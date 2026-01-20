/**
 * =============================================================================
 * THIAGUINHO CORE SYSTEM v6.0 (GOLD MASTER)
 * =============================================================================
 * Arquitetura: Singleton Pattern
 * Foco: Estabilidade Mobile, Audio Procedural Nintendo, Gestão de Memória.
 */

window.Sfx = {
    ctx: null,
    
    init: function() {
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (AC) this.ctx = new AC();
        } catch(e) { console.warn("Audio mudo"); }
    },

    play: function(freq, type, dur, vol=0.1, slide=0) {
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(()=>{});

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            if(slide !== 0) {
                osc.frequency.linearRampToValueAtTime(freq + slide, this.ctx.currentTime + dur);
            }

            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + dur);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + dur);
        } catch(e) {}
    },

    // --- SOUND BANK (NINTENDO STYLE) ---
    boot:  function() { this.play(660,'sine',0.1); setTimeout(()=>this.play(880,'sine',0.4), 100); },
    ui:    function() { this.play(1200,'sine',0.05, 0.05); },
    ok:    function() { this.play(880,'square',0.1); setTimeout(()=>this.play(1760,'square',0.1), 80); },
    back:  function() { this.play(300,'triangle',0.1); },
    jump:  function() { this.play(150,'square',0.2, 0.1, 400); }, // Slide up
    coin:  function() { this.play(988,'square',0.08, 0.1); setTimeout(()=>this.play(1319,'square',0.3, 0.1), 80); },
    hit:   function() { this.play(100,'sawtooth',0.1, 0.2, -50); },
    crash: function() { this.play(80,'sawtooth',0.6, 0.3, -40); }
};

window.Gfx = {
    shakePower: 0,
    
    map: function(kp, w, h) { 
        return { 
            x: w - (kp.x / 640 * w), // Espelhado para sensação natural
            y: kp.y / 480 * h, 
            score: kp.score 
        }; 
    },

    shake: function(val) { this.shakePower = val; },

    updateShake: function(ctx) {
        if (this.shakePower > 0) {
            const dx = (Math.random() - 0.5) * this.shakePower;
            const dy = (Math.random() - 0.5) * this.shakePower;
            ctx.translate(dx, dy);
            this.shakePower *= 0.9;
            if(this.shakePower < 0.5) this.shakePower = 0;
        }
    },

    drawSkeleton: function(ctx, pose, w, h, color='#00ffff') {
        if(!pose) return;
        const kp = pose.keypoints;
        const find = n => kp.find(k => k.name===n);
        
        ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
        const link = (a,b) => {
            const p1=find(a), p2=find(b);
            if(p1 && p2 && p1.score>0.3 && p2.score>0.3) {
                const c1=this.map(p1,w,h), c2=this.map(p2,w,h);
                ctx.beginPath(); ctx.moveTo(c1.x,c1.y); ctx.lineTo(c2.x,c2.y); ctx.stroke();
            }
        };
        link('left_shoulder','right_shoulder');
        link('left_shoulder','left_elbow'); link('left_elbow','left_wrist');
        link('right_shoulder','right_elbow'); link('right_elbow','right_wrist');
    }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    registerGame: function(id, meta, logic) {
        this.games[id] = { meta, logic };
        // Atualiza o menu se estiver visível
        if(document.getElementById('channel-grid')) this.renderMenu();
    },

    boot: async function() {
        const log = document.getElementById('boot-log');
        log.innerText = "INICIANDO SISTEMA...";
        
        // 1. Inicializa Audio (Requer gesto do usuário)
        window.Sfx.init();

        try {
            // 2. Camera
            log.innerText = "LIGANDO CÂMERA...";
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user', width: { ideal: 640 } }, 
                audio: false 
            });
            
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            document.getElementById('webcam').srcObject = stream;
            
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play(); 
            document.getElementById('webcam').play();

            // 3. IA
            log.innerText = "CARREGANDO NEURAL ENGINE...";
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            // 4. Canvas
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.resize();
            window.addEventListener('resize', () => this.resize());

            // 5. Finalização
            document.getElementById('screen-safety').classList.add('hidden');
            this.menu();
            window.Sfx.boot();

        } catch (e) {
            alert("ERRO FATAL: " + e.message + "\nVerifique se o site está em HTTPS ou se deu permissão à câmera.");
            log.innerText = "FALHA NO BOOT";
            log.style.color = "red";
        }
    },

    renderMenu: function() {
        const grid = document.getElementById('channel-grid');
        if(!grid) return;
        
        grid.innerHTML = '';
        const keys = Object.keys(this.games);
        
        if(keys.length === 0) {
            grid.innerHTML = "<p style='grid-column: span 2; text-align:center;'>Carregando Jogos...</p>";
            // Retry automático
            setTimeout(() => this.renderMenu(), 500);
            return;
        }

        keys.forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            div.onclick = function() { window.System.launch(k); };
            div.innerHTML = `
                <div class="channel-icon">${g.meta.icon}</div>
                <div class="channel-title">${g.meta.name}</div>
            `;
            grid.appendChild(div);
        });

        // Preenche espaços vazios estilo Wii
        for(let i=keys.length; i<8; i++) {
            grid.innerHTML += `<div class="channel" style="opacity:0.3; border:2px dashed #ddd; cursor:default;"></div>`;
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

            window.Sfx.ok();
            this.activeGame = g;

            // Troca Telas
            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            
            // Configurações Específicas
            const cam = document.getElementById('webcam');
            const wheel = document.getElementById('ui-wheel');
            
            if(cam) cam.style.opacity = g.meta.camOpacity || 0.2;
            if(wheel) wheel.style.opacity = g.meta.showWheel ? 1 : 0;

            // Inicia
            if(g.logic.init) g.logic.init();
            if(!this.loopId) this.loop();

        } catch(e) {
            console.error(e);
            this.menu();
        }
    },

    loop: async function() {
        if(!window.System.activeGame) return;

        try {
            // IA (Tolerância a falha se frame vier vazio)
            let pose = null;
            if(window.System.detector && window.System.video.readyState === 4) {
                try {
                    const poses = await window.System.detector.estimatePoses(window.System.video, {flipHorizontal: false});
                    if(poses.length > 0) pose = poses[0];
                } catch(err){}
            }

            const ctx = window.System.ctx;
            const w = window.System.canvas.width;
            const h = window.System.canvas.height;

            // Limpa e Prepara
            ctx.clearRect(0, 0, w, h);
            ctx.save();
            window.Gfx.updateShake(ctx);
            
            // Lógica do Jogo
            const score = window.System.activeGame.logic.update(ctx, w, h, pose);
            ctx.restore();

            // Atualiza Pontuação
            const hud = document.getElementById('hud-score');
            if(hud) hud.innerText = Math.floor(score);

            window.System.loopId = requestAnimationFrame(window.System.loop);

        } catch(e) {
            console.error("Game Loop Error:", e);
            window.System.stopGame();
            window.System.menu();
        }
    },

    stopGame: function() {
        if(this.loopId) { cancelAnimationFrame(this.loopId); this.loopId = null; }
        this.activeGame = null;
    },

    home: function() { window.Sfx.back(); this.menu(); },
    
    restart: function() { 
        if(this.activeGame) {
            document.getElementById('screen-over').classList.add('hidden');
            document.getElementById('game-ui').classList.remove('hidden');
            this.activeGame.logic.init();
            this.loop();
        } else this.menu();
    },

    gameOver: function(s) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(s);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    msg: function(t) {
        const el = document.getElementById('game-msg');
        if(el) {
            el.innerText = t;
            el.style.transform = "translate(-50%, -50%) scale(1)";
            setTimeout(() => el.style.transform = "translate(-50%, -50%) scale(0)", 1500);
        }
    },

    resize: function() {
        if(this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }
};