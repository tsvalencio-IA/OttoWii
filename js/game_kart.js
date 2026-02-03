// =============================================================================
// KART DO OTTO – ULTIMATE PRO EDITION (V2.0)
// ARQUITETURA: SENIOR GAME DEV
// =============================================================================
// CHANGELOG TÉCNICO:
// 1. FÍSICA: Vetores de curva desacoplados (Input vs Força Centrífuga).
// 2. RENDER: Viewport Rotation para colisões (Spin 360).
// 3. GAME FEEL: FOV Dinâmico e Screen Shake baseado em superfície.
// 4. UX: Hitbox de UI recalculado para viewport responsivo.
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. DADOS, CONSTANTES E TUNING
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO',    color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0,  accel: 1.0 },
        { id: 1, name: 'THIAGO',  color: '#f1c40f', speedInfo: 1.1, turnInfo: 0.85, accel: 0.9 }, // Rápido, ruim de curva
        { id: 2, name: 'THAMIS',  color: '#3498db', speedInfo: 0.9, turnInfo: 1.2,  accel: 1.15 } // Ágil, top speed menor
    ];

    const TRACKS = [
        { id: 0, name: 'GP CIRCUITO', theme: 'grass', sky: 0, curveMult: 1.0, friction: 1.0 },
        { id: 1, name: 'DESERTO SECO', theme: 'sand', sky: 1, curveMult: 0.9, friction: 0.9 }, // Escorrega um pouco
        { id: 2, name: 'PICO NEVADO', theme: 'snow', sky: 2, curveMult: 1.4, friction: 0.75 } // Muito drift
    ];

    // TUNING FINO DE FÍSICA ARCADE
    const CONF = {
        MAX_SPEED: 220,
        TURBO_MAX_SPEED: 340,
        ACCEL_RATE: 0.15,
        BREAK_RATE: 0.3,
        DECEL_RATE: 0.05,        // Resistência do ar natural
        OFFROAD_DECEL: 0.92,     // Penalidade fora da pista
        OFFROAD_LIMIT: 2.3,      // Limite X onde começa o off-road
        
        // FÍSICA DE CURVA
        CENTRIFUGAL: 0.45,       // Força que joga o carro pra fora da curva
        STEER_SPEED: 0.18,       // Velocidade de resposta do volante
        GRIP_LOSS_SPEED: 180,    // Velocidade onde começa a perder aderência

        // VISUAL
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 180,      // Aumentado para ver mais longe
        FOV_BASE: 100,
        RUMBLE_LENGTH: 3
    };

    // VARIÁVEIS DE ESTADO
    let segments = [];
    let trackLength = 0;
    let particles = [];
    let minimapPoints = [];
    let nitroBtn = null;

    // SISTEMA DE BOTÕES (UI)
    let uiButtons = [];

    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, WAITING, RACE, FINISHED
        roomId: 'room_01',
        
        // Jogador
        selectedChar: 0,
        selectedTrack: 0,
        
        // Física
        speed: 0, 
        pos: 0, 
        playerX: 0, // -1 (esq) a 1 (dir), mas pode passar disso (offroad)
        steer: 0, 
        targetSteer: 0,
        
        // Estado de colisão/controle
        spinAngle: 0,     // Ângulo visual da câmera (0 = normal)
        spinTimer: 0,     // Tempo restante do spin
        collisionTimer: 0,
        screenShake: 0,
        
        // Gameplay
        nitro: 100, 
        turboLock: false,
        lap: 1, 
        totalLaps: 3, 
        time: 0, 
        rank: 1,
        
        // Skill System
        combo: 0,
        maxCombo: 0,
        score: 0,

        // Multiplayer
        isOnline: false,
        isReady: false,
        rivals: [],
        dbRef: null,
        lastSync: 0,
        autoStartTimer: null,

        // Input Virtual
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        inputMethod: 'NONE', // KEYBOARD, TOUCH, WEBCAM

        // =================================================================
        // CICLO DE VIDA
        // =================================================================
        init: function() { 
            this.cleanup();
            this.resetState();
            this.setupUI(); // Configura botão HTML do Nitro
            particles = [];
            window.System.msg("SELECIONE O MODO");
            
            // Listener de Teclado (Fallback importante para testes/PC)
            window.addEventListener('keydown', this.handleKeys.bind(this));
            window.addEventListener('keyup', this.handleKeysUp.bind(this));
        },

        cleanup: function() {
            if (this.dbRef) {
                try { this.dbRef.child('players').off(); } catch(e){}
            }
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
            // Remove listeners antigos se houver
            window.removeEventListener('keydown', this.handleKeys);
            window.removeEventListener('keyup', this.handleKeysUp);
        },

        resetState: function() {
            this.speed = 0; 
            this.pos = 0; 
            this.playerX = 0; 
            this.steer = 0;
            this.spinAngle = 0;
            this.spinTimer = 0;
            this.lap = 1;
            this.score = 0;
            this.combo = 0;
            this.nitro = 100;
            this.state = 'MODE_SELECT';
            this.virtualWheel = { x:0, y:0, r:60, opacity:0, isHigh: false };
        },

        // =================================================================
        // UI & INPUT (CORREÇÃO DE CLIQUES)
        // =================================================================
        setupUI: function() {
            // Remove botão antigo se existir
            const old = document.getElementById('nitro-btn-kart');
            if(old) old.remove();

            // Cria botão DOM para Nitro (melhor que canvas para mobile)
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
                transform: 'scale(1)', transition: 'transform 0.1s'
            });

            // Lógica de Ativação do Nitro
            const toggleTurbo = (e) => {
                if(e) { if(e.cancelable) e.preventDefault(); e.stopPropagation(); }
                if(this.state !== 'RACE') return;
                
                if(this.nitro > 10) {
                    this.turboLock = !this.turboLock;
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.9)' : 'scale(1)';
                    nitroBtn.style.filter = this.turboLock ? 'brightness(1.5)' : 'brightness(1)';
                    if(this.turboLock) {
                        window.Sfx.play(600, 'square', 0.1, 0.1);
                        this.screenShake = 5; // Impacto visual ao ligar
                    }
                }
            };
            
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            document.getElementById('game-ui').appendChild(nitroBtn);

            // INPUT HANDLING DO CANVAS (Mouse/Touch nos menus)
            window.System.canvas.onclick = (e) => {
                const rect = window.System.canvas.getBoundingClientRect();
                
                // Normaliza coordenadas (0 a 1) para independer da resolução
                const clickX = (e.clientX - rect.left) / rect.width;
                const clickY = (e.clientY - rect.top) / rect.height;

                this.checkUIButtons(clickX, clickY);
            };
        },

        // Helper para definir botões dinâmicos
        registerButton: function(id, x, y, w, h, callback) {
            // x,y,w,h são porcentagens (0.0 a 1.0)
            uiButtons.push({ id, x, y, w, h, callback });
        },

        checkUIButtons: function(cx, cy) {
            uiButtons.forEach(btn => {
                // Checa colisão AABB simples
                if (cx >= btn.x && cx <= btn.x + btn.w &&
                    cy >= btn.y && cy <= btn.y + btn.h) {
                    window.Sfx.click();
                    btn.callback();
                }
            });
        },

        // Teclado (Debug/PC)
        handleKeys: function(e) {
            if(this.state !== 'RACE') return;
            if(e.key === 'ArrowLeft') this.targetSteer = -1.5;
            if(e.key === 'ArrowRight') this.targetSteer = 1.5;
            if(e.key === 'ArrowUp') this.inputMethod = 'KEYBOARD_GAS';
            if(e.key === ' ') { // Space para Nitro
                if(this.nitro > 5) this.turboLock = true;
            }
        },
        handleKeysUp: function(e) {
            if(e.key === 'ArrowLeft' || e.key === 'ArrowRight') this.targetSteer = 0;
            if(e.key === 'ArrowUp') this.inputMethod = 'NONE';
            if(e.key === ' ') this.turboLock = false;
        },

        // =================================================================
        // LÓGICA DE JOGO (UPDATE)
        // =================================================================
        update: function(ctx, w, h, pose) {
            try {
                // Limpa botões a cada frame para recriar conforme a tela
                uiButtons = []; 

                if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
                if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
                
                // RACE MODE
                if (!segments || segments.length === 0) return 0;

                this.updatePhysics(w, h, pose);
                this.renderWorld(ctx, w, h);
                this.renderHUD(ctx, w, h);
                
                if (this.isOnline) this.syncMultiplayer();
                return Math.floor(this.score);

            } catch (err) {
                console.error("Critical Loop Error:", err);
                return 0;
            }
        },

        // =================================================================
        // FÍSICA PRO (A MAGIA ACONTECE AQUI)
        // =================================================================
        updatePhysics: function(w, h, pose) {
            const charStats = CHARACTERS[this.selectedChar];
            const trackStats = TRACKS[this.selectedTrack];

            // 1. INPUT (WebCam Priority)
            let detected = false;
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.2 && rw.score > 0.2) {
                    detected = true;
                    // Mapeia coordenadas normalizadas
                    const pLx = (1 - lw.x/640); // Mirror
                    const pRx = (1 - rw.x/640); // Mirror
                    
                    // Centro do volante virtual
                    const cx = (pLx + pRx) / 2;
                    // Diferença Y determina giro
                    const dy = (rw.y - lw.y) / 100; // Sensibilidade
                    
                    // Atualiza volante virtual
                    this.virtualWheel.x = cx * w;
                    this.virtualWheel.y = (lw.y + rw.y)/2 * (h/480);
                    this.virtualWheel.opacity = 1.0;

                    this.targetSteer = dy * 4.0; // Multiplicador de esterçamento
                    this.inputMethod = 'WEBCAM';
                }
            }
            
            if (!detected) {
                this.virtualWheel.opacity *= 0.9;
                if(this.inputMethod !== 'KEYBOARD_GAS') this.targetSteer *= 0.5; // Auto-center se soltar
            }

            // Clamp Steer
            this.targetSteer = Math.max(-1.5, Math.min(1.5, this.targetSteer));
            // Smooth Steer (Inércia do volante)
            this.steer += (this.targetSteer - this.steer) * CONF.STEER_SPEED;

            // 2. ACELERAÇÃO E VELOCIDADE
            let maxS = CONF.MAX_SPEED * charStats.speedInfo;
            if (this.turboLock && this.nitro > 0) {
                maxS = CONF.TURBO_MAX_SPEED;
                this.nitro -= 0.5;
                this.screenShake = 2; // Treme com nitro
                if(this.nitro <= 0) this.turboLock = false;
            } else {
                this.nitro = Math.min(100, this.nitro + 0.05); // Regeneração lenta
            }

            // Gas
            if (this.inputMethod !== 'NONE' || detected || this.turboLock) {
                this.speed += (maxS - this.speed) * (CONF.ACCEL_RATE * charStats.accel);
            } else {
                this.speed -= CONF.DECEL_RATE * 2; // Freio motor
            }
            
            // OFFROAD (Punição real)
            if (Math.abs(this.playerX) > CONF.OFFROAD_LIMIT) {
                this.speed *= CONF.OFFROAD_DECEL; // Perde velocidade exponencialmente
                this.screenShake = Math.max(this.screenShake, (this.speed/50)); // Trepidação
                this.combo = 0; // Perde combo
            }

            this.speed = Math.max(0, Math.min(this.speed, maxS + 50)); // Clamp final

            // 3. CURVAS E FORÇA CENTRÍFUGA (O SEGREDO DO GAMEPLAY)
            const segIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            const seg = segments[segIdx % segments.length] || { curve: 0 };
            const curvePower = seg.curve * trackStats.curveMult;

            // Fator Velocidade (quanto mais rápido, mais difícil virar e mais a curva te joga)
            const speedRatio = this.speed / CONF.MAX_SPEED;
            
            // APLICAÇÃO DE FORÇAS
            // a) O jogador vira o carro
            this.playerX += this.steer * (speedRatio * 1.5) * charStats.turnInfo;
            
            // b) A pista "joga" o carro para fora (Força Centrífuga)
            // Se a curva é para direita (positiva), a força joga para esquerda (negativa) relativa à pista visual
            const centrifugal = curvePower * (speedRatio * speedRatio) * CONF.CENTRIFUGAL;
            this.playerX -= centrifugal; 

            // Clamp Position (Paredes invisíveis elásticas)
            if(this.playerX < -5) { this.playerX = -5; this.speed *= 0.9; }
            if(this.playerX > 5)  { this.playerX = 5;  this.speed *= 0.9; }

            // 4. COLISÕES E IMPACTOS (SPIN)
            // Obstáculos
            seg.obs.forEach(o => {
                // Hitbox simples
                if (Math.abs(this.playerX - o.x) < 0.6 && Math.abs(o.zRelative) < 50) {
                     this.triggerCrash(o.type === 'rock' ? 'HARD' : 'SOFT');
                     o.hit = true; // Evita hit duplo
                }
            });

            // Rivais (PVP)
            this.rivals.forEach(r => {
                let dist = r.pos - this.pos;
                // Wrap around track
                if (dist > trackLength/2) dist -= trackLength;
                if (dist < -trackLength/2) dist += trackLength;

                if (Math.abs(dist) < 200 && Math.abs(r.x - this.playerX) < 0.8) {
                    this.triggerCrash('SOFT');
                    // Empurrão
                    const pushDir = (this.playerX - r.x) > 0 ? 1 : -1;
                    this.playerX += pushDir * 0.5;
                }
            });

            // Lógica do SPIN (Giro de câmera)
            if (this.spinTimer > 0) {
                this.spinTimer--;
                this.spinAngle += 25; // Gira rápido
                this.speed *= 0.94;   // Freia forte
            } else {
                // Retorna a câmera ao normal suavemente
                if (this.spinAngle % 360 !== 0) {
                    this.spinAngle = 0; 
                }
            }

            // 5. PROGRESSÃO
            this.pos += this.speed;
            while (this.pos >= trackLength) {
                this.pos -= trackLength;
                this.lap++;
                window.System.msg(`VOLTA ${this.lap}/${this.totalLaps}`);
                window.Sfx.play(1000, 'sine', 0.5, 0.0);
            }
            while (this.pos < 0) this.pos += trackLength;

            // Skill Points (Drift limpo)
            if (this.speed > 100 && Math.abs(curvePower) > 1 && Math.abs(this.playerX) < 2) {
                this.combo++;
                this.score += Math.floor(this.combo / 10);
            } else {
                this.combo = Math.max(0, this.combo - 2); // Decay
            }
            
            // Check Win
            if (this.lap > this.totalLaps && this.state === 'RACE') {
                this.state = 'FINISHED';
                window.System.gameOver(Math.floor(this.score));
            }

            // Efeitos Visuais
            if(this.screenShake > 0) this.screenShake *= 0.9;
        },

        triggerCrash: function(severity) {
            if (this.spinTimer > 0) return; // Já está batido

            window.Sfx.crash();
            this.screenShake = severity === 'HARD' ? 20 : 10;
            this.combo = 0; // Zera combo

            if (severity === 'HARD') {
                this.spinTimer = 40; // ~0.7s girando
                this.speed *= 0.3; // Perde muita velocidade
            } else {
                this.speed *= 0.7;
            }
        },

        // =================================================================
        // RENDERIZAÇÃO (VISUAL PRO)
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const cx = w / 2;
            const cy = h / 2;
            const horizon = h * 0.45;

            // 1. GLOBAL CAMERA TRANSFORMS (Shake & Spin)
            ctx.save();
            
            // Screen Shake
            const sx = (Math.random()-0.5) * this.screenShake;
            const sy = (Math.random()-0.5) * this.screenShake;
            ctx.translate(sx, sy);

            // SPIN EFFECT (A câmera gira em torno do centro da tela)
            if (this.spinAngle !== 0) {
                ctx.translate(cx, cy);
                ctx.rotate(this.spinAngle * Math.PI / 180);
                ctx.translate(-cx, -cy);
            }

            // 2. BACKGROUND (Parallax)
            this.drawBackground(ctx, w, h, horizon);

            // 3. ESTRADA (Pseudo-3D)
            const currentSegIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            let dx = 0; // Acumulador de curva
            let ddy = 0; // Acumulador de colina (futuro)
            
            // Cam X: Posição do jogador relativa à estrada
            // Interpolação para suavizar a câmera
            const camX = this.playerX * (w * 0.35); 
            
            let maxY = h; // Z-Buffer simples (horizonte de baixo pra cima)

            // FOV Effect (Estica quando rápido)
            const fov = CONF.FOV_BASE + (this.turboLock ? 40 : 0) + (this.speed/10);

            // Loop de renderização dos segmentos
            for (let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = (currentSegIdx + n) % segments.length;
                const seg = segments[segIdx];
                
                // Curva projetada
                dx += seg.curve;
                
                // Projeção 3D -> 2D
                // Z da câmera = 0. Z do segmento = n * segmentLength
                const segZ = (n * CONF.SEGMENT_LENGTH); 
                // Scale = dist / (z + dist)
                const scale = fov / (fov + segZ); 
                
                // Próximo segmento (para conectar o poligono)
                const scaleNext = fov / (fov + segZ + CONF.SEGMENT_LENGTH);

                // Coordenadas de Tela
                // X = (WorldX - CamX) * Scale + ScreenCenterX
                // O termo dx acumula a curva visualmente
                const screenX = cx + (-camX - dx * n * 2) * scale; 
                const screenXNext = cx + (-camX - (dx + seg.curve) * (n+1) * 2) * scaleNext;
                
                const screenY = horizon + (1000 * scale); // 1000 = Camera Height fictício
                const screenYNext = horizon + (1000 * scaleNext);
                
                const width = w * 2 * scale; // Largura da estrada
                const widthNext = w * 2 * scaleNext;

                // Culling (Não desenha se estiver escondido por uma colina)
                if (screenYNext >= maxY) continue;
                maxY = screenYNext;

                // Desenha o segmento (Grama, Pista, Zebra)
                this.drawSegment(ctx, w, screenY, screenYNext, screenX, screenXNext, width, widthNext, seg);
                
                // Armazena coords para desenhar sprites depois (Painters Algorithm)
                seg.clipY = screenYNext;
                seg.scale = scale;
                seg.screenX = screenX;
                seg.screenY = screenY;
                
                // Z-index para objetos
                seg.zRelative = segZ;
            }

            // 4. SPRITES (De trás para frente)
            for (let n = CONF.DRAW_DISTANCE - 1; n > 0; n--) {
                const segIdx = (currentSegIdx + n) % segments.length;
                const seg = segments[segIdx];
                
                // Rivais
                this.rivals.forEach(r => {
                     // Calcula posição relativa na pista circular
                     let dist = r.pos - this.pos;
                     if (dist > trackLength/2) dist -= trackLength;
                     if (dist < -trackLength/2) dist += trackLength;
                     
                     // Se o rival está neste segmento (+- erro)
                     if (dist >= n*CONF.SEGMENT_LENGTH && dist < (n+1)*CONF.SEGMENT_LENGTH) {
                         const spriteScale = seg.scale * (w * 0.006);
                         const spriteX = seg.screenX + (r.x * w * seg.scale);
                         this.drawKart(ctx, spriteX, seg.screenY, spriteScale, 0, r.color, true);
                     }
                });

                // Obstáculos
                seg.obs.forEach(o => {
                    const spriteScale = seg.scale * (w * 0.006);
                    const spriteX = seg.screenX + (o.x * w * seg.scale * 1.5); // 1.5 para espalhar mais
                    this.drawObstacle(ctx, o.type, spriteX, seg.screenY, spriteScale);
                });
            }

            // 5. JOGADOR (Sempre na frente)
            // Bounce effect based on speed and offroad
            const bounce = (Math.abs(this.playerX) > CONF.OFFROAD_LIMIT ? Math.random()*5 : Math.sin(this.time * 0.5) * 2);
            const kartY = h * 0.85 + bounce;
            
            // Inclinação visual nas curvas
            const tilt = (this.steer * 20) + (this.spinAngle); 
            
            this.drawKart(ctx, cx, kartY, w * 0.006, tilt, CHARACTERS[this.selectedChar].color, false);

            ctx.restore(); // Fim do Spin/Shake
        },

        drawSegment: function(ctx, w, y1, y2, x1, x2, w1, w2, seg) {
            const trackStats = TRACKS[this.selectedTrack];
            const cols = this.getThemeColors(trackStats.theme, seg.color);
            
            // Grama/Chão
            ctx.fillStyle = cols.grass;
            ctx.fillRect(0, y2, w, y1 - y2);

            // Zebra (Rumble Strip)
            const rW1 = w1 * 1.2; 
            const rW2 = w2 * 1.2;
            ctx.fillStyle = cols.rumble;
            ctx.beginPath();
            ctx.moveTo(x1 - rW1/2, y1); ctx.lineTo(x1 + rW1/2, y1);
            ctx.lineTo(x2 + rW2/2, y2); ctx.lineTo(x2 - rW2/2, y2);
            ctx.fill();

            // Asfalto
            ctx.fillStyle = cols.road;
            ctx.beginPath();
            ctx.moveTo(x1 - w1/2, y1); ctx.lineTo(x1 + w1/2, y1);
            ctx.lineTo(x2 + w2/2, y2); ctx.lineTo(x2 - w2/2, y2);
            ctx.fill();
            
            // Linha central
            if (seg.color === 'dark') {
                ctx.fillStyle = '#fff';
                const lW1 = w1 * 0.02; const lW2 = w2 * 0.02;
                ctx.beginPath();
                ctx.moveTo(x1 - lW1, y1); ctx.lineTo(x1 + lW1, y1);
                ctx.lineTo(x2 + lW2, y2); ctx.lineTo(x2 - lW2, y2);
                ctx.fill();
            }
        },

        getThemeColors: function(theme, type) {
            const dark = type === 'dark';
            if (theme === 'snow') {
                return {
                    grass: dark ? '#b2bec3' : '#dfe6e9', // Neve
                    rumble: dark ? '#d63031' : '#fff',   // Zebra vermelha/branca
                    road: dark ? '#636e72' : '#6c7a89'   // Asfalto gelado
                };
            } else if (theme === 'sand') {
                return {
                    grass: dark ? '#e67e22' : '#f1c40f', // Areia
                    rumble: dark ? '#c0392b' : '#ecf0f1',
                    road: dark ? '#7f8c8d' : '#95a5a6'
                };
            }
            // Grass default
            return {
                grass: dark ? '#27ae60' : '#2ecc71',
                rumble: dark ? '#c0392b' : '#ecf0f1',
                road: dark ? '#34495e' : '#2c3e50'
            };
        },

        drawBackground: function(ctx, w, h, horizon) {
            // Céu gradiente simples
            const grad = ctx.createLinearGradient(0, 0, 0, horizon);
            const skyId = TRACKS[this.selectedTrack].sky;
            if(skyId === 0) { grad.addColorStop(0, '#3498db'); grad.addColorStop(1, '#85c1e9'); } // Azul
            if(skyId === 1) { grad.addColorStop(0, '#d35400'); grad.addColorStop(1, '#f39c12'); } // Laranja
            if(skyId === 2) { grad.addColorStop(0, '#2c3e50'); grad.addColorStop(1, '#bdc3c7'); } // Cinza
            
            ctx.fillStyle = grad;
            ctx.fillRect(-w, -h, w*3, h*3); // Overdraw para cobrir spin
            
            // Montanhas/Cenário (Parallax simples com formas)
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            const offset = (this.pos * 0.001) + (this.playerX * 0.1);
            ctx.beginPath();
            for(let i=0; i<10; i++) {
                const mx = (i * w/4) - (offset * w) % (w*4);
                ctx.lineTo(mx, horizon);
                ctx.lineTo(mx + w/8, horizon - h*0.2);
                ctx.lineTo(mx + w/4, horizon);
            }
            ctx.fill();
        },

        drawKart: function(ctx, x, y, scale, tilt, color, isRival) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            ctx.rotate(tilt * Math.PI / 180);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 20, 50, 10, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-30, -10); ctx.lineTo(30, -10);
            ctx.lineTo(40, 20); ctx.lineTo(-40, 20);
            ctx.fill();

            // Motor / Detalhes
            ctx.fillStyle = '#333';
            ctx.fillRect(-15, -25, 30, 15);
            
            // Rodas (Aumentam com velocidade - squash/stretch fake)
            ctx.fillStyle = '#111';
            const wheelH = 25 + (this.speed/20);
            ctx.fillRect(-45, 5, 15, wheelH); // Esq
            ctx.fillRect(30, 5, 15, wheelH);  // Dir

            // Capacete
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -15, 18, 0, Math.PI*2); ctx.fill();
            
            // Fogo do Nitro
            if ((this.turboLock || isRival) && Math.random() > 0.5) {
                ctx.fillStyle = '#0ff';
                ctx.beginPath(); 
                ctx.moveTo(-10, -10); ctx.lineTo(10, -10); ctx.lineTo(0, -50 - Math.random()*30); 
                ctx.fill();
            }

            // Nome/ID
            if (isRival) {
                ctx.fillStyle = '#fff'; ctx.font="bold 24px Arial"; ctx.textAlign="center";
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
                ctx.beginPath(); ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(0, -40); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.fillRect(-8, -25, 16, 5);
            } else if (type === 'rock') {
                ctx.fillStyle = '#7f8c8d';
                ctx.beginPath(); ctx.arc(0, -15, 20, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#95a5a6'; ctx.beginPath(); ctx.arc(-5, -20, 8, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        },

        // =================================================================
        // HUD & INTERFACES
        // =================================================================
        renderHUD: function(ctx, w, h) {
            // 1. Velocímetro Analógico
            const cx = w - 80; const cy = h - 80; const r = 60;
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2); 
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
            
            // Ponteiro
            const angle = Math.PI + (this.speed / CONF.TURBO_MAX_SPEED) * Math.PI;
            ctx.strokeStyle = this.turboLock ? '#0ff' : '#e74c3c';
            ctx.beginPath(); ctx.moveTo(cx, cy); 
            ctx.lineTo(cx + Math.cos(angle)*r, cy + Math.sin(angle)*r); 
            ctx.stroke();

            // Texto KM/H
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; 
            ctx.font = "bold 20px 'Chakra Petch'"; 
            ctx.fillText(Math.floor(this.speed), cx, cy + 30);

            // 2. Combo / Score
            if (this.combo > 10) {
                ctx.fillStyle = '#f1c40f'; 
                ctx.font = `bold ${40 + (this.combo/5)}px 'Russo One'`;
                ctx.fillText(`COMBO x${Math.floor(this.combo/10)}`, w/2, 100);
            }

            // 3. Volante Virtual (Feedback Visual)
            if (this.virtualWheel.opacity > 0.1) {
                ctx.save();
                ctx.globalAlpha = this.virtualWheel.opacity;
                ctx.translate(this.virtualWheel.x, this.virtualWheel.y);
                ctx.rotate(this.steer);
                
                ctx.beginPath(); ctx.arc(0,0, 50, 0, Math.PI*2);
                ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
                ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0, -50); ctx.stroke(); // Marcador topo
                
                ctx.restore();
            }
        },

        renderModeSelect: function(ctx, w, h) {
            // Fundo
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(0,0,w,h);
            
            // Título
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; 
            ctx.font="bold 60px 'Russo One'"; ctx.fillText("OTTO KART PRO", w/2, 100);

            // Botões desenhados (Hitbox registrada no update anterior)
            const drawBtn = (label, y, color, id, cb) => {
                const bx = w/2 - 200;
                const bw = 400; const bh = 80;
                ctx.fillStyle = color;
                // Efeito Hover simples (se fosse mouse real, mas touch não tem hover)
                ctx.fillRect(bx, y, bw, bh);
                
                ctx.fillStyle = '#fff'; ctx.font="30px 'Russo One'";
                ctx.fillText(label, w/2, y + 50);

                // Registra hitbox (normalizada)
                this.registerButton(id, (bx)/w, y/h, bw/w, bh/h, cb);
            };

            drawBtn("JOGAR SOLO", h*0.4, '#e67e22', 'solo', () => this.enterLobby(false));
            drawBtn("MULTIPLAYER", h*0.6, '#27ae60', 'multi', () => this.enterLobby(true));
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#34495e'; ctx.fillRect(0,0,w,h);
            
            const char = CHARACTERS[this.selectedChar];
            const track = TRACKS[this.selectedTrack];

            // Info
            ctx.fillStyle = '#fff'; ctx.textAlign='center';
            ctx.font="40px 'Russo One'"; ctx.fillText("GARAGEM", w/2, 80);

            // Seleção Char
            ctx.font="20px Arial"; ctx.fillText("PILOTO", w/2, h*0.25);
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.35, 50, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.font="30px 'Russo One'"; ctx.fillText(char.name, w/2, h*0.35 + 80);
            
            // Botão Trocar Char (Seta invisível gigante)
            this.registerButton('char_next', 0.3, 0.25, 0.4, 0.2, () => {
                this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
            });

            // Seleção Pista
            ctx.font="20px Arial"; ctx.fillText("PISTA", w/2, h*0.55);
            ctx.fillStyle = '#ecf0f1'; ctx.fillRect(w/2 - 150, h*0.6, 300, 50);
            ctx.fillStyle = '#2c3e50'; ctx.font="25px 'Russo One'"; ctx.fillText(track.name, w/2, h*0.6 + 35);
            
            this.registerButton('track_next', 0.3, 0.55, 0.4, 0.15, () => {
                this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
            });

            // Botão GO
            const btnText = this.isReady ? "AGUARDANDO..." : "PRONTO!";
            const btnColor = this.isReady ? '#7f8c8d' : '#27ae60';
            
            ctx.fillStyle = btnColor; ctx.fillRect(w/2 - 150, h*0.8, 300, 70);
            ctx.fillStyle = '#fff'; ctx.fillText(btnText, w/2, h*0.8 + 45);

            this.registerButton('go', 0.3, 0.8, 0.4, 0.15, () => this.toggleReady());
        },

        // =================================================================
        // SISTEMA (Network & Maps)
        // =================================================================
        enterLobby: function(online) {
            this.isOnline = online;
            this.state = 'LOBBY';
            window.System.msg(online ? "CONECTANDO..." : "MODO LOCAL");
            
            if (online) {
                if(!window.DB) {
                    window.System.msg("ERRO: SEM REDE!");
                    this.isOnline = false;
                    return;
                }
                this.connectNet();
            } else {
                // Bots Falsos
                this.rivals = [
                    { id: 'cpu1', pos: 100, x: -0.5, color: '#8e44ad', name: 'CPU 1' },
                    { id: 'cpu2', pos: 50, x: 0.5, color: '#f39c12', name: 'CPU 2' }
                ];
            }
        },

        toggleReady: function() {
            if (!this.isOnline) {
                this.startRace();
                return;
            }
            this.isReady = !this.isReady;
            this.state = this.isReady ? 'WAITING' : 'LOBBY';
            this.syncLobby();
        },

        startRace: function() {
            this.buildTrack(this.selectedTrack);
            this.state = 'RACE';
            this.time = 0;
            this.combo = 0;
            
            // Ativa UI Nitro
            if(nitroBtn) nitroBtn.style.display = 'flex';
            
            window.System.msg("LARGADA!");
            window.Sfx.play(600, 'square', 0.5, 0.1);
        },

        buildTrack: function(id) {
            segments = [];
            const trk = TRACKS[id];
            
            const addRoad = (enter, curve, height) => {
                for(let i=0; i<enter; i++) {
                    segments.push({
                        curve: curve,
                        color: (Math.floor(segments.length/CONF.RUMBLE_LENGTH)%2) ? 'dark' : 'light',
                        obs: []
                    });
                }
            };

            // GERAÇÃO PROCEDURAL DA PISTA
            addRoad(50, 0, 0); // Start
            addRoad(40, 0.5, 0); // Curva leve
            addRoad(40, -0.5, 0);
            addRoad(50, 1.5, 0); // Curva fechada
            addRoad(20, 0, 0);
            
            // Obstáculos
            const obsTypes = trk.theme === 'snow' ? 'rock' : 'cone';
            
            // Adiciona retas com obstáculos
            for(let i=0; i<10; i++) {
                addRoad(30, (Math.random()-0.5)*2, 0);
                // Adiciona obstáculo no último segmento criado
                if (Math.random() > 0.5) {
                    segments[segments.length-1].obs.push({
                        type: obsTypes,
                        x: (Math.random()-0.5) * 3, // Espalhado na largura
                        hit: false
                    });
                }
            }
            
            addRoad(50, 0, 0); // Finish line straight
            trackLength = segments.length * CONF.SEGMENT_LENGTH;
        },

        // NETCODE BÁSICO
        connectNet: function() {
            this.dbRef = window.DB.ref('rooms/' + this.roomId);
            const myRef = this.dbRef.child('players/' + window.System.playerId);
            myRef.set({ 
                name: 'Player', charId: this.selectedChar, ready: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP 
            });
            myRef.onDisconnect().remove();

            // Escuta
            this.dbRef.child('players').on('value', snap => {
                const val = snap.val();
                if(!val) return;
                
                this.rivals = Object.keys(val)
                    .filter(k => k !== window.System.playerId)
                    .map(k => ({
                        id: k, ...val[k],
                        color: CHARACTERS[val[k].charId || 0].color,
                        x: val[k].x || 0,
                        pos: val[k].pos || 0
                    }));
                
                // Auto start se todos prontos
                const total = this.rivals.length + 1;
                const readys = this.rivals.filter(r => r.ready).length + (this.isReady?1:0);
                if (total > 1 && total === readys && this.state === 'WAITING') {
                    this.startRace();
                }
            });
        },

        syncMultiplayer: function() {
            if (Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child('players/' + window.System.playerId).update({
                    x: this.playerX,
                    pos: this.pos,
                    charId: this.selectedChar,
                    ready: this.isReady
                });
            }
        },

        syncLobby: function() {
            if (this.isOnline) {
                this.dbRef.child('players/' + window.System.playerId).update({
                    charId: this.selectedChar,
                    ready: this.isReady
                });
            }
        }
    };

    // REGISTRO NO SISTEMA (CORE)
    if(window.System) {
        window.System.registerGame('drive', 'OTTO KART PRO', '🏎️', Logic, {
            camOpacity: 0.15, // Leve transparência para ver as mãos
            showWheel: true
        });
    }

})();