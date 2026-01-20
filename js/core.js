window.log("Carregando Core.js...");

window.Sfx = {
    play: function() { /* Som desativado temporariamente para teste */ },
    boot: function() {}, click: function() {}, coin: function() {}, jump: function() {}, crash: function() {}
};

window.Gfx = {
    shake: function() {},
    update: function(ctx) {}
};

window.System = {
    video: null, canvas: null, ctx: null, detector: null,
    activeGame: null, loopId: null, games: {},

    registerGame: function(id, meta, logic) {
        window.log("JOGO ENCONTRADO: " + id);
        this.games[id] = { meta: meta, logic: logic };
        this.renderMenu();
    },

    boot: async function() {
        window.log("Iniciando Boot...");
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
            document.getElementById('webcam').srcObject = stream;
            
            window.log("Câmera OK. Carregando IA...");
            await tf.setBackend('webgl');
            this.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING });
            
            this.canvas = document.getElementById('game-canvas');
            this.ctx = this.canvas.getContext('2d');
            this.resize();
            
            window.log("SISTEMA PRONTO!");
        } catch(e) {
            window.log("ERRO BOOT: " + e.message);
        }
    },

    renderMenu: function() {
        const grid = document.getElementById('channel-grid');
        grid.innerHTML = '';
        Object.keys(this.games).forEach(k => {
            const g = this.games[k];
            const div = document.createElement('div');
            div.className = 'channel';
            // CLIQUE DIRETO COM LOG
            div.onclick = function() { 
                window.log("Clicou em: " + k);
                window.System.launch(k); 
            };
            div.innerHTML = `<div class="channel-icon">${g.meta.icon}</div><div class="channel-title">${g.meta.name}</div>`;
            grid.appendChild(div);
        });
    },

    launch: function(id) {
        window.log("Tentando lançar: " + id);
        try {
            if(!this.detector) {
                window.log("IA ainda não carregou! Iniciando Boot forçado...");
                this.boot().then(() => this.launch(id)); // Tenta bootar e depois lança
                return;
            }

            const g = this.games[id];
            this.activeGame = g;

            document.getElementById('screen-menu').classList.add('hidden');
            document.getElementById('screen-game').classList.remove('hidden');
            document.getElementById('webcam').style.opacity = g.meta.camOpacity || 0.2;

            window.log("Executando init() do jogo...");
            g.logic.init();
            
            window.log("Iniciando Loop...");
            if(!this.loopId) this.loop();

        } catch(e) {
            window.log("ERRO AO ABRIR: " + e.message);
        }
    },

    loop: async function() {
        if(!this.activeGame) return;
        
        try {
            let pose = null;
            if(this.detector) {
                const poses = await this.detector.estimatePoses(document.getElementById('webcam'), {flipHorizontal: false});
                if(poses.length > 0) pose = poses[0];
            }

            const ctx = this.ctx;
            const w = this.canvas.width;
            const h = this.canvas.height;

            ctx.clearRect(0,0,w,h);
            const score = this.activeGame.logic.update(ctx, w, h, pose);
            
            document.getElementById('score-display').innerText = Math.floor(score);

            this.loopId = requestAnimationFrame(() => this.loop());
        } catch(e) {
            window.log("ERRO NO LOOP: " + e.message);
            this.stopGame();
        }
    },

    stopGame: function() {
        cancelAnimationFrame(this.loopId);
        this.loopId = null;
        this.activeGame = null;
    },

    menu: function() {
        this.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('screen-game').classList.add('hidden');
    },
    
    gameOver: function(s) {
        this.stopGame();
        alert("GAME OVER! Score: " + s);
        this.menu();
    },

    msg: function(t) {
        document.getElementById('game-msg').innerText = t;
    },

    resize: function() {
        if(this.canvas) {
            this.canvas.width = window.innerWidth;
            this.canvas.height = window.innerHeight;
        }
    }
};