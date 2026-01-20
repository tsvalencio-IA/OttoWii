/**
 * =============================================================================
 * THIAGUINHO SOLUÇÕES - CORE ENGINE v5.0 (MOBILE FIX)
 * =============================================================================
 * Correção Crítica: Sistema de clique universal e tratamento de falha de áudio.
 */

window.Sfx = {
    ctx: null,
    
    // Inicializa o áudio de forma segura
    init() {
        try {
            const AudioCtor = window.AudioContext || window.webkitAudioContext;
            if (AudioCtor) this.ctx = new AudioCtor();
        } catch(e) { console.warn("Audio desativado: Navegador não suporta."); }
    },

    play(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        
        // Tenta resumir o áudio se estiver suspenso (comum no Chrome Android)
        if (this.ctx.state === 'suspended') {
            this.ctx.resume().catch(() => {});
        }

        try {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.type = type;
            osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
            
            gain.gain.setValueAtTime(vol, this.ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start();
            osc.stop(this.ctx.currentTime + duration);
        } catch(e) { 
            // Silêncio: Se o áudio falhar, não trava o jogo
        }
    },

    // Sons simplificados para garantir performance
    boot() { this.play(600, 'sine', 0.2); },
    click() { this.play(1200, 'sine', 0.1); },
    back() { this.play(300, 'triangle', 0.1); },
    jump() { this.play(150, 'square', 0.2); },
    coin() { this.play(1000, 'square', 0.1); },
    crash() { this.play(100, 'sawtooth', 0.5); }
};

window.Gfx = {
    shakePower: 0,
    map(kp, w, h) { return { x: w - (kp.x / 640 * w), y: kp.y / 480 * h, score: kp.score }; },
    shake(amount) { this.shakePower = amount; },
    updateShake(ctx) {
        if (this.shakePower > 0) {
            ctx.translate((Math.random() - 0.5) * this.shakePower, (Math.random() - 0.5) * this.shakePower);
            this.shakePower *= 0.9;
        }
    },
    drawSkeleton(ctx, pose, w, h, color='#0ff') { /* Skeleton logic opcional */ }
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    registerGame(id, meta, logic) {
        this.games[id] = { meta, logic };
        // Atualiza o menu se ele já existir
        if (document.getElementById('channel-grid')) this.renderMenu();
    },

    async boot() {
        const log = document.getElementById('boot-log');
        if(log) log.innerText = "INICIANDO...";
        
        // Tenta iniciar áudio no clique do usuário
        window.Sfx.init();
        window.Sfx.boot();

        try {
            // Câmera
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

            // IA
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );

            // Canvas
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d', { alpha: false });
            this.resize();
            window.addEventListener('resize', () => this.resize());

            // Esconde tela de segurança e abre menu
            document.getElementById('screen-safety').classList.add('hidden');
            this.menu();

        } catch (e) {
            alert("Erro na Câmera: " + e.message + "\nVerifique permissões do navegador.");
        }
    },

    renderMenu() {
        const grid = document.getElementById('channel-grid');
        if (!grid) return;
        
        grid.innerHTML = '';
        const keys = Object.keys(this.games);
        
        keys.forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            
            // CORREÇÃO: Usa onclick padrão para compatibilidade máxima
            div.onclick = function() { window.System.launch(k); };
            
            div.innerHTML = `
                <div class="channel-icon" style="pointer-events:none">${g.meta.icon}</div>
                <div class="channel-title" style="pointer-events:none">${g.meta.name}</div>
            `;
            grid.appendChild(div);
        });

        // Preenche vazios
        for(let i=keys.length; i<12; i++) {
            grid.innerHTML += `<div class="channel" style="opacity:0.3; border:2px dashed #ccc"></div>`;
        }
    },

    menu() {
        this.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        // Garante que o menu está clicável
        document.getElementById('screen-menu').style.zIndex = "50";
        this.renderMenu();
    },

    launch(id) {
        try {
            window.Sfx.click();
            const g = this.games[id];
            
            if (!g) {
                alert("Erro: Jogo não encontrado na memória.");
                return;
            }

            this.activeGame = g;
            
            // TROCA VISUAL FORÇADA (Z-INDEX)
            const menuScreen = document.getElementById('screen-menu');
            const gameScreen = document.getElementById('game-ui');
            const webCam = document.getElementById('webcam');
            const wheel = document.getElementById('ui-wheel');

            menuScreen.classList.add('hidden');
            menuScreen.style.zIndex = "-1"; // Manda menu para trás
            
            gameScreen.classList.remove('hidden');
            gameScreen.style.zIndex = "100"; // Traz jogo para frente
            
            // Configurações do jogo
            if(webCam) webCam.style.opacity = g.meta.camOpacity || 0.2;
            if(wheel) wheel.style.opacity = g.meta.showWheel ? 1 : 0;

            // Inicia Lógica
            g.logic.init();
            
            // Inicia Loop
            if (!this.loopId) this.loop();

        } catch (e) {
            console.error(e);
            alert("Ocorreu um erro ao abrir o jogo: " + e.message);
            this.menu();
        }
    },

    async loop() {
        if (!this.activeGame) {
            this.loopId = null;
            return;
        }

        try {
            // Detecção de Pose
            let pose = null;
            if (this.detector && this.video.readyState === 4) {
                try {
                    const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
                    if (poses.length > 0) pose = poses[0];
                } catch(err) { /* Ignora frames ruins da câmera */ }
            }

            // Renderização do Jogo
            const w = this.canvas.width; 
            const h = this.canvas.height;
            
            this.ctx.clearRect(0, 0, w, h);
            this.ctx.save();
            window.Gfx.updateShake(this.ctx);
            
            const score = this.activeGame.logic.update(this.ctx, w, h, pose);
            this.ctx.restore();

            // Atualiza Pontuação
            const scoreEl = document.getElementById('hud-score');
            if(scoreEl) scoreEl.innerText = Math.floor(score);

            this.loopId = requestAnimationFrame(() => this.loop());

        } catch (e) {
            console.error("Game Loop Crash:", e);
            // Se der erro grave no loop, para tudo e volta pro menu
            this.stopGame();
            alert("O jogo travou. Voltando ao menu.");
            this.menu();
        }
    },

    stopGame() {
        if (this.loopId) {
            cancelAnimationFrame(this.loopId);
            this.loopId = null;
        }
        this.activeGame = null;
    },

    home() {
        window.Sfx.back();
        this.menu();
    },

    gameOver(score) {
        this.stopGame();
        window.Sfx.crash();
        document.getElementById('final-score').innerText = Math.floor(score);
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
        document.getElementById('screen-over').style.zIndex = "200"; // Game Over acima de tudo
    },
    
    restart() {
        if(this.activeGame) {
             document.getElementById('screen-over').classList.add('hidden');
             document.getElementById('game-ui').classList.remove('hidden');
             this.activeGame.logic.init();
             this.loop();
        } else {
            this.menu();
        }
    },

    msg(txt) {
        const el = document.getElementById('game-msg');
        if (el) {
            el.innerText = txt;
            el.classList.add('pop');
            setTimeout(() => el.classList.remove('pop'), 1500);
        }
    },

    resize() {
        if (this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }
};