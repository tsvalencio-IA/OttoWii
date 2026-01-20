/**
 * =============================================================================
 * OTTO CORE - ARCHITECTURE V5 (NINTENDO STANDARD)
 * =============================================================================
 * Engine central focada em baixa latência, feedback tátil e física determinística.
 */

// Utilitários Matemáticos de Alta Performance
const MathUtils = {
    lerp: (start, end, amt) => (1 - amt) * start + amt * end,
    clamp: (num, min, max) => Math.min(Math.max(num, min), max),
    map: (n, start1, stop1, start2, stop2) => ((n - start1) / (stop1 - start1)) * (stop2 - start2) + start2,
    rand: (min, max) => Math.random() * (max - min) + min
};

// 1. AUDIO ENGINE (Sintetizador Procedural)
window.Sfx = {
    ctx: null,
    master: null,
    
    init() {
        window.AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.4;
        this.master.connect(this.ctx.destination);
    },

    play(freq, type, dur, vol = 0.5, slide = 0) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        if (slide !== 0) {
            osc.frequency.exponentialRampToValueAtTime(Math.max(10, freq + slide), this.ctx.currentTime + dur);
        }

        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);

        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + dur);
    },

    // Biblioteca de Feedback Nintendo
    ui_select() { this.play(880, 'sine', 0.1, 0.1); },
    ui_ok() { this.play(1100, 'square', 0.1, 0.1, 200); },
    jump() { this.play(150, 'square', 0.3, 0.15, 600); }, // O clássico som de pulo
    coin() { 
        this.play(988, 'sine', 0.08, 0.1); 
        setTimeout(() => this.play(1319, 'sine', 0.2, 0.1), 80); 
    },
    hit() { this.play(100, 'sawtooth', 0.2, 0.3, -50); },
    crash() { this.play(50, 'sawtooth', 0.5, 0.4, -40); }
};

// 2. GRAPHICS ENGINE (Renderização e Efeitos)
window.Gfx = {
    shakePower: 0,
    
    // Mapeamento e Suavização de Coordenadas
    // Transforma espaço da câmera (640x480) para Canvas e inverte espelho
    project(kp, w, h) {
        return {
            x: w - (kp.x / 640 * w),
            y: kp.y / 480 * h,
            score: kp.score
        };
    },

    shake(amount) {
        this.shakePower = amount;
    },

    applyShake(ctx) {
        if (this.shakePower > 0.5) {
            const dx = Math.random() * this.shakePower - (this.shakePower / 2);
            const dy = Math.random() * this.shakePower - (this.shakePower / 2);
            ctx.translate(dx, dy);
            this.shakePower *= 0.9; // Decaimento
        } else {
            this.shakePower = 0;
        }
    },

    drawSkeleton(ctx, pose, w, h) {
        if (!pose) return;
        ctx.save();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        
        // Desenha apenas conexões essenciais para feedback visual
        const pairs = [
            ['left_shoulder', 'right_shoulder'],
            ['left_shoulder', 'left_elbow'], ['left_elbow', 'left_wrist'],
            ['right_shoulder', 'right_elbow'], ['right_elbow', 'right_wrist']
        ];

        const kp = pose.keypoints;
        const find = n => kp.find(k => k.name === n);

        pairs.forEach(([a, b]) => {
            const pa = find(a), pb = find(b);
            if (pa && pb && pa.score > 0.4 && pb.score > 0.4) {
                const p1 = this.project(pa, w, h);
                const p2 = this.project(pb, w, h);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
            }
        });
        ctx.restore();
    }
};

// 3. SYSTEM OS (Gerenciador de Estado e Hardware)
window.System = {
    video: null,
    canvas: null,
    ctx: null,
    detector: null,
    
    activeGame: null,
    gameLoopId: null,
    games: {},
    
    // Estado de Pose Suavizado (Low-pass filter)
    lastPose: null,

    registerGame(id, meta, logic) {
        this.games[id] = { meta, logic };
        this.renderMenu();
    },

    async boot() {
        document.getElementById('screen-boot').classList.add('hidden');
        document.getElementById('screen-load').classList.remove('hidden');
        window.Sfx.init();

        try {
            // Inicializa WebCam
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false
            });
            this.video = document.getElementById('webcam');
            this.video.srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);

            // Inicializa TensorFlow
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            // Setup Canvas
            this.canvas = document.getElementById('canvas-main');
            this.ctx = this.canvas.getContext('2d', { alpha: false }); // Otimização
            this.resize();
            window.addEventListener('resize', () => this.resize());

            document.getElementById('screen-load').classList.add('hidden');
            this.menu();

        } catch (e) {
            console.error("Boot falhou:", e);
            alert("Erro: Câmera necessária para jogar.");
        }
    },

    renderMenu() {
        const grid = document.getElementById('menu-grid');
        grid.innerHTML = '';
        Object.keys(this.games).forEach(key => {
            const g = this.games[key];
            const div = document.createElement('div');
            div.className = 'channel';
            div.onclick = () => this.launch(key);
            div.innerHTML = `
                <div class="icon-game">${g.meta.icon}</div>
                <div class="text-game">${g.meta.name}</div>
            `;
            div.onmouseenter = () => window.Sfx.ui_select();
            grid.appendChild(div);
        });
    },

    menu() {
        this.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('screen-game').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('webcam').style.opacity = 0;
    },

    launch(id) {
        window.Sfx.ui_ok();
        this.activeGame = this.games[id];
        
        document.getElementById('screen-menu').classList.add('hidden');
        document.getElementById('screen-game').classList.remove('hidden');
        
        // Opacidade da câmera depende do jogo
        document.getElementById('webcam').style.opacity = 0.2; 
        
        this.activeGame.logic.init();
        this.lastTime = performance.now();
        this.loop();
        
        this.showMsg("READY?");
        setTimeout(() => this.showMsg("GO!"), 1500);
    },

    restart() {
        if (this.activeGame) {
            document.getElementById('screen-over').classList.add('hidden');
            document.getElementById('screen-game').classList.remove('hidden');
            this.activeGame.logic.init();
            this.loop();
        }
    },

    async loop() {
        if (!this.activeGame) return;

        const now = performance.now();
        const dt = Math.min((now - this.lastTime) / 1000, 0.1); // Cap dt
        this.lastTime = now;

        // 1. Detecção (Hardware)
        let pose = null;
        try {
            const poses = await this.detector.estimatePoses(this.video, {
                flipHorizontal: false
            });
            if (poses.length > 0) {
                pose = this.smoothPose(poses[0]); // Suavização aplicada aqui
            }
        } catch (e) {}

        // 2. Lógica & Render (Software)
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(0, 0, w, h);
        
        this.ctx.save();
        window.Gfx.applyShake(this.ctx);
        const score = this.activeGame.logic.update(this.ctx, w, h, pose, dt);
        this.ctx.restore();

        // 3. UI Update
        document.getElementById('hud-score').innerText = Math.floor(score);

        this.gameLoopId = requestAnimationFrame(() => this.loop());
    },

    // Filtro para reduzir tremor (Lerp entre frames)
    smoothPose(newPose) {
        if (!this.lastPose) {
            this.lastPose = newPose;
            return newPose;
        }
        
        // Interpola cada keypoint
        newPose.keypoints.forEach((kp, i) => {
            const oldKp = this.lastPose.keypoints[i];
            kp.x = MathUtils.lerp(oldKp.x, kp.x, 0.5); // 0.5 = equilíbrio entre latência e suavidade
            kp.y = MathUtils.lerp(oldKp.y, kp.y, 0.5);
        });
        
        this.lastPose = newPose;
        return newPose;
    },

    stopGame() {
        if (this.gameLoopId) cancelAnimationFrame(this.gameLoopId);
        this.activeGame = null;
    },

    gameOver(finalScore) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(finalScore);
        document.getElementById('screen-game').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    resize() {
        if(this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    },

    showMsg(txt) {
        const el = document.getElementById('game-msg');
        el.innerText = txt;
        el.style.transform = 'scale(1.5)';
        el.style.opacity = '1';
        setTimeout(() => {
            el.style.transform = 'scale(0)';
            el.style.opacity = '0';
        }, 1000);
    }
};