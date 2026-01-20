/**
 * =============================================================================
 * OTTO SYSTEM CORE - NINTENDO WII ARCHITECTURE REMASTER
 * =============================================================================
 * Desenvolvedor: Game Developer Sênior (20+ anos exp.)
 * Filosofia: Controle absoluto, feedback imediato, física honesta.
 */

// 1. AUDIO ENGINE (Sfx) - Síntese de áudio de baixa latência com variação dinâmica
window.Sfx = {
    ctx: null,
    masterGain: null,
    
    init() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
            this.masterGain = this.ctx.createGain();
            this.masterGain.connect(this.ctx.destination);
            this.masterGain.gain.value = 0.5;
        } catch (e) {
            console.error("AudioContext não suportado:", e);
        }
    },

    // Toca um som sintetizado com parâmetros precisos
    play(freq, type, duration, volume = 0.1, sweep = 0) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (sweep !== 0) {
            osc.frequency.exponentialRampToValueAtTime(freq + sweep, this.ctx.currentTime + duration);
        }

        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    },

    // Biblioteca de sons padrão Nintendo
    ui_hover() { this.play(880, 'sine', 0.05, 0.05); },
    ui_click() { this.play(1320, 'sine', 0.1, 0.1, 440); },
    ui_back() { this.play(440, 'sine', 0.15, 0.1, -220); },
    game_start() { 
        this.play(523.25, 'square', 0.1, 0.1); // C5
        setTimeout(() => this.play(659.25, 'square', 0.1, 0.1), 100); // E5
        setTimeout(() => this.play(783.99, 'square', 0.3, 0.1), 200); // G5
    },
    hit() { this.play(150, 'sawtooth', 0.1, 0.2, -50); },
    coin() { 
        this.play(987.77, 'square', 0.1, 0.05); // B5
        setTimeout(() => this.play(1318.51, 'square', 0.4, 0.05), 80); // E6
    },
    jump() { this.play(200, 'sine', 0.2, 0.1, 600); },
    crash() { this.play(60, 'square', 0.5, 0.3, -40); }
};

// 2. GRAPHICS ENGINE (Gfx) - Renderização, transformações e efeitos visuais
window.Gfx = {
    shakeAmount: 0,
    
    // Mapeamento de coordenadas da webcam (640x480) para o canvas (W x H)
    // Inverte o eixo X para efeito de espelho natural
    map(kp, w, h) {
        return {
            x: w - (kp.x / 640 * w),
            y: kp.y / 480 * h,
            score: kp.score
        };
    },

    // Aplica tremor de tela (Screen Shake)
    applyShake(ctx) {
        if (this.shakeAmount > 0) {
            const dx = (Math.random() - 0.5) * this.shakeAmount;
            const dy = (Math.random() - 0.5) * this.shakeAmount;
            ctx.translate(dx, dy);
            this.shakeAmount *= 0.85;
            if (this.shakeAmount < 0.5) this.shakeAmount = 0;
        }
    },

    shake(intensity) {
        this.shakeAmount = intensity;
    },

    // Desenha o esqueleto neon com estilo Wii/Cyber
    drawSkeleton(ctx, pose, w, h) {
        if (!pose) return;
        const kp = pose.keypoints;
        const get = (name) => kp.find(k => k.name === name);

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffff';
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.lineWidth = 6;

        const connect = (n1, n2) => {
            const p1 = get(n1), p2 = get(n2);
            if (p1 && p2 && p1.score > 0.3 && p2.score > 0.3) {
                const m1 = this.map(p1, w, h), m2 = this.map(p2, w, h);
                ctx.beginPath();
                ctx.moveTo(m1.x, m1.y);
                ctx.lineTo(m2.x, m2.y);
                ctx.stroke();
            }
        };

        // Estrutura superior
        connect('left_shoulder', 'right_shoulder');
        connect('left_shoulder', 'left_elbow');
        connect('left_elbow', 'left_wrist');
        connect('right_shoulder', 'right_elbow');
        connect('right_elbow', 'right_wrist');
        
        // Tronco
        connect('left_shoulder', 'left_hip');
        connect('right_shoulder', 'right_hip');
        connect('left_hip', 'right_hip');

        // Estrutura inferior
        connect('left_hip', 'left_knee');
        connect('left_knee', 'left_ankle');
        connect('right_hip', 'right_knee');
        connect('right_knee', 'right_ankle');

        // Cabeça (Círculo)
        const nose = get('nose');
        if (nose && nose.score > 0.3) {
            const m = this.map(nose, w, h);
            ctx.beginPath();
            ctx.arc(m.x, m.y - 20, 30, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }
};

// 3. SYSTEM OS (System) - Gerenciamento de ciclo de vida, jogos e hardware
window.System = {
    video: null,
    canvas: null,
    ctx: null,
    detector: null,
    activeGame: null,
    loopId: null,
    games: {},
    sensitivity: 1.0,
    lastTime: 0,
    fps: 0,

    registerGame(id, name, icon, logic, settings = {}) {
        this.games[id] = {
            name, icon, logic,
            settings: { camOpacity: 0.3, showWheel: false, ...settings }
        };
    },

    async boot() {
        const log = document.getElementById('boot-log');
        log.innerText = "Inicializando Hardware...";
        window.Sfx.init();
        window.Sfx.ui_click();

        try {
            // Configuração de Câmera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: 640, height: 480 },
                audio: false
            });
            
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play();
            document.getElementById('webcam').play();

            log.innerText = "Carregando Motores de IA...";
            document.getElementById('screen-safety').classList.add('hidden');
            document.getElementById('screen-load').classList.remove('hidden');

            // Inicialização TensorFlow
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            // Configuração Canvas
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());

            document.getElementById('screen-load').classList.add('hidden');
            this.renderMenu();
            this.menu();
            
            log.innerText = "Sistema Pronto.";
        } catch (e) {
            console.error(e);
            alert("Erro de Inicialização: " + e.message);
        }
    },

    renderMenu() {
        const grid = document.getElementById('channel-grid');
        grid.innerHTML = '';
        Object.keys(this.games).forEach(id => {
            const g = this.games[id];
            const channel = document.createElement('div');
            channel.className = 'channel';
            channel.onclick = () => this.launch(id);
            channel.onmouseenter = () => window.Sfx.ui_hover();
            channel.innerHTML = `
                <div class="channel-icon">${g.icon}</div>
                <div class="channel-name">${g.name}</div>
            `;
            grid.appendChild(channel);
        });
        
        // Preenche espaços vazios estilo Wii
        const emptyCount = Math.max(0, 12 - Object.keys(this.games).length);
        for (let i = 0; i < emptyCount; i++) {
            const empty = document.createElement('div');
            empty.className = 'channel channel-empty';
            grid.appendChild(empty);
        }
    },

    menu() {
        this.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('webcam').style.opacity = '0';
        window.Sfx.ui_back();
    },

    launch(id) {
        const g = this.games[id];
        if (!g) return;
        
        window.Sfx.game_start();
        this.activeGame = g;
        
        document.getElementById('screen-menu').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        document.getElementById('webcam').style.opacity = g.settings.camOpacity;
        document.getElementById('ui-wheel').style.opacity = g.settings.showWheel ? '1' : '0';
        
        g.logic.init();
        this.lastTime = performance.now();
        this.loop();
    },

    async loop() {
        if (!this.activeGame) return;

        const now = performance.now();
        const dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.fps = 1 / dt;

        let pose = null;
        try {
            const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
            if (poses.length > 0) pose = poses[0];
        } catch (e) {
            console.warn("Erro detecção:", e);
        }

        const { ctx, canvas } = this;
        const { width: w, height: h } = canvas;

        ctx.clearRect(0, 0, w, h);
        ctx.save();
        window.Gfx.applyShake(ctx);
        
        const score = this.activeGame.logic.update(ctx, w, h, pose, dt);
        ctx.restore();

        document.getElementById('hud-score').innerText = Math.floor(score);
        this.loopId = requestAnimationFrame(() => this.loop());
    },

    stopGame() {
        this.activeGame = null;
        if (this.loopId) cancelAnimationFrame(this.loopId);
    },

    home() {
        this.menu();
    },

    gameOver(score) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(score);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    },

    setSens(v) {
        this.sensitivity = parseFloat(v);
    },

    msg(text) {
        const el = document.getElementById('game-msg');
        el.innerText = text;
        el.classList.add('pop');
        setTimeout(() => {
            el.classList.remove('pop');
            setTimeout(() => { if (!el.classList.contains('pop')) el.innerText = ''; }, 300);
        }, 2000);
    }
};
