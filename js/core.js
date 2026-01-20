/**
 * =============================================================================
 * OTTO SYSTEM CORE - NINTENDO WII REMASTER (ULTRA-ROBUST VERSION)
 * =============================================================================
 */

// 1. CRIAÇÃO IMEDIATA DO SISTEMA (Antes de qualquer outra coisa)
(function() {
    const system = {
        games: {},
        activeGame: null,
        loopId: null,
        detector: null,
        video: null,
        canvas: null,
        ctx: null,
        lastTime: 0,

        // Função de Registro que aceita jogos a qualquer momento
        registerGame: function(id, name, icon, logic, settings = {}) {
            this.games[id] = {
                name: name,
                icon: icon,
                logic: logic,
                settings: Object.assign({ camOpacity: 0.3, showWheel: false }, settings)
            };
            console.log("%c[OttO] Jogo Registrado: " + name, "background: #3498db; color: #fff; padding: 2px 5px;");
            
            // Se o menu já existir no HTML, desenha ele agora
            if (document.getElementById('channel-grid')) {
                this.renderMenu();
            }
        },

        renderMenu: function() {
            const grid = document.getElementById('channel-grid');
            if (!grid) return;
            grid.innerHTML = '';
            const ids = Object.keys(this.games);
            ids.forEach(id => {
                const g = this.games[id];
                const div = document.createElement('div');
                div.className = 'channel';
                div.onclick = () => this.launch(id);
                div.innerHTML = `<div class="channel-icon">${g.icon}</div><div class="channel-name">${g.name}</div>`;
                grid.appendChild(div);
            });
            // Preenche espaços vazios estilo Wii
            for (let i = 0; i < Math.max(0, 12 - ids.length); i++) {
                const empty = document.createElement('div');
                empty.className = 'channel channel-empty';
                grid.appendChild(empty);
            }
        },

        boot: async function() {
            const log = document.getElementById('boot-log');
            if (log) log.innerText = "Iniciando Hardware...";
            if (window.Sfx && window.Sfx.init) window.Sfx.init();
            
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
                this.video = document.getElementById('video-source');
                this.video.srcObject = stream;
                document.getElementById('webcam').srcObject = stream;
                await new Promise(r => this.video.onloadedmetadata = r);
                this.video.play();
                document.getElementById('webcam').play();

                if (log) log.innerText = "Carregando IA...";
                document.getElementById('screen-safety').classList.add('hidden');
                document.getElementById('screen-load').classList.remove('hidden');

                await tf.setBackend('webgl');
                this.detector = await poseDetection.createDetector(
                    poseDetection.SupportedModels.MoveNet,
                    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
                );

                this.canvas = document.getElementById('game-canvas');
                this.ctx = this.canvas.getContext('2d');
                this.resize();
                window.addEventListener('resize', () => this.resize());

                document.getElementById('screen-load').classList.add('hidden');
                this.renderMenu();
                this.menu();
            } catch (e) { alert("Erro de Câmera: " + e.message); }
        },

        menu: function() {
            this.stopGame();
            document.getElementById('screen-menu').classList.remove('hidden');
            document.getElementById('screen-over').classList.add('hidden');
            document.getElementById('game-ui').classList.add('hidden');
            document.getElementById('webcam').style.opacity = '0';
        },

        launch: function(id) {
            const g = this.games[id];
            if (!g) return;
            this.activeGame = g;
            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            document.getElementById('webcam').style.opacity = g.settings.camOpacity;
            document.getElementById('ui-wheel').style.opacity = g.settings.showWheel ? '1' : '0';
            g.logic.init();
            this.lastTime = performance.now();
            this.loop();
        },

        loop: async function() {
            if (!this.activeGame) return;
            const now = performance.now();
            const dt = (now - this.lastTime) / 1000;
            this.lastTime = now;

            let pose = null;
            try {
                const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
                if (poses.length > 0) pose = poses[0];
            } catch (e) {}

            const { ctx, canvas } = this;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.save();
            if (window.Gfx && window.Gfx.applyShake) window.Gfx.applyShake(ctx);
            const score = this.activeGame.logic.update(ctx, canvas.width, canvas.height, pose, dt);
            ctx.restore();

            document.getElementById('hud-score').innerText = Math.floor(score);
            this.loopId = requestAnimationFrame(() => this.loop());
        },

        stopGame: function() {
            this.activeGame = null;
            if (this.loopId) cancelAnimationFrame(this.loopId);
        },

        gameOver: function(s) {
            this.stopGame();
            document.getElementById('final-score').innerText = Math.floor(s);
            document.getElementById('game-ui').classList.add('hidden');
            document.getElementById('screen-over').classList.remove('hidden');
        },

        resize: function() {
            if (this.canvas) {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
            }
        },

        home: function() { this.menu(); }
    };

    // Exporta para o escopo global IMEDIATAMENTE
    window.System = system;
})();

// 2. AUDIO ENGINE
window.Sfx = {
    ctx: null,
    init: function() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch (e) {}
    },
    play: function(f, t, d, v = 0.1) {
        if (!this.ctx) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = t; o.frequency.value = f;
        g.gain.setValueAtTime(v, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + d);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime + d);
    },
    ui_click: function() { this.play(880, 'sine', 0.1); },
    ui_back: function() { this.play(440, 'sine', 0.1); },
    hit: function() { this.play(150, 'sawtooth', 0.1); },
    coin: function() { this.play(1000, 'square', 0.1); }
};

// 3. GRAPHICS ENGINE
window.Gfx = {
    shakeAmount: 0,
    map: function(kp, w, h) {
        return { x: w - (kp.x / 640 * w), y: kp.y / 480 * h, score: kp.score };
    },
    applyShake: function(ctx) {
        if (this.shakeAmount > 0) {
            ctx.translate((Math.random()-0.5)*this.shakeAmount, (Math.random()-0.5)*this.shakeAmount);
            this.shakeAmount *= 0.9;
        }
    },
    shake: function(i) { this.shakeAmount = i; },
    drawSkeleton: function(ctx, pose, w, h) {
        if (!pose) return;
        const kp = pose.keypoints;
        ctx.strokeStyle = '#0ff'; ctx.lineWidth = 4;
        kp.forEach(p => {
            if (p.score > 0.5) {
                const m = this.map(p, w, h);
                ctx.beginPath(); ctx.arc(m.x, m.y, 5, 0, Math.PI*2); ctx.stroke();
            }
        });
    }
};
