/**
 * =============================================================================
 * THIAGUINHO CORE v8.0 (RETINA DISPLAY SUPPORT)
 * =============================================================================
 * Correção Crítica: O sistema agora detecta 'devicePixelRatio'.
 * Isso faz com que o Canvas tenha a resolução real do pixel físico do celular,
 * eliminando o borrão. A lógica interna continua usando escala normalizada.
 * =============================================================================
 */

window.Sfx = {
    ctx: null,
    init: function() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },
    play: function(freq, type, dur, vol = 0.1) {
        if (!this.ctx) return;
        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = type; osc.frequency.value = freq;
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
            osc.connect(gain); gain.connect(this.ctx.destination);
            osc.start(); osc.stop(this.ctx.currentTime + dur);
        } catch(e) {}
    },
    // Sons Clássicos Nintendo (Wavetable Synthesis simulada)
    boot: function() { this.play(1046, 'square', 0.1, 0.1); setTimeout(()=>this.play(2093, 'square', 0.2, 0.1), 100); },
    click: function() { this.play(800, 'triangle', 0.05, 0.1); },
    coin: function() { 
        this.play(987, 'square', 0.08, 0.1); 
        setTimeout(() => this.play(1318, 'square', 0.3, 0.1), 80); 
    },
    jump: function() {
        if(!this.ctx) return;
        const o = this.ctx.createOscillator(); const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(150, this.ctx.currentTime);
        o.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 0.15);
        g.gain.setValueAtTime(0.1, this.ctx.currentTime);
        g.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime + 0.15);
    },
    stomp: function() { this.play(100, 'sawtooth', 0.1, 0.3); },
    crash: function() { this.play(60, 'sawtooth', 0.5, 0.4); }
};

window.Gfx = {
    shakePower: 0,
    dpr: 1, // Device Pixel Ratio

    // Normaliza input do Tensorflow (640x480) para o Canvas (Screen Size)
    map: function(kp, w, h) {
        return { 
            x: w - (kp.x / 640 * w), // Espelhado e escalado
            y: (kp.y / 480 * h)
        };
    },

    shake: function(amount) { this.shakePower = amount; },
    updateShake: function(ctx) {
        if (this.shakePower > 0.5) {
            const dx = (Math.random() - 0.5) * this.shakePower;
            const dy = (Math.random() - 0.5) * this.shakePower;
            ctx.translate(dx, dy);
            this.shakePower *= 0.9;
        } else {
            this.shakePower = 0;
        }
    },
    
    // Helper para desenhar Pixel Art (Retângulos otimizados)
    drawPixel: function(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x), Math.floor(y), size, size);
    },

    // Esqueleto de Debug
    drawSkeleton: function(ctx, pose, w, h) {
        if(!pose) return;
        const kp = pose.keypoints;
        ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 2;
        const connect = (a,b) => {
            const p1=kp.find(k=>k.name===a), p2=kp.find(k=>k.name===b);
            if(p1&&p2&&p1.score>0.3&&p2.score>0.3) {
                const m1=this.map(p1,w,h), m2=this.map(p2,w,h);
                ctx.beginPath(); ctx.moveTo(m1.x,m1.y); ctx.lineTo(m2.x,m2.y); ctx.stroke();
            }
        };
        connect('left_shoulder','right_shoulder');
        connect('left_shoulder','left_elbow'); connect('left_elbow','left_wrist');
        connect('right_shoulder','right_elbow'); connect('right_elbow','right_wrist');
    }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    registerGame: function(id, meta, logic) {
        this.games[id] = { meta, logic };
        if(document.getElementById('channel-grid')) this.renderMenu();
    },

    boot: async function() {
        const log = document.getElementById('boot-log');
        log.innerText = "LIGANDO CÂMERA...";
        window.Sfx.init();

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, 
                audio: false 
            });
            
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); document.getElementById('webcam').play();

            log.innerText = "CARREGANDO CORE...";
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            this.initCanvas();
            window.addEventListener('resize', () => this.initCanvas());

            document.getElementById('screen-safety').classList.add('hidden');
            window.Sfx.boot();
            this.menu();

        } catch (e) {
            alert("ERRO: " + e.message);
            log.innerText = "FALHA NO BOOT";
        }
    },

    initCanvas: function() {
        this.canvas = document.getElementById('game-canvas');
        if(!this.canvas) return;

        // RETINA FIX: Ajusta o tamanho interno do canvas pela densidade de pixels
        const dpr = window.devicePixelRatio || 1;
        window.Gfx.dpr = dpr;

        const rect = document.body.getBoundingClientRect();
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        // Mantém o tamanho CSS (visual) correto
        this.canvas.style.width = `${rect.width}px`;
        this.canvas.style.height = `${rect.height}px`;

        this.ctx = this.canvas.getContext('2d', { alpha: true });
        // Escala o contexto para desenhar como se fosse resolução normal
        this.ctx.scale(dpr, dpr);
        
        // Desativa antialiasing para pixel art nítido
        this.ctx.imageSmoothingEnabled = false;
    },

    renderMenu: function() {
        const grid = document.getElementById('channel-grid');
        grid.innerHTML = '';
        const keys = Object.keys(this.games);
        
        keys.forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            div.onclick = () => this.launch(k);
            div.innerHTML = `
                <div class="text-5xl mb-2 filter drop-shadow-md">${g.meta.icon}</div>
                <div class="font-bold text-gray-500 text-xs uppercase tracking-wider">${g.meta.name}</div>
            `;
            grid.appendChild(div);
        });

        // Filler channels (Estilo Wii)
        for(let i=0; i < (12 - keys.length); i++) {
            grid.innerHTML += `<div class="channel opacity-30 grayscale cursor-default border-dashed border-gray-300"></div>`;
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
        if(!this.games[id]) return;
        window.Sfx.click();
        this.activeGame = this.games[id];
        
        document.getElementById('screen-menu').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        
        const cam = document.getElementById('webcam');
        cam.style.opacity = this.activeGame.meta.camOpacity || 0.2;
        
        // Limpa overlay UI
        document.getElementById('ui-overlay').innerHTML = '';

        if(this.activeGame.logic.init) this.activeGame.logic.init();
        this.loop();
    },

    loop: async function() {
        if(!this.activeGame) return;
        
        let pose = null;
        try {
            if(this.detector && this.video.readyState === 4) {
                const p = await this.detector.estimatePoses(this.video, {flipHorizontal: false});
                if(p.length > 0) pose = p[0];
            }
        } catch(e){}

        const ctx = this.ctx;
        // Usa dimensões lógicas (CSS pixels), não físicas
        const w = this.canvas.width / window.Gfx.dpr;
        const h = this.canvas.height / window.Gfx.dpr;

        ctx.clearRect(0,0,w,h);
        ctx.save();
        window.Gfx.updateShake(ctx);
        
        const score = this.activeGame.logic.update(ctx, w, h, pose);
        ctx.restore();

        const hud = document.getElementById('hud-score');
        if(hud) hud.innerText = Math.floor(score).toString().padStart(4, '0');

        this.loopId = requestAnimationFrame(() => this.loop());
    },

    stopGame: function() {
        if(this.loopId) cancelAnimationFrame(this.loopId);
        this.activeGame = null;
    },
    gameOver: function(s) {
        this.stopGame(); window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(s);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },
    msg: function(t) {
        const el = document.getElementById('game-msg');
        if(el) {
            const span = el.querySelector('span');
            if(span) span.innerText = t;
            else el.innerText = t;
            el.classList.remove('scale-0');
            setTimeout(() => el.classList.add('scale-0'), 1500);
        }
    }
};
