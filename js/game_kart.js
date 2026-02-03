// =============================================================================
// KART DO OTTO – V6.0 GOLD (FÍSICA REALISTA, MULTIPLAYER FIX, OBJETIVOS)
// ARQUITETO: SENIOR DEV
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS, CONSTANTES E BALANCEAMENTO
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO', color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0,  accel: 1.0 },
        { id: 1, name: 'THIAGO', color: '#f1c40f', speedInfo: 1.05, turnInfo: 0.85, accel: 0.95 },
        { id: 2, name: 'THAMIS', color: '#3498db', speedInfo: 0.95, turnInfo: 1.15, accel: 1.05 }
    ];

    const TRACKS = [
        { id: 0, name: 'GP CIRCUITO', theme: 'grass', sky: 0, curveMult: 1.0, laps: 3, targetTime: 120 },
        { id: 1, name: 'DESERTO SECO', theme: 'sand', sky: 1, curveMult: 0.9, laps: 3, targetTime: 130 },
        { id: 2, name: 'PICO NEVADO', theme: 'snow', sky: 2, curveMult: 1.3, laps: 4, targetTime: 140 }
    ];

    const CONF = {
        MAX_SPEED: 210,
        TURBO_MAX_SPEED: 320,
        ACCEL: 0.2,
        BREAKING: 0.6,
        DECEL_AIR: 0.96,
        DECEL_OFFROAD: 0.92, // Punição severa fora da pista
        OFFROAD_LIMIT: 2.4,  // Ponto onde o asfalto termina

        CENTRIFUGAL: 0.38,   // Força que joga pra fora da curva
        
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 160,
        RUMBLE_LENGTH: 3,
        ROAD_WIDTH: 2000
    };

    // Variáveis Globais de Estado
    let segments = [];
    let trackLength = 0;
    let minimapPoints = [];
    let nitroBtn = null;
    let particles = [];
    
    // Elementos de UI flutuantes
    let lapPopupTimer = 0;
    let lapPopupText = "";
    let objectiveText = "";

    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    // Utilitários de Pista
    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        return segments[((Math.floor(index) % segments.length) + segments.length) % segments.length] || DUMMY_SEG;
    }

    // Gera pontos do minimapa apenas uma vez por pista
    function buildMiniMap(segments) {
        minimapPoints = [];
        let x = 0; let y = 0; let dir = -Math.PI / 2;
        // Pula segmentos para economizar performance no loop
        for(let i=0; i<segments.length; i+=5) {
            const seg = segments[i];
            dir += seg.curve * 0.007; // Ajuste de escala angular
            x += Math.cos(dir) * 3; 
            y += Math.sin(dir) * 3;
            minimapPoints.push({ x, y, index: i });
        }
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO (ENGINE)
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, WAITING, RACE, FINISHED
        roomId: 'room_01',
        
        // Configuração Jogador
        selectedChar: 0,
        selectedTrack: 0,
        
        // Física
        speed: 0, 
        pos: 0, 
        playerX: 0, // -1 a 1 é pista, >1 é offroad
        steer: 0, 
        targetSteer: 0,
        
        // Mecânicas
        nitro: 100, 
        turboLock: false,
        spinAngle: 0,     // Rotação visual do kart (0 a 360)
        spinVelocity: 0,  // Velocidade do giro
        
        // Progressão
        lap: 1, 
        totalLaps: 3, 
        time: 0, 
        rank: 1,
        
        // Multiplayer
        isOnline: false,
        isReady: false,
        rivals: [], // Lista de oponentes {id, x, pos, charId...}
        dbRef: null,
        lastSync: 0,
        autoStartTimer: null,

        // Input Virtual
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        inputState: 0,
        gestureTimer: 0,
        visualTilt: 0, 
        bounce: 0,

        // =================================================================
        // CICLO DE VIDA
        // =================================================================
        init: function() { 
            this.cleanup();
            this.resetState();
            this.setupUI(); 
            particles = [];
            window.System.msg("BEM-VINDO AO KART PRO");
        },

        cleanup: function() {
            if (this.dbRef) {
                try { this.dbRef.child('players').off(); } catch(e){}
            }
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        resetState: function() {
            this.speed = 0; 
            this.pos = 0; 
            this.playerX = 0; 
            this.steer = 0;
            this.lap = 1;
            this.time = 0;
            this.nitro = 100;
            this.spinAngle = 0;
            this.spinVelocity = 0;
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
        },

        // =================================================================
        // UI & INPUT (CORRIGIDO)
        // =================================================================
        setupUI: function() {
            // Remove botão antigo se existir para evitar duplicação
            const old = document.getElementById('nitro-btn-kart');
            if(old) old.remove();

            // Cria botão DOM para Nitro (Funciona melhor em Mobile que Canvas puro)
            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '40%', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(circle, #ffaa00, #ff4500)', 
                border: '4px solid #fff', color: '#fff', display: 'none', 
                alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '18px', zIndex: '100',
                boxShadow: '0 0 25px rgba(255, 69, 0, 0.8)', cursor: 'pointer', userSelect: 'none',
                transform: 'scale(1)', transition: 'all 0.1s'
            });

            // Lógica de Ativação
            const toggleTurbo = (e) => {
                if(e) { if(e.cancelable) e.preventDefault(); e.stopPropagation(); }
                if(this.state !== 'RACE') return;
                
                if(this.nitro > 5) {
                    this.turboLock = !this.turboLock;
                    // Feedback Visual no Botão
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.9)' : 'scale(1)';
                    nitroBtn.style.border = this.turboLock ? '4px solid #00ffff' : '4px solid #fff';
                    if(this.turboLock) window.Sfx.play(600, 'square', 0.1, 0.1);
                }
            };
            
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            document.getElementById('game-ui').appendChild(nitroBtn);

            // INPUT GLOBAL (Menus)
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                const pX = (e.clientX - rect.left) / rect.width;
                const pY = (e.clientY - rect.top) / rect.height;

                if (this.state === 'MODE_SELECT') {
                    if (pY < 0.5) this.selectMode('OFFLINE');
                    else this.selectMode('ONLINE');
                    window.Sfx.click();
                    return;
                }

                if (this.state === 'LOBBY') {
                    // Botão Start (Baixo)
                    if (pY > 0.75) this.toggleReady();
                    // Seleção Personagem (Cima)
                    else if (pY < 0.4) {
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
                        window.Sfx.hover();
                        if(this.isOnline) this.syncLobby();
                    }
                    // Seleção Pista (Meio)
                    else {
                        this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                        window.Sfx.hover();
                        if(this.isOnline) this.syncLobby();
                    }
                }
            };
        },

        // =================================================================
        // LÓGICA DE JOGO (UPDATE LOOP)
        // =================================================================
        update: function(ctx, w, h, pose) {
            try {
                if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
                if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
                
                // Se não há pista, não roda física
                if (!segments || segments.length === 0) return 0;

                this.updatePhysics(w, h, pose);
                this.renderWorld(ctx, w, h);
                this.renderUI(ctx, w, h);
                
                if (this.isOnline) this.syncMultiplayer();
                return Math.floor(this.score);

            } catch (err) {
                console.error("Critical Loop Error:", err);
                return 0;
            }
        },

        // =================================================================
        // FÍSICA PRO (SIMULADOR DE KART)
        // =================================================================
        updatePhysics: function(w, h, pose) {
            const charStats = CHARACTERS[this.selectedChar];
            const trackStats = TRACKS[this.selectedTrack];

            // 1. INPUT (WEBCAM ou TECLADO IMPLÍCITO NA LÓGICA)
            let detected = 0;
            let pLeft, pRight, nose;

            if (this.state === 'RACE' && pose && pose.keypoints) {
                const mapP = (k) => ({ x: (1 - k.x/640)*w, y: (k.y/480)*h });
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const n  = pose.keypoints.find(k => k.name === 'nose');

                if(lw && lw.score > 0.2) pLeft = mapP(lw);
                if(rw && rw.score > 0.2) pRight = mapP(rw);
                if(n && n.score > 0.2) nose = mapP(n);

                if (pLeft && pRight && nose) {
                    detected = 2;
                    // Detecta Turbo (Mãos acima do nariz)
                    const handsUp = (pLeft.y < nose.y && pRight.y < nose.y);
                    this.virtualWheel.isHigh = handsUp;
                    
                    if(handsUp) {
                        this.gestureTimer++;
                        if(this.gestureTimer > 15 && this.nitro > 5) { 
                            this.turboLock = true; 
                            window.System.msg("TURBO GESTUAL!");
                        }
                    } else {
                        this.gestureTimer = 0;
                    }

                    // Direção (Diferença de altura entre pulsos)
                    const dy = pRight.y - pLeft.y;
                    this.targetSteer = (dy / 50); // Sensibilidade
                    
                    // UI Volante
                    this.virtualWheel.x = (pLeft.x + pRight.x)/2;
                    this.virtualWheel.y = (pLeft.y + pRight.y)/2;
                    this.virtualWheel.opacity = 1;
                }
            }

            if(detected < 2) {
                this.targetSteer = 0;
                this.virtualWheel.opacity *= 0.9;
                if(this.nitro <= 0) this.turboLock = false;
            }

            // Suavização do volante (Inércia)
            this.steer += (this.targetSteer - this.steer) * 0.2;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer)); // Clamp

            // 2. ACELERAÇÃO E VELOCIDADE
            let maxS = CONF.MAX_SPEED * charStats.speedInfo;
            if (this.turboLock && this.nitro > 0) {
                maxS = CONF.TURBO_MAX_SPEED;
                this.nitro -= 0.6;
                if(this.nitro <= 0) this.turboLock = false;
            } else {
                this.nitro = Math.min(100, this.nitro + 0.08); // Regenera lento
            }

            // Se bater ou rodar, perde velocidade
            if(Math.abs(this.spinVelocity) > 2) maxS *= 0.3;

            // Acelera automaticamente se estiver em corrida (Arcade Style)
            if (this.state === 'RACE') {
                this.speed += (maxS - this.speed) * CONF.ACCEL;
            } else {
                this.speed *= 0.95; // Freia no final
            }

            // 3. FÍSICA DE PISTA (CURVAS E FORÇA CENTRÍFUGA)
            const speedRatio = this.speed / CONF.MAX_SPEED;
            const segIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            const seg = getSegment(segIdx);
            const curvePower = seg.curve * trackStats.curveMult;

            // Força Centrífuga: Joga para fora se estiver rápido
            // Se a curva é para direita (positiva), a força é negativa (esquerda)
            const centrifugal = -curvePower * (speedRatio * speedRatio) * CONF.CENTRIFUGAL;
            
            // Controle do Jogador
            const steerPower = 0.16 * charStats.turnInfo;
            
            // Posição X Final
            this.playerX += (this.steer * steerPower * speedRatio) + centrifugal;

            // 4. TERRENO E LIMITES (FIM DOS TRILHOS)
            // Agora o carro pode ir muito para os lados (Offroad)
            const absX = Math.abs(this.playerX);
            
            // Zebra (Vibração e leve perda)
            if (absX > 2.0 && absX < CONF.OFFROAD_LIMIT) {
                this.speed *= 0.98;
                this.bounce = (Math.random()-0.5) * 5; // Trepidação
            }
            // Offroad (Grama/Areia) - Perda Brutal
            if (absX >= CONF.OFFROAD_LIMIT) {
                this.speed *= CONF.DECEL_OFFROAD;
                this.bounce = (Math.random()-0.5) * 10; // Trepidação Forte
                if(this.speed > 50) this.speed -= 2; // Arrasto extra
            }

            // Limite do Mundo (Parede Invisível distante)
            if(this.playerX < -6) { this.playerX = -6; this.speed = 0; }
            if(this.playerX > 6)  { this.playerX = 6;  this.speed = 0; }


            // 5. COLISÕES E SPIN (ROTAÇÃO HORIZONTAL)
            // Obstáculos
            seg.obs.forEach(o => {
                // Hitbox simples
                if (Math.abs(this.playerX - o.x) < 0.6 && o.x < 10) {
                     this.triggerSpin('HARD');
                     o.x = 999; // Remove obstáculo atingido visualmente
                }
            });

            // Rivais (PVP)
            this.rivals.forEach(r => {
                let distZ = r.pos - this.pos;
                if (distZ > trackLength/2) distZ -= trackLength;
                if (distZ < -trackLength/2) distZ += trackLength;
                
                let distX = r.x - this.playerX;

                if (Math.abs(distZ) < 250 && Math.abs(distX) < 0.7) {
                    // Batida Lateral
                    this.triggerSpin('SOFT');
                    // Rebote físico
                    const push = (distX > 0) ? -0.5 : 0.5;
                    this.playerX += push;
                    // Som
                    window.Sfx.crash();
                }
            });

            // Lógica do Spin (Giro Horizontal)
            if (Math.abs(this.spinVelocity) > 0.1) {
                this.spinAngle += this.spinVelocity;
                this.spinVelocity *= 0.92; // Atrito angular
                
                // Normaliza 0-360
                if(this.spinAngle > 360) this.spinAngle -= 360;
                if(this.spinAngle < 0) this.spinAngle += 360;

                // Snap to zero quando parar
                if (Math.abs(this.spinVelocity) < 1) {
                    this.spinVelocity = 0;
                    this.spinAngle = 0; // Endireita o carro
                }
            }

            // 6. PROGRESSÃO
            this.pos += this.speed;
            while (this.pos >= trackLength) {
                this.pos -= trackLength;
                this.lap++;
                if (this.lap <= this.totalLaps) {
                    lapPopupText = `VOLTA ${this.lap}/${this.totalLaps}`;
                    lapPopupTimer = 120; // 2 segundos
                    window.System.msg(lapPopupText);
                }
            }
            while (this.pos < 0) this.pos += trackLength;

            // Timer
            this.time += 1/60; // Segundos (aprox)

            // Check Win condition
            if (this.lap > this.totalLaps && this.state === 'RACE') {
                this.state = 'FINISHED';
                const success = (this.rank <= 3); // Objetivo: Top 3
                window.System.gameOver(success ? `VITÓRIA! RANK ${this.rank}` : `FIM DE JOGO (RANK ${this.rank})`);
            }
            
            // Visual Tilt (Inclinação nas curvas)
            this.visualTilt += ((this.steer * 20) - this.visualTilt) * 0.1;
        },

        triggerSpin: function(severity) {
            window.Sfx.crash();
            window.Gfx.shakeScreen(severity === 'HARD' ? 15 : 8);
            
            // Inicia rotação
            this.spinVelocity = severity === 'HARD' ? 30 : 15;
            if(Math.random()>0.5) this.spinVelocity *= -1;
            
            // Perde nitro e velocidade
            this.nitro = Math.max(0, this.nitro - 20);
            this.speed *= 0.5;
        },

        // =================================================================
        // RENDERIZAÇÃO
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const cx = w / 2;
            const horizon = h * 0.45;
            const currentSegIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            
            // Câmera segue o jogador (X)
            const camX = this.playerX * (w * 0.3); 
            
            // Background (Parallax simples)
            this.drawBackground(ctx, w, h, horizon);

            // ESTRADA (Pseudo-3D)
            let dx = 0;
            let maxY = h;
            const roadW = 2000;
            const fov = 100 + (this.turboLock ? 30 : 0); // FOV Effect no Turbo

            // Lista de Sprites para desenhar depois (Painter's Algorithm)
            const sprites = [];

            for (let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = (currentSegIdx + n) % segments.length;
                const seg = segments[segIdx];
                const loop = Math.floor((currentSegIdx + n) / segments.length);
                
                dx += seg.curve;
                
                // Projeção
                const segZ = (n * CONF.SEGMENT_LENGTH); 
                const scale = fov / (fov + segZ); 
                const scaleNext = fov / (fov + segZ + CONF.SEGMENT_LENGTH);

                const screenX = cx + (-camX - dx * n * 1.5) * scale; 
                const screenXNext = cx + (-camX - (dx + seg.curve) * (n+1) * 1.5) * scaleNext;
                
                const screenY = horizon + (1000 * scale); 
                const screenYNext = horizon + (1000 * scaleNext);
                
                const width = w * 2.5 * scale;
                const widthNext = w * 2.5 * scaleNext;

                // Culling (Otimização)
                if (screenYNext >= maxY) continue;
                maxY = screenYNext;

                // Desenha Segmento
                this.drawSegment(ctx, w, screenY, screenYNext, screenX, screenXNext, width, widthNext, seg);
                
                // Coleta Sprites (Obstáculos e Rivais) neste segmento
                // Obstáculos
                seg.obs.forEach(o => {
                    const spriteScale = scale * (w/800);
                    const spriteX = screenX + (o.x * width * 0.3); // Posicionamento lateral
                    sprites.push({ type: 'obs', obj: o, x: spriteX, y: screenY, s: spriteScale, z: n });
                });

                // Rivais
                this.rivals.forEach(r => {
                    // Calcula distância relativa considerando o loop da pista
                    let dist = r.pos - this.pos;
                    if (dist > trackLength/2) dist -= trackLength;
                    if (dist < -trackLength/2) dist += trackLength;
                    
                    // Se o rival está neste segmento
                    if (dist >= n*CONF.SEGMENT_LENGTH && dist < (n+1)*CONF.SEGMENT_LENGTH) {
                        const spriteScale = scale * (w/800);
                        const spriteX = screenX + (r.x * width * 0.3);
                        sprites.push({ type: 'rival', obj: r, x: spriteX, y: screenY, s: spriteScale, z: n });
                    }
                });
            }

            // DESENHA SPRITES (De trás para frente)
            for (let i = sprites.length - 1; i >= 0; i--) {
                const s = sprites[i];
                if (s.type === 'obs') {
                    this.drawObstacle(ctx, s.obj.type, s.x, s.y, s.s);
                } else if (s.type === 'rival') {
                    // Rival não tem spin visual complexo, apenas tilt
                    this.drawKart(ctx, s.x, s.y, s.s, 0, 0, s.obj.color, true);
                }
            }

            // JOGADOR (Sempre na frente)
            const kartY = h * 0.85 + this.bounce;
            const kartScale = (w/800);
            const playerColor = CHARACTERS[this.selectedChar].color;
            
            // Rotação combinada: Tilt da curva + Spin da batida
            this.drawKart(ctx, cx, kartY, kartScale, this.visualTilt, this.spinAngle, playerColor, false);
        },

        drawSegment: function(ctx, w, y1, y2, x1, x2, w1, w2, seg) {
            const trackStats = TRACKS[this.selectedTrack];
            const cols = this.getThemeColors(trackStats.theme, seg.color);
            
            // Grama/Offroad
            ctx.fillStyle = cols.grass;
            ctx.fillRect(0, y2, w, y1 - y2);

            // Zebra
            const rW1 = w1 * 1.2; const rW2 = w2 * 1.2;
            ctx.fillStyle = cols.rumble;
            ctx.beginPath();
            ctx.moveTo(x1 - rW1/2, y1); ctx.lineTo(x1 + rW1/2, y1);
            ctx.lineTo(x2 + rW2/2, y2); ctx.lineTo(x2 - rW2/2, y2);
            ctx.fill();

            // Pista
            ctx.fillStyle = cols.road;
            ctx.beginPath();
            ctx.moveTo(x1 - w1/2, y1); ctx.lineTo(x1 + w1/2, y1);
            ctx.lineTo(x2 + w2/2, y2); ctx.lineTo(x2 - w2/2, y2);
            ctx.fill();
            
            // Linha Central
            if (seg.color === 'dark') {
                ctx.fillStyle = '#fff';
                const lW = w1 * 0.02;
                ctx.fillRect(x1 - lW/2, y2, lW, y1-y2);
            }
        },

        getThemeColors: function(theme, type) {
            const dark = type === 'dark';
            if (theme === 'snow') return { grass: dark ? '#b2bec3' : '#dfe6e9', rumble: dark ? '#d63031' : '#fff', road: dark ? '#636e72' : '#6c7a89' };
            if (theme === 'sand') return { grass: dark ? '#e67e22' : '#f1c40f', rumble: dark ? '#c0392b' : '#ecf0f1', road: dark ? '#7f8c8d' : '#95a5a6' };
            return { grass: dark ? '#27ae60' : '#2ecc71', rumble: dark ? '#c0392b' : '#ecf0f1', road: dark ? '#34495e' : '#2c3e50' };
        },

        drawBackground: function(ctx, w, h, horizon) {
            const grad = ctx.createLinearGradient(0, 0, 0, horizon);
            const skyId = TRACKS[this.selectedTrack].sky;
            if(skyId === 0) { grad.addColorStop(0, '#3498db'); grad.addColorStop(1, '#85c1e9'); }
            else if(skyId === 1) { grad.addColorStop(0, '#d35400'); grad.addColorStop(1, '#f39c12'); }
            else { grad.addColorStop(0, '#2c3e50'); grad.addColorStop(1, '#bdc3c7'); }
            
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, horizon);

            // Montanhas Parallax
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            const offset = (this.pos * 0.002) + (this.playerX * 0.05);
            ctx.beginPath();
            for(let i=0; i<10; i++) {
                const mx = ((i * w/4) - (offset * w)) % (w*4);
                ctx.lineTo(mx, horizon);
                ctx.lineTo(mx + w/8, horizon - h*0.2);
                ctx.lineTo(mx + w/4, horizon);
            }
            ctx.fill();
        },

        drawKart: function(ctx, x, y, scale, tilt, spin, color, isRival) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            
            // CORREÇÃO DO ESPETO: Rotação no eixo Z (Plano da tela)
            // Somamos o Tilt (curva) + Spin (batida)
            const rotation = (tilt * 0.02) + (spin * Math.PI / 180);
            ctx.rotate(rotation);

            // Sombra (Fica embaixo)
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 40, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            const grad = ctx.createLinearGradient(-30, 0, 30, 0);
            grad.addColorStop(0, color); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, color);
            ctx.fillStyle = grad;
            
            // Corpo Aerodinâmico
            ctx.beginPath(); 
            ctx.moveTo(-30, -20); ctx.lineTo(30, -20); // Traseira
            ctx.lineTo(45, 10); ctx.lineTo(15, 45); // Lateral Dir
            ctx.lineTo(-15, 45); ctx.lineTo(-45, 10); // Lateral Esq
            ctx.fill();
            
            // Motor / Detalhes
            ctx.fillStyle = '#333'; ctx.fillRect(-20, -30, 40, 15);
            
            // Rodas (Mudam com esterçamento visual simplificado)
            ctx.fillStyle = '#111';
            ctx.fillRect(-50, 0, 15, 30); // TRE
            ctx.fillRect(35, 0, 15, 30);  // TRD
            
            // Capacete
            ctx.fillStyle = isRival ? '#fff' : '#f1c40f'; // Dourado p/ player
            ctx.beginPath(); ctx.arc(0, -10, 22, 0, Math.PI*2); ctx.fill();
            
            // Fogo Turbo
            if ((this.turboLock || isRival) && Math.random() > 0.5) {
                ctx.fillStyle = '#00ffff';
                ctx.beginPath(); ctx.moveTo(-10, -30); ctx.lineTo(10, -30); ctx.lineTo(0, -60 - Math.random()*20); ctx.fill();
            }

            // Identificador P2
            if (isRival) {
                ctx.fillStyle = '#0f0'; ctx.font="bold 20px Arial"; ctx.textAlign="center";
                ctx.fillText("P2", 0, -50);
            }

            ctx.restore();
        },

        drawObstacle: function(ctx, type, x, y, scale) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            
            if (type === 'cone') {
                ctx.fillStyle = '#e67e22';
                ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(0, -50); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.fillRect(-10, -30, 20, 8);
            } else if (type === 'rock') {
                ctx.fillStyle = '#7f8c8d';
                ctx.beginPath(); ctx.arc(0, -15, 25, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(-10, -20, 10, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        },

        // =================================================================
        // HUD & MENUS
        // =================================================================
        renderUI: function(ctx, w, h) {
            // HUD DE CORRIDA
            if (this.state === 'RACE') {
                // 1. Velocímetro
                const hudX = w - 80; const hudY = h - 60;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 60, 0, Math.PI*2); ctx.fill();
                
                const speedPct = this.speed / CONF.TURBO_MAX_SPEED;
                ctx.beginPath(); ctx.arc(hudX, hudY, 55, Math.PI, Math.PI + (speedPct * Math.PI));
                ctx.strokeStyle = this.turboLock ? '#00ffff' : '#ff3300'; ctx.lineWidth = 8; ctx.stroke();
                
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 24px 'Chakra Petch'";
                ctx.fillText(Math.floor(this.speed), hudX, hudY+10);
                
                // 2. Nitro Bar
                const nW = 200;
                ctx.fillStyle = '#333'; ctx.fillRect(w/2 - nW/2, 20, nW, 20);
                ctx.fillStyle = this.turboLock ? '#00ffff' : '#ffaa00';
                ctx.fillRect(w/2 - nW/2 + 2, 22, (nW-4) * (this.nitro/100), 16);
                
                // 3. Mini-Mapa (Radar)
                if (minimapPoints.length > 0) {
                    const mapSize = 120; const mapX = 20; const mapY = 100;
                    
                    ctx.save();
                    ctx.translate(mapX + mapSize/2, mapY + mapSize/2);
                    
                    // Fundo Radar
                    ctx.fillStyle = 'rgba(0,20,40,0.8)'; ctx.beginPath(); ctx.arc(0,0, mapSize/2, 0, Math.PI*2); ctx.fill();
                    ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 2; ctx.stroke();
                    
                    // Desenha Pontos da Pista
                    ctx.fillStyle = '#555';
                    minimapPoints.forEach(p => {
                        ctx.fillRect(p.x * 0.8, p.y * 0.8, 2, 2);
                    });
                    
                    // Jogador (Ponto Piscante)
                    const pIdx = Math.floor((this.pos / trackLength) * minimapPoints.length);
                    const pDot = minimapPoints[pIdx] || minimapPoints[0];
                    if(pDot) {
                        ctx.fillStyle = '#ff0000'; 
                        ctx.beginPath(); ctx.arc(pDot.x*0.8, pDot.y*0.8, 4, 0, Math.PI*2); ctx.fill();
                    }
                    
                    // Rivais
                    this.rivals.forEach(r => {
                        const rIdx = Math.floor((r.pos / trackLength) * minimapPoints.length);
                        const rDot = minimapPoints[rIdx];
                        if(rDot) {
                            ctx.fillStyle = '#00ff00';
                            ctx.beginPath(); ctx.arc(rDot.x*0.8, rDot.y*0.8, 3, 0, Math.PI*2); ctx.fill();
                        }
                    });

                    ctx.restore();
                }

                // 4. Objetivos / Infos
                ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.font = "16px sans-serif";
                ctx.fillText(`RANK: ${this.rank} / ${this.rivals.length + 1}`, 20, 60);
                ctx.fillText(lapPopupTimer > 0 ? lapPopupText : `VOLTA ${this.lap}/${this.totalLaps}`, 20, 85);
                
                // Objetivos
                const tTime = TRACKS[this.selectedTrack].targetTime;
                ctx.fillStyle = (this.time > tTime) ? '#f00' : '#0f0';
                ctx.fillText(`META: ${tTime}s (${Math.floor(this.time)}s)`, 20, 40);

                // Volante Virtual (Feedback)
                if (this.virtualWheel.opacity > 0) {
                    ctx.save();
                    ctx.globalAlpha = this.virtualWheel.opacity;
                    ctx.translate(this.virtualWheel.x, this.virtualWheel.y);
                    ctx.rotate(this.steer);
                    ctx.strokeStyle = this.virtualWheel.isHigh ? '#00ffff' : '#fff';
                    ctx.lineWidth = 6;
                    ctx.beginPath(); ctx.arc(0,0, 40, 0, Math.PI*2); ctx.stroke();
                    ctx.fillStyle = '#fff'; ctx.fillRect(-5, -40, 10, 20); // Marcador topo
                    ctx.restore();
                }

            } else if (this.state === 'FINISHED') {
                ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
                ctx.font = "bold 50px 'Russo One'";
                ctx.fillText("CORRIDA FINALIZADA", w/2, h/2 - 50);
                
                ctx.font = "30px sans-serif";
                ctx.fillStyle = this.rank <= 3 ? '#0f0' : '#f00';
                ctx.fillText(`POSIÇÃO FINAL: ${this.rank}º`, w/2, h/2 + 20);
                
                ctx.font = "20px sans-serif"; ctx.fillStyle = '#ccc';
                ctx.fillText("Toque para voltar ao menu", w/2, h - 50);
                
                // Click to restart handler (simple)
                if(!window.System.canvas.onclick) {
                    window.System.canvas.onclick = () => window.System.menu();
                }
            }
        },

        renderModeSelect: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="bold 40px 'Russo One'";
            ctx.fillText("OTTO KART GP", w/2, 100);
            
            // Botões desenhados (Hitbox tratada no onclick)
            const btn = (y, color, text) => {
                ctx.fillStyle = color; ctx.fillRect(w/2-150, y, 300, 80);
                ctx.fillStyle = "#fff"; ctx.font="24px sans-serif"; ctx.fillText(text, w/2, y+50);
            };
            
            btn(h*0.35, '#e67e22', "JOGAR SOLO");
            btn(h*0.55, '#27ae60', "MULTIPLAYER");
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = "#34495e"; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = "#fff"; ctx.textAlign="center"; ctx.font="bold 30px 'Russo One'";
            ctx.fillText("GARAGEM", w/2, 60);
            
            // Info Piloto
            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.25, 50, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.font="24px sans-serif"; 
            ctx.fillText(char.name, w/2, h*0.25 + 80);
            ctx.font="14px sans-serif"; ctx.fillStyle="#bdc3c7";
            ctx.fillText("Toque acima para trocar", w/2, h*0.25 + 100);

            // Info Pista
            const trk = TRACKS[this.selectedTrack];
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(w/2-150, h*0.55, 300, 60);
            ctx.fillStyle = "#ecf0f1"; ctx.font="20px 'Russo One'";
            ctx.fillText(`PISTA: ${trk.name}`, w/2, h*0.55 + 38);

            // Botão GO
            const btnColor = this.state === 'WAITING' ? '#95a5a6' : '#27ae60';
            const btnTxt = this.state === 'WAITING' ? "AGUARDANDO..." : "INICIAR CORRIDA";
            ctx.fillStyle = btnColor; ctx.fillRect(w/2-150, h*0.8, 300, 70);
            ctx.fillStyle = "#fff"; ctx.font="bold 24px sans-serif"; ctx.fillText(btnTxt, w/2, h*0.8 + 45);
        },

        // =================================================================
        // SISTEMAS (NETCODE & UTILS)
        // =================================================================
        selectMode: function(mode) {
            this.resetState();
            if(mode === 'OFFLINE') {
                this.isOnline = false;
                this.state = 'LOBBY';
                // Bots
                this.rivals = [
                    { id:'cpu1', name:'CPU 1', color:'#8e44ad', pos:0, x:-0.5, speed:0 },
                    { id:'cpu2', name:'CPU 2', color:'#2ecc71', pos:0, x:0.5, speed:0 }
                ];
            } else {
                if(!window.DB) { window.System.msg("ERRO: OFFLINE"); return; }
                this.isOnline = true;
                this.state = 'LOBBY';
                this.connectNet();
            }
        },

        connectNet: function() {
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            const myRef = this.dbRef.child(`players/${window.System.playerId}`);
            
            myRef.set({
                name: 'Player', charId: this.selectedChar, ready: false, 
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            myRef.onDisconnect().remove();

            // Escuta Rivais (Correção do Bug Multiplayer)
            this.dbRef.child('players').on('value', snap => {
                const data = snap.val();
                if(!data) return;

                const now = Date.now();
                this.rivals = Object.keys(data)
                    .filter(k => k !== window.System.playerId)
                    .filter(k => (now - (data[k].lastSeen || 0) < 10000)) // Remove inativos
                    .map(k => {
                        const p = data[k];
                        return {
                            id: k,
                            pos: p.pos || 0,
                            x: p.x || 0,
                            color: CHARACTERS[p.charId || 0].color,
                            ready: p.ready
                        };
                    });

                // Auto-start
                if(this.state === 'WAITING') {
                    const allReady = this.rivals.every(r => r.ready) && this.rivals.length > 0;
                    if(allReady && this.isReady) this.startRace();
                }
            });
        },

        syncMultiplayer: function() {
            if(Date.now() - this.lastSync > 100) { // 10hz update
                this.lastSync = Date.now();
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    pos: Math.floor(this.pos),
                    x: this.playerX, // Envia com precisão decimal
                    charId: this.selectedChar,
                    ready: this.isReady,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
                });
            }
        },
        
        syncLobby: function() {
            if(this.isOnline) {
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    charId: this.selectedChar,
                    trackId: this.selectedTrack
                });
            }
        },

        toggleReady: function() {
            if(!this.isOnline) { this.startRace(); return; }
            this.isReady = !this.isReady;
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            this.syncLobby();
        },

        startRace: function() {
            this.buildTrack(this.selectedTrack);
            this.state = 'RACE';
            this.nitro = 100;
            if(nitroBtn) nitroBtn.style.display = 'flex'; // Exibe Nitro
            window.System.msg("LARGADA!");
            window.Sfx.play(600, 'square', 0.5, 0.1);
            
            // Ativa UI globalmente para não bloquear cliques no botão de nitro
            document.getElementById('game-ui').style.pointerEvents = 'auto';
        },

        buildTrack: function(id) {
            segments = [];
            const trk = TRACKS[id];
            
            const addRoad = (enter, curve, y) => {
                for(let i=0; i<enter; i++) {
                    const isDark = Math.floor(segments.length/CONF.RUMBLE_LENGTH)%2;
                    segments.push({
                        curve: curve * trk.curveMult,
                        y: y,
                        color: isDark ? 'dark' : 'light',
                        obs: [],
                        theme: trk.theme
                    });
                }
            };
            
            // GERAÇÃO PROCEDURAL
            addRoad(50, 0, 0); // Reta inicial
            addRoad(40, 1.5, 0); // Curva Dir
            addRoad(40, -1.5, 0); // Curva Esq
            
            // Loop de obstáculos
            for(let i=0; i<15; i++) {
                addRoad(30, (Math.random()-0.5)*3, 0);
                if(Math.random() > 0.4) {
                    segments[segments.length-1].obs.push({
                        type: trk.theme === 'snow' ? 'rock' : 'cone',
                        x: (Math.random()-0.5)*4
                    });
                }
            }
            addRoad(50, 0, 0); // Reta final
            
            trackLength = segments.length * CONF.SEGMENT_LENGTH;
            buildMiniMap(segments);
        }
    };

    // REGISTRO
    if(window.System) {
        window.System.registerGame('drive', 'OTTO KART GP', '🏎️', Logic, {
            camOpacity: 0.2,
            showWheel: true
        });
    }

})();