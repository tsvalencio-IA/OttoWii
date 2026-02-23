/* =================================================================
   CORE DO SISTEMA - VERSÃO MISSÕES, PROGRESSÃO E MULTI-CAMERA
   STATUS: GERENCIADOR DE CÂMERA (FRONTAL/TRASEIRA) ATIVADO
   ================================================================= */

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
            const o = window.Sfx.ctx.createOscillator(); const g = window.Sfx.ctx.createGain();
            o.type=t; o.frequency.value=f; 
            g.gain.setValueAtTime(v, window.Sfx.ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.001, window.Sfx.ctx.currentTime+d);
            o.connect(g); g.connect(window.Sfx.ctx.destination); 
            o.start(); o.stop(window.Sfx.ctx.currentTime+d);
        } catch(e){}
    },
    hover: () => window.Sfx.play(800, 'sine', 0.05, 0.04),
    click: () => window.Sfx.play(1000, 'sine', 0.1, 0.08),
    error: () => window.Sfx.play(150, 'sawtooth', 0.3, 0.1),
    coin: () => { window.Sfx.play(988, 'sine', 0.1, 0.1); setTimeout(()=>window.Sfx.play(1319, 'sine', 0.2, 0.1), 100); },
    epic: () => { window.Sfx.play(400, 'square', 0.5, 0.2); setTimeout(()=>window.Sfx.play(600, 'sawtooth', 0.5, 0.2), 200); setTimeout(()=>window.Sfx.play(800, 'sine', 1.0, 0.3), 400); }
};

window.Gfx = {
    shake: 0,
    addShake: (val) => { window.Gfx.shake = Math.min(window.Gfx.shake + val, 30); },
    updateShake: (ctx) => {
        if(window.Gfx.shake > 0.5) {
            ctx.translate((Math.random()-0.5)*window.Gfx.shake, (Math.random()-0.5)*window.Gfx.shake);
            window.Gfx.shake *= 0.85;
        } else window.Gfx.shake = 0;
    },
    shakeScreen: (val) => { window.Gfx.addShake(val); }
};

window.Profile = {
    xp: 0, level: 1, coins: 0,
    
    load: () => {
        try {
            const data = localStorage.getItem('thiaguinho_os_profile_v2');
            if(data) {
                const p = JSON.parse(data);
                window.Profile.xp = p.xp || 0; window.Profile.level = p.level || 1; window.Profile.coins = p.coins || 0;
            }
        } catch(e){}
        window.Profile.updateUI();
    },
    save: () => { try { localStorage.setItem('thiaguinho_os_profile_v2', JSON.stringify({ xp: window.Profile.xp, level: window.Profile.level, coins: window.Profile.coins })); } catch(e){} window.Profile.updateUI(); },

    addReward: (score, isWin, extraCoins = 0) => {
        let xpGained = isWin ? Math.max(100, Math.floor(score * 2.0)) : Math.max(20, Math.floor(score * 0.5));
        let coinsGained = (isWin ? Math.max(10, Math.floor(score * 0.2)) : 0) + extraCoins; 
        
        window.Profile.xp += xpGained; window.Profile.coins += coinsGained;
        
        let nextLevelXP = window.Profile.level * 1000; let leveledUp = false;
        while(window.Profile.xp >= nextLevelXP) {
            window.Profile.level++; window.Profile.xp -= nextLevelXP; nextLevelXP = window.Profile.level * 1000; leveledUp = true;
        }
        window.Profile.save(); return { xp: xpGained, coins: coinsGained, leveledUp };
    },

    updateUI: () => {
        const reqXP = window.Profile.level * 1000; const pct = Math.min(100, (window.Profile.xp / reqXP) * 100);
        document.getElementById('ui-level').innerText = window.Profile.level;
        document.getElementById('ui-xp-text').innerText = `${window.Profile.xp}/${reqXP}`;
        document.getElementById('ui-xp-bar').style.width = `${pct}%`;
        document.getElementById('ui-coins').innerText = window.Profile.coins;
    },

    getRank: (score, isWin) => {
        if(!isWin) return { rank: 'D', color: '#95a5a6', msg: "FALHOU" };
        if(score > 3000) return { rank: 'S', color: '#f1c40f', msg: "LENDÁRIO!" };
        if(score > 1500) return { rank: 'A', color: '#e74c3c', msg: "EXCELENTE!" };
        if(score > 800)  return { rank: 'B', color: '#3498db', msg: "MUITO BOM" };
        return { rank: 'C', color: '#2ecc71', msg: "SUCESSO" };
    }
};

window.System = {
    playerId: 'p_' + Math.floor(Math.random()*10000),
    activeGame: null, loopId: null, canvas: null, video: null, detector: null,
    currentCameraMode: null, // Guarda se estamos na câmera da frente ou de trás

    // Gerenciador Inteligente de Câmeras
    switchCamera: async (facingMode) => {
        // Se a câmera que o jogo quer já estiver ligada, não faz nada
        if (window.System.currentCameraMode === facingMode) return;
        
        // Desliga a câmera atual
        if (window.System.video.srcObject) {
            window.System.video.srcObject.getTracks().forEach(track => track.stop());
        }

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: facingMode }, width: 640, height: 480 },
                audio: false
            });
            window.System.video.srcObject = stream;
            
            // Corrige o espelhamento: Câmera frontal vira um espelho, câmera traseira não!
            if (facingMode === 'environment') {
                window.System.video.style.transform = "none";
            } else {
                window.System.video.style.transform = "scaleX(-1)";
            }
            
            await new Promise((resolve) => { window.System.video.onloadedmetadata = () => resolve(); });
            window.System.currentCameraMode = facingMode;
        } catch(error) {
            console.error("Erro ao trocar de câmera:", error);
        }
    },

    registerGame: (id, title, icon, logic, opts={}) => {
        if(!window.Games) window.Games = [];
        const existing = window.Games.findIndex(g => g.id === id);
        if(existing >= 0) window.Games[existing] = {id, title, icon, logic, opts};
        else window.Games.push({id, title, icon, logic, opts});
        window.System.renderChannels();
    },

    renderChannels: () => {
        const grid = document.getElementById('channel-grid'); if(!grid) return; grid.innerHTML = '';
        window.Games.forEach(g => {
            const div = document.createElement('div'); div.className = 'channel';
            div.innerHTML = `<div class="channel-icon">${g.icon}</div><div class="channel-title">${g.title}</div>`;
            div.onclick = () => { window.Sfx.click(); window.System.openPhases(g); };
            div.onmouseenter = () => window.Sfx.hover(); grid.appendChild(div);
        });
    },

    openPhases: (game) => {
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('phase-screen').classList.remove('hidden');
        document.getElementById('phase-title').innerText = game.title.toUpperCase();
        
        const grid = document.getElementById('phase-grid'); grid.innerHTML = '';
        const phases = game.opts.phases || [ { id: 'arcade', name: 'MODO ARCADE', desc: 'Jogue livremente offline ou online', reqLvl: 1 } ];

        phases.forEach(fase => {
            const isUnlocked = window.Profile.level >= fase.reqLvl;
            const card = document.createElement('div');
            card.className = `mission-card ${isUnlocked ? '' : 'locked'}`;
            card.innerHTML = `
                <div class="mission-info">
                    <h2>${fase.name}</h2>
                    <p>${fase.desc}</p>
                </div>
                <div class="mission-icon">${isUnlocked ? '⭐' : '🔒'}</div>
            `;
            
            if(isUnlocked) {
                // AQUI NÓS VERIFICAMOS E TROCAMOS A CÂMERA ANTES DE ABRIR O JOGO
                card.onclick = async () => {
                    window.Sfx.click();
                    document.getElementById('phase-screen').classList.add('hidden');
                    document.getElementById('loading').classList.remove('hidden');
                    document.getElementById('loading-text').innerText = "AJUSTANDO SENSORES...";

                    // Se o jogo pede 'environment', ligamos a de trás. Se não, a padrão da frente ('user')
                    const targetCamera = game.opts.camera === 'environment' ? 'environment' : 'user';
                    await window.System.switchCamera(targetCamera);

                    document.getElementById('loading-text').innerText = "CARREGANDO MISSÃO...";
                    
                    setTimeout(() => {
                        document.getElementById('loading').classList.add('hidden');
                        document.getElementById('game-ui').classList.remove('hidden');
                        window.System.activeGame = game;
                        if(game.logic.init) game.logic.init(fase);
                        window.System.loop();
                    }, 500);
                };
            } else {
                card.onclick = () => window.System.msg(`Requer Nível ${fase.reqLvl}`);
            }
            grid.appendChild(card);
        });
    },

    loop: async () => {
        if(!window.System.activeGame) return;
        const w = window.System.canvas.width; const h = window.System.canvas.height;
        const ctx = window.System.canvas.getContext('2d');
        let pose = null;

        const isArMode = window.System.activeGame.opts.camera === 'environment';

        // BÔNUS DE BATERIA: Se for jogo de Realidade Aumentada, desliga a IA (MoveNet) para poupar o celular
        if(!isArMode && window.System.detector && window.System.video.readyState === 4) {
            const p = await window.System.detector.estimatePoses(window.System.video, {flipHorizontal: false});
            if(p.length > 0) pose = p[0];
        }

        ctx.save(); window.Gfx.updateShake(ctx);
        const score = window.System.activeGame.logic.update(ctx, w, h, pose);
        ctx.restore();
        
        const hud = document.getElementById('hud-score');
        if(hud) hud.innerText = Math.floor(score || 0);
        window.System.loopId = requestAnimationFrame(window.System.loop);
    },

    stopGame: () => {
        if(window.System.loopId) cancelAnimationFrame(window.System.loopId);
        if(window.System.activeGame?.logic.cleanup) window.System.activeGame.logic.cleanup();
        window.System.activeGame = null;
    },

    menu: () => { 
        window.System.stopGame(); 
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('phase-screen').classList.add('hidden');
        document.getElementById('menu-screen').classList.remove('hidden');
        window.Profile.updateUI(); 
    },
    home: () => { window.Sfx.click(); window.System.menu(); },
    
    gameOver: (score, isWin = true, coinsInGame = 0) => {
        window.System.stopGame();
        let finalScore = Math.floor(score || 0);
        
        let rewards = window.Profile.addReward(finalScore, isWin, coinsInGame);
        let rankData = window.Profile.getRank(finalScore, isWin);

        document.getElementById('result-header').innerText = isWin ? "MISSÃO CONCLUÍDA!" : "FALHA NA MISSÃO";
        document.getElementById('result-header').style.color = isWin ? "#2ecc71" : "#e74c3c";
        document.getElementById('final-score').innerText = finalScore;
        document.getElementById('result-status').innerText = rankData.msg;
        document.getElementById('result-xp').innerText = `+${rewards.xp}`;
        document.getElementById('result-coins').innerText = `+${rewards.coins}`;
        
        const rankStamp = document.getElementById('result-rank');
        rankStamp.innerText = rankData.rank;
        rankStamp.style.color = rankData.color;
        rankStamp.classList.remove('show');

        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('screen-over').classList.remove('hidden');
        
        setTimeout(() => {
            rankStamp.classList.add('show');
            if (isWin && (rankData.rank === 'S' || rankData.rank === 'A')) { window.Sfx.epic(); window.Gfx.shakeScreen(15); } 
            else if (isWin) { window.Sfx.coin(); }
            else { window.Sfx.error(); }
            if(rewards.leveledUp) setTimeout(() => window.System.msg("🔥 LEVEL UP! 🔥"), 1000);
        }, 300); 
    },

    resize: () => { if(window.System.canvas) { window.System.canvas.width = window.innerWidth; window.System.canvas.height = window.innerHeight; } },
    msg: (t) => {
        const el = document.getElementById('game-msg');
        if(el) { el.innerText = t; el.style.animation = 'none'; el.offsetHeight; el.style.animation = 'popMsg 1.5s forwards'; }
    }
};

const style = document.createElement('style');
style.innerHTML = `@keyframes popMsg { 0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0; } 15% { transform: translate(-50%, -50%) scale(1.2); opacity: 1; } 30% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 80% { transform: translate(-50%, -50%) scale(1); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; } }`;
document.head.appendChild(style);

window.onload = async () => {
    window.System.canvas = document.getElementById('game-canvas'); window.System.video = document.getElementById('webcam');
    window.System.resize(); window.addEventListener('resize', window.System.resize);
    window.Profile.load();

    // Inicia o sistema sempre com a câmera frontal, para o menu e jogos tradicionais
    await window.System.switchCamera('user');

    document.getElementById('loading-text').innerText = "CARREGANDO MOTOR IA...";
    await tf.ready();
    window.System.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING });

    document.getElementById('loading').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    window.System.renderChannels();
};
