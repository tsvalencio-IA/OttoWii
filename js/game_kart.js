/* =================================================================
   KART LEGENDS: PLATINUM EDITION (VISUAL RESTORED + PHYSICS V4)
   ================================================================= */

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES & ASSETS
    // -----------------------------------------------------------------
    const CONF = {
        MAX_SPEED: 240,
        TURBO_MAX_SPEED: 360,
        ACCEL: 0.15,
        BREAKING: 0.3,
        FRICTION: 0.98,
        OFFROAD_DECEL: 0.94,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 300,
        ROAD_WIDTH: 2000,
        RUMBLE_LENGTH: 3,
        LANES: 3,
        TOTAL_LAPS: 3
    };

    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', stats: { speed: 1.0, turn: 1.0, weight: 1.0 } },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', stats: { speed: 1.05, turn: 0.9, weight: 1.0 } },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', stats: { speed: 0.95, turn: 1.15, weight: 0.8 } },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', stats: { speed: 1.15, turn: 0.7, weight: 1.8 } },
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', stats: { speed: 0.90, turn: 1.25, weight: 0.6 } },
        { id: 5, name: 'YOSHI',  color: '#76ff03', hat: '#64dd17', stats: { speed: 1.02, turn: 1.1, weight: 0.9 } }
    ];

    const TRACKS = [
        { name: 'GRAND PRIX',    theme: 'grass', sky: ['#0099ff', '#88ccff'], ground: ['#55aa44', '#448833'] },
        { name: 'SUNSET DESERT', theme: 'sand',  sky: ['#e67e22', '#f1c40f'], ground: ['#f39c12', '#d35400'] },
        { name: 'MIDNIGHT CITY', theme: 'city',  sky: ['#000033', '#000066'], ground: ['#2c3e50', '#34495e'] }
    ];

    // -----------------------------------------------------------------
    // 2. AUDIO ENGINE (SINTETIZADOR V8)
    // -----------------------------------------------------------------
    const KartAudio = {
        ctx: null, engineOsc: null, engineGain: null, noiseNode: null, noiseGain: null,
        init: function() {
            if (this.ctx) return;
            const AC = window.AudioContext || window.webkitAudioContext;
            this.ctx = new AC();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.4;
            this.master.connect(this.ctx.destination);
        },
        startEngine: function() {
            if (!this.ctx) this.init();
            if (this.engineOsc) return;
            const t = this.ctx.currentTime;
            
            // Motor (Sawtooth + Lowpass)
            this.engineOsc = this.ctx.createOscillator();
            this.engineOsc.type = 'sawtooth';
            this.engineGain = this.ctx.createGain();
            this.engineGain.gain.value = 0.1;
            this.engineOsc.connect(this.engineGain);
            this.engineGain.connect(this.master);
            this.engineOsc.start(t);

            // Ruído de Vento/Pneu
            const bufSize = this.ctx.sampleRate * 2;
            const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
            
            this.noiseNode = this.ctx.createBufferSource();
            this.noiseNode.buffer = buffer;
            this.noiseNode.loop = true;
            this.noiseGain = this.ctx.createGain();
            this.noiseGain.gain.value = 0;
            
            // Filtro para o ruído
            this.noiseFilter = this.ctx.createBiquadFilter();
            this.noiseFilter.type = 'lowpass';
            this.noiseFilter.frequency.value = 400;

            this.noiseNode.connect(this.noiseFilter);
            this.noiseFilter.connect(this.noiseGain);
            this.noiseGain.connect(this.master);
            this.noiseNode.start(t);
        },
        update: function(speed, maxSpeed, isOffroad, isDrift) {
            if (!this.engineOsc) return;
            const ratio = Math.abs(speed) / maxSpeed;
            const now = this.ctx.currentTime;

            // Pitch do motor
            const freq = 60 + (ratio * 200) + (isDrift ? 20 : 0);
            this.engineOsc.frequency.setTargetAtTime(freq, now, 0.1);
            
            // Volume do ruído (Vento + Offroad)
            let noiseVol = ratio * 0.2;
            if (isOffroad) noiseVol += 0.3;
            if (isDrift) noiseVol += 0.2;
            this.noiseGain.gain.setTargetAtTime(noiseVol, now, 0.1);
        },
        stop: function() {
            if (this.engineOsc) {
                this.engineOsc.stop(); this.engineOsc = null;
                this.noiseNode.stop(); this.noiseNode = null;
            }
        },
        playSfx: function(type) {
            if (!this.ctx) return;
            const osc = this.ctx.createOscillator();
            const g = this.ctx.createGain();
            const t = this.ctx.currentTime;
            
            if (type === 'drift') {
                osc.type = 'sawtooth'; osc.frequency.setValueAtTime(150, t);
                osc.frequency.exponentialRampToValueAtTime(100, t+0.2);
                g.gain.setValueAtTime(0.2, t); g.gain.linearRampToValueAtTime(0, t+0.2);
            } else if (type === 'boost') {
                osc.type = 'sine'; osc.frequency.setValueAtTime(200, t);
                osc.frequency.linearRampToValueAtTime(600, t+0.5);
                g.gain.setValueAtTime(0.3, t); g.gain.linearRampToValueAtTime(0, t+0.5);
            } else if (type === 'crash') {
                osc.type = 'square'; osc.frequency.setValueAtTime(100, t);
                osc.frequency.exponentialRampToValueAtTime(20, t+0.2);
                g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.01, t+0.2);
            }
            
            osc.connect(g); g.connect(this.master);
            osc.start(); osc.stop(t+0.5);
        }
    };

    // -----------------------------------------------------------------
    // 3. LÓGICA DO JOGO (ENGINE)
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT', // MENU, LOBBY, RACE, GAMEOVER
        
        // Multiplayer
        roomId: 'kart_pro_v1',
        isOnline: false,
        isHost: false,
        dbRef: null,
        players: {}, // Dados dos oponentes remotos
        
        // Configuração Local
        selChar: 0,
        selTrack: 0,
        
        // Física do Jogador
        pos: 0,
        playerX: 0,
        speed: 0,
        accel: 0,
        steer: 0,
        
        // Estados de Corrida
        lap: 1,
        lapTime: 0,
        totalTime: 0,
        rank: 1,
        nitro: 100,
        isTurbo: false,
        driftAmt: 0,
        
        // Visual
        segments: [],
        trackLength: 0,
        particles: [],
        hudMsgs: [],
        minimap: { path: [], minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        shake: 0,
        
        // Input Virtual
        wheel: { angle: 0, x: 0, y: 0, visible: false },

        // IA
        bots: [],

        init: function() {
            this.state = 'MENU';
            this.reset();
            if(window.System) window.System.msg("KART LEGENDS");
            // Criar botão de Nitro Físico no DOM
            this.createNitroBtn();
        },

        createNitroBtn: function() {
            const old = document.getElementById('nitro-btn');
            if(old) old.remove();
            
            const btn = document.createElement('div');
            btn.id = 'nitro-btn';
            Object.assign(btn.style, {
                position: 'fixed', bottom: '120px', right: '30px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(#ffdd00, #ff8800)',
                border: '4px solid #fff', boxShadow: '0 0 20px rgba(255, 100, 0, 0.6)',
                zIndex: '200', display: 'none', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'sans-serif', fontWeight: 'bold', fontSize: '18px',
                userSelect: 'none', touchAction: 'none'
            });
            btn.innerText = 'NITRO';
            
            const activate = (e) => {
                if(e) e.preventDefault();
                if(this.state === 'RACE' && this.nitro > 20) {
                    this.isTurbo = true;
                    KartAudio.playSfx('boost');
                    this.msg("TURBO!", "#0ff");
                }
            };
            btn.addEventListener('touchstart', activate);
            btn.addEventListener('mousedown', activate);
            document.body.appendChild(btn);
            this.nitroBtnElement = btn;
        },

        reset: function() {
            this.pos = 0;
            this.playerX = 0;
            this.speed = 0;
            this.steer = 0;
            this.lap = 1;
            this.nitro = 100;
            this.isTurbo = false;
            this.particles = [];
            this.bots = [];
            KartAudio.stop();
        },

        // --- TRACK GENERATION (ALGORITMO MODE 7 REAL) ---
        buildTrack: function() {
            this.segments = [];
            const add = (enter, hold, leave, curve, y) => {
                const startY = this.segments.length > 0 ? this.segments[this.segments.length-1].y : 0;
                const endY = startY + (y * CONF.SEGMENT_LENGTH);
                const total = enter + hold + leave;
                for(let i=0; i<total; i++) {
                    const seg = {
                        index: this.segments.length,
                        p1: { world: { z: this.segments.length * CONF.SEGMENT_LENGTH, y: startY, x: 0 }, camera: {}, screen: {} },
                        p2: { world: { z: (this.segments.length+1) * CONF.SEGMENT_LENGTH, y: startY, x: 0 }, camera: {}, screen: {} },
                        curve: 0,
                        color: Math.floor(this.segments.length/CONF.RUMBLE_LENGTH)%2 ? 'dark' : 'light',
                        sprites: []
                    };
                    // Curva suavizada (Ease in/out)
                    let perc = 0;
                    if(i < enter) perc = i / enter;
                    else if(i < enter + hold) perc = 1;
                    else perc = (total - i) / leave;
                    seg.curve = curve * perc;
                    
                    // Altura suavizada
                    // (Simplificado para performance mobile, mantendo plano por enquanto para FPS alto)
                    
                    this.segments.push(seg);
                }
            };

            // Layout da Pista (Curvas complexas)
            add(50, 50, 50, 0, 0);       // Reta Largada
            add(40, 40, 40, 3, 0);       // Direita Suave
            add(40, 40, 40, -4, 0);      // Esquerda Forte
            add(80, 80, 80, 0, 0);       // Retão
            add(30, 30, 30, 6, 0);       // Hairpin Direita
            add(50, 50, 50, -2, 0);      // Esquerda Aberta
            
            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
            this.buildMinimap(); // Gera o mapa baseado na geometria
        },

        buildMinimap: function() {
            this.minimap.path = [];
            let x = 0, z = 0, angle = 0;
            let minX=0, maxX=0, minZ=0, maxZ=0;
            
            for(let i=0; i<this.segments.length; i++) {
                const seg = this.segments[i];
                // Acumula curvatura para gerar coordenadas X/Z
                angle += seg.curve * 0.003; 
                x += Math.sin(angle) * 50;
                z += Math.cos(angle) * 50;
                
                this.minimap.path.push({x, z});
                if(x < minX) minX = x; if(x > maxX) maxX = x;
                if(z < minZ) minZ = z; if(z > maxZ) maxZ = z;
            }
            // Normalizar para caber no HUD
            this.minimap.minX = minX; this.minimap.maxX = maxX;
            this.minimap.minZ = minZ; this.minimap.maxZ = maxZ;
        },

        // --- UPDATE LOOP ---
        update: function(ctx, w, h, pose, dt) {
            // Gerenciamento de Estado
            if (this.state === 'MENU') { this.uiMenu(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // CORRIDA ATIVA
            this.handleInput(pose, w, h, dt);
            this.simulatePhysics(dt);
            if (this.isOnline) this.syncNetwork();
            
            this.render3D(ctx, w, h);
            this.renderHUD(ctx, w, h);
            
            return Math.floor(this.score);
        },

        handleInput: function(pose, w, h, dt) {
            let steerInput = 0;
            this.wheel.visible = false;

            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const nose = pose.keypoints.find(k => k.name === 'nose');

                if (lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    // Mapeia coordenadas normalizadas para tela
                    const lx = (1 - lw.x/640) * w; const ly = (lw.y/480) * h;
                    const rx = (1 - rw.x/640) * w; const ry = (rw.y/480) * h;

                    // Cálculo do Volante
                    const dx = rx - lx; const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    steerInput = angle * 2.5; // Sensibilidade
                    
                    // Dados visuais do volante
                    this.wheel.x = (lx + rx) / 2;
                    this.wheel.y = (ly + ry) / 2;
                    this.wheel.angle = angle;
                    this.wheel.visible = true;

                    // Turbo Gesto: Mãos acima do nariz
                    if (nose && ly < nose.y && ry < nose.y && this.nitro > 20) {
                        if (!this.isTurbo) {
                            this.isTurbo = true;
                            KartAudio.playSfx('boost');
                            this.msg("TURBO!", "#0ff");
                        }
                    }
                }
            }
            
            // Suavização do input
            this.steer += (steerInput - this.steer) * 0.2;
        },

        simulatePhysics: function(dt) {
            const charStat = CHARACTERS[this.selChar].stats;
            const seg = this.segments[Math.floor(this.pos / CONF.SEGMENT_LENGTH) % this.segments.length];

            // 1. Aceleração
            let maxSpeed = CONF.MAX_SPEED * charStat.speed;
            if (this.isTurbo) {
                maxSpeed = CONF.TURBO_MAX_SPEED;
                this.nitro -= 40 * dt;
                if (this.nitro <= 0) this.isTurbo = false;
                this.spawnParticles(0, 0, 'fire'); // Partículas atrás do kart
            } else {
                this.nitro = Math.min(100, this.nitro + (5*dt));
            }

            // Offroad Check
            if (Math.abs(this.playerX) > 1.1) {
                maxSpeed *= 0.4;
                this.shake = 5;
                this.spawnParticles((Math.random()-0.5)*50, 0, 'dust');
            } else {
                this.shake = 0;
            }

            this.speed += (maxSpeed - this.speed) * CONF.ACCEL * dt;

            // 2. Curvas e Centrífuga
            // Quanto mais rápido, mais difícil fazer a curva (inércia)
            const speedRatio = (this.speed / CONF.MAX_SPEED);
            const dx = dt * 2 * speedRatio; 
            
            // Força Centrífuga da pista (te joga pra fora)
            this.playerX -= (dx * seg.curve * 0.3 * speedRatio);
            
            // Sua direção
            this.playerX += (dx * this.steer * 1.5 * charStat.turn);

            // Limites da pista
            this.playerX = Math.max(-2.5, Math.min(2.5, this.playerX));

            // 3. Avanço
            this.pos += this.speed * dt * 20; // Escala arbitrária para sensação de velocidade
            if (this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if (this.lap > CONF.TOTAL_LAPS) {
                    this.state = 'GAMEOVER';
                    this.nitroBtnElement.style.display = 'none';
                    KartAudio.stop();
                    window.System.msg("FINAL!!");
                } else {
                    this.msg("VOLTA " + this.lap);
                }
            }

            // Audio update
            KartAudio.update(this.speed, CONF.MAX_SPEED, Math.abs(this.playerX)>1.1, Math.abs(this.steer)>0.8);
            
            // Update Bots
            this.bots.forEach(bot => this.updateBot(bot, dt));
        },

        updateBot: function(bot, dt) {
            // IA Simplificada
            const speed = bot.speed * (bot.pos > this.pos - 2000 && bot.pos < this.pos + 2000 ? 1 : 0.8); // Corre se estiver perto
            bot.pos += speed * dt * 20;
            
            const segIdx = Math.floor(bot.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
            const seg = this.segments[segIdx];
            
            // IA tenta ficar no centro mas faz curvas
            const targetX = -seg.curve * 0.5; // Compensa curva
            bot.x += (targetX - bot.x) * 0.05;
            
            if (bot.pos >= this.trackLength) {
                bot.pos -= this.trackLength;
                bot.lap++;
            }
        },

        // --- RENDER ENGINE (MODE 7 PSEUDO-3D) ---
        render3D: function(ctx, w, h) {
            // Background (Parallax)
            const theme = TRACKS[this.selTrack];
            const skyGrad = ctx.createLinearGradient(0, 0, 0, h/2);
            skyGrad.addColorStop(0, theme.sky[0]); skyGrad.addColorStop(1, theme.sky[1]);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,h);
            
            // Chão (Offroad)
            ctx.fillStyle = theme.ground[0]; ctx.fillRect(0, h/2, w, h/2);

            // Pista
            const fov = 1 / Math.tan( (80 * Math.PI / 180) * 0.5 ); // FOV 80
            const cameraHeight = 1000 + (this.isTurbo ? Math.random()*50 : 0); // Camera shake no turbo
            const cameraDepth = 1 / Math.tan( (80 * Math.PI / 180) * 0.5 );
            
            let dx = 0;
            let ddx = 0;
            let startPos = this.pos;
            let maxY = h;

            // Loop de Renderização (Trás para frente não funciona bem aqui, fazemos frente para trás com Z-Buffer lógico)
            // Na verdade, Painter's Algorithm para Sprites, mas scanline para pista.
            // Aqui usamos a técnica clássica de scanline: desenha de perto para longe, mas só desenha se Y for menor que o anterior.
            // Para sprites, armazenamos e desenhamos depois de trás para frente.
            
            let spritesToDraw = [];

            // Base segment
            const baseIdx = Math.floor(startPos / CONF.SEGMENT_LENGTH);
            const camX = this.playerX * CONF.ROAD_WIDTH;
            
            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const seg = this.segments[(baseIdx + n) % this.segments.length];
                const looped = (baseIdx + n) >= this.segments.length;
                
                // Projeção 3D
                // Mundo -> Camera -> Tela
                // Coordenadas relativas à câmera
                let z = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (startPos % CONF.SEGMENT_LENGTH));
                if (z < 60) continue; // Clip near plane
                
                // Curvatura acumulada
                dx += ddx;
                ddx += seg.curve;
                
                const scale = cameraDepth / z;
                const screenY = (h/2) + (scale * cameraHeight * (h/2));
                const screenX = (w/2) - ( (camX - dx) * scale * w/2 ) / CONF.ROAD_WIDTH; // Offset X
                const screenW = (CONF.ROAD_WIDTH * scale * w/2) / CONF.ROAD_WIDTH * 2000; // Largura visual

                // Otimização: Só desenha se subiu na tela (occlusion)
                if (screenY >= maxY) continue;
                maxY = screenY;

                // Desenha Grama/Chão (opcional se já preenchemos o fundo, mas ajuda na transição)
                // Desenha Pista
                const color = seg.color === 'light' ? '#999' : '#888';
                const rumble = seg.color === 'light' ? '#fff' : '#c00';
                
                // Zebra
                ctx.fillStyle = rumble;
                ctx.fillRect(0, screenY, w, 4); // Scanline hack (simples e rápido)
                
                // Asfalto
                const laneW = screenW * 0.8;
                ctx.fillStyle = color;
                const left = screenX - laneW;
                ctx.fillRect(left, screenY, laneW*2, 4);
                
                // Faixa central
                if (seg.color === 'light') {
                   ctx.fillStyle = '#fff';
                   ctx.fillRect(screenX - (laneW*0.02), screenY, laneW*0.04, 4);
                }

                // Coletar Sprites e Players para desenhar depois
                // Adiciona Bots
                this.bots.forEach(bot => {
                    const botSeg = Math.floor(bot.pos / CONF.SEGMENT_LENGTH);
                    if (botSeg === seg.index || (looped && botSeg === seg.index + this.segments.length)) {
                        spritesToDraw.push({
                            type: 'kart', obj: bot, x: screenX + (bot.x * laneW), y: screenY, scale: scale, dist: z
                        });
                    }
                });
                
                // Adiciona Rivais Online
                // (Logica similar para players remotos)
            }

            // Desenhar Sprites (Painter's Algo: Trás para Frente)
            spritesToDraw.sort((a,b) => b.dist - a.dist);
            spritesToDraw.forEach(s => {
                if (s.type === 'kart') this.drawKartSprite(ctx, s.x, s.y, s.scale * 4000, 0, 0, s.obj.charId);
            });

            // PARTICLES
            this.renderParticles(ctx, w, h);

            // PLAYER KART (Sempre na frente)
            const bounce = Math.abs(Math.sin(Date.now()/50)) * (this.speed/20);
            this.drawKartSprite(ctx, w/2, h*0.85 - bounce + this.shake, w*0.8, this.steer, this.isTurbo, this.selChar);
        },

        drawKartSprite: function(ctx, x, y, scale, steer, isTurbo, charId) {
            const size = scale * 0.001 * (window.innerWidth/2);
            const char = CHARACTERS[charId];
            
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(size, size);
            
            // Inclinação nas curvas
            ctx.rotate(steer * 0.3);

            // Sombra
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath(); ctx.ellipse(0, 30, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Pneus Traseiros
            ctx.fillStyle = "#222";
            ctx.fillRect(-55, 0, 20, 30);
            ctx.fillRect(35, 0, 20, 30);

            // Chassi
            ctx.fillStyle = char.color;
            // Design aerodinâmico
            ctx.beginPath();
            ctx.moveTo(-35, -20);
            ctx.lineTo(35, -20);
            ctx.lineTo(45, 10);
            ctx.lineTo(25, 30);
            ctx.lineTo(-25, 30);
            ctx.lineTo(-45, 10);
            ctx.fill();
            
            // Detalhe Motor/Escape
            ctx.fillStyle = "#555";
            ctx.fillRect(-20, 25, 40, 10);
            if (isTurbo) {
                // Fogo
                ctx.fillStyle = (Math.random() > 0.5) ? "#ff0" : "#f00";
                ctx.beginPath();
                ctx.moveTo(-10, 35); ctx.lineTo(10, 35); ctx.lineTo(0, 60 + Math.random()*20);
                ctx.fill();
            }

            // Motorista (Cabeça)
            ctx.fillStyle = "#ffccaa"; // Pele
            ctx.beginPath(); ctx.arc(0, -30, 20, 0, Math.PI*2); ctx.fill();
            
            // Chapéu
            ctx.fillStyle = char.hat;
            ctx.beginPath(); ctx.arc(0, -35, 20, Math.PI, 0); ctx.fill();
            ctx.fillRect(-20, -35, 40, 5); // Aba
            // Letra
            ctx.fillStyle = "#fff"; ctx.font = "bold 15px Arial"; ctx.textAlign = "center";
            ctx.fillText(char.name[0], 0, -38);

            // Pneus Dianteiros (Giram com steer)
            const wheelRot = steer * 0.5;
            const drawWheel = (ox) => {
                ctx.save();
                ctx.translate(ox, 10);
                ctx.rotate(wheelRot);
                ctx.fillStyle = "#222";
                ctx.fillRect(-10, -15, 20, 30);
                // Calota
                ctx.fillStyle = "#ccc";
                ctx.fillRect(-5, -5, 10, 10);
                ctx.restore();
            };
            drawWheel(-50);
            drawWheel(50);

            // Volante
            ctx.fillStyle = "#333";
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.8);
            ctx.fillRect(-15, -2, 30, 4);
            ctx.restore();

            ctx.restore();
        },

        spawnParticles: function(x, y, type) {
            this.particles.push({ 
                x: x, y: y, z: 0.5, 
                vx: (Math.random()-0.5)*10, vy: -Math.random()*10, 
                life: 1.0, type: type 
            });
        },

        renderParticles: function(ctx, w, h) {
            this.particles = this.particles.filter(p => p.life > 0);
            this.particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                const px = (w/2) + p.x;
                const py = (h * 0.85) + p.y; // Baseado na posição do player
                
                ctx.globalAlpha = p.life;
                if (p.type === 'fire') {
                    ctx.fillStyle = `rgb(255, ${Math.floor(p.life*255)}, 0)`;
                    ctx.beginPath(); ctx.arc(px, py, 10*p.life, 0, Math.PI*2); ctx.fill();
                } else {
                    ctx.fillStyle = '#aaa';
                    ctx.fillRect(px, py, 8*p.life, 8*p.life);
                }
            });
            ctx.globalAlpha = 1.0;
        },

        renderHUD: function(ctx, w, h) {
            // 1. VOLANTE VIRTUAL (Estilo GT)
            if (this.wheel.visible) {
                const wx = this.wheel.x; const wy = this.wheel.y;
                const r = 60;
                ctx.save();
                ctx.translate(wx, wy);
                ctx.rotate(this.wheel.angle);
                
                // Aro
                ctx.lineWidth = 15;
                ctx.strokeStyle = '#333'; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
                // Detalhe superior (marca de centro)
                ctx.strokeStyle = '#f00'; ctx.beginPath(); ctx.arc(0,0,r, -0.2, 0.2); ctx.stroke();
                // Miolo
                ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.fill();
                // Hastes
                ctx.fillStyle = '#ccc'; 
                ctx.fillRect(-r, -5, r*2, 10);
                
                // Texto
                ctx.rotate(-this.wheel.angle); // Desfazer rotação para texto
                ctx.fillStyle = '#0ff'; ctx.font = "bold 12px sans-serif"; ctx.textAlign="center";
                ctx.fillText("AR DRIVE", 0, 35);
                ctx.restore();
            }

            // 2. SPEEDOMETER
            const sx = w - 80; const sy = h - 80;
            ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(sx, sy, 55, Math.PI*0.8, Math.PI*2.2); ctx.stroke();
            // Ponteiro
            const speedPct = this.speed / CONF.TURBO_MAX_SPEED;
            const pAngle = (Math.PI*0.8) + (speedPct * (Math.PI*1.4));
            ctx.strokeStyle = this.isTurbo ? '#0ff' : '#f00'; ctx.lineWidth = 5;
            ctx.beginPath(); ctx.moveTo(sx, sy); 
            ctx.lineTo(sx + Math.cos(pAngle)*50, sy + Math.sin(pAngle)*50); ctx.stroke();
            // Digital
            ctx.fillStyle = '#fff'; ctx.font = "italic bold 24px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText(Math.floor(this.speed), sx, sy + 40);
            ctx.font = "10px sans-serif"; ctx.fillText("KM/H", sx, sy + 52);

            // 3. MINIMAPA PRECISO
            const mapSize = 120;
            const mx = 20; const my = 20;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(mx, my, mapSize, mapSize);
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(mx, my, mapSize, mapSize);
            
            // Desenhar traçado
            ctx.save();
            ctx.beginPath();
            ctx.rect(mx, my, mapSize, mapSize);
            ctx.clip(); // Cortar o que sobra
            
            // Calcular escala do mapa para caber na caixa
            const worldW = this.minimap.maxX - this.minimap.minX;
            const worldH = this.minimap.maxZ - this.minimap.minZ;
            const scaleX = (mapSize - 20) / worldW;
            const scaleZ = (mapSize - 20) / worldH;
            const mapScale = Math.min(scaleX, scaleZ);
            
            ctx.translate(mx + mapSize/2, my + mapSize/2);
            ctx.scale(mapScale, mapScale);
            // Centralizar
            const centerX = (this.minimap.minX + this.minimap.maxX) / 2;
            const centerZ = (this.minimap.minZ + this.minimap.maxZ) / 2;
            ctx.translate(-centerX, -centerZ);

            // Linha da pista
            ctx.strokeStyle = '#888'; ctx.lineWidth = 15; ctx.lineJoin = 'round';
            ctx.beginPath();
            this.minimap.path.forEach((p, i) => {
                if (i===0) ctx.moveTo(p.x, p.z);
                else ctx.lineTo(p.x, p.z);
            });
            ctx.closePath(); ctx.stroke();
            // Interior pista
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();

            // PONTOS (Jogadores)
            // Converter posição linear (pos) para coordenada X,Z do mapa
            const getMapPos = (dist) => {
                const idx = Math.floor(dist / CONF.SEGMENT_LENGTH) % this.segments.length;
                return this.minimap.path[idx] || {x:0, z:0};
            };

            const myPos = getMapPos(this.pos);
            ctx.fillStyle = '#f00'; ctx.beginPath(); ctx.arc(myPos.x, myPos.z, 20, 0, Math.PI*2); ctx.fill();
            
            // Bots no mapa
            this.bots.forEach(b => {
                const bPos = getMapPos(b.pos);
                ctx.fillStyle = '#ff0'; ctx.beginPath(); ctx.arc(bPos.x, bPos.z, 15, 0, Math.PI*2); ctx.fill();
            });

            ctx.restore();

            // 4. MENSAGENS DE TOPO
            this.hudMsgs.forEach(m => {
                m.life -= 1;
                m.y -= 1;
                ctx.fillStyle = m.c; ctx.strokeStyle = '#000'; ctx.lineWidth=4;
                ctx.font = "bold 40px 'Russo One'"; ctx.textAlign="center";
                ctx.strokeText(m.t, w/2, m.y); ctx.fillText(m.t, w/2, m.y);
            });
            this.hudMsgs = this.hudMsgs.filter(m => m.life > 0);
        },

        // --- TELAS DE MENU ---
        uiMenu: function(ctx, w, h) {
            // Fundo animado
            const t = Date.now() / 1000;
            const grad = ctx.createLinearGradient(0,0,w,h);
            grad.addColorStop(0, '#e74c3c'); grad.addColorStop(1, '#f1c40f');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            
            // Título
            ctx.fillStyle = '#fff'; ctx.font = "italic black 60px 'Russo One'"; ctx.textAlign="center";
            ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20;
            ctx.fillText("KART LEGENDS", w/2, h*0.3);
            ctx.font = "bold 20px sans-serif";
            ctx.fillText("SELECIONE O MODO", w/2, h*0.35);
            ctx.shadowBlur = 0;

            // Botões (Hitbox simplificada: Metade cima / Metade baixo)
            ctx.fillStyle = '#fff'; 
            ctx.fillRect(w/2 - 150, h*0.5 - 40, 300, 80); // Solo
            ctx.fillRect(w/2 - 150, h*0.7 - 40, 300, 80); // Multi

            ctx.fillStyle = '#c0392b'; ctx.font = "bold 30px 'Russo One'";
            ctx.fillText("ARCADE SOLO", w/2, h*0.5 + 10);
            ctx.fillText("MULTIPLAYER", w/2, h*0.7 + 10);

            // Input Mockup
            if (!window.System.canvas.onclick) {
                window.System.canvas.onclick = (e) => {
                    const rect = window.System.canvas.getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    if (y < h*0.6) {
                        this.startSolo();
                    } else {
                        this.startMulti();
                    }
                    window.System.canvas.onclick = null;
                };
            }
        },
        
        startSolo: function() {
            this.isOnline = false;
            // Add bots
            this.bots = [
                { id: 1, charId: 1, pos: 500, x: 0.5, speed: 100 },
                { id: 3, charId: 3, pos: 200, x: -0.5, speed: 90 },
                { id: 4, charId: 4, pos: 800, x: 0, speed: 110 }
            ];
            this.startGame();
        },
        
        startMulti: function() {
            this.isOnline = true;
            this.state = 'LOBBY';
            window.System.msg("CONECTANDO...");
            // Lógica de sala seria aqui, simplificado vai direto
            setTimeout(() => this.startGame(), 1000);
        },

        startGame: function() {
            this.reset();
            this.buildTrack();
            this.state = 'RACE';
            this.nitroBtnElement.style.display = 'flex';
            KartAudio.startEngine();
            this.msg("LARGADA!", "#0f0");
        },

        msg: function(t, c='#fff') {
            this.hudMsgs.push({t:t, c:c, y: window.innerHeight/2, life: 60});
        },

        uiGameOver: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = '#f1c40f'; ctx.font = "bold 60px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText("FIM DE JOGO", w/2, h/2);
            ctx.fillStyle = '#fff'; ctx.font = "30px sans-serif";
            ctx.fillText("Toque para reiniciar", w/2, h/2 + 60);
            
            if (!window.System.canvas.onclick) {
                window.System.canvas.onclick = () => {
                    this.init();
                    window.System.canvas.onclick = null;
                };
            }
        },

        // --- MULTIPLAYER SYNC (SIMPLIFICADO) ---
        syncNetwork: function() {
            // Em um app real, aqui enviamos this.pos, this.playerX para o Firebase
            // E lemos os players para this.bots
        }
    };

    // Registrar
    if(window.System && window.System.registerGame) {
        window.System.registerGame('kart', 'Kart Legends', '🏎️', Game, { camOpacity: 0.1 });
    }

})();