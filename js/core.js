/**
 * =============================================================================
 * THIAGUINHO SYSTEM CORE (KERNEL v4.0 - STABLE)
 * =============================================================================
 * Responsabilidade: Orquestração de Hardware (Webcam), Áudio (Sfx) e Ciclo de Vida.
 * Arquitetura: Singleton Global (window.System).
 * =============================================================================
 */

// 1. SOUND PROCESSOR (DSP VIRTUAL)
window.Sfx = {
    ctx: null,
    
    // Inicializa o Contexto de Áudio (Exige interação do usuário)
    init: function() {
        if (!this.ctx) {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (AudioContext) {
                this.ctx = new AudioContext();
            }
        }
        // Retoma se estiver suspenso (Comportamento Chrome)
        if (this.ctx && this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    },

    // Sintetizador de Ondas (Oscillator)
    play: function(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = type; // 'sine', 'square', 'sawtooth', 'triangle'
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

            // Envelope ADSR Simplificado (Ataque rápido, Decaimento suave)
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);

            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch (e) {
            console.warn("Audio Error:", e);
        }
    },

    // Biblioteca de Efeitos (Presets Nintendo Style)
    boot: function() { 
        // Som de "Coin" agudo e rápido
        this.play(1200, 'sine', 0.1, 0.1);
        setTimeout(() => this.play(2400, 'sine', 0.2, 0.1), 100);
    },
    click: function() { this.play(800, 'triangle', 0.05, 0.05); },
    back: function() { this.play(300, 'triangle', 0.1, 0.1); },
    hit: function() { this.play(150, 'sawtooth', 0.1, 0.2); },
    bump: function() { this.play(100, 'square', 0.1, 0.3); }, // Impacto pesado
    jump: function() { 
        // Slide de frequência (Pulo clássico)
        if(!this.ctx) return;
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(150, this.ctx.currentTime);
        o.frequency.linearRampToValueAtTime(300, this.ctx.currentTime + 0.1);
        g.gain.setValueAtTime(0.1, this.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.1);
        o.connect(g); g.connect(this.ctx.destination);
        o.start(); o.stop(this.ctx.currentTime + 0.1);
    },
    crash: function() {
        // Ruído branco simulado (Sawtooth grave e dissonante)
        this.play(80, 'sawtooth', 0.5, 0.4);
        setTimeout(() => this.play(50, 'square', 0.4, 0.3), 100);
    }
};

// 2. GRAPHICS UTILS (ABSTRAÇÃO VISUAL)
window.Gfx = {
    shakePower: 0,
    
    // Mapeia coordenadas normalizadas do TensorFlow para o Canvas
    map: function(keypoint, w, h) {
        // Espelhamento horizontal (x = w - x) para sensação de espelho
        return {
            x: w - keypoint.x, // Inverte X
            y: keypoint.y      // Y original
        };
    },

    // Efeito de Tremor de Tela
    shake: function(amount) {
        this.shakePower = amount;
    },

    updateShake: function(ctx) {
        if (this.shakePower > 0.5) {
            const dx = (Math.random() - 0.5) * this.shakePower;
            const dy = (Math.random() - 0.5) * this.shakePower;
            ctx.translate(dx, dy);
            this.shakePower *= 0.9; // Amortecimento (Damping)
        } else {
            this.shakePower = 0;
        }
    },

    // Desenha esqueleto para debug/feedback
    drawSkeleton: function(ctx, pose, w, h, color='#00ff00') {
        if (!pose) return;
        const kp = pose.keypoints;
        
        ctx.strokeStyle = color;
        ctx.lineWidth = 4;
        
        const connect = (a, b) => {
            const p1 = kp.find(k => k.name === a);
            const p2 = kp.find(k => k.name === b);
            if (p1 && p1.score > 0.3 && p2 && p2.score > 0.3) {
                const m1 = this.map(p1, w, h);
                const m2 = this.map(p2, w, h);
                ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
            }
        };

        connect('left_shoulder', 'right_shoulder');
        connect('left_shoulder', 'left_elbow');
        connect('left_elbow', 'left_wrist');
        connect('right_shoulder', 'right_elbow');
        connect('right_elbow', 'right_wrist');
    }
};

// 3. SYSTEM ORCHESTRATOR (OS)
window.System = {
    video: null,
    canvas: null,
    ctx: null,
    detector: null,
    activeGame: null,
    animationFrameId: null,
    games: {}, // Registro de Cartuchos

    // Registra um jogo no sistema
    registerGame: function(id, metadata, logic) {
        console.log(`[SYS] Cartucho carregado: ${id}`);
        this.games[id] = { meta: metadata, logic: logic };
        // Atualiza UI se estiver pronta
        if(document.getElementById('channel-grid')) this.renderMenu();
    },

    // Sequência de Boot (Inicializa Câmera e IA)
    boot: async function() {
        const log = document.getElementById('boot-log');
        log.innerText = "INICIALIZANDO HARDWARE...";
        
        try {
            window.Sfx.init();
            
            // 1. Câmera
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480, facingMode: 'user' },
                audio: false
            });
            
            this.video = document.getElementById('video-source');
            this.video.srcObject = stream;
            
            // Feed Visual (Espelho)
            const webcamUI = document.getElementById('webcam');
            webcamUI.srcObject = stream;
            
            await new Promise(resolve => this.video.onloadedmetadata = resolve);
            this.video.play();
            webcamUI.play();

            // 2. IA (TensorFlow MoveNet)
            log.innerText = "CARREGANDO NEURAL ENGINE...";
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            // 3. Canvas
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: true }); // Alpha para camadas
            this.resize();
            window.addEventListener('resize', () => this.resize());

            // Boot completo
            document.getElementById('screen-safety').classList.add('hidden');
            window.Sfx.boot();
            this.menu();

        } catch (err) {
            console.error(err);
            log.innerText = "ERRO: CÂMERA NECESSÁRIA";
            alert("Erro: Permita o acesso à câmera para jogar.");
        }
    },

    // Renderiza o Grid de Canais (Menu Principal)
    renderMenu: function() {
        const grid = document.getElementById('channel-grid');
        grid.innerHTML = ''; // Limpa grid

        const gameIds = Object.keys(this.games);
        
        gameIds.forEach(id => {
            const game = this.games[id];
            const btn = document.createElement('div');
            btn.className = 'channel animate-pop';
            btn.onclick = () => this.launch(id);
            btn.innerHTML = `
                <div class="text-6xl mb-2">${game.meta.icon}</div>
                <div class="font-bold text-gray-600 text-sm uppercase tracking-wider">${game.meta.name}</div>
            `;
            grid.appendChild(btn);
        });

        // Adiciona canal vazio ("Mii")
        const empty = document.createElement('div');
        empty.className = 'channel opacity-50 cursor-default grayscale';
        empty.innerHTML = `<div class="text-4xl mb-2">👤</div><div class="text-xs">Perfil</div>`;
        grid.appendChild(empty);
    },

    // Vai para o Menu
    menu: function() {
        this.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        
        // Esconde webcam no menu
        document.getElementById('webcam').style.opacity = 0;
        this.renderMenu();
    },

    // Lança um Jogo
    launch: function(id) {
        if (!this.games[id]) return;

        window.Sfx.click();
        this.activeGame = this.games[id];

        // UI Transition
        document.getElementById('screen-menu').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        
        // Configurações Específicas
        const cam = document.getElementById('webcam');
        const wheel = document.getElementById('ui-wheel');
        
        cam.style.opacity = this.activeGame.meta.camOpacity || 0.3;
        wheel.style.opacity = this.activeGame.meta.showWheel ? 1 : 0;
        
        // Inicializa Lógica do Jogo
        if (this.activeGame.logic.init) {
            this.activeGame.logic.init();
        }

        // Inicia Loop
        this.lastFrameTime = performance.now();
        this.loop();
    },

    // Loop Principal (Game Loop)
    loop: async function() {
        if (!this.activeGame) return;

        // 1. Detecção de Pose (Assíncrono)
        let pose = null;
        try {
            if (this.detector && this.video.readyState === 4) {
                const poses = await this.detector.estimatePoses(this.video, {
                    flipHorizontal: false // Já espelhamos no CSS/Gfx.map
                });
                if (poses.length > 0) pose = poses[0];
            }
        } catch (e) { console.warn("AI Lag", e); }

        // 2. Renderização
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;

        ctx.clearRect(0, 0, w, h);
        ctx.save();
        
        // Aplica Shake Global
        window.Gfx.updateShake(ctx);

        // Update do Jogo
        const score = this.activeGame.logic.update(ctx, w, h, pose);
        
        ctx.restore();

        // 3. Atualiza HUD
        const hud = document.getElementById('hud-score');
        if(hud) hud.innerText = Math.floor(score);

        // Próximo Frame
        this.animationFrameId = requestAnimationFrame(() => this.loop());
    },

    stopGame: function() {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        this.activeGame = null;
    },

    gameOver: function(finalScore) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(finalScore);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    // Mensagem Flutuante (Toast)
    msg: function(text) {
        const el = document.getElementById('game-msg');
        el.innerText = text;
        el.classList.remove('scale-0');
        el.classList.add('scale-100');
        
        // Reset automático
        setTimeout(() => {
            el.classList.remove('scale-100');
            el.classList.add('scale-0');
        }, 1500);
    },

    resize: function() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }
};
