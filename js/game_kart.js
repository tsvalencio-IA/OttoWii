// =============================================================================
// KART LEGENDS: DEFINITIVE EDITION (V-FINAL 177)
// ENGINE: PSEUDO-3D CLASSICA (ESTILO OUTRUN/HORIZON) 
// CORREÇÃO: CRASH DO CORE.JS + PERSPECTIVA DE CÂMERA
// =============================================================================

(function() {

    // --- PATCH DE SEGURANÇA DO SISTEMA (IMPEDE TELA BRANCA/ERRO DE CORE.JS) ---
    // Se o index.html não tiver o elemento que o core.js busca, criamos ele aqui
    // para evitar que o jogo trave no carregamento.
    if (!document.getElementById('loading-text')) {
        const fixEl = document.createElement('p');
        fixEl.id = 'loading-text';
        fixEl.style.display = 'none'; // Invisível, só para o JS achar
        const loader = document.getElementById('loading');
        if(loader) loader.appendChild(fixEl);
        else document.body.appendChild(fixEl);
    }

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES E TUNING
    // -----------------------------------------------------------------
    const CONF = {
        // Câmera (Ajuste fino para o ângulo da imagem de referência)
        CAMERA_HEIGHT: 1200, 
        CAMERA_DEPTH: 0.84,  // FOV
        DRAW_DISTANCE: 300,  // Quantos segmentos desenhar à frente
        
        // Pista
        SEGMENT_LENGTH: 200,
        RUMBLE_LENGTH: 3,
        ROAD_WIDTH: 2200, // Pista bem larga
        
        // Física
        MAX_SPEED: 260,
        ACCEL: 1.2,
        BREAKING: 3.0,
        DECEL: 0.98,
        OFFROAD_DECEL: 0.94,
        OFFROAD_LIMIT: 2.4, 
        CENTRIFUGAL: 0.3
    };

    // Paleta de Cores (Baseada na referência enviada)
    const THEMES = {
        grass: { 
            sky: ['#00B4DB', '#0083B0'], // Céu azul vibrante
            road: '#525c65',             // Asfalto azulado
            roadLine: '#ffffff', 
            rumble: ['#c0392b', '#ecf0f1'], // Zebra clássica
            ground: '#55aa44'            // Grama saturada
        },
        sand: { 
            sky: ['#FF8008', '#FFC837'], 
            road: '#7f8c8d', 
            roadLine: '#ffffff', 
            rumble: ['#d35400', '#f39c12'], 
            ground: '#f1c40f' 
        },
        snow: { 
            sky: ['#83a4d4', '#b6fbff'], 
            road: '#95a5a6', 
            roadLine: '#ecf0f1', 
            rumble: ['#2980b9', '#3498db'], 
            ground: '#dfe6e9' 
        }
    };

    const CHARACTERS = [
        { id: 0, name: 'SPEEDER', color: '#e74c3c', speed: 1.0, grip: 0.98 },
        { id: 1, name: 'TANK',    color: '#2ecc71', speed: 1.05, grip: 0.94 },
        { id: 2, name: 'DRIFTER', color: '#f1c40f', speed: 0.95, grip: 1.05 }
    ];

    const TRACKS = [
        { id: 0, name: 'FUJI CIRCUIT', theme: 'grass', curveMult: 1.0 },
        { id: 1, name: 'CANYON DRIFT', theme: 'sand', curveMult: 0.8 },
        { id: 2, name: 'ALPINE PEAK',  theme: 'snow', curveMult: 1.3 }
    ];

    // -----------------------------------------------------------------
    // 2. ENGINE LÓGICA
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT',
        roomId: 'kart_room_v2',
        
        // Estado
        selectedChar: 0,
        selectedTrack: 0,
        isOnline: false,
        isReady: false,
        
        // Física do Jogador
        position: 0,
        playerX: 0,
        speed: 0,
        steer: 0,       
        targetSteer: 0, 
        
        // Gameplay
        lap: 1,
        totalLaps: 3,
        rank: 1,
        score: 0,
        nitro: 100,
        turboLock: false,
        boostTimer: 0,
        
        // Mundo
        segments: [],
        trackLength: 0,
        cars: [], 
        
        // Input
        virtualWheel: { x:0, y:0, r:60, opacity:0, isActive: false },
        
        // Network
        dbRef: null,
        lastSync: 0,

        // =============================================================
        // CICLO DE VIDA
        // =============================================================
        init: function() {
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.setupUI();
            this.resetPhysics();
            window.System.msg("KART LEGENDS");
        },

        cleanup: function() {
            if (this.dbRef) try { this.dbRef.child('players').off(); } catch(e){}
            const btn = document.getElementById('nitro-btn-kart');
            if(btn) btn.remove();
            window.System.canvas.onclick = null;
        },

        resetPhysics: function() {
            this.position = 0;
            this.playerX = 0;
            this.speed = 0;
            this.steer = 0;
            this.nitro = 100;
            this.lap = 1;
            this.score = 0;
            this.cars = [];
            this.turboLock = false;
        },

        setupUI: function() {
            let btn = document.getElementById('nitro-btn-kart');
            if (!btn) {
                btn = document.createElement('div');
                btn.id = 'nitro-btn-kart';
                btn.innerText = "N";
                Object.assign(btn.style, {
                    position: 'absolute', bottom: '20%', right: '20px', width: '80px', height: '80px',
                    borderRadius: '50%', background: 'radial-gradient(#f1c40f, #e67e22)', 
                    border: '4px solid #fff', color: '#fff', display: 'none', 
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '24px', zIndex: '100', cursor: 'pointer',
                    boxShadow: '0 5px 15px rgba(0,0,0,0.5)', userSelect: 'none'
                });
                
                const fire = (e) => {
                    if(e) { e.preventDefault(); e.stopPropagation(); }
                    if(this.state === 'RACE' && this.nitro > 10) {
                        this.turboLock = true;
                        window.Sfx.play(600, 'sawtooth', 0.5);
                    }
                };
                
                btn.addEventListener('mousedown', fire);
                btn.addEventListener('touchstart', fire, {passive:false});
                btn.addEventListener('touchend', () => this.turboLock = false);
                btn.addEventListener('mouseup', () => this.turboLock = false);
                
                document.getElementById('game-ui').appendChild(btn);
            }

            // Handler de Clique Unificado
            window.System.canvas.onclick = (e) => {
                if (this.state === 'RACE') return;
                
                const rect = window.System.canvas.getBoundingClientRect();
                const scaleY = window.System.canvas.height / rect.height;
                const y = (e.clientY - rect.top) * scaleY;
                const h = window.System.canvas.height;

                if (this.state === 'MODE_SELECT') {
                    if (y < h * 0.5) this.selectMode('SOLO');
                    else this.selectMode('MULTI');
                    window.Sfx.click();
                } 
                else if (this.state === 'LOBBY') {
                    if (y > h*0.25 && y < h*0.45) {
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
                        window.Sfx.hover();
                    } else if (y > h*0.5 && y < h*0.7) {
                        this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                        window.Sfx.hover();
                    } else if (y > h*0.75) {
                        this.toggleReady();
                    }
                    if(this.isOnline) this.syncLobby();
                }
            };
        },

        // =============================================================
        // REDE E MULTIPLAYER
        // =============================================================
        selectMode: function(mode) {
            this.resetPhysics();
            if (mode === 'MULTI') {
                if (!window.DB) { window.System.msg("OFFLINE"); this.selectMode('SOLO'); return; }
                this.isOnline = true;
                this.connect();
                this.state = 'LOBBY';
            } else {
                this.isOnline = false;
                // Bots Offline para testar física
                this.cars = [
                    { id: 'cpu1', z: 0, x: -0.5, speed: 0, charId: 1, name: 'Luigi Bot', isBot: true },
                    { id: 'cpu2', z: 200, x: 0.5, speed: 0, charId: 2, name: 'Peach Bot', isBot: true }
                ];
                this.state = 'LOBBY';
            }
        },

        connect: function() {
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ name: 'Player', charId: 0, ready: false });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', (snap) => {
                const data = snap.val();
                if (!data) return;
                
                this.cars = Object.keys(data)
                    .filter(id => id !== window.System.playerId)
                    .map(id => ({
                        id: id,
                        isRemote: true,
                        ...data[id],
                        z: data[id].pos || 0,
                        x: data[id].x || 0,
                        speed: data[id].speed || 0
                    }));

                if (this.state === 'WAITING') {
                    const allReady = Object.values(data).every(p => p.ready);
                    if (Object.keys(data).length > 0 && allReady) this.startRace();
                }
            });
        },

        syncLobby: function() {
            if (this.dbRef) {
                this.dbRef.child('players/' + window.System.playerId).update({
                    charId: this.selectedChar,
                    trackId: this.selectedTrack,
                    ready: this.isReady
                });
            }
        },

        syncRace: function() {
            if (Date.now() - this.lastSync > 100 && this.dbRef) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    pos: Math.floor(this.position),
                    x: this.playerX,
                    speed: Math.floor(this.speed),
                    steer: this.steer
                });
            }
        },

        toggleReady: function() {
            if (!this.isOnline) { this.startRace(); return; }
            this.isReady = !this.isReady;
            window.Sfx.click();
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            if (this.isReady) window.System.msg("AGUARDANDO...");
            this.syncLobby();
        },

        startRace: function() {
            this.buildTrack(this.selectedTrack);
            this.state = 'RACE';
            document.getElementById('nitro-btn-kart').style.display = 'flex';
            window.System.msg("LARGADA!");
            window.Sfx.play(600, 'square', 0.5);
            
            this.position = 0;
            this.playerX = 0;
            this.speed = 0;
            // Configura bots para começar atrás
            this.cars.forEach((c, i) => { if(c.isBot) { c.z = (i+1) * 200; c.speed = 0; }});
        },

        // =============================================================
        // CONSTRUÇÃO DE PISTA
        // =============================================================
        buildTrack: function(trackId) {
            this.segments = [];
            const t = TRACKS[trackId];
            const curveMult = t.curveMult;
            
            const addSegment = (curve, y) => {
                const n = this.segments.length;
                let sprites = [];
                // Decoração aleatória
                if (Math.random() > 0.95) {
                    const type = t.theme === 'sand' ? 'cactus' : (t.theme === 'snow' ? 'rock' : 'tree');
                    const x = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random()*3);
                    sprites.push({ type: type, x: x });
                }

                this.segments.push({
                    index: n,
                    // P1 e P2 armazenam geometria 3D para projeção
                    p1: { world: { z: n * CONF.SEGMENT_LENGTH, y: y }, camera: {}, screen: {} },
                    p2: { world: { z: (n + 1) * CONF.SEGMENT_LENGTH, y: y }, camera: {}, screen: {} },
                    curve: curve,
                    sprites: sprites,
                    color: Math.floor(n / CONF.RUMBLE_LENGTH) % 2 ? 'dark' : 'light'
                });
            };

            const addRoad = (enter, hold, leave, curve, y=0) => {
                for(let i=0; i<enter; i++) addSegment(curve * (i/enter) * curveMult, y);
                for(let i=0; i<hold; i++)  addSegment(curve * curveMult, y);
                for(let i=0; i<leave; i++) addSegment(curve * ((leave-i)/leave) * curveMult, y);
            };

            // Layout
            addRoad(50, 50, 50, 0);       
            addRoad(50, 50, 50, 2);       
            addRoad(50, 50, 50, 0);
            addRoad(50, 50, 50, -2);      
            addRoad(50, 50, 50, -4);      
            addRoad(100, 50, 100, 0);     
            addRoad(50, 50, 50, 3);       
            addRoad(50, 50, 50, 0);       

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        // =============================================================
        // UPDATE LOOP
        // =============================================================
        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            if (this.segments.length === 0) return 0;

            // --- INPUT ---
            this.handleInput(w, h, pose);

            // --- FÍSICA ---
            const playerSegment = this.findSegment(this.position);
            const speedPercent = this.speed / CONF.MAX_SPEED;
            const dx = 0.015;

            // Aceleração
            if (this.turboLock && this.nitro > 0) {
                this.speed += CONF.ACCEL * 1.5;
                this.nitro -= 0.5;
            } else {
                this.speed += CONF.ACCEL * 0.5;
            }
            
            // Atrito e Limites
            let maxSpeed = CONF.MAX_SPEED * CHARACTERS[this.selectedChar].speed;
            if (Math.abs(this.playerX) > CONF.OFFROAD_LIMIT) {
                maxSpeed *= 0.3; // Grama freia
                this.speed *= CONF.OFFROAD_DECEL;
            } else {
                this.speed *= CONF.DECEL; 
            }
            this.speed = Math.max(0, Math.min(this.speed, maxSpeed));

            // Curva (Física Centrífuga)
            this.playerX = this.playerX - (dx * speedPercent * playerSegment.curve * CONF.CENTRIFUGAL);
            this.playerX = this.playerX + (dx * speedPercent * this.steer);

            if (this.playerX < -3.5) this.playerX = -3.5;
            if (this.playerX > 3.5)  this.playerX = 3.5;

            // Avanço Z
            this.position += this.speed;
            while (this.position >= this.trackLength) {
                this.position -= this.trackLength;
                this.lap++;
                if (this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while (this.position < 0) this.position += this.trackLength;

            // --- RIVAIS ---
            this.updateCars(this.trackLength);

            // --- RENDER ---
            this.renderWorld(ctx, w, h, playerSegment);
            this.renderHUD(ctx, w, h);

            if (this.isOnline) this.syncRace();

            return Math.floor(this.score);
        },

        handleInput: function(w, h, pose) {
            let handsDetected = false;
            // Webcam Control
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.2 && rw.score > 0.2) {
                    handsDetected = true;
                    // Normaliza para o centro da tela
                    const dx = rw.x - lw.x;
                    const dy = rw.y - lw.y;
                    const angle = Math.atan2(dy, dx);
                    
                    this.targetSteer = angle * 2.5; 
                    
                    // Visual Volante
                    const nx = ((lw.x + rw.x) / 2) / 640;
                    const ny = ((lw.y + rw.y) / 2) / 480;
                    this.virtualWheel.x = (1-nx) * w;
                    this.virtualWheel.y = ny * h;
                    this.virtualWheel.isActive = true;
                    this.virtualWheel.opacity = 1;
                }
            }

            if (!handsDetected) {
                // Fallback Mouse (Cantos da tela) - Se não tem webcam
                // A leitura do mouse é feita no evento 'mousemove' se fosse implementado
                // Aqui usamos o targetSteer que já foi setado no onclick para mobile/mouse
                this.virtualWheel.isActive = false;
                this.virtualWheel.opacity *= 0.9;
                
                // Auto-center se não estiver segurando
                if(Math.abs(this.targetSteer) > 0.05) this.targetSteer *= 0.85; 
                else this.targetSteer = 0;
            }

            this.steer += (this.targetSteer - this.steer) * 0.2;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));
        },

        updateCars: function(trackLen) {
            let pRank = 1;
            const myTotalPos = (this.lap * trackLen) + this.position;

            this.cars.forEach(car => {
                if (car.isBot) {
                    const seg = this.findSegment(car.z);
                    car.x += (-(seg.curve * 0.5) - car.x) * 0.05; // IA simples
                    let maxS = CONF.MAX_SPEED * (0.9 + (car.charId * 0.05));
                    if (car.speed < maxS) car.speed += CONF.ACCEL;
                    
                    car.z += car.speed;
                    if (car.z >= trackLen) { car.z -= trackLen; car.lap = (car.lap||1)+1; }
                }
                const enemyTotalPos = ((car.lap||1) * trackLen) + car.z;
                if (enemyTotalPos > myTotalPos) pRank++;
            });
            this.rank = pRank;
        },

        findSegment: function(z) {
            return this.segments[Math.floor(z / CONF.SEGMENT_LENGTH) % this.segments.length];
        },

        finishRace: function() {
            this.state = 'FINISHED';
            window.System.msg(this.rank === 1 ? "VITÓRIA!" : `${this.rank}º LUGAR`);
            document.getElementById('nitro-btn-kart').style.display = 'none';
            setTimeout(() => window.System.gameOver(this.rank === 1 ? 1000 : 500), 2000);
        },

        // =============================================================
        // RENDERIZAÇÃO 
        // =============================================================
        renderWorld: function(ctx, w, h, playerSeg) {
            const theme = THEMES[TRACKS[this.selectedTrack].theme];
            
            // 1. FUNDO (Céu + Parallax)
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
            skyGrad.addColorStop(0, theme.sky[0]);
            skyGrad.addColorStop(1, theme.sky[1]);
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h);

            // Montanhas Parallax
            const hillOffset = this.steer * 50; 
            ctx.fillStyle = 'rgba(255,255,255,0.8)'; // Branco (Monte Fuji Style)
            ctx.beginPath();
            ctx.moveTo(w*0.3, h*0.5);
            ctx.lineTo(w*0.5, h*0.2); // Pico
            ctx.lineTo(w*0.7, h*0.5);
            ctx.fill();
            
            // 2. ESTRADA (Projeção)
            const baseSegment = this.findSegment(this.position);
            const basePercent = (this.position % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            
            let dx = -(baseSegment.curve * basePercent);
            let x = 0;
            let maxY = h; 

            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segment = this.segments[(baseSegment.index + n) % this.segments.length];
                const looped = segment.index < baseSegment.index;
                
                let camX = this.playerX * CONF.ROAD_WIDTH;
                let camY = CONF.CAMERA_HEIGHT;
                let camZ = this.position - (looped ? this.trackLength : 0);

                // Projeta os dois pontos do segmento (perto e longe)
                this.project(segment.p1, (this.playerX * CONF.ROAD_WIDTH) - x,      camY, camZ, w, h);
                this.project(segment.p2, (this.playerX * CONF.ROAD_WIDTH) - x - dx, camY, camZ, w, h);

                x += dx;
                dx += segment.curve;

                // Culling (Otimização e Z-Buffer simples)
                if (segment.p1.camera.z <= CONF.CAMERA_DEPTH || segment.p2.screen.y >= maxY || segment.p2.screen.y >= segment.p1.screen.y) 
                    continue;

                this.renderSegment(ctx, w, segment, theme);
                maxY = segment.p1.screen.y; // Corta o que está atrás

                // Sprites
                for(let i=0; i<segment.sprites.length; i++) {
                    const sprite = segment.sprites[i];
                    const scale = segment.p1.screen.scale;
                    const sx = segment.p1.screen.x + (scale * sprite.x * CONF.ROAD_WIDTH * w/2);
                    const sy = segment.p1.screen.y;
                    this.renderSprite(ctx, sprite.type, sx, sy, scale * w, false);
                }

                // Carros
                this.cars.forEach(car => {
                    const carSeg = this.findSegment(car.z);
                    if (carSeg.index === segment.index) {
                        const scale = segment.p1.screen.scale;
                        const cx = segment.p1.screen.x + (scale * car.x * CONF.ROAD_WIDTH * w/2);
                        const cy = segment.p1.screen.y;
                        const rivalColor = CHARACTERS[car.charId || 1].color;
                        this.renderKart(ctx, cx, cy, scale * w, 0, rivalColor, false);
                    }
                });
            }

            // 3. JOGADOR
            const playerScale = w * 0.0006; 
            this.renderPlayer(ctx, w/2, h*0.88, playerScale * w);
        },

        project: function(p, cameraX, cameraY, position, w, h) {
            p.camera.z = p.world.z - position;
            if (p.camera.z < 0) p.camera.z += this.trackLength;
            
            p.screen.scale = CONF.CAMERA_DEPTH / (p.camera.z || 1);
            
            // A mágica da projeção: Y da tela = Centro + (Altura Mundo - Altura Camera) * Escala
            // O erro anterior estava aqui, gerando coordenadas negativas ou invertidas
            p.screen.x = Math.round((w/2) + (p.screen.scale * -cameraX * w/2));
            p.screen.y = Math.round((h/2) - (p.screen.scale * (p.world.y - cameraY) * h/2)); 
            p.screen.w = Math.round(p.screen.scale * CONF.ROAD_WIDTH * w/2);
        },

        renderSegment: function(ctx, w, seg, theme) {
            const x1 = seg.p1.screen.x;
            const y1 = seg.p1.screen.y;
            const w1 = seg.p1.screen.w;
            const x2 = seg.p2.screen.x;
            const y2 = seg.p2.screen.y;
            const w2 = seg.p2.screen.w;

            // Grama
            ctx.fillStyle = seg.color === 'dark' ? theme.ground : adjustColor(theme.ground, -20);
            ctx.fillRect(0, y2, w, y1 - y2);

            // Zebra
            const r1 = w1 * 1.2;
            const r2 = w2 * 1.2;
            ctx.fillStyle = seg.color === 'dark' ? theme.rumble[0] : theme.rumble[1];
            ctx.beginPath();
            ctx.moveTo(x1 - r1, y1); ctx.lineTo(x1 + r1, y1);
            ctx.lineTo(x2 + r2, y2); ctx.lineTo(x2 - r2, y2);
            ctx.fill();

            // Estrada
            ctx.fillStyle = seg.color === 'dark' ? theme.road : adjustColor(theme.road, 10);
            ctx.beginPath();
            ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1);
            ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2);
            ctx.fill();

            // Linha
            if (seg.color === 'dark') {
                ctx.fillStyle = theme.roadLine;
                const lw1 = w1 * 0.05; const lw2 = w2 * 0.05;
                ctx.beginPath();
                ctx.moveTo(x1 - lw1, y1); ctx.lineTo(x1 + lw1, y1);
                ctx.lineTo(x2 + lw2, y2); ctx.lineTo(x2 - lw2, y2);
                ctx.fill();
            }
        },

        renderSprite: function(ctx, type, x, y, scale, isPlayer) {
            const s = scale * 4000; 
            const h = s; 
            const w = s * 0.5;
            
            if (type === 'tree') {
                ctx.fillStyle = '#795548'; ctx.fillRect(x-w*0.2, y-h, w*0.4, h); 
                ctx.fillStyle = '#4caf50'; 
                ctx.beginPath(); ctx.moveTo(x-w, y-h*0.3); ctx.lineTo(x, y-h*1.5); ctx.lineTo(x+w, y-h*0.3); ctx.fill();
            } else if (type === 'cactus') {
                ctx.fillStyle = '#2e7d32'; 
                ctx.roundRect(x-w*0.2, y-h, w*0.4, h, 10); 
                ctx.fill();
            } else if (type === 'rock') {
                ctx.fillStyle = '#9e9e9e';
                ctx.beginPath(); ctx.arc(x, y-w*0.3, w*0.4, Math.PI, 0); ctx.fill();
            }
        },

        renderPlayer: function(ctx, x, y, scale) {
            const bounce = Math.sin(Date.now() * 0.02) * (this.speed * 0.05);
            // Banking visual: Inclina o sprite, não a tela
            const lean = this.steer * 0.3; 
            const color = CHARACTERS[this.selectedChar].color;
            this.renderKart(ctx, x, y + bounce, scale, lean, color, true);
        },

        renderKart: function(ctx, x, y, size, lean, color, isPlayer) {
            ctx.save();
            ctx.translate(x, y);
            
            const w = size * 300;
            const h = size * 150;
            
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(0, 0, w/1.8, h/3, 0, 0, Math.PI*2); ctx.fill();

            // Pneus
            ctx.fillStyle = '#222';
            ctx.fillRect(-w/2, -h/2, w/4, h/2); 
            ctx.fillRect(w/4, -h/2, w/4, h/2); 

            // Chassi (Trapézio que inclina)
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-w/2.2, -h/1.5 + (lean*10)); 
            ctx.lineTo(w/2.2, -h/1.5 - (lean*10));  
            ctx.lineTo(w/2.2, 0);
            ctx.lineTo(-w/2.2, 0);
            ctx.fill();

            // Capacete
            ctx.fillStyle = '#ffeaa7'; 
            ctx.beginPath(); ctx.arc(0 - (lean*5), -h/1.2, h/3, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = color; 
            ctx.beginPath(); ctx.arc(0 - (lean*5), -h/1.1, h/3.2, Math.PI, 0); ctx.fill();

            if (isPlayer && this.turboLock) {
                ctx.fillStyle = `rgba(255, ${Math.random()*255}, 0, 0.8)`;
                ctx.beginPath();
                ctx.moveTo(-10, -h/2); ctx.lineTo(10, -h/2); ctx.lineTo(0, -h - Math.random()*20);
                ctx.fill();
            }
            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            ctx.fillStyle = "#fff";
            ctx.textAlign = "right";
            ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 20, 50);
            ctx.font = "16px Arial";
            ctx.fillText("KM/H", w - 20, 75);

            ctx.fillStyle = "#333";
            ctx.fillRect(w - 30, 90, 10, 100);
            ctx.fillStyle = this.turboLock ? "#00ffff" : "#f1c40f";
            const hBar = (this.nitro / 100) * 100;
            ctx.fillRect(w - 30, 190 - hBar, 10, hBar);

            if (this.state === 'RACE') {
                ctx.textAlign = "left";
                ctx.fillStyle = this.rank === 1 ? "#f1c40f" : "#fff";
                ctx.font = "bold 40px 'Russo One'";
                ctx.fillText(`${this.rank}º`, 20, 50);
                ctx.font = "20px Arial";
                ctx.fillStyle = "#fff";
                ctx.fillText(`VOLTA ${this.lap}/${this.totalLaps}`, 20, 80);
            }
        },

        renderModeSelect: function(ctx, w, h) {
            const grad = ctx.createLinearGradient(0,0,0,h); 
            grad.addColorStop(0, '#2980b9'); grad.addColorStop(1, '#2c3e50');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; 
            ctx.font = "italic bold 60px 'Russo One'";
            ctx.fillText("KART LEGENDS", w/2, h*0.3);
            
            this.drawButton(ctx, w/2, h*0.5, "JOGO RÁPIDO", "#e67e22");
            this.drawButton(ctx, w/2, h*0.65, "MULTIPLAYER", "#27ae60");
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(0,0,w,h);
            const char = CHARACTERS[this.selectedChar];
            const track = TRACKS[this.selectedTrack];
            
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font = "bold 40px 'Russo One'";
            ctx.fillText("LOBBY", w/2, h*0.15);
            
            ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(w/2, h*0.35, 80, 0, Math.PI*2); ctx.fill();
            this.renderKart(ctx, w/2, h*0.35, 1.5, 0, char.color, false);
            
            this.drawButton(ctx, w/2, h*0.55, `< ${char.name} >`, '#34495e', 200);
            this.drawButton(ctx, w/2, h*0.65, `< ${track.name} >`, '#34495e', 200);
            const btnTxt = this.isReady ? "AGUARDANDO..." : "PRONTO!";
            this.drawButton(ctx, w/2, h*0.85, btnTxt, this.isReady ? '#7f8c8d' : '#e74c3c');
        },

        drawButton: function(ctx, x, y, txt, color, w=300) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.roundRect(x - w/2, y - 30, w, 60, 10); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font="bold 24px Arial"; ctx.textAlign="center";
            ctx.fillText(txt, x, y+8);
        }
    };

    function adjustColor(color, amount) { return color; }

    if(window.System) {
        window.System.registerGame('drive', 'Kart Legends', '🏎️', Logic, {
            camOpacity: 0.2
        });
    }

})();