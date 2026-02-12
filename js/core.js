/* =================================================================
   CORE ENGINE PLATINUM - AR & MULTIPLAYER ARCHITECTURE
   ================================================================= */

class AudioManager {
    constructor() {
        this.ctx = null;
        this.master = null;
    }
    init() {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.5;
        this.master.connect(this.ctx.destination);
    }
    play(freq, type = 'sine', duration = 0.1, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }
}

class InputManager {
    constructor() {
        this.pose = null;
        this.history = [];
        this.smoothFactor = 0.4;
    }
    update(newPose) {
        if (!newPose) return;
        if (!this.pose) { this.pose = newPose; return; }
        // Suavização por interpolação (Lerp) de todos os pontos-chave
        newPose.keypoints.forEach((kp, i) => {
            const current = this.pose.keypoints[i];
            current.x += (kp.x - current.x) * this.smoothFactor;
            current.y += (kp.y - current.y) * this.smoothFactor;
            current.score = kp.score;
        });
    }
}

class SystemEngine {
    constructor() {
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.detector = null;
        this.games = [];
        this.activeGame = null;
        this.lastTime = 0;
        this.playerId = 'PLAYER_' + Math.floor(Math.random() * 9999);
        
        this.audio = new AudioManager();
        this.input = new InputManager();
        this.netStatus = 'OFFLINE';
    }

    async init() {
        const progressBar = document.getElementById('load-progress');
        const loadText = document.getElementById('loading-text');

        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());

        // 1. Camera Init
        try {
            this.video = document.getElementById('webcam');
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { width: 640, height: 480, frameRate: 30 } 
            });
            this.video.srcObject = stream;
            await new Promise(r => this.video.onloadedmetadata = r);
            this.video.play();
            progressBar.style.width = '30%';
        } catch(e) { loadText.innerText = "CAMERA ERROR"; }

        // 2. Pose Detection Init
        loadText.innerText = "LOADING AI MODELS...";
        if (typeof poseDetection !== 'undefined') {
            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet, 
                { modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING }
            );
            progressBar.style.width = '70%';
        }

        // 3. Network Init
        if (window.DB) {
            this.netStatus = 'ONLINE NODE';
            document.getElementById('net-status').innerText = '🟢 ' + this.netStatus;
            document.getElementById('net-status').classList.add('text-cyan-400');
        }

        progressBar.style.width = '100%';
        setTimeout(() => {
            document.getElementById('loading').style.opacity = '0';
            setTimeout(() => document.getElementById('loading').classList.add('hidden'), 500);
            this.menu();
        }, 800);

        document.getElementById('player-tag').innerText = this.playerId;
        this.startUIEffects();
        
        // Loop Start
        requestAnimationFrame((t) => this.loop(t));
    }

    registerGame(id, title, icon, logic, opts = {}) {
        this.games.push({ id, title, icon, logic, opts });
        const grid = document.getElementById('channel-grid');
        const card = document.createElement('div');
        card.className = 'channel-card glass p-8 flex flex-col items-center justify-center cursor-pointer group';
        card.innerHTML = `
            <div class="text-6xl mb-4 group-hover:scale-110 transition-transform">${icon}</div>
            <h3 class="font-bold tracking-tighter italic text-xl uppercase">${title}</h3>
            <div class="w-1/2 h-0.5 bg-white/10 mt-4 group-hover:bg-[#00f2ff] transition-colors"></div>
        `;
        card.onclick = () => this.loadGame(id);
        grid.appendChild(card);
    }

    loadGame(id) {
        const game = this.games.find(g => g.id === id);
        if (!game) return;
        
        this.audio.init();
        this.audio.play(800, 'sine', 0.1, 0.2);
        
        this.activeGame = game;
        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        document.getElementById('webcam').style.opacity = game.opts.camOpacity || 0.3;
        
        if (game.logic.init) game.logic.init();
        this.msg(game.title);
    }

    menu() {
        if (this.activeGame?.logic.cleanup) this.activeGame.logic.cleanup();
        this.activeGame = null;
        document.getElementById('menu-screen').classList.remove('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('webcam').style.opacity = 0;
    }

    loop(time) {
        const dt = (time - this.lastTime) / 1000;
        this.lastTime = time;

        this.updateAI();
        
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.activeGame) {
            const score = this.activeGame.logic.update(this.ctx, this.canvas.width, this.canvas.height, this.input.pose, dt);
            document.getElementById('hud-score').innerText = String(Math.floor(score || 0)).padStart(5, '0');
        }

        this.updateClock();
        requestAnimationFrame((t) => this.loop(t));
    }

    async updateAI() {
        if (this.detector && this.video?.readyState === 4) {
            const poses = await this.detector.estimatePoses(this.video, { flipHorizontal: false });
            if (poses.length > 0) this.input.update(poses[0]);
        }
    }

    msg(t) {
        const el = document.getElementById('game-msg');
        el.innerText = t;
        el.style.opacity = 1;
        el.style.transform = 'translate(-50%, -50%) scale(1)';
        setTimeout(() => {
            el.style.opacity = 0;
            el.style.transform = 'translate(-50%, -50%) scale(1.5)';
        }, 1500);
    }

    home() {
        this.audio.play(400, 'sine', 0.1);
        this.menu();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    updateClock() {
        const now = new Date();
        document.getElementById('clock').innerText = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    }

    startUIEffects() {
        const canvas = document.getElementById('ui-bg-particles');
        const ctx = canvas.getContext('2d');
        const particles = Array(50).fill(0).map(() => ({
            x: Math.random() * window.innerWidth,
            y: Math.random() * window.innerHeight,
            s: Math.random() * 2,
            v: Math.random() * 0.5
        }));

        const draw = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            ctx.fillStyle = '#00f2ff';
            particles.forEach(p => {
                p.y -= p.v;
                if (p.y < 0) p.y = canvas.height;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.s, 0, Math.PI*2);
                ctx.fill();
            });
            requestAnimationFrame(draw);
        };
        draw();
    }

    showSettings() { this.showModal("Settings", "Graphics: High Performance\nLatency: 24ms\nAR Optimization: Enabled"); }
    showModal(title, content) {
        const m = document.getElementById('global-modal');
        document.getElementById('modal-title').innerText = title;
        document.getElementById('modal-content').innerText = content;
        m.classList.remove('pointer-events-none');
        m.classList.add('opacity-100');
        m.children[0].classList.remove('scale-90');
    }
    closeModal() {
        const m = document.getElementById('global-modal');
        m.classList.add('pointer-events-none');
        m.classList.remove('opacity-100');
        m.children[0].classList.add('scale-90');
    }
}

window.System = new SystemEngine();
window.onload = () => window.System.init();