/**
 * =============================================================================
 * THIAGUINHO CORE v7.0 (STABLE MOBILE)
 * =============================================================================
 * Foco: Estabilidade no GitHub Pages + Visual Nintendo
 */

window.Sfx = {
    ctx: null,
    init: function() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        } catch(e) {}
    },
    play: function(freq, type, dur, vol=0.1) {
        if (!this.ctx) return;
        // Tenta destravar audio suspenso (comum no Chrome Android)
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});
        try {
            const o = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            o.type = type; o.frequency.value = freq;
            g.gain.setValueAtTime(vol, this.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);
            o.connect(g); g.connect(this.ctx.destination);
            o.start(); o.stop(this.ctx.currentTime + dur);
        } catch(e) {}
    },
    // Sons Nintendo
    boot: function(){ this.play(660,'sine',0.1); setTimeout(()=>this.play(880,'sine',0.4),100); },
    click: function(){ this.play(1200,'sine',0.1); },
    jump: function(){ this.play(150,'square',0.2); }, 
    coin: function(){ this.play(988,'square',0.1); setTimeout(()=>this.play(1319,'square',0.1),80); },
    crash: function(){ this.play(80,'sawtooth',0.5); }
};

window.Gfx = {
    shakePower: 0,
    map: function(kp, w, h) { return { x: w-(kp.x/640*w), y: kp.y/480*h, score: kp.score }; },
    shake: function(v) { this.shakePower = v; },
    updateShake: function(ctx) {
        if (this.shakePower > 0) {
            ctx.translate((Math.random()-0.5)*this.shakePower, (Math.random()-0.5)*this.shakePower);
            this.shakePower *= 0.9;
        }
    }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    // Registro seguro
    registerGame: function(id, meta, logic) {
        console.log("Registrado: " + id);
        this.games[id] = { meta, logic };
        if(document.getElementById('channel-grid')) this.renderMenu();
    },

    boot: async function() {
        const log = document.getElementById('boot-log');
        log.innerText = "INICIANDO...";
        window.Sfx.init();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 640 } }, audio: false 
            });
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); document.getElementById('webcam').play();

            log.innerText = "CARREGANDO IA...";
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
            this.menu();
            window.Sfx.boot();

        } catch (e) {
            alert("ERRO: " + e.message);
            log.innerText = "FALHA.";
        }
    },

    renderMenu: function() {
        const grid = document.getElementById('channel-grid');
        if(!grid) return;
        grid.innerHTML = '';
        const keys = Object.keys(this.games);
        
        if(keys.length === 0) {
            grid.innerHTML = "<p style='color:#999; grid-column:span 2; text-align:center'>Carregando...</p>";
            return;
        }

        keys.forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            div.onclick = function() { window.System.launch(k); };
            div.innerHTML = `<div class="channel-icon">${g.meta.icon}</div><div class="channel-title">${g.meta.name}</div>`;
            grid.appendChild(div);
        });
        
        // Slots vazios para layout
        for(let i=keys.length; i<6; i++) {
            grid.innerHTML += `<div class="channel" style="opacity:0.3; border:2px dashed #ddd; cursor:default"></div>`;
        }
    },

    menu: function() {
        this.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('webcam').style.opacity = 0;
        this.renderMenu();
    },

    launch: function(id) {
        try {
            const g = this.games[id];
            if(!g) return;
            
            window.Sfx.click();
            this.activeGame = g;

            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            
            const cam = document.getElementById('webcam');
            const wheel = document.getElementById('ui-wheel');
            if(cam) cam.style.opacity = g.meta.camOpacity || 0.2;
            if(wheel) wheel.style.opacity = g.meta.showWheel ? 1 : 0;

            if(g.logic.init) g.logic.init();
            if(!this.loopId) this.loop();
        } catch(e) { console.error(e); this.menu(); }
    },

    loop: async function() {
        if(!window.System.activeGame) return;
        try {
            let pose = null;
            if(window.System.detector && window.System.video.readyState === 4) {
                try {
                    const poses = await window.System.detector.estimatePoses(window.System.video, {flipHorizontal: false});
                    if(poses.length > 0) pose = poses[0];
                } catch(err){}
            }
            
            const ctx = window.System.ctx;
            const w = window.System.canvas.width; const h = window.System.canvas.height;
            ctx.clearRect(0,0,w,h);
            ctx.save();
            window.Gfx.updateShake(ctx);
            
            const score = window.System.activeGame.logic.update(ctx, w, h, pose);
            ctx.restore();

            const hud = document.getElementById('hud-score');
            if(hud) hud.innerText = Math.floor(score);

            window.System.loopId = requestAnimationFrame(window.System.loop);
        } catch(e) { 
            console.error(e); 
            window.System.stopGame(); 
            window.System.menu(); 
        }
    },

    stopGame: function() {
        if(this.loopId) { cancelAnimationFrame(this.loopId); this.loopId = null; }
        this.activeGame = null;
    },
    resize: function() { if(this.canvas){ this.canvas.width=window.innerWidth; this.canvas.height=window.innerHeight; } },
    home: function() { window.Sfx.back(); this.menu(); },
    restart: function() { if(this.activeGame) { this.activeGame.logic.init(); this.loop(); } else this.menu(); },
    gameOver: function(s) {
        this.stopGame(); window.Sfx.crash();
        document.getElementById('final-score').innerText=Math.floor(s);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },
    msg: function(t) {
        const el = document.getElementById('game-msg');
        if(el) { el.innerText=t; el.style.transform="translate(-50%,-50%) scale(1)"; setTimeout(()=>el.style.transform="translate(-50%,-50%) scale(0)", 1500); }
    }
};