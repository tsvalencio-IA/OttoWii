// =============================================================================
// KART LEGENDS: DEFINITIVE EDITION (V-FINAL 177)
// ENGINE: PSEUDO-3D CLASSICA (ESTILO OUTRUN) COM VISUAL RETRO-MODERNO
// =============================================================================

(function() {

    // --- PATCH DE SEGURANÇA (CORREÇÃO DO ERRO DO CONSOLE) ---
    // Garante que o elemento 'loading-text' exista para o core.js não travar
    if (!document.getElementById('loading-text')) {
        const fixEl = document.createElement('div');
        fixEl.id = 'loading-text';
        fixEl.style.display = 'none';
        document.body.appendChild(fixEl);
    }

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES E TUNING (GAME DESIGN)
    // -----------------------------------------------------------------
    const CONF = {
        // Câmera (Ajustada para o ângulo da imagem de referência)
        CAMERA_HEIGHT: 1000, 
        CAMERA_DEPTH: 0.84,  // Field of View profundidade
        
        // Pista
        SEGMENT_LENGTH: 200,
        RUMBLE_LENGTH: 3,
        ROAD_WIDTH: 2000, // Pista larga estilo arcade
        LANES: 3,
        DRAW_DISTANCE: 300, // Visibilidade distante

        // Física
        MAX_SPEED: 240, // Km/h visual
        ACCEL: 1.2,
        BREAKING: 3.0,
        DECEL: 0.98,
        OFFROAD_DECEL: 0.95,
        OFFROAD_LIMIT: 2.4, // Limite onde a grama começa
        CENTRIFUGAL: 0.3    // Força que joga pra fora na curva
    };

    const CHARACTERS = [
        { id: 0, name: 'MARIO', color: '#e74c3c', speed: 1.0, grip: 0.98 },  // Vermelho
        { id: 1, name: 'LUIGI', color: '#2ecc71', speed: 1.05, grip: 0.94 }, // Verde
        { id: 2, name: 'PEACH', color: '#f1c40f', speed: 0.95, grip: 1.05 }  // Amarelo
    ];

    const TRACKS = [
        { id: 0, name: 'GP CIRCUITO', theme: 'grass', sky: 0, curveMult: 1.0 },
        { id: 1, name: 'DESERTO SECO', theme: 'sand', sky: 1, curveMult: 0.8 },
        { id: 2, name: 'GELO FINAL', theme: 'snow', sky: 2, curveMult: 1.3 }
    ];

    // Cores Vibrantes (Baseadas na imagem de referência)
    const THEMES = {
        grass: { 
            sky: ['#00B4DB', '#0083B0'], 
            road: '#525c65', 
            roadLine: '#ffffff', 
            rumble: ['#c0392b', '#ecf0f1'], // Zebra clássica Vermelha/Branca
            ground: '#55aa44' 
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

    // -----------------------------------------------------------------
    // 2. ENGINE LÓGICA
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, RACE, FINISHED
        roomId: 'kart_room_v1',
        
        // Seleção
        selectedChar: 0,
        selectedTrack: 0,
        
        // Estado
        isOnline: false,
        isReady: false,
        
        // Física
        position: 0,
        playerX: 0,
        speed: 0,
        steer: 0,       // Suavizado
        targetSteer: 0, // Input Bruto
        
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
        cars: [], // Rivais
        
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
            // Botão Nitro Overlay
            let btn = document.getElementById('nitro-btn-kart');
            if (!btn) {
                btn = document.createElement('div');
                btn.id = 'nitro-btn-kart';
                btn.innerText = "NITRO";
                Object.assign(btn.style, {
                    position: 'absolute', bottom: '15%', right: '20px', width: '90px', height: '90px',
                    borderRadius: '50%', background: 'radial-gradient(#f1c40f, #e67e22)', 
                    border: '4px solid #fff', color: '#fff', display: 'none', 
                    alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'Russo One', fontSize: '18px', zIndex: '50', cursor: 'pointer',
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

            // Handler de Clique para Menus
            window.System.canvas.onclick = (e) => {
                if (this.state === 'RACE') return;
                
                const rect = window.System.canvas.getBoundingClientRect();
                const scaleX = window.System.canvas.width / rect.width;
                const scaleY = window.System.canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                const w = window.System.canvas.width;
                const h = window.System.canvas.height;

                if (this.state === 'MODE_SELECT') {
                    if (y < h * 0.5) this.selectMode('SOLO');
                    else this.selectMode('MULTI');
                    window.Sfx.click();
                } 
                else if (this.state === 'LOBBY') {
                    // Seleção Personagem
                    if (y > h*0.25 && y < h*0.45) {
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
                        window.Sfx.hover();
                    }
                    // Seleção Pista
                    else if (y > h*0.5 && y < h*0.7) {
                        this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                        window.Sfx.hover();
                    }
                    // Botão Start
                    else if (y > h*0.75) {
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
                if (!window.DB) { window.System.msg("OFFLINE - INDO PARA SOLO"); this.selectMode('SOLO'); return; }
                this.isOnline = true;
                this.connect();
                this.state = 'LOBBY';
            } else {
                this.isOnline = false;
                // Bots Offline
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
                
                // Atualiza lista de rivais (exceto eu mesmo)
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

                // Check Auto Start
                if (this.state === 'WAITING') {
                    const allReady = Object.values(data).every(p => p.ready);
                    const count = Object.keys(data).length;
                    if (count > 1 && allReady) this.startRace();
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
            if (this.isReady) window.System.msg("AGUARDANDO OPONENTES...");
            this.syncLobby();
        },

        startRace: function() {
            this.buildTrack(this.selectedTrack);
            this.state = 'RACE';
            document.getElementById('nitro-btn-kart').style.display = 'flex';
            window.System.msg("LARGADA!");
            window.Sfx.play(600, 'square', 0.5);
            // Zera posições de largada
            this.position = 0;
            this.playerX = 0;
            this.speed = 0;
            // Se Offline, define velocidade inicial dos bots
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
                // Props (Decoração lateral)
                let sprites = [];
                if (Math.random() > 0.92) {
                    const type = t.theme === 'sand' ? 'cactus' : (t.theme === 'snow' ? 'rock' : 'tree');
                    const x = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random()*3);
                    sprites.push({ type: type, x: x });
                }

                this.segments.push({
                    index: n,
                    p1: { world: { z: n * CONF.SEGMENT_LENGTH }, camera: {}, screen: {} },
                    p2: { world: { z: (n + 1) * CONF.SEGMENT_LENGTH }, camera: {}, screen: {} },
                    curve: curve,
                    sprites: sprites,
                    color: Math.floor(n / CONF.RUMBLE_LENGTH) % 2 ? 'dark' : 'light',
                    y: y 
                });
            };

            const addRoad = (enter, hold, leave, curve, y=0) => {
                for(let i=0; i<enter; i++) addSegment(curve * (i/enter) * curveMult, y);
                for(let i=0; i<hold; i++)  addSegment(curve * curveMult, y);
                for(let i=0; i<leave; i++) addSegment(curve * ((leave-i)/leave) * curveMult, y);
            };

            // Layout da Pista (Pseudo-procedural)
            addRoad(50, 50, 50, 0);       // Reta inicial
            addRoad(50, 50, 50, 2);       // Curva direita suave
            addRoad(50, 50, 50, 0);
            addRoad(50, 50, 50, -2);      // Curva esquerda
            addRoad(50, 50, 50, -4);      // Curva fechada
            addRoad(100, 50, 100, 0);     // Retao
            addRoad(50, 50, 50, 3);       // Curva direita forte
            addRoad(50, 50, 50, 0);       // Reta final

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
        },

        // =============================================================
        // UPDATE LOOP
        // =============================================================
        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return 0; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return 0; }
            if (this.segments.length === 0) return 0;

            // --- INPUT & CONTROLE ---
            this.handleInput(w, h, pose);

            // --- FÍSICA DO CARRO ---
            const playerSegment = this.findSegment(this.position);
            const speedPercent = this.speed / CONF.MAX_SPEED;
            const dx = 0.015; // Velocidade lateral base

            // 1. Aceleração / Atrito
            if (this.turboLock && this.nitro > 0) {
                this.speed += CONF.ACCEL * 1.5;
                this.nitro -= 0.5;
            } else {
                this.speed += CONF.ACCEL * 0.5; // Aceleração automática arcade
            }
            
            // Limites de velocidade e terreno
            let maxSpeed = CONF.MAX_SPEED * CHARACTERS[this.selectedChar].speed;
            if (Math.abs(this.playerX) > CONF.OFFROAD_LIMIT) {
                maxSpeed *= 0.3; // Grama te freia muito
                this.speed *= CONF.OFFROAD_DECEL;
            } else {
                this.speed *= CONF.DECEL; // Atrito ar
            }
            
            this.speed = Math.max(0, Math.min(this.speed, maxSpeed));

            // 2. Direção e Força Centrífuga
            // Centrífuga: A curva te joga para fora (inverso da curva)
            this.playerX = this.playerX - (dx * speedPercent * playerSegment.curve * CONF.CENTRIFUGAL);
            // Volante: Vira o carro
            this.playerX = this.playerX + (dx * speedPercent * this.steer);

            // Colisão com laterais extremas
            if (this.playerX < -3.5) this.playerX = -3.5;
            if (this.playerX > 3.5)  this.playerX = 3.5;

            // 3. Movimento na Pista
            this.position += this.speed;
            while (this.position >= this.trackLength) {
                this.position -= this.trackLength;
                this.lap++;
                if (this.lap > this.totalLaps) this.finishRace();
                else window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
            }
            while (this.position < 0) this.position += this.trackLength;

            // --- IA / RIVAIS ---
            this.updateCars(this.trackLength);

            // --- RENDERIZAÇÃO ---
            this.renderWorld(ctx, w, h, playerSegment);
            this.renderHUD(ctx, w, h);

            if (this.isOnline) this.syncRace();

            return Math.floor(this.score);
        },

        handleInput: function(w, h, pose) {
            // Detecção Pose (Webcam)
            let handsDetected = false;
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.2 && rw.score > 0.2) {
                    handsDetected = true;
                    // Normaliza coordenadas
                    const nx = ((lw.x + rw.x) / 2) / 640; // Centro X (0-1)
                    const ny = ((lw.y + rw.y) / 2) / 480;
                    
                    // Cálculo do ângulo (volante)
                    const dx = rw.x - lw.x;
                    const dy = rw.y - lw.y;
                    const angle = Math.atan2(dy, dx);
                    
                    this.targetSteer = angle * 2.5; // Sensibilidade
                    
                    // Visual
                    this.virtualWheel.x = (1-nx) * w; // Inverte espelho
                    this.virtualWheel.y = ny * h;
                    this.virtualWheel.isActive = true;
                    this.virtualWheel.opacity = 1;
                }
            }

            if (!handsDetected) {
                // Se não tem pose, input vai voltando a zero (auto-center)
                this.virtualWheel.isActive = false;
                this.virtualWheel.opacity *= 0.9;
                this.targetSteer *= 0.8; 
            }

            // Suavização (Lerp) para evitar movimentos bruscos
            this.steer += (this.targetSteer - this.steer) * 0.2;
            // Limite do volante
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));
        },

        updateCars: function(trackLen) {
            let pRank = 1;
            const myTotalPos = (this.lap * trackLen) + this.position;

            this.cars.forEach(car => {
                if (car.isBot) {
                    // IA Simples
                    const seg = this.findSegment(car.z);
                    // Tenta ficar no meio, mas curva empurra
                    car.x += (-(seg.curve * 0.5) - car.x) * 0.05;
                    // Velocidade baseada no ID (dificuldade)
                    let maxS = CONF.MAX_SPEED * (0.9 + (car.charId * 0.05));
                    if (car.speed < maxS) car.speed += CONF.ACCEL;
                    
                    car.z += car.speed;
                    if (car.z >= trackLen) { car.z -= trackLen; car.lap = (car.lap||1)+1; }
                }

                // Rank Check
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
        // RENDERIZAÇÃO (OUTRUN STYLE)
        // =============================================================
        renderWorld: function(ctx, w, h, playerSeg) {
            // 1. CÉU E FUNDO (Parallax)
            const theme = THEMES[TRACKS[this.selectedTrack].theme];
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
            skyGrad.addColorStop(0, theme.sky[0]);
            skyGrad.addColorStop(1, theme.sky[1]);
            ctx.fillStyle = skyGrad;
            ctx.fillRect(0, 0, w, h);

            // Parallax Hills (Simples estilo Monte Fuji da referência)
            const hillOffset = this.steer * 50; 
            ctx.fillStyle = 'rgba(255,255,255,0.8)'; // Branco Neve
            ctx.beginPath();
            ctx.moveTo(w*0.3, h*0.5);
            ctx.lineTo(w*0.5, h*0.2); // Pico
            ctx.lineTo(w*0.7, h*0.5);
            ctx.fill();
            
            // Cerejeiras/Arvores no horizonte
            ctx.fillStyle = theme.ground === '#55aa44' ? '#e91e63' : '#90a4ae'; // Rosa ou Cinza
            for(let i=0; i<w; i+=80) {
                const hOff = Math.sin(i*0.1 + this.position*0.001)*10;
                ctx.beginPath(); ctx.arc(i, h*0.5 - 20 + hOff, 30, 0, Math.PI*2); ctx.fill();
            }

            // 2. PISTA (PROJEÇÃO 3D)
            const baseSegment = this.findSegment(this.position);
            const basePercent = (this.position % CONF.SEGMENT_LENGTH) / CONF.SEGMENT_LENGTH;
            
            let dx = -(baseSegment.curve * basePercent);
            let x = 0;
            let maxY = h; 

            // Loop de Renderização (Draw Distance)
            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segment = this.segments[(baseSegment.index + n) % this.segments.length];
                const looped = segment.index < baseSegment.index;
                
                // Coordenadas de Mundo relativos à câmera
                let camX = this.playerX * CONF.ROAD_WIDTH;
                let camY = CONF.CAMERA_HEIGHT;
                // Loop relativo
                let camZ = this.position - (looped ? this.trackLength : 0);

                // Projeção
                this.project(segment.p1, (this.playerX * CONF.ROAD_WIDTH) - x,      camY, this.position - (looped ? this.trackLength : 0), w, h);
                this.project(segment.p2, (this.playerX * CONF.ROAD_WIDTH) - x - dx, camY, this.position - (looped ? this.trackLength : 0), w, h);

                x += dx;
                dx += segment.curve;

                // Culling e Horizonte
                if (segment.p1.camera.z <= CONF.CAMERA_DEPTH || segment.p2.screen.y >= maxY) 
                    continue;

                // Desenha Segmento
                this.renderSegment(ctx, w, segment, theme);
                maxY = segment.p2.screen.y; // Atualiza horizonte (Topo do segmento atual)

                // Sprites Laterais
                for(let i=0; i<segment.sprites.length; i++) {
                    const sprite = segment.sprites[i];
                    const spriteScale = segment.p1.screen.scale;
                    const spriteX = segment.p1.screen.x + (spriteScale * sprite.x * CONF.ROAD_WIDTH * w/2);
                    const spriteY = segment.p1.screen.y;
                    this.renderSprite(ctx, sprite.type, spriteX, spriteY, spriteScale * w, false);
                }

                // Carros Rivais neste segmento
                this.cars.forEach(car => {
                    const carSeg = this.findSegment(car.z);
                    if (carSeg.index === segment.index) {
                        const carScale = segment.p1.screen.scale;
                        const carX = segment.p1.screen.x + (carScale * car.x * CONF.ROAD_WIDTH * w/2);
                        const carY = segment.p1.screen.y;
                        const rivalColor = CHARACTERS[car.charId || 1].color;
                        this.renderKart(ctx, carX, carY, carScale * w, 0, rivalColor, false);
                    }
                });
            }

            // 3. DESENHA JOGADOR (Sempre por cima)
            const playerScale = w * 0.0006; 
            this.renderPlayer(ctx, w/2, h*0.88, playerScale * w);
        },

        project: function(p, cameraX, cameraY, position, w, h) {
            p.camera.z = p.world.z - position;
            // Loop Z
            if (p.camera.z < 0) p.camera.z += this.trackLength;
            
            // Fator de escala
            p.screen.scale = CONF.CAMERA_DEPTH / (p.camera.z || 1); // Evita div por zero
            
            // Projeção na tela (Correção de Y: Mundo é plano em 0, Camera em +Y)
            // Tela Y = Centro + (WorldY - CameraY) * Scale
            // WorldY = 0 (Estrada Plana). CameraY = 1000.
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

            // Fundo (Grama/Areia/Neve) - Preenche laterais
            ctx.fillStyle = seg.color === 'dark' ? theme.ground : adjustColor(theme.ground, -20);
            ctx.fillRect(0, y2, w, y1 - y2);

            // Zebra (Rumble)
            const r1 = w1 * 1.2;
            const r2 = w2 * 1.2;
            ctx.fillStyle = seg.color === 'dark' ? theme.rumble[0] : theme.rumble[1];
            ctx.beginPath();
            ctx.moveTo(x1 - r1, y1); ctx.lineTo(x1 + r1, y1);
            ctx.lineTo(x2 + r2, y2); ctx.lineTo(x2 - r2, y2);
            ctx.fill();

            // Asfalto
            ctx.fillStyle = seg.color === 'dark' ? theme.road : adjustColor(theme.road, 10);
            ctx.beginPath();
            ctx.moveTo(x1 - w1, y1); ctx.lineTo(x1 + w1, y1);
            ctx.lineTo(x2 + w2, y2); ctx.lineTo(x2 - w2, y2);
            ctx.fill();

            // Faixa Central
            if (seg.color === 'dark') {
                ctx.fillStyle = theme.roadLine;
                const lw1 = w1 * 0.05; const lw2 = w2 * 0.05;
                ctx.beginPath();
                ctx.moveTo(x1 - lw1, y1); ctx.lineTo(x1 + lw1, y1);
                ctx.lineTo(x2 + lw2, y2); ctx.lineTo(x2 - lw2, y2);
                ctx.fill();
            }
        },

        // Desenho Procedural de Sprites (Árvores, Cactos)
        renderSprite: function(ctx, type, x, y, scale, isPlayer) {
            const s = scale * 4000; 
            const h = s; 
            const w = s * 0.5;
            
            if (type === 'tree') {
                ctx.fillStyle = '#795548'; ctx.fillRect(x-w*0.2, y-h, w*0.4, h); // Tronco
                ctx.fillStyle = '#4caf50'; 
                ctx.beginPath(); ctx.moveTo(x-w, y-h*0.3); ctx.lineTo(x, y-h*1.5); ctx.lineTo(x+w, y-h*0.3); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x-w*0.8, y-h*0.8); ctx.lineTo(x, y-h*1.8); ctx.lineTo(x+w*0.8, y-h*0.8); ctx.fill();
            }
            else if (type === 'cactus') {
                ctx.fillStyle = '#2e7d32'; 
                ctx.roundRect(x-w*0.2, y-h, w*0.4, h, 10); 
                ctx.roundRect(x-w*0.6, y-h*0.6, w*0.4, w*0.2, 5); 
                ctx.fill();
            }
            else if (type === 'rock') {
                ctx.fillStyle = '#9e9e9e';
                ctx.beginPath(); ctx.arc(x, y-w*0.3, w*0.4, Math.PI, 0); ctx.fill();
            }
        },

        // Desenho do Kart (Sem tombar!)
        renderPlayer: function(ctx, x, y, scale) {
            const bounce = Math.sin(Date.now() * 0.02) * (this.speed * 0.05);
            // Banking visual suave: inclina o corpo (offset), mas não roda todo o canvas
            const lean = this.steer * 0.3; 
            
            // Cor do Jogador
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

            // Pneus Traseiros
            ctx.fillStyle = '#222';
            ctx.fillRect(-w/2, -h/2, w/4, h/2); // Esq
            ctx.fillRect(w/4, -h/2, w/4, h/2);  // Dir

            // Chassi (Corpo Principal) - Inclina com skew simulado
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-w/2.2, -h/1.5 + (lean*10)); // Sobe/desce lado esq
            ctx.lineTo(w/2.2, -h/1.5 - (lean*10));  // Inverso lado dir
            ctx.lineTo(w/2.2, 0);
            ctx.lineTo(-w/2.2, 0);
            ctx.fill();

            // Pneus Dianteiros (Com esterçamento visual)
            const wheelTurn = isPlayer ? this.steer * 5 : 0;
            ctx.fillStyle = '#222';
            ctx.fillRect(-w/2.1 + wheelTurn, 0, w/4.5, h/2.5); // Esq
            ctx.fillRect(w/3.5 + wheelTurn, 0, w/4.5, h/2.5);  // Dir

            // Piloto (Cabeça)
            ctx.fillStyle = '#ffeaa7'; // Pele
            ctx.beginPath(); ctx.arc(0 - (lean*5), -h/1.2, h/3, 0, Math.PI*2); ctx.fill();
            // Capacete/Boné
            ctx.fillStyle = color; 
            ctx.beginPath(); ctx.arc(0 - (lean*5), -h/1.1, h/3.2, Math.PI, 0); ctx.fill();

            // Fogo do Nitro
            if (isPlayer && this.turboLock) {
                ctx.fillStyle = `rgba(255, ${Math.random()*255}, 0, 0.8)`;
                ctx.beginPath();
                ctx.moveTo(-10, -h/2); ctx.lineTo(10, -h/2); ctx.lineTo(0, -h - Math.random()*20);
                ctx.fill();
            }

            ctx.restore();
        },

        renderHUD: function(ctx, w, h) {
            // Velocímetro
            ctx.fillStyle = "#fff";
            ctx.textAlign = "right";
            ctx.font = "italic bold 40px 'Russo One'";
            ctx.fillText(Math.floor(this.speed), w - 20, 50);
            ctx.font = "16px Arial";
            ctx.fillText("KM/H", w - 20, 75);

            // Barra Nitro
            ctx.fillStyle = "#333";
            ctx.fillRect(w - 30, 90, 10, 100);
            ctx.fillStyle = this.turboLock ? "#00ffff" : "#f1c40f";
            const hBar = (this.nitro / 100) * 100;
            ctx.fillRect(w - 30, 190 - hBar, 10, hBar);

            // Volante Virtual (Se pose ativa)
            if (this.virtualWheel.isActive) {
                const vw = this.virtualWheel;
                ctx.save();
                ctx.translate(vw.x, vw.y);
                ctx.globalAlpha = 0.6;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(0, 0, vw.r, 0, Math.PI*2); ctx.stroke();
                // Marcador de giro
                ctx.fillStyle = '#f00';
                const markerX = Math.sin(this.targetSteer) * vw.r;
                const markerY = -Math.cos(this.targetSteer) * vw.r;
                ctx.beginPath(); ctx.arc(markerX, markerY, 8, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            }

            // Posição
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
            
            // Preview Carro
            ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.beginPath(); ctx.arc(w/2, h*0.35, 80, 0, Math.PI*2); ctx.fill();
            this.renderKart(ctx, w/2, h*0.35, 1.5, 0, char.color, false);
            
            this.drawButton(ctx, w/2, h*0.55, `< ${char.name} >`, '#34495e', 200);
            this.drawButton(ctx, w/2, h*0.65, `< ${track.name} >`, '#34495e', 200);
            
            const btnColor = this.isReady ? '#7f8c8d' : '#e74c3c';
            const btnTxt = this.isReady ? "AGUARDANDO..." : "PRONTO!";
            this.drawButton(ctx, w/2, h*0.85, btnTxt, btnColor);
        },

        drawButton: function(ctx, x, y, txt, color, w=300) {
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.roundRect(x - w/2, y - 30, w, 60, 10); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth=2; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.font="bold 24px Arial"; ctx.textAlign="center";
            ctx.fillText(txt, x, y+8);
        }
    };

    // Helper de cor simples
    function adjustColor(color, amount) { return color; }

    // Registro
    if(window.System) {
        window.System.registerGame('drive', 'Kart Legends', '🏎️', Logic, {
            camOpacity: 0.2
        });
    }

})();
