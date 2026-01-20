/**
 * =============================================================================
 * CORE ENGINE - VERSÃO BLINDADA (GITHUB PAGES FIX)
 * =============================================================================
 */

window.Sfx = {
    ctx: null,
    init: function() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch(e) { console.warn("Audio bloqueado pelo navegador"); }
    },
    play: function(f, t, d) {
        // Se o audio não existir ou der erro, IGNORA e segue o jogo.
        if(!this.ctx) return; 
        try {
            if(this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type=t; o.frequency.value=f;
            g.gain.value=0.1; 
            g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime+d);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(); o.stop(this.ctx.currentTime+d);
        } catch(e) {}
    },
    // Atalhos seguros
    click: function(){ this.play(1200,'sine',0.1); },
    crash: function(){ this.play(100,'sawtooth',0.5); },
    boot: function(){ this.play(600,'sine',0.3); }
};

window.Gfx = {
    shakePower: 0,
    map: function(kp, w, h) { return { x: w-(kp.x/640*w), y: kp.y/480*h, score: kp.score }; },
    shake: function(v) { this.shakePower = v; },
    updateShake: function(ctx) {
        if(this.shakePower > 0) {
            ctx.translate((Math.random()-0.5)*this.shakePower, (Math.random()-0.5)*this.shakePower);
            this.shakePower *= 0.9;
        }
    },
    drawSkeleton: function(ctx, pose, w, h) { /* Lógica visual opcional */ }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    // 1. REGISTRO DE JOGOS (Agora à prova de falhas)
    registerGame: function(id, meta, logic) {
        console.log("Jogo carregado: " + id);
        this.games[id] = { meta: meta, logic: logic };
    },

    // 2. INICIALIZAÇÃO DO HARDWARE
    boot: async function() {
        const log = document.getElementById('boot-log');
        log.innerText = "Iniciando Audio...";
        window.Sfx.init();

        try {
            log.innerText = "Pedindo Câmera...";
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: {ideal: 640} }, 
                audio: false 
            });
            
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); document.getElementById('webcam').play();

            log.innerText = "Carregando IA...";
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            // Prepara Canvas
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.resize();
            window.addEventListener('resize', () => this.resize());

            // Tudo pronto: Abre o menu
            document.getElementById('screen-safety').classList.add('hidden');
            this.menu();
            window.Sfx.boot();

        } catch (e) {
            alert("ERRO FATAL: " + e.message + "\nVerifique permissões ou use HTTPS.");
        }
    },

    // 3. RENDERIZAÇÃO DO MENU
    menu: function() {
        this.stopGame();
        
        // Troca telas
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');

        const grid = document.getElementById('channel-grid');
        grid.innerHTML = '';

        const keys = Object.keys(this.games);
        if(keys.length === 0) {
            grid.innerHTML = "<p style='color:red'>Carregando jogos...</p>";
            // Tenta de novo em 1s caso os scripts estejam lentos
            setTimeout(() => this.menu(), 1000);
            return;
        }

        keys.forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            // Usa função anônima para evitar execução imediata
            div.onclick = function() { window.System.launch(k); };
            div.innerHTML = `
                <div class="channel-icon">${g.meta.icon}</div>
                <div class="channel-title">${g.meta.name}</div>
            `;
            grid.appendChild(div);
        });
    },

    // 4. LANÇAR JOGO (Com proteção de erro)
    launch: function(id) {
        try {
            const g = this.games[id];
            if(!g) throw new Error("Jogo não encontrado");

            window.Sfx.click();
            this.activeGame = g;

            // Interface
            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            
            // Configs Específicas
            const cam = document.getElementById('webcam');
            const wheel = document.getElementById('ui-wheel');
            if(cam) cam.style.opacity = g.meta.camOpacity || 0.2;
            if(wheel) wheel.style.opacity = g.meta.showWheel ? 1 : 0;

            // Inicia Lógica
            if(g.logic.init) g.logic.init();
            
            // Inicia Loop
            if(!this.loopId) this.loop();

        } catch(e) {
            console.error(e);
            alert("Erro ao abrir jogo: " + e.message);
            this.menu();
        }
    },

    // 5. GAME LOOP (Protegido contra crash)
    loop: async function() {
        if(!window.System.activeGame) return;

        try {
            // IA (Pode falhar se a câmera piscar, então try/catch)
            let pose = null;
            if(window.System.detector) {
                try {
                    const poses = await window.System.detector.estimatePoses(window.System.video, {flipHorizontal: false});
                    if(poses.length > 0) pose = poses[0];
                } catch(err) {}
            }

            const ctx = window.System.ctx;
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;

            ctx.clearRect(0, 0, w, h);
            ctx.save();
            window.Gfx.updateShake(ctx);
            
            // Executa o jogo
            const score = window.System.activeGame.logic.update(ctx, w, h, pose);
            ctx.restore();

            // Atualiza Score HUD
            const hud = document.getElementById('hud-score');
            if(hud) hud.innerText = Math.floor(score);

            window.System.loopId = requestAnimationFrame(window.System.loop);

        } catch(e) {
            console.error("Crash no Loop:", e);
            window.System.stopGame();
            alert("Ocorreu um erro durante o jogo.");
            window.System.menu();
        }
    },

    stopGame: function() {
        if(this.loopId) cancelAnimationFrame(this.loopId);
        this.loopId = null;
        this.activeGame = null;
    },

    resize: function() {
        if(this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    },

    msg: function(txt) {
        const el = document.getElementById('game-msg');
        if(el) {
            el.innerText = txt;
            el.style.transform = "scale(1)";
            setTimeout(() => el.style.transform = "scale(0)", 1500);
        }
    },
    
    gameOver: function(s) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(s);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    }
};