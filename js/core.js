/* =================================================================
   CORE DO SISTEMA (CÉREBRO) - VERSÃO CORRIGIDA (MAPA DE PIXELS)
   ================================================================= */

// 1. AUDIO GLOBAL
window.Sfx = {
    ctx: null,
    init: () => { 
        window.AudioContext = window.AudioContext || window.webkitAudioContext; 
        if (!window.Sfx.ctx) window.Sfx.ctx = new AudioContext(); 
        if (window.Sfx.ctx.state === 'suspended') window.Sfx.ctx.resume();
    },
    play: (f, t, d, v=0.1) => {
        if(!window.Sfx.ctx) return;
        try {
            const o = window.Sfx.ctx.createOscillator(); 
            const g = window.Sfx.ctx.createGain();
            o.type=t; o.frequency.value=f; 
            g.gain.setValueAtTime(v, window.Sfx.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, window.Sfx.ctx.currentTime+d);
            o.connect(g); g.connect(window.Sfx.ctx.destination); 
            o.start(); o.stop(window.Sfx.ctx.currentTime+d);
        } catch(e) { console.warn("Audio Error", e); }
    },
    hover: () => window.Sfx.play(800, 'sine', 0.05, 0.05),
    click: () => window.Sfx.play(1200, 'sine', 0.1, 0.1),
    crash: () => window.Sfx.play(100, 'sawtooth', 0.5, 0.2),
    skid: () => window.Sfx.play(150, 'square', 0.1, 0.05)
};

// 2. SISTEMA GRÁFICO (CORRIGIDO PARA MOVENET PADRÃO 640x480)
window.Gfx = {
    shake: 0,
    updateShake: (ctx) => {
        if(window.Gfx.shake > 0) {
            ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            window.Gfx.shake *= 0.9;
            if(window.Gfx.shake < 0.5) window.Gfx.shake = 0;
        }
    },
    shakeScreen: (i) => { window.Gfx.shake = i; },
    
    // --- AQUI ESTAVA O ERRO! CORRIGIDO PARA LÓGICA DO THIAGO.ZIP ---
    // MoveNet retorna pixels (0-640). Precisamos normalizar baseados nisso.
    map: (pt, w, h) => ({ 
        x: w - (pt.x / 640 * w), // Inverte X (Espelho) e escala para a tela
        y: (pt.y / 480 * h)      // Escala Y para a tela
    }),
    
    drawSkeleton: (ctx, pose, w, h) => { /* Opcional */ }
};

// 3. SISTEMA PRINCIPAL
window.System = {
    video: null, canvas: null, detector: null,
    games: [], activeGame: null, loopId: null,
    playerId: null,

    init: async () => {
        console.log("Iniciando System Wii...");
        const loadingText = document.getElementById('loading-text');

        let savedId = localStorage.getItem('wii_player_id');
        if (!savedId) {
            savedId = 'Player_' + Math.floor(Math.random() * 9999);
            localStorage.setItem('wii_player_id', savedId);
        }
        window.System.playerId = savedId;

        try {
            window.System.canvas = document.getElementById('game-canvas');
            window.System.resize();
            window.addEventListener('resize', window.System.resize);

            if (loadingText) loadingText.innerText = "LIGANDO CÂMERA...";
            window.System.video = document.getElementById('webcam');
            
            // Força 640x480 para bater com a matemática do Gfx.map
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { width: 640, height: 480, frameRate: { ideal: 30 } } 
                });
                window.System.video.srcObject = stream;
                await new Promise(r => window.System.video.onloadedmetadata = r);
                window.System.video.play();
            } catch(e) {
                console.warn("Câmera falhou:", e);
                if (loadingText) loadingText.innerText = "CÂMERA OFF - MODO TOQUE";
            }

            if (typeof poseDetection !== 'undefined') {
                if (loadingText) loadingText.innerText = "CARREGANDO INTELIGÊNCIA ARTIFICIAL...";
                
                const modelPromise = poseDetection.createDetector(
                    poseDetection.SupportedModels.MoveNet, 
                    { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
                );
                
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Timeout IA')), 8000)
                );

                try {
                    window.System.detector = await Promise.race([modelPromise, timeoutPromise]);
                    console.log("IA Pronta!");
                } catch (err) {
                    console.error("Falha IA:", err);
                }
            }

        } catch (globalErr) {
            console.error("Erro fatal:", globalErr);
        } finally {
            const loadScreen = document.getElementById('loading');
            if (loadScreen) loadScreen.classList.add('hidden');
            window.System.menu();
            
            document.body.addEventListener('click', () => window.Sfx.init(), {once:true});
            document.body.addEventListener('touchstart', () => window.Sfx.init(), {once:true});
        }
    },

    registerGame: (id, title, icon, logic, opts) => {
        if(!window.System.games.find(g => g.id === id)) {
            window.System.games.push({ id, title, icon, logic, opts });
            const grid = document.getElementById('channel-grid');
            if (grid) {
                const div = document.createElement('div');
                div.className = 'channel';
                div.innerHTML = `<div class="channel-icon">${icon}</div><div class="channel-title">${title}</div>`;
                div.onclick = () => window.System.loadGame(id);
                div.onmouseenter = window.Sfx.hover;
                grid.appendChild(div);
            }
        }
    },

    menu: () => {
        window.System.stopGame();
        const menu = document.getElementById('menu-screen');
        const ui = document.getElementById('game-ui');
        const over = document.getElementById('screen-over');
        const web = document.getElementById('webcam');

        if(menu) menu.classList.remove('hidden');
        if(ui) ui.classList.add('hidden');
        if(over) over.classList.add('hidden');
        if(web) web.style.opacity = 0;
        
        if (window.System.canvas) {
            const ctx = window.System.canvas.getContext('2d');
            ctx.fillStyle = "#ececec";
            ctx.fillRect(0, 0, window.System.canvas.width, window.System.canvas.height);
        }
    },

    loadGame: (id) => {
        const game = window.System.games.find(g => g.id === id);
        if(!game) return;

        window.System.activeGame = game;
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        
        if (window.System.video && window.System.video.readyState >= 2) {
            document.getElementById('webcam').style.opacity = game.opts.camOpacity || 0.3;
        }

        if (game.logic.init) game.logic.init();
        window.Sfx.click();
        window.System.loop();
    },

    loop: async () => {
        if(!window.System.activeGame) return;

        if (window.System.loopId) {
            cancelAnimationFrame(window.System.loopId);
            window.System.loopId = null;
        }

        const ctx = window.System.canvas.getContext('2d');
        const w = window.System.canvas.width;
        const h = window.System.canvas.height;

        let pose = null;
        if (window.System.detector && window.System.video && window.System.video.readyState === 4) {
            try {
                const p = await window.System.detector.estimatePoses(window.System.video, {flipHorizontal: false});
                if(p.length > 0) pose = p[0];
            } catch(e) { }
        }

        ctx.save();
        if(window.Gfx && window.Gfx.updateShake) window.Gfx.updateShake(ctx);
        
        const s = window.System.activeGame.logic.update(ctx, w, h, pose);
        ctx.restore();

        const scoreEl = document.getElementById('hud-score');
        if(typeof s === 'number' && scoreEl) scoreEl.innerText = s;

        window.System.loopId = requestAnimationFrame(window.System.loop);
    },

    stopGame: () => {
        if (window.System.activeGame && window.System.activeGame.logic.cleanup) {
            window.System.activeGame.logic.cleanup();
        }
        window.System.activeGame = null;
        if(window.System.loopId) {
            cancelAnimationFrame(window.System.loopId);
            window.System.loopId = null;
        }
    },

    home: () => { window.Sfx.click(); window.System.menu(); },
    
    gameOver: (s) => {
        window.System.stopGame();
        window.Sfx.crash();
        const finalScore = document.getElementById('final-score');
        if(finalScore) finalScore.innerText = s;
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
    },

    resize: () => {
        if(window.System.canvas) {
            window.System.canvas.width = window.innerWidth;
            window.System.canvas.height = window.innerHeight;
        }
    },

    msg: (t) => {
        const el = document.getElementById('game-msg');
        if(el) {
            el.innerText = t; el.style.opacity = 1;
            setTimeout(() => el.style.opacity = 0, 2000);
        }
    }
};

window.onload = window.System.init;
