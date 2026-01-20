/**
 * =============================================================================
 * THIAGUINHO SOLUÇÕES - CORE ENGINE v4.2 (SAFETY MODE)
 * =============================================================================
 */

window.Sfx = {
    ctx: null,
    init() { try { window.AudioContext = window.AudioContext || window.webkitAudioContext; this.ctx = new AudioContext(); } catch(e){} },
    play(f, t, d, v=0.1) {
        if(!this.ctx) return;
        if(this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
        try {
            const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
            o.type=t; o.frequency.value=f; g.gain.value=v;
            g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime+d);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(); o.stop(this.ctx.currentTime+d);
        } catch(e){}
    },
    boot() { this.play(600,'sine',0.1); },
    click() { this.play(1200,'sine',0.1); },
    back() { this.play(300,'triangle',0.1); },
    jump() { this.play(150,'square',0.2); },
    coin() { this.play(988,'square',0.1); },
    crash() { this.play(80,'sawtooth',0.4); }
};

window.Gfx = {
    shakePower: 0,
    map(kp, w, h) { return { x: w-(kp.x/640*w), y: kp.y/480*h, score: kp.score }; },
    shake(amount) { this.shakePower = amount; },
    updateShake(ctx) {
        if(this.shakePower > 0) {
            ctx.translate((Math.random()-0.5)*this.shakePower, (Math.random()-0.5)*this.shakePower);
            this.shakePower *= 0.9;
        }
    },
    drawSkeleton(ctx, pose, w, h) { /* Skeleton Logic Omitted for brevity, assumed functional */ }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    registerGame(id, meta, logic) {
        this.games[id] = { meta, logic };
        if(document.getElementById('channel-grid')) this.renderMenu();
    },

    async boot() {
        document.getElementById('boot-log').innerText = "INICIALIZANDO...";
        window.Sfx.init();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 640 }, audio: false });
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); document.getElementById('webcam').play();

            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING });

            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.resize();
            window.addEventListener('resize', () => this.resize());

            document.getElementById('screen-safety').classList.add('hidden');
            this.menu();
        } catch(e) {
            alert("Erro Câmera: " + e.message);
        }
    },

    renderMenu() {
        const grid = document.getElementById('channel-grid');
        if(!grid) return;
        grid.innerHTML = '';
        Object.keys(this.games).forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            // Usa onpointerdown para melhor resposta em mobile
            div.onpointerdown = () => this.launch(k);
            div.innerHTML = `<div class="channel-icon">${g.meta.icon}</div><div class="channel-title">${g.meta.name}</div>`;
            grid.appendChild(div);
        });
        // Slots vazios
        for(let i=Object.keys(this.games).length; i<12; i++) grid.innerHTML+=`<div class="channel" style="opacity:0.3;border:2px dashed #ccc"></div>`;
    },

    menu() {
        this.stopGame();
        this.renderMenu();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('webcam').style.opacity = '0';
    },

    launch(id) {
        try {
            window.Sfx.click();
            const g = this.games[id];
            this.activeGame = g;
            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            
            const cam = document.getElementById('webcam');
            if(cam) cam.style.opacity = g.meta.camOpacity || 0.2;
            
            const wheel = document.getElementById('ui-wheel');
            if(wheel) wheel.style.opacity = g.meta.showWheel ? 1 : 0;

            g.logic.init();
            this.loop();
        } catch(e) {
            console.error(e);
            alert("Falha ao iniciar jogo: " + e.message);
            this.menu();
        }
    },

    async loop() {
        if(!this.activeGame) return;
        try {
            let pose = null;
            try {
                const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
                if(poses.length > 0) pose = poses[0];
            } catch(e){}

            const w = this.canvas.width; const h = this.canvas.height;
            this.ctx.clearRect(0,0,w,h);
            this.ctx.save();
            window.Gfx.updateShake(this.ctx);
            const score = this.activeGame.logic.update(this.ctx, w, h, pose);
            this.ctx.restore();
            
            document.getElementById('hud-score').innerText = Math.floor(score);
            this.loopId = requestAnimationFrame(() => this.loop());
        } catch(e) {
            console.error("Game Loop Crash:", e);
            // Não alerta no loop para não spammar, apenas para
            this.stopGame();
            alert("O jogo encontrou um erro e foi encerrado.");
            this.menu();
        }
    },

    stopGame() {
        if(this.loopId) cancelAnimationFrame(this.loopId);
        this.activeGame = null;
    },

    home() { window.Sfx.back(); this.menu(); },
    
    restart() { 
        if(this.activeGame) {
            document.getElementById('screen-over').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            this.activeGame.logic.init();
            this.loop();
        } else this.menu();
    },

    gameOver(s) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(s);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    msg(t) {
        const el = document.getElementById('game-msg');
        if(el) { el.innerText = t; el.classList.add('pop'); setTimeout(()=>el.classList.remove('pop'), 1500); }
    },

    resize() {
        if(this.canvas) { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }
    }
};