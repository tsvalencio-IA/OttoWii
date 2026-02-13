/* =================================================================
   KART LEGENDS: DIAMOND EDITION (SOLID RENDER + MULTIPLAYER)
   ================================================================= */

(function() {

    // -----------------------------------------------------------------
    // 1. CONSTANTES & ASSETS
    // -----------------------------------------------------------------
    const CONF = {
        MAX_SPEED: 260,
        TURBO_MAX_SPEED: 420,
        ACCEL: 0.12,
        BREAKING: 0.3,
        DECEL: 0.04,
        OFFROAD_DECEL: 0.15,
        SEGMENT_LENGTH: 200, // Distância Z de cada segmento
        RUMBLE_LENGTH: 3,
        ROAD_WIDTH: 2000,
        DRAW_DISTANCE: 300,  // Quantos segmentos desenhar (Profundidade)
        FOV: 100,
        CAMERA_HEIGHT: 1000,
        CAMERA_DEPTH: 0.84
    };

    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', skin: '#ffccaa', stats: { speed: 1.0, grip: 1.0 } },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', skin: '#ffccaa', stats: { speed: 1.02, grip: 0.95 } },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', skin: '#ffccaa', stats: { speed: 0.96, grip: 1.1 } },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', skin: '#e67e22', stats: { speed: 1.15, grip: 0.7 } },
        { id: 4, name: 'TOAD',   color: '#3498db', hat: '#ecf0f1', skin: '#ffccaa', stats: { speed: 0.9, grip: 1.2 } },
        { id: 5, name: 'YOSHI',  color: '#76ff03', hat: '#64dd17', skin: '#ffccaa', stats: { speed: 1.05, grip: 1.05 } }
    ];

    const TRACKS = [
        { name: 'GRAND PRIX',    sky: ['#0099ff', '#88ccff'], ground: ['#55aa44', '#448833'], road: ['#666', '#555'], mapColor: '#4d4' },
        { name: 'SUNSET CANYON', sky: ['#e67e22', '#f1c40f'], ground: ['#d35400', '#e67e22'], road: ['#a0522d', '#8b4513'], mapColor: '#d60' },
        { name: 'NEON CITY',     sky: ['#000033', '#000066'], ground: ['#111', '#222'],       road: ['#333', '#222'], mapColor: '#00f' }
    ];

    // -----------------------------------------------------------------
    // 2. ENGINE LÓGICA
    // -----------------------------------------------------------------
    const Game = {
        state: 'INIT', // MENU, LOBBY, RACE, GAMEOVER
        
        // Multiplayer
        roomId: 'kart_diamond_v2',
        isOnline: false,
        dbRef: null,
        remotePlayers: {},
        lastSync: 0,
        playerId: window.System ? window.System.playerId : 'P'+Math.floor(Math.random()*1000),

        // Config Local
        selChar: 0,
        selTrack: 0,

        // Física
        pos: 0,
        playerX: 0,
        speed: 0,
        steer: 0,
        nitro: 100,
        isTurbo: false,
        lap: 1,
        totalLaps: 3,

        // Render
        segments: [],
        trackLength: 0,
        particles: [],
        hudMsgs: [],
        minimap: { path: [], minX: 0, maxX: 0, minZ: 0, maxZ: 0 },
        shake: 0,
        
        // Input
        wheel: { x:0, y:0, angle:0, active:false },
        
        // Entidades
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
                position: 'fixed', bottom: '150px', right: '30px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(circle, #ffeb3b 0%, #ff9800 100%)',
                border: '4px solid #fff', boxShadow: '0 0 25px rgba(255, 140, 0, 0.8)',
                display: 'none', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontFamily: 'sans-serif', fontWeight: '900', fontSize: '18px',
                textShadow: '0 2px 4px rgba(0,0,0,0.5)', cursor: 'pointer', zIndex: '1000',
                userSelect: 'none', touchAction: 'manipulation'
            });
            btn.innerText = "NITRO";
            
            const action = (e) => {
                if(e) { e.preventDefault(); e.stopPropagation(); }
                if(this.state === 'RACE' && this.nitro > 15) {
                    this.isTurbo = true;
                    if(window.Sfx) window.Sfx.play(600, 'square', 0.5, 0.2);
                    this.msg("TURBO!", "#0ff");
                }
            };
            btn.addEventListener('touchstart', action, {passive: false});
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
            this.remotePlayers = {};
        },

        // --- GERAÇÃO DE PISTA (GEOMETRIA) ---
        buildTrack: function() {
            this.segments = [];
            const add = (enter, hold, leave, curve, y) => {
                const startY = this.segments.length > 0 ? this.segments[this.segments.length-1].p2.world.y : 0;
                const endY = startY + (y * CONF.SEGMENT_LENGTH);
                const total = enter + hold + leave;
                
                for(let i=0; i<total; i++) {
                    const n = this.segments.length;
                    // Curva suavizada
                    let c = 0;
                    if (i < enter) c = curve * (i/enter);
                    else if (i < enter + hold) c = curve;
                    else c = curve * ((total-i)/leave);

                    // Altura suavizada
                    let h = startY + (endY - startY) * (i/total);
                    
                    const colorScheme = Math.floor(n/CONF.RUMBLE_LENGTH)%2 ? 'dark' : 'light';

                    this.segments.push({
                        index: n,
                        p1: { world: { z: n*CONF.SEGMENT_LENGTH, y: (n===0?0:this.segments[n-1].p2.world.y), x: 0 }, camera: {}, screen: {} },
                        p2: { world: { z: (n+1)*CONF.SEGMENT_LENGTH, y: h, x: 0 }, camera: {}, screen: {} },
                        curve: c,
                        color: colorScheme
                    });
                }
            };

            // Layout da Pista (Curvas Complexas)
            // (Enter, Hold, Leave, Curve, HeightDiff)
            if (this.selTrack === 0) { // Grand Prix
                add(50, 50, 50, 0, 0); 
                add(40, 40, 40, 4, 0);
                add(60, 60, 60, -3, 20); 
                add(40, 40, 40, -3, -20);
                add(30, 30, 30, 6, 0);
                add(50, 50, 50, 0, 0);
            } else if (this.selTrack === 1) { // Sunset
                add(50, 50, 50, 0, 0);
                add(30, 80, 30, 5, 0);
                add(30, 30, 30, -5, 0);
                add(10, 10, 10, 0, 40); // Pulo
                add(50, 50, 50, 0, -40);
            } else { // Neon
                add(50, 50, 50, 0, 0);
                add(20, 20, 20, 8, 0); // Curva fechada
                add(20, 20, 20, -8, 0);
                add(20, 20, 20, 8, 0);
                add(100, 100, 100, 0, 0); // Retão
            }

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
            
            // Loopar geometria final para inicial (evitar pulo visual no fim da volta)
            // Simplificação: apenas garante Y=0 no fim
            const last = this.segments[this.segments.length-1];
            if(last.p2.world.y !== 0) {
                 // Suavizar de volta pra 0 nos últimos segmentos seria ideal, mas resetamos hard por enquanto
            }
            
            this.buildMinimap();
        },

        buildMinimap: function() {
            this.minimap.path = [];
            let x = 0, z = 0, angle = 0;
            let minX=0, maxX=0, minZ=0, maxZ=0;

            for(let i=0; i<this.segments.length; i++) {
                const seg = this.segments[i];
                angle += seg.curve * 0.003; 
                x += Math.sin(angle) * 50;
                z += Math.cos(angle) * 50;
                this.minimap.path.push({x, z});
                if(x < minX) minX = x; if(x > maxX) maxX = x;
                if(z < minZ) minZ = z; if(z > maxZ) maxZ = z;
            }
            this.minimap.minX = minX; this.minimap.maxX = maxX;
            this.minimap.minZ = minZ; this.minimap.maxZ = maxZ;
        },

        // --- UPDATE LOOP ---
        update: function(ctx, w, h, pose, dt) {
            if (this.state === 'MENU') { this.uiMenu(ctx, w, h); return; }
            if (this.state === 'LOBBY') { this.uiLobby(ctx, w, h); return; }
            if (this.state === 'GAMEOVER') { this.uiGameOver(ctx, w, h); return; }

            // Lógica
            this.handleInput(pose, w, h, dt);
            this.physics(dt);
            
            // Rede
            if (this.isOnline) {
                this.syncNetwork();
                this.interpolateRemotes(dt);
            }

            // Render
            this.render3D(ctx, w, h);
            this.renderHUD(ctx, w, h);

            return Math.floor(this.speed * 10);
        },

        handleInput: function(pose, w, h, dt) {
            let steerInput = 0;
            this.wheel.active = false;

            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const nose = pose.keypoints.find(k => k.name === 'nose');

                if (lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    const lx = (1 - lw.x/640) * w; const ly = (lw.y/480) * h;
                    const rx = (1 - rw.x/640) * w; const ry = (rw.y/480) * h;
                    const angle = Math.atan2(ry - ly, rx - lx);
                    steerInput = angle * 2.8; 
                    this.wheel.x = (lx+rx)/2; this.wheel.y = (ly+ry)/2; this.wheel.angle = angle;
                    this.wheel.active = true;

                    // Turbo Gesto
                    if (nose && ly < nose.y && ry < nose.y && this.nitro > 20) {
                        if(!this.isTurbo) {
                            this.isTurbo = true;
                            if(window.Sfx) window.Sfx.play(800, 'square', 0.2, 0.2);
                        }
                    }
                }
            }
            this.steer += (steerInput - this.steer) * 5 * dt;
        },

        physics: function(dt) {
            const stats = CHARACTERS[this.selChar].stats;
            const segIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
            const seg = this.segments[segIdx];

            // Aceleração
            let max = CONF.MAX_SPEED * stats.speed;
            if(this.isTurbo) {
                max = CONF.TURBO_MAX_SPEED;
                this.nitro -= 35 * dt;
                this.spawnParticle(0, 0, 'fire');
                if(this.nitro <= 0) this.isTurbo = false;
            } else {
                this.nitro = Math.min(100, this.nitro + (8*dt));
            }

            if (Math.abs(this.playerX) > 1.2) { // Offroad
                max *= 0.3;
                this.spawnParticle((Math.random()-0.5)*40, 0, 'dust');
                if(window.Gfx) window.Gfx.shakeScreen(2);
            }

            if(this.speed < max) this.speed += CONF.ACCEL * dt * 60;
            else this.speed -= CONF.DECEL * dt * 60;

            // Curva (Física Centrífuga)
            const ratio = (this.speed / CONF.MAX_SPEED);
            const dx = dt * 2 * ratio;
            this.playerX -= (dx * seg.curve * 0.3 * ratio); // Pista joga pra fora
            this.playerX += (dx * this.steer * 1.5 * stats.grip); // Volante

            this.playerX = Math.max(-2.5, Math.min(2.5, this.playerX));

            // Move
            this.pos += this.speed * dt * 20;
            if(this.pos >= this.trackLength) {
                this.pos -= this.trackLength;
                this.lap++;
                if(this.lap > this.totalLaps) this.finishRace();
                else this.msg("VOLTA " + this.lap);
            }

            // Bots
            this.bots.forEach(bot => this.updateBot(bot, dt));
        },

        updateBot: function(bot, dt) {
            // IA melhorada que tenta desviar
            const botSegIdx = Math.floor(bot.pos / CONF.SEGMENT_LENGTH) % this.segments.length;
            const seg = this.segments[botSegIdx];
            
            // Velocidade varia
            let targetSpeed = bot.baseSpeed;
            if (this.pos > bot.pos - 1000 && this.pos < bot.pos + 1000) targetSpeed *= 1.1; // Rubber banding

            if(bot.speed < targetSpeed) bot.speed += CONF.ACCEL * dt * 50;
            else bot.speed *= 0.99;

            bot.pos += bot.speed * dt * 20;
            
            // IA segue a pista compensando a curva
            const targetX = -seg.curve * 0.6;
            bot.x += (targetX - bot.x) * 0.05;

            // Wrap
            if(bot.pos >= this.trackLength) {
                bot.pos -= this.trackLength;
                bot.lap++;
            }
        },

        // --- RENDER 3D (POLYGONAL / NO GAPS) ---
        project: function(p, cameraX, cameraY, cameraZ, cameraDepth, width, height, roadWidth) {
            p.camera.x = (p.world.x || 0) - cameraX;
            p.camera.y = (p.world.y || 0) - cameraY;
            p.camera.z = (p.world.z || 0) - cameraZ;
            
            // Corrige loop da pista (se câmera passou do fim do mundo mas ponto é no inicio)
            if (p.camera.z < 0 && this.trackLength > 0) {
                 // Não desenha atrás
            }
            
            p.screen.scale = cameraDepth / p.camera.z;
            p.screen.x = Math.round((width/2) + (p.screen.scale * p.camera.x * width/2));
            p.screen.y = Math.round((height/2) - (p.screen.scale * p.camera.y * height/2));
            p.screen.w = Math.round( (p.screen.scale * roadWidth * width/2) );
        },

        render3D: function(ctx, w, h) {
            const cx = w/2; const cy = h/2;
            const theme = TRACKS[this.selTrack];

            // 1. Céu e Chão
            const skyGrad = ctx.createLinearGradient(0,0,0,h/2);
            skyGrad.addColorStop(0, theme.sky[0]); skyGrad.addColorStop(1, theme.sky[1]);
            ctx.fillStyle = skyGrad; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = theme.ground[0]; ctx.fillRect(0, h/2, w, h/2);

            // 2. Projeção da Estrada
            let baseIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            let camZ = this.pos;
            let camH = CONF.CAMERA_HEIGHT + this.segments[baseIdx % this.segments.length].p1.world.y;
            // Camera Shake
            if (this.isTurbo || Math.abs(this.playerX) > 1.2) camH += (Math.random()-0.5)*30;

            let x = 0, dx = 0; // Curvatura acumulada
            let maxY = h; // Clip buffer

            // Sprite list
            let sprites = [];

            for (let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const idx = (baseIdx + n) % this.segments.length;
                const seg = this.segments[idx];
                const looped = (baseIdx + n) >= this.segments.length;
                
                // Coord Z Relativa (para projecao correta em loop)
                let segmentZ = (n * CONF.SEGMENT_LENGTH) + (CONF.SEGMENT_LENGTH - (this.pos % CONF.SEGMENT_LENGTH));
                
                // Curvatura
                x += dx; dx += seg.curve;

                // Projetar P1 (Início do segmento)
                // Usamos valores calculados para garantir continuidade visual (sem buracos)
                // O P1 deste segmento DEVE ser igual ao P2 do segmento anterior desenhado na tela
                
                const scale = CONF.CAMERA_DEPTH / (segmentZ/1000); // Scale P1
                const prevScale = CONF.CAMERA_DEPTH / ((segmentZ + CONF.SEGMENT_LENGTH)/1000); // Scale P2

                // Screen Y
                // P1
                const p1y_rel = (seg.p1.world.y - camH);
                const screenY1 = (h/2) - (scale * p1y_rel * h/2) / 1000;
                // P2
                const p2y_rel = (seg.p2.world.y - camH);
                const screenY2 = (h/2) - (prevScale * p2y_rel * h/2) / 1000;

                // Screen X e Width
                const objX = this.playerX * CONF.ROAD_WIDTH;
                // P1
                const screenX1 = cx + (-objX - x) * scale * (w/2) / CONF.ROAD_WIDTH;
                const screenW1 = CONF.ROAD_WIDTH * scale * (w/2) / CONF.ROAD_WIDTH;
                // P2 (Próximo X considera curva do próximo passo, aprox)
                const screenX2 = cx + (-objX - x - dx) * prevScale * (w/2) / CONF.ROAD_WIDTH;
                const screenW2 = CONF.ROAD_WIDTH * prevScale * (w/2) / CONF.ROAD_WIDTH;

                // Guardar coordenadas para sprites
                seg.screen = { x: screenX1, y: screenY1, w: screenW1, scale: scale };

                // Clip (Otimização e Oclusão)
                if (screenY1 >= maxY && n > 0) continue; // P1 está abaixo do que já desenhamos?
                // Se P2 está acima do maxY, desenhamos até maxY. Se P1 está abaixo, desenhamos.
                
                // Se o segmento está totalmente oculto (atrás de uma colina), pula
                if (screenY2 >= maxY) {
                    // Mas cuidado, pode ter sprites altos.
                }

                // Atualizar Clip
                if(screenY1 < maxY) maxY = screenY1;

                // DESENHAR POLÍGONO (SEM BURACOS)
                const color = seg.color === 'light' ? theme.road[0] : theme.road[1];
                const grass = seg.color === 'light' ? theme.ground[0] : theme.ground[1];
                const rumble = seg.color === 'light' ? '#fff' : '#c00';

                // Grama Lateral
                ctx.fillStyle = grass;
                ctx.fillRect(0, screenY2, w, (screenY1 - screenY2)); // Aqui fillRect é ok pois é fundo

                // Estrada (Polígono Trapezoidal)
                this.drawPoly(ctx, color, screenX1-screenW1, screenY1, screenX1+screenW1, screenY1, screenX2+screenW2, screenY2, screenX2-screenW2, screenY2);

                // Zebra
                const rW1 = screenW1 * 1.2; const rW2 = screenW2 * 1.2;
                this.drawPoly(ctx, rumble, screenX1-rW1, screenY1, screenX1-screenW1, screenY1, screenX2-screenW2, screenY2, screenX2-rW2, screenY2);
                this.drawPoly(ctx, rumble, screenX1+screenW1, screenY1, screenX1+rW1, screenY1, screenX2+rW2, screenY2, screenX2+screenW2, screenY2);
                
                // Faixa Central
                if (seg.color === 'light') {
                    ctx.fillStyle = '#fff';
                    const lW1 = screenW1 * 0.02; const lW2 = screenW2 * 0.02;
                    this.drawPoly(ctx, '#fff', screenX1-lW1, screenY1, screenX1+lW1, screenY1, screenX2+lW2, screenY2, screenX2-lW2, screenY2);
                }

                // Coletar Entidades para desenhar depois
                // Bots
                this.bots.forEach(bot => {
                    const botSeg = Math.floor(bot.pos / CONF.SEGMENT_LENGTH);
                    let rel = botSeg - baseIdx;
                    if(rel < 0) rel += this.segments.length; // Loop wrap
                    
                    if(rel === n) {
                        const spriteX = screenX1 + (bot.x * screenW1);
                        sprites.push({ type: 'kart', obj: bot, x: spriteX, y: screenY1, scale: scale, dist: n });
                    }
                });

                // Players Online
                Object.values(this.remotePlayers).forEach(p => {
                    const pSeg = Math.floor(p.pos / CONF.SEGMENT_LENGTH);
                    let rel = pSeg - baseIdx;
                    if(rel < 0) rel += this.segments.length;
                    
                    if(rel === n) {
                        const spriteX = screenX1 + (p.x * screenW1);
                        // Mock obj structure for draw function
                        const mockObj = { charId: p.charId || 0, name: p.name || 'P2' };
                        sprites.push({ type: 'kart', obj: mockObj, x: spriteX, y: screenY1, scale: scale, dist: n, isRemote: true });
                    }
                });
            }

            // Desenhar Sprites (Back to Front)
            sprites.sort((a,b) => b.dist - a.dist);
            sprites.forEach(s => {
                const isR = s.isRemote;
                this.drawKartSprite(ctx, s.x, s.y, s.scale * 3500, 0, false, s.obj.charId, isR);
                if(isR) {
                     ctx.fillStyle = '#0f0'; ctx.font="bold 12px Arial"; ctx.textAlign="center";
                     ctx.fillText(s.obj.name, s.x, s.y - (s.scale*3500*0.04));
                }
            });

            // Player (Frente)
            const bounce = Math.abs(Math.sin(Date.now()/50)) * (this.speed/30);
            this.drawKartSprite(ctx, cx, h*0.88 - bounce + this.shake, 2.8, this.steer, this.isTurbo, this.selChar, false);

            this.renderParticles(ctx, w, h);
        },

        drawPoly: function(ctx, color, x1, y1, x2, y2, x3, y3, x4, y4) {
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x3, y3);
            ctx.lineTo(x4, y4);
            ctx.fill();
        },

        drawKartSprite: function(ctx, x, y, size, steer, isTurbo, charId, isRemote) {
            const char = CHARACTERS[charId] || CHARACTERS[0];
            const s = size * 0.001 * (window.innerWidth/2);
            
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s, s);
            ctx.rotate(steer * 0.2);

            // Sombra
            ctx.fillStyle = "rgba(0,0,0,0.5)";
            ctx.beginPath(); ctx.ellipse(0, 20, 50, 12, 0, 0, Math.PI*2); ctx.fill();

            // Rodas Traseiras
            ctx.fillStyle = "#111"; ctx.fillRect(-45, -5, 18, 25); ctx.fillRect(27, -5, 18, 25);

            // Chassi
            ctx.fillStyle = isRemote ? '#ccc' : char.color; // Remotos um pouco desbotados ou cor normal
            if(!isRemote) ctx.fillStyle = char.color;
            
            ctx.beginPath();
            ctx.moveTo(-30, -25); ctx.lineTo(30, -25);
            ctx.lineTo(40, 10); ctx.lineTo(20, 30);
            ctx.lineTo(-20, 30); ctx.lineTo(-40, 10);
            ctx.fill();

            // Fogo
            if(isTurbo) {
                ctx.fillStyle = (Math.random()>0.5)?"#ff0":"#f00";
                ctx.beginPath(); ctx.moveTo(-8, 30); ctx.lineTo(8, 30); ctx.lineTo(0, 60+Math.random()*20); ctx.fill();
            }

            // Piloto
            ctx.fillStyle = char.skin; ctx.beginPath(); ctx.arc(0, -30, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = char.hat; ctx.beginPath(); ctx.arc(0, -35, 19, Math.PI, 0); ctx.fill();
            ctx.fillRect(-20, -35, 40, 6); // Aba

            // Rodas Dianteiras
            const wheelAngle = steer * 0.5;
            const dw = (ox) => {
                ctx.save(); ctx.translate(ox, 10); ctx.rotate(wheelAngle);
                ctx.fillStyle = "#111"; ctx.fillRect(-10, -12, 20, 24);
                ctx.restore();
            };
            dw(-42); dw(42);

            // Volante
            ctx.fillStyle = "#333"; ctx.save(); ctx.translate(0, -10); ctx.rotate(steer);
            ctx.fillRect(-12, -2, 24, 4); ctx.restore();

            ctx.restore();
        },

        spawnParticle: function(x, y, type) {
            this.particles.push({x, y, vx:(Math.random()-0.5)*10, vy:-Math.random()*15, life:1.0, type});
        },
        renderParticles: function(ctx, w, h) {
            this.particles = this.particles.filter(p => p.life > 0);
            this.particles.forEach(p => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                const px = w/2 + p.x; const py = h*0.88 + p.y;
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.type==='fire' ? '#ff0' : '#888';
                ctx.beginPath(); ctx.arc(px, py, 8*p.life, 0, Math.PI*2); ctx.fill();
            });
            ctx.globalAlpha = 1.0;
        },

        // --- HUD & UI ---
        renderHUD: function(ctx, w, h) {
            // MiniMapa
            if(this.minimap.path.length > 0) {
                const ms = 130; const mx = 20; const my = 20;
                ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(mx, my, ms, ms);
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(mx, my, ms, ms);
                
                ctx.save();
                ctx.beginPath(); ctx.rect(mx, my, ms, ms); ctx.clip();
                
                const mapW = this.minimap.maxX - this.minimap.minX;
                const mapH = this.minimap.maxZ - this.minimap.minZ;
                const scale = Math.min((ms-20)/mapW, (ms-20)/mapH);
                
                ctx.translate(mx+ms/2, my+ms/2);
                ctx.scale(scale, scale);
                ctx.translate(-(this.minimap.minX+this.minimap.maxX)/2, -(this.minimap.minZ+this.minimap.maxZ)/2);
                
                // Pista
                ctx.strokeStyle = TRACKS[this.selTrack].mapColor || '#888'; 
                ctx.lineWidth = 20; ctx.lineJoin = 'round';
                ctx.beginPath();
                this.minimap.path.forEach((p, i) => { if(i===0) ctx.moveTo(p.x, p.z); else ctx.lineTo(p.x, p.z); });
                ctx.closePath(); ctx.stroke();
                
                // Pontos
                const getCoord = (d) => {
                    const i = Math.floor(d / CONF.SEGMENT_LENGTH) % this.minimap.path.length;
                    return this.minimap.path[i] || {x:0, z:0};
                };

                // Player
                const me = getCoord(this.pos);
                ctx.fillStyle = "#f00"; ctx.beginPath(); ctx.arc(me.x, me.z, 25, 0, Math.PI*2); ctx.fill();

                // Bots
                this.bots.forEach(b => {
                    const bp = getCoord(b.pos);
                    ctx.fillStyle = "#ff0"; ctx.beginPath(); ctx.arc(bp.x, bp.z, 20, 0, Math.PI*2); ctx.fill();
                });

                // Remote
                Object.values(this.remotePlayers).forEach(p => {
                    const pp = getCoord(p.pos);
                    ctx.fillStyle = "#0ff"; ctx.beginPath(); ctx.arc(pp.x, pp.z, 20, 0, Math.PI*2); ctx.fill();
                });

                ctx.restore();
            }

            // Volante GT
            if(this.wheel.active) {
                const wx = this.wheel.x; const wy = this.wheel.y;
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(this.wheel.angle);
                ctx.strokeStyle="#333"; ctx.lineWidth=12; ctx.beginPath(); ctx.arc(0,0,50,0,Math.PI*2); ctx.stroke();
                ctx.strokeStyle="#f00"; ctx.beginPath(); ctx.arc(0,0,50,-0.4,0.4); ctx.stroke();
                ctx.restore();
            }

            // Msgs
            this.hudMsgs.forEach(m => {
                m.y--; m.l--;
                ctx.fillStyle = m.c; ctx.strokeStyle="#000"; ctx.lineWidth=3;
                ctx.font="bold 40px 'Russo One'"; ctx.textAlign="center";
                ctx.strokeText(m.t, w/2, m.y); ctx.fillText(m.t, w/2, m.y);
            });
            this.hudMsgs = this.hudMsgs.filter(m => m.l > 0);
        },

        // --- MENUS INTERATIVOS ---
        uiMenu: function(ctx, w, h) {
            const grad = ctx.createLinearGradient(0,0,w,h);
            grad.addColorStop(0, '#e74c3c'); grad.addColorStop(1, '#f1c40f');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            
            ctx.fillStyle = "#fff"; ctx.font = "italic 60px 'Russo One'"; ctx.textAlign = "center";
            ctx.fillText("KART LEGENDS", w/2, h*0.25);

            // Botões de Modo
            this.drawBtn(ctx, w/2, h*0.5, "SOLO RACE", "#c0392b");
            this.drawBtn(ctx, w/2, h*0.7, "MULTIPLAYER", "#2980b9");

            // Lógica de Clique do Menu
            if(!window.System.canvas.onclick) {
                window.System.canvas.onclick = (e) => {
                    const r = window.System.canvas.getBoundingClientRect();
                    const y = e.clientY - r.top;
                    if (Math.abs(y - h*0.5) < 40) this.setMode('SOLO');
                    if (Math.abs(y - h*0.7) < 40) this.setMode('MULTI');
                };
            }
        },

        uiLobby: function(ctx, w, h) {
            ctx.fillStyle = "#2c3e50"; ctx.fillRect(0,0,w,h);
            ctx.textAlign = "center"; ctx.fillStyle = "#fff";
            
            // Seleção de Personagem
            ctx.font = "30px sans-serif"; ctx.fillText("ESCOLHA SEU PILOTO", w/2, h*0.15);
            
            const char = CHARACTERS[this.selChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.3, 60, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = "#fff"; ctx.font = "bold 40px 'Russo One'"; ctx.fillText(char.name, w/2, h*0.45);
            
            // Setas Char
            ctx.fillStyle = "#f1c40f"; ctx.font = "50px sans-serif";
            ctx.fillText("◀", w/2 - 120, h*0.35);
            ctx.fillText("▶", w/2 + 120, h*0.35);

            // Seleção de Pista
            const trk = TRACKS[this.selTrack];
            ctx.fillStyle = "#ecf0f1"; ctx.fillRect(w/2 - 150, h*0.55, 300, 50);
            ctx.fillStyle = "#2c3e50"; ctx.font = "20px sans-serif"; ctx.fillText("PISTA: " + trk.name, w/2, h*0.55 + 32);
            ctx.fillStyle = "#f1c40f"; ctx.font = "40px sans-serif";
            ctx.fillText("◀", w/2 - 180, h*0.55 + 35);
            ctx.fillText("▶", w/2 + 180, h*0.55 + 35);

            // Botão Start
            this.drawBtn(ctx, w/2, h*0.8, "START RACE", "#27ae60");

            // Lógica de Clique do Lobby
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - r.left;
                const y = e.clientY - r.top;
                
                // Char Change
                if (y > h*0.25 && y < h*0.45) {
                    if (x < w/2) this.selChar = (this.selChar - 1 + CHARACTERS.length) % CHARACTERS.length;
                    else this.selChar = (this.selChar + 1) % CHARACTERS.length;
                    if(window.Sfx) window.Sfx.play(600, 'sine', 0.1, 0.1);
                }
                // Track Change
                if (y > h*0.5 && y < h*0.65) {
                    if (x < w/2) this.selTrack = (this.selTrack - 1 + TRACKS.length) % TRACKS.length;
                    else this.selTrack = (this.selTrack + 1) % TRACKS.length;
                    if(window.Sfx) window.Sfx.play(600, 'sine', 0.1, 0.1);
                }
                // Start
                if (y > h*0.75 && y < h*0.85) {
                    this.startGame();
                    window.System.canvas.onclick = null;
                }
            };
        },

        drawBtn: function(ctx, x, y, txt, col) {
            ctx.fillStyle = col; ctx.fillRect(x-150, y-30, 300, 60);
            ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.strokeRect(x-150, y-30, 300, 60);
            ctx.fillStyle = "#fff"; ctx.font = "bold 25px sans-serif"; ctx.textAlign="center";
            ctx.fillText(txt, x, y+10);
        },

        setMode: function(mode) {
            this.isOnline = (mode === 'MULTI');
            this.state = 'LOBBY';
            window.System.canvas.onclick = null; // Limpa evento anterior
            // Inicia conexão básica
            if(this.isOnline && window.DB) {
                this.dbRef = window.DB.ref('rooms/' + this.roomId);
                // Listener de oponentes
                this.dbRef.child('players').on('value', snap => {
                    const val = snap.val();
                    if(val) {
                        // Filtra eu mesmo
                        const others = {};
                        Object.keys(val).forEach(k => {
                            if(k !== this.playerId) others[k] = val[k];
                        });
                        this.remotePlayers = others;
                    }
                });
            }
        },

        startGame: function() {
            this.reset();
            this.buildTrack();
            this.state = 'RACE';
            this.nitroEl.style.display = 'flex';
            this.msg("GO!", "#0f0");

            if (!this.isOnline) {
                // Criar Bots Locais
                for(let i=0; i<3; i++) {
                    this.bots.push({
                        id: i,
                        charId: (this.selChar + 1 + i) % CHARACTERS.length,
                        pos: (i+1) * 300,
                        x: (i%2===0 ? 0.5 : -0.5),
                        baseSpeed: 100 + (Math.random()*20),
                        speed: 0,
                        lap: 1
                    });
                }
            }
        },
        
        finishRace: function() {
            this.state = 'GAMEOVER';
            this.nitroEl.style.display = 'none';
            if(window.System) window.System.gameOver("FINAL!");
        },

        uiGameOver: function(ctx, w, h) {
            // Renderizado pelo core, mas podemos adicionar fundo
        },

        msg: function(t, c='#fff') {
            this.hudMsgs.push({t, c, y: window.innerHeight/2, l: 60});
        },

        // --- MULTIPLAYER ---
        syncNetwork: function() {
            if(!this.dbRef) return;
            const now = Date.now();
            if(now - this.lastSync > 100) { // 10Hz
                this.lastSync = now;
                this.dbRef.child('players/' + this.playerId).set({
                    name: 'P1',
                    charId: this.selChar,
                    pos: Math.floor(this.pos),
                    x: this.playerX,
                    lap: this.lap
                });
            }
        },
        
        interpolateRemotes: function(dt) {
            // Interpolação simples poderia ser adicionada aqui
            // Por enquanto usa os dados brutos do Firebase no render
        }
    };

    // Registrar
    if(window.System && window.System.registerGame) {
        window.System.registerGame('kart', 'Kart Legends', '🏎️', Game, { camOpacity: 0.1 });
    }

})();