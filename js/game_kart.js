/* =================================================================
   KART LEGENDS: TITANIUM EDITION (MODE-7 RENDER + REAL PHYSICS)
   ================================================================= */

(function() {

    // -----------------------------------------------------------------
    // 1. CONSTANTES & CONFIGURAÇÕES
    // -----------------------------------------------------------------
    const CONF = {
        MAX_SPEED: 240,       // Velocidade base alta
        TURBO_MAX_SPEED: 380, // Velocidade turbo insana
        ACCEL: 0.1,           // Aceleração
        BREAKING: 0.3,        // Frenagem
        DECEL: 0.05,          // Perda de velocidade natural
        OFFROAD_DECEL: 0.2,   // Perda na grama
        SEGMENT_LENGTH: 200,  // Comprimento de cada pedaço da pista
        RUMBLE_LENGTH: 3,     // Tamanho da zebra
        ROAD_WIDTH: 2000,     // Largura da pista
        DRAW_DISTANCE: 300,   // Distância de renderização (Profundidade)
        FOV: 100,             // Campo de visão
        CAMERA_HEIGHT: 1000,  // Altura da câmera
        CAMERA_DEPTH: 0.84    // Distância focal
    };

    const CHARACTERS = [
        { id: 0, name: 'MARIO',   color: '#e74c3c', hat: '#d32f2f', skin: '#ffccaa', stats: { speed: 1.00, grip: 1.00 } },
        { id: 1, name: 'LUIGI',   color: '#2ecc71', hat: '#27ae60', skin: '#ffccaa', stats: { speed: 1.02, grip: 0.95 } },
        { id: 2, name: 'PEACH',   color: '#ff9ff3', hat: '#fd79a8', skin: '#ffccaa', stats: { speed: 0.95, grip: 1.10 } },
        { id: 3, name: 'BOWSER',  color: '#f1c40f', hat: '#e67e22', skin: '#e67e22', stats: { speed: 1.15, grip: 0.70 } },
        { id: 4, name: 'TOAD',    color: '#3498db', hat: '#ecf0f1', skin: '#ffccaa', stats: { speed: 0.90, grip: 1.20 } },
        { id: 5, name: 'YOSHI',   color: '#76ff03', hat: '#64dd17', skin: '#ffccaa', stats: { speed: 1.05, grip: 1.05 } }
    ];

    const TRACKS = [
        { name: 'GRAND PRIX',    sky: ['#0099ff', '#88ccff'], ground: ['#55aa44', '#448833'], road: ['#777', '#666'] },
        { name: 'SUNSET CANYON', sky: ['#e67e22', '#f1c40f'], ground: ['#d35400', '#e67e22'], road: ['#a0522d', '#8b4513'] },
        { name: 'NEON CITY',     sky: ['#000033', '#000066'], ground: ['#111', '#222'],       road: ['#333', '#222'] }
    ];

    // -----------------------------------------------------------------
    // 2. ENGINE LÓGICA
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT',
        
        // Multiplayer
        roomId: 'kart_titanium_v1',
        isOnline: false,
        isHost: false,
        dbRef: null,
        players: {},

        // Estado Local
        selChar: 0,
        selTrack: 0,
        
        // Física
        pos: 0,            // Posição Z na pista
        playerX: 0,        // Posição X na pista (-1 a 1)
        speed: 0,
        steer: 0,          // Input de direção
        nitro: 100,
        isTurbo: false,
        lap: 1,
        totalLaps: 3,
        
        // Render
        segments: [],      // Array de segmentos da pista
        trackLength: 0,    // Comprimento total
        minimapPath: [],   // Coordenadas X,Z reais da pista
        minimapBounds: {}, // Limites para escala do minimap
        particles: [],
        hudMsgs: [],
        
        // Input Virtual
        wheel: { x:0, y:0, angle:0, active:false },

        // IA
        bots: [],

        init: function() {
            this.state = 'MENU';
            if(window.System) window.System.msg("KART LEGENDS");
            this.createNitroBtn();
            this.reset();
        },

        createNitroBtn: function() {
            const old = document.getElementById('nitro-btn'); if(old) old.remove();
            
            const btn = document.createElement('div');
            btn.id = 'nitro-btn';
            Object.assign(btn.style, {
                position: 'fixed', bottom: '140px', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(circle, #ffeb3b 0%, #ff9800 100%)',
                border: '4px solid #fff', boxShadow: '0 0 20px rgba(255, 165, 0, 0.6)',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'sans-serif', fontWeight: '900', fontSize: '18px',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)', cursor: 'pointer', zIndex: '1000'
            });
            btn.innerText = "NITRO";
            
            const action = (e) => {
                if(e) e.preventDefault();
                if(this.state === 'RACE' && this.nitro > 20) {
                    this.isTurbo = true;
                    if(window.Sfx) window.Sfx.play(600, 'square', 0.5, 0.2);
                    this.msg("TURBO!", "#0ff");
                }
            };
            btn.addEventListener('touchstart', action);
            btn.addEventListener('mousedown', action);
            document.body.appendChild(btn);
            this.nitroEl = btn;
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
        },

        // --- GERAÇÃO DE PISTA (GEOMETRIA REAL) ---
        buildTrack: function() {
            this.segments = [];
            const add = (enter, hold, leave, curve, y) => {
                const startY = this.segments.length > 0 ? this.segments[this.segments.length-1].y : 0;
                const endY = startY + (y * CONF.SEGMENT_LENGTH);
                const total = enter + hold + leave;
                
                for(let i=0; i<total; i++) {
                    // Interpolação de curva (Ease In/Out)
                    let c = 0;
                    if (i < enter) c = curve * (i/enter);
                    else if (i < enter + hold) c = curve;
                    else c = curve * ((total-i)/leave);

                    // Interpolação de Altura
                    let h = startY + (endY - startY) * (i/total);

                    this.segments.push({
                        index: this.segments.length,
                        p1: { world: { z:0, y:0, x:0 }, camera: {}, screen: {} }, // Preenchido no render
                        p2: { world: { z:0, y:0, x:0 }, camera: {}, screen: {} },
                        curve: c,
                        y: h,
                        color: Math.floor(this.segments.length/CONF.RUMBLE_LENGTH)%2 ? 'dark' : 'light'
                    });
                }
            };

            // Layout da Pista (Curvas Complexas)
            // (Num, Num, Num, Curvatura, Altura)
            add(50, 50, 50,  0,  0);  // Reta Largada
            add(40, 40, 40,  4,  0);  // Direita Média
            add(60, 60, 60, -2,  0);  // Esquerda Longa
            add(40, 40, 40, -4,  20); // Esquerda Subida
            add(80, 80, 80,  0, -20); // Reta Descida
            add(30, 30, 30,  6,  0);  // Hairpin Direita
            add(50, 50, 50,  0,  0);  // Reta Final

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
            this.calculateMapPath();
        },

        // Calcula a geometria X/Z real para o minimapa
        calculateMapPath: function() {
            this.minimapPath = [];
            let x = 0, z = 0, angle = 0;
            let minX=0, maxX=0, minZ=0, maxZ=0;

            for(let i=0; i<this.segments.length; i++) {
                const seg = this.segments[i];
                // Acumula curvatura para virar o ângulo
                angle += seg.curve * 0.003; 
                x += Math.sin(angle) * 50;
                z += Math.cos(angle) * 50;

                this.minimapPath.push({x, z});

                if(x < minX) minX = x; if(x > maxX) maxX = x;
                if(z < minZ) minZ = z; if(z > maxZ) maxZ = z;
            }
            this.minimapBounds = { minX, maxX, minZ, maxZ, w: maxX-minX, h: maxZ-minZ };
        },

        // --- GAME LOOP ---
        update: function(ctx, w, h, pose, dt) {
            // Gerenciamento de Estado
            if (this.state === 'MENU') { this.uiMenu(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // Lógica de Corrida
            this.handleInput(pose, w, h, dt);
            this.physics(dt);
            if(this.isOnline) this.syncNet();

            // Renderização
            this.render3D(ctx, w, h);
            this.renderHUD(ctx, w, h);

            return Math.floor(this.speed * 10);
        },

        handleInput: function(pose, w, h, dt) {
            let steerInput = 0;
            this.wheel.active = false;

            // Pose Detection para Direção
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const nose = pose.keypoints.find(k => k.name === 'nose');

                if (lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    const lx = (1 - lw.x/640) * w; const ly = (lw.y/480) * h;
                    const rx = (1 - rw.x/640) * w; const ry = (rw.y/480) * h;

                    // Ângulo entre pulsos
                    const angle = Math.atan2(ry - ly, rx - lx);
                    steerInput = angle * 2.5; 

                    this.wheel.x = (lx+rx)/2;
                    this.wheel.y = (ly+ry)/2;
                    this.wheel.angle = angle;
                    this.wheel.active = true;

                    // Turbo Gesto: Mãos acima do nariz
                    if (nose && ly < nose.y && ry < nose.y && this.nitro > 20) {
                        if(!this.isTurbo) {
                            this.isTurbo = true;
                            if(window.Sfx) window.Sfx.play(800, 'square', 0.2, 0.2);
                        }
                    }
                }
            }

            // Suavização
            this.steer += (steerInput - this.steer) * 5 * dt;
        },

        physics: function(dt) {
            const stats = CHARACTERS[this.selChar].stats;
            const seg = this.segments[Math.floor(this.pos / CONF.SEGMENT_LENGTH) % this.segments.length];

            // Aceleração
            let maxSpeed = CONF.MAX_SPEED * stats.speed;
            if(this.isTurbo) {
                maxSpeed = CONF.TURBO_MAX_SPEED;
                this.nitro -= 30 * dt;
                this.spawnParticles(0, 0, 'fire');
                if(this.nitro <= 0) this.isTurbo = false;
            } else {
                this.nitro = Math.min(100, this.nitro + (5*dt));
            }

            // Terreno (Grama reduz velocidade)
            if (Math.abs(this.playerX) > 1.2) {
                maxSpeed *= 0.3;
                this.spawnParticles((Math.random()-0.5)*50, 0, 'dust');
                if(window.Gfx) window.Gfx.shakeScreen(3);
            }

            // Aplica Velocidade
            if (this.speed < maxSpeed) this.speed += CONF.ACCEL * dt * 60;
            else this.speed -= CONF.DECEL * dt * 60;

            // Centrífuga (Curva joga pra fora)
            const speedRatio = (this.speed / CONF.MAX_SPEED);
            const dx = dt * 2 * speedRatio;
            
            // Física de Curva:
            // playerX é modificado pela curva da pista (centrífuga) E pelo volante
            this.playerX -= (dx * seg.curve * 0.25 * speedRatio); // Força centrífuga
            this.playerX += (dx * this.steer * 1.5 * stats.grip); // Volante

            // Limites da pista
            this.playerX = Math.max(-2.5, Math.min(2.5, this.playerX));

            // Avanço
            this.pos += this.speed * dt * 20;
            if(this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if(this.lap > this.totalLaps) this.finishRace();
                else this.msg("VOLTA " + this.lap);
            }

            // Bots Update
            this.bots.forEach(bot => this.updateBot(bot, dt));
        },

        updateBot: function(bot, dt) {
            // IA Simples: Tenta seguir o centro, velocidade varia
            const speed = bot.speed * (bot.pos > this.pos - 2000 && bot.pos < this.pos + 2000 ? 1 : 0.85);
            bot.pos += speed * dt * 20;
            
            const segIdx = Math.floor(bot.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
            const seg = this.segments[segIdx];
            
            // IA vira contra a curva para ficar na pista
            const targetX = -seg.curve * 0.5; 
            bot.x += (targetX - bot.x) * 0.05;

            if(bot.pos >= this.trackLength) {
                bot.pos -= this.trackLength;
                bot.lap++;
            }
        },

        // --- RENDER 3D (MODE 7 SCANLINE) ---
        render3D: function(ctx, w, h) {
            const cx = w/2;
            const cy = h/2;
            
            // 1. Céu e Chão (Parallax)
            const theme = TRACKS[this.selTrack];
            // Céu
            const skyGrad = ctx.createLinearGradient(0,0,0,h/2);
            skyGrad.addColorStop(0, theme.sky[0]); skyGrad.addColorStop(1, theme.sky[1]);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,h);
            // Chão (Fundo)
            ctx.fillStyle = theme.ground[0]; ctx.fillRect(0, h/2, w, h/2);

            // 2. Renderização da Pista (Painter's Algorithm Invertido/Scanline Z-Buffer)
            // Projetamos segmentos de baixo para cima
            
            let startPos = this.pos;
            let startIdx = Math.floor(startPos / CONF.SEGMENT_LENGTH);
            let camH = CONF.CAMERA_HEIGHT + (this.isTurbo ? (Math.random()*20) : 0);
            let maxY = h; // Z-Buffer visual (Horizonte)
            let x = 0, dx = 0; // Curvatura acumulada

            // Sprites para desenhar depois (para garantir ordem correta)
            let sprites = [];

            // Desenha a estrada
            for(let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const seg = this.segments[(startIdx + n) % this.segments.length];
                const looped = (startIdx + n) >= this.segments.length;
                
                // Coordenadas relativas à câmera
                // Z é a distância da câmera até o segmento
                let z = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (startPos % CONF.SEGMENT_LENGTH));
                
                // Projeção 3D (World -> Screen)
                // Scale = fov / z
                const scale = CONF.CAMERA_DEPTH / (z/1000); // Fator de escala
                
                // Curvatura Acumulada (Project X)
                x += dx;
                dx += seg.curve;
                
                // Posição na Tela
                // X = (WorldX - PlayerX - CurveOffset) * scale
                const objX = this.playerX * CONF.ROAD_WIDTH;
                const screenX = cx + (-objX - x) * scale * (w/2) / CONF.ROAD_WIDTH;
                const screenY = cy + (camH * scale * h/2) / 1000;
                const screenW = CONF.ROAD_WIDTH * scale * (w/2) / CONF.ROAD_WIDTH * 2; // Largura visual

                // Armazenar coords para sprites usarem depois
                seg.screen = { x: screenX, y: screenY, w: screenW, scale: scale };

                // Só desenha se estiver abaixo do horizonte atual (Otimização e Oclusão)
                if (screenY >= maxY) continue;
                maxY = screenY;

                // Desenhar Segmento
                const color = seg.color === 'light' ? theme.road[0] : theme.road[1];
                const rumble = seg.color === 'light' ? '#fff' : '#c00';
                const grass = seg.color === 'light' ? theme.ground[0] : theme.ground[1];

                // Hack visual: desenha retângulos horizontais (Scanline)
                // É mais rápido que polígonos em JS puro e dá o look retro
                const bandH = 4; // Altura da linha
                
                // Grama Lateral
                ctx.fillStyle = grass;
                ctx.fillRect(0, screenY, w, bandH);

                // Zebra
                ctx.fillStyle = rumble;
                const rW = screenW * 1.2; 
                ctx.fillRect(screenX - rW/2, screenY, rW, bandH);

                // Asfalto
                ctx.fillStyle = color;
                ctx.fillRect(screenX - screenW/2, screenY, screenW, bandH);
                
                // Linha central
                if(seg.color === 'light') {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(screenX - (screenW*0.02), screenY, screenW*0.04, bandH);
                }
            }

            // 3. Coletar Sprites (Bots e Partículas)
            // Bots
            this.bots.forEach(bot => {
                const botSegIdx = Math.floor(bot.pos / CONF.SEGMENT_LENGTH);
                // Verifica se bot está visível (dentro do draw distance)
                // A lógica cíclica da pista exige cuidado
                let relIdx = botSegIdx - startIdx;
                if (relIdx < 0) relIdx += this.segments.length;

                if (relIdx > 0 && relIdx < CONF.DRAW_DISTANCE) {
                    const seg = this.segments[botSegIdx % this.segments.length];
                    if (seg.screen) {
                        const spriteX = seg.screen.x + (bot.x * seg.screen.w / 2); // Offset X na estrada
                        sprites.push({
                            type: 'kart', obj: bot, 
                            x: spriteX, y: seg.screen.y, 
                            scale: seg.screen.scale, dist: relIdx
                        });
                    }
                }
            });

            // Ordenar Sprites (Longe para Perto)
            sprites.sort((a,b) => b.dist - a.dist);

            // Desenhar Sprites
            sprites.forEach(s => {
                this.drawKartSprite(ctx, s.x, s.y, s.scale * 3000, 0, false, s.obj.charId);
            });

            // Desenhar Player (Sempre por último, fixo na tela)
            const bounce = Math.sin(Date.now()/50) * (this.speed/50);
            this.drawKartSprite(ctx, cx, h*0.85 + bounce, 2.5, this.steer, this.isTurbo, this.selChar);

            // Partículas
            this.renderParticles(ctx, w, h);
        },

        drawKartSprite: function(ctx, x, y, size, steer, isTurbo, charId) {
            const char = CHARACTERS[charId];
            ctx.save();
            ctx.translate(x, y);
            const s = size * 0.001 * (window.innerWidth/2); // Ajuste de escala
            ctx.scale(s, s);

            // Inclinação da curva
            ctx.rotate(steer * 0.3);

            // Sombra
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath(); ctx.ellipse(0, 20, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Pneus Traseiros
            ctx.fillStyle = "#111";
            ctx.fillRect(-55, 0, 25, 35);
            ctx.fillRect(30, 0, 25, 35);

            // Chassi Principal
            ctx.fillStyle = char.color;
            ctx.beginPath();
            ctx.moveTo(-35, -20); ctx.lineTo(35, -20);
            ctx.lineTo(45, 10); ctx.lineTo(25, 35);
            ctx.lineTo(-25, 35); ctx.lineTo(-45, 10);
            ctx.fill();

            // Motor
            ctx.fillStyle = "#444";
            ctx.fillRect(-20, 25, 40, 15);
            
            // Fogo Turbo
            if(isTurbo) {
                ctx.fillStyle = (Math.random()>0.5) ? "#ff0" : "#f40";
                ctx.beginPath(); ctx.moveTo(-10, 40); ctx.lineTo(10, 40); ctx.lineTo(0, 80 + Math.random()*30); ctx.fill();
            }

            // Cabeça
            ctx.fillStyle = char.skin;
            ctx.beginPath(); ctx.arc(0, -30, 22, 0, Math.PI*2); ctx.fill();
            
            // Chapéu/Cabelo
            ctx.fillStyle = char.hat;
            ctx.beginPath(); ctx.arc(0, -35, 23, Math.PI, 0); ctx.fill(); // Topo
            ctx.fillRect(-25, -35, 50, 8); // Aba

            // Letra
            ctx.fillStyle = "#fff"; ctx.font="bold 18px Arial"; ctx.textAlign="center";
            ctx.fillText(char.name[0], 0, -40);

            // Volante
            ctx.fillStyle = "#333";
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 1.5);
            ctx.fillRect(-15, -3, 30, 6);
            ctx.restore();

            // Pneus Dianteiros (Rotacionam)
            const drawWheel = (ox) => {
                ctx.save(); ctx.translate(ox, 10); ctx.rotate(steer * 0.6);
                ctx.fillStyle = "#111"; ctx.fillRect(-12, -18, 24, 36);
                ctx.fillStyle = "#ccc"; ctx.fillRect(-5, -5, 10, 10); // Calota
                ctx.restore();
            };
            drawWheel(-50);
            drawWheel(50);

            ctx.restore();
        },

        spawnParticles: function(x, y, type) {
            this.particles.push({
                x: x, y: y, vx: (Math.random()-0.5)*10, vy: -Math.random()*15,
                life: 1.0, type: type
            });
        },

        renderParticles: function(ctx, w, h) {
            this.particles = this.particles.filter(p => p.life > 0);
            this.particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                const px = w/2 + p.x;
                const py = h * 0.85 + p.y;
                ctx.globalAlpha = p.life;
                if(p.type === 'fire') {
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
            // 1. VOLANTE GT
            if(this.wheel.active) {
                const wx = this.wheel.x; const wy = this.wheel.y;
                const r = 60;
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(this.wheel.angle);
                // Aro
                ctx.lineWidth=12; ctx.strokeStyle="#333"; ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.stroke();
                // Marca Topo
                ctx.strokeStyle="#f00"; ctx.beginPath(); ctx.arc(0,0,r,-0.2,0.2); ctx.stroke();
                // Miolo
                ctx.fillStyle="#222"; ctx.beginPath(); ctx.arc(0,0,20,0,Math.PI*2); ctx.fill();
                // Hastes
                ctx.fillStyle="#888"; ctx.fillRect(-r, -5, r*2, 10);
                
                ctx.rotate(-this.wheel.angle);
                ctx.fillStyle="#0ff"; ctx.font="bold 12px Arial"; ctx.textAlign="center";
                ctx.fillText("AR DRIVE", 0, 35);
                ctx.restore();
            }

            // 2. VELOCÍMETRO
            const sx = w - 80, sy = h - 80;
            ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.beginPath(); ctx.arc(sx, sy, 60, 0, Math.PI*2); ctx.fill();
            const angle = Math.PI*0.8 + (this.speed/CONF.TURBO_MAX_SPEED)*(Math.PI*1.4);
            ctx.strokeStyle = this.isTurbo ? "#0ff" : "#f00"; ctx.lineWidth=4;
            ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + Math.cos(angle)*50, sy + Math.sin(angle)*50); ctx.stroke();
            ctx.fillStyle="#fff"; ctx.font="bold 24px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText(Math.floor(this.speed), sx, sy+40);

            // 3. MINIMAPA REAL (GEOMÉTRICO)
            if(this.minimapPath.length > 0) {
                const ms = 130; const mx = 20; const my = 20;
                ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.fillRect(mx, my, ms, ms);
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(mx, my, ms, ms);
                
                ctx.save();
                ctx.beginPath(); ctx.rect(mx, my, ms, ms); ctx.clip();
                
                // Calcular escala
                const mapW = this.minimapBounds.maxX - this.minimapBounds.minX;
                const mapH = this.minimapBounds.maxZ - this.minimapBounds.minZ;
                const scale = Math.min((ms-20)/mapW, (ms-20)/mapH);
                
                ctx.translate(mx + ms/2, my + ms/2);
                ctx.scale(scale, scale);
                ctx.translate(-(this.minimapBounds.minX + this.minimapBounds.maxX)/2, -(this.minimapBounds.minZ + this.minimapBounds.maxZ)/2);
                
                // Pista
                ctx.strokeStyle = "#aaa"; ctx.lineWidth=15; ctx.lineJoin="round";
                ctx.beginPath();
                this.minimapPath.forEach((p,i) => { if(i===0) ctx.moveTo(p.x, p.z); else ctx.lineTo(p.x, p.z); });
                ctx.closePath(); ctx.stroke();
                ctx.strokeStyle="#fff"; ctx.lineWidth=2; ctx.stroke();

                // Dots (Player & Bots)
                // Converter distância linear (pos) em coordenada do mapa
                const getCoord = (dist) => {
                    const idx = Math.floor(dist / CONF.SEGMENT_LENGTH) % this.minimapPath.length;
                    return this.minimapPath[idx] || {x:0, z:0};
                };

                const myPos = getCoord(this.pos);
                ctx.fillStyle="#f00"; ctx.beginPath(); ctx.arc(myPos.x, myPos.z, 20, 0, Math.PI*2); ctx.fill();

                this.bots.forEach(b => {
                    const bPos = getCoord(b.pos);
                    ctx.fillStyle="#ff0"; ctx.beginPath(); ctx.arc(bPos.x, bPos.z, 15, 0, Math.PI*2); ctx.fill();
                });

                ctx.restore();
            }

            // Msgs
            this.hudMsgs.forEach(m => {
                m.life--; m.y--;
                ctx.fillStyle = m.c; ctx.font="bold 40px 'Russo One'"; ctx.textAlign="center";
                ctx.strokeStyle="black"; ctx.lineWidth=4; ctx.strokeText(m.t, w/2, m.y);
                ctx.fillText(m.t, w/2, m.y);
            });
            this.hudMsgs = this.hudMsgs.filter(m => m.life > 0);
        },

        uiMenu: function(ctx, w, h) {
            const grad = ctx.createLinearGradient(0,0,0,h);
            grad.addColorStop(0, '#e74c3c'); grad.addColorStop(1, '#f1c40f');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = '#fff'; ctx.font="italic 60px 'Russo One'"; ctx.textAlign="center";
            ctx.fillText("KART LEGENDS", w/2, h*0.3);
            
            ctx.fillStyle = '#c0392b'; ctx.fillRect(w/2-150, h*0.5, 300, 60);
            ctx.fillStyle = '#fff'; ctx.font="bold 30px sans-serif"; ctx.fillText("SOLO RACE", w/2, h*0.5+40);
            
            ctx.fillStyle = '#2980b9'; ctx.fillRect(w/2-150, h*0.65, 300, 60);
            ctx.fillStyle = '#fff'; ctx.fillText("MULTIPLAYER", w/2, h*0.65+40);

            if(!window.System.canvas.onclick) {
                window.System.canvas.onclick = (e) => {
                    const r = window.System.canvas.getBoundingClientRect();
                    const y = e.clientY - r.top;
                    if(y > h*0.45 && y < h*0.6) this.startSolo();
                    else if(y > h*0.6 && y < h*0.75) this.startMulti();
                    window.System.canvas.onclick = null;
                };
            }
        },

        startSolo: function() {
            this.isOnline = false;
            // Cria bots simples
            this.bots = [
                { charId: 3, pos: 500, x: 0.5, speed: 100, lap: 1 },
                { charId: 1, pos: 200, x: -0.5, speed: 90, lap: 1 },
                { charId: 4, pos: 800, x: 0, speed: 110, lap: 1 }
            ];
            this.startGame();
        },

        startMulti: function() {
            this.isOnline = true;
            this.msg("CONNECTING...", "#ff0");
            setTimeout(() => this.startGame(), 1000);
        },

        startGame: function() {
            this.reset();
            this.buildTrack();
            this.state = 'RACE';
            this.nitroEl.style.display = 'flex';
            this.msg("GO!", "#0f0");
        },
        
        finishRace: function() {
            this.state = 'GAMEOVER';
            this.nitroEl.style.display = 'none';
            if(window.System) window.System.gameOver("1º LUGAR");
        },

        msg: function(t, c='#fff') {
            this.hudMsgs.push({t, c, y: window.innerHeight/2, life: 60});
        },

        uiGameOver: function(ctx, w, h) {
            // Tratado pelo System.gameOver, mas renderiza fundo se precisar
        },

        syncNet: function() {
            // Placeholder para sync real se DB estiver conectado
        }
    };

    // REGISTRAR
    if(window.System && window.System.registerGame) {
        window.System.registerGame('kart', 'Kart Legends', '🏎️', Game, { camOpacity: 0.1 });
    }

})();