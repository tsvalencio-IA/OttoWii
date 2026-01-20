/**
 * =============================================================================
 * THIAGUINHO SOLUÇÕES - CORE ENGINE v4.1 (STABLE FIX)
 * =============================================================================
 * Correções: Segurança no lançamento de jogos e tratamento de erros de áudio.
 */

window.Sfx = {
    ctx: null,
    
    init() {
        try {
            window.AudioContext = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AudioContext();
        } catch(e) { console.warn("Audio não suportado"); }
    },

    play(freq, type, duration, vol = 0.1, slide = 0) {
        if (!this.ctx) return;
        // Resume áudio suspenso (comum no Chrome Mobile)
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            if (slide !== 0) {
                osc.frequency.linearRampToValueAtTime(freq + slide, this.ctx.currentTime + duration);
            }

            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) { /* Ignora erro de audio para não travar o jogo */ }
    },

    // Sons do Sistema
    boot() { this.play(600, 'sine', 0.1, 0.1); setTimeout(() => this.play(800, 'sine', 0.4, 0.1), 100); },
    hover() { this.play(400, 'sine', 0.05, 0.05); },
    click() { this.play(1200, 'sine', 0.1, 0.1); },
    back() { this.play(300, 'triangle', 0.1, 0.1, -100); },
    
    // Sons de Jogo
    jump() { this.play(150, 'square', 0.2, 0.1, 300); },
    coin() { this.play(988, 'square', 0.08, 0.1); setTimeout(() => this.play(1319, 'square', 0.3, 0.1), 80); },
    bump() { this.play(100, 'sawtooth', 0.1, 0.2, -50); },
    crash() { this.play(80, 'sawtooth', 0.4, 0.4, -60); }
};

window.Gfx = {
    shakePower: 0,
    map(kp, w, h) {
        return { x: w - (kp.x / 640 * w), y: kp.y / 480 * h, score: kp.score };
    },
    shake(amount) { this.shakePower = amount; },
    updateShake(ctx) {
        if (this.shakePower > 0) {
            const dx = (Math.random() - 0.5) * this.shakePower;
            const dy = (Math.random() - 0.5) * this.shakePower;
            ctx.translate(dx, dy);
            this.shakePower *= 0.9;
            if (this.shakePower < 0.5) this.shakePower = 0;
        }
    },
    drawSkeleton(ctx, pose, w, h, color = '#00ffff') {
        if (!pose) return;
        const kp = pose.keypoints;
        const find = n => kp.find(k => k.name === n);
        ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
        const connect = (a, b) => {
            const p1 = find(a), p2 = find(b);
            if (p1 && p2 && p1.score > 0.3 && p2.score > 0.3) {
                const c1 = this.map(p1, w, h), c2 = this.map(p2, w, h);
                ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
            }
        };
        connect('left_shoulder', 'right_shoulder');
        connect('left_shoulder', 'left_elbow'); connect('left_elbow', 'left_wrist');
        connect('right_shoulder', 'right_elbow'); connect('right_elbow', 'right_wrist');
    }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},
    
    registerGame(id, meta, logic) {
        this.games[id] = { meta, logic };
        if(document.getElementById('channel-grid')) this.renderMenu();
    },

    async boot() {
        const log = document.getElementById('boot-log');
        log.innerText = "INICIALIZANDO HARDWARE...";
        window.Sfx.init();
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' }, audio: false
            });
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); document.getElementById('webcam').play();

            log.innerText = "CARREGANDO REDE NEURAL...";
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.resize();
            window.addEventListener('resize', () => this.resize());

            document.getElementById('screen-safety').classList.add('hidden');
            window.Sfx.boot();
            this.menu();

        } catch (e) {
            alert("Erro Fatal: Câmera não detectada. " + e.message);
        }
    },

    renderMenu() {
        const grid = document.getElementById('channel-grid');
        if(!grid) return;
        grid.innerHTML = '';
        const keys = Object.keys(this.games);
        
        keys.forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            div.onclick = () => this.launch(k);
            div.innerHTML = `<div class="channel-icon">${g.meta.icon}</div><div class="channel-title">${g.meta.name}</div>`;
            grid.appendChild(div);
        });

        const slots = Math.max(12, keys.length + (4 - keys.length % 4));
        for(let i = keys.length; i < slots; i++) {
            grid.innerHTML += `<div class="channel" style="background:#eee; opacity:0.5; border-style:dashed;"></div>`;
        }
    },

    menu() {
        this.stopGame();
        this.renderMenu();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('webcam').style.opacity = '0';
    },

    launch(id) {
        try {
            window.Sfx.click();
            const g = this.games[id];
            this.activeGame = g;
            
            // Troca de Telas (Forçada)
            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            
            // Configurações de Hardware (Seguras)
            const camEl = document.getElementById('webcam');
            if(camEl) camEl.style.opacity = g.meta.camOpacity || 0.2;
            
            const wheelEl = document.getElementById('ui-wheel');
            if(wheelEl) wheelEl.style.opacity = g.meta.showWheel ? 1 : 0;

            // Inicia Lógica
            g.logic.init();
            this.loop();
        } catch(e) {
            console.error(e);
            alert("Erro ao iniciar jogo: " + e.message);
            this.menu();
        }
    },

    restart() {
        if(this.activeGame) {
            document.getElementById('screen-over').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            this.activeGame.logic.init();
            this.loop();
        } else { this.menu(); }
    },

    home() { window.Sfx.back(); this.menu(); },

    async loop() {
        if (!this.activeGame) return;

        let pose = null;
        try {
            const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
            if (poses.length > 0) pose = poses[0];
        } catch (e) {}

        const w = this.canvas.width;
        const h = this.canvas.height;
        this.ctx.clearRect(0,0,w,h);
        
        this.ctx.save();
        window.Gfx.updateShake(this.ctx);
        const score = this.activeGame.logic.update(this.ctx, w, h, pose);
        this.ctx.restore();

        document.getElementById('hud-score').innerText = Math.floor(score);
        this.loopId = requestAnimationFrame(() => this.loop());
    },

    stopGame() {
        if (this.loopId) cancelAnimationFrame(this.loopId);
        this.activeGame = null;
    },

    gameOver(score) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(score);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    msg(txt) {
        const el = document.getElementById('game-msg');
        if(el) {
            el.innerText = txt;
            el.classList.add('pop');
            setTimeout(() => el.classList.remove('pop'), 1500);
        }
    },

    resize() {
        if(this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }
};