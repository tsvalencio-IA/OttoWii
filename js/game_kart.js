/* =================================================================
   KART LEGENDS - ULTIMATE EDITION (VISUAL RESTORED + NEW PHYSICS)
   ================================================================= */

(function() {
    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES & DADOS (VISUAIS RICOS)
    // -----------------------------------------------------------------
    const KART_CONF = {
        MAX_SPEED: 320,
        ACCEL: 0.15,
        FRICTION: 0.97,
        OFFROAD_DECEL: 0.94,
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 300,
        ROAD_WIDTH: 2200,
        CENTRIFUGAL: 0.3
    };

    const CHARACTERS = [
        { id: 0, name: 'MARIO',  color: '#e74c3c', hat: '#d32f2f', skin: '#ffccaa' },
        { id: 1, name: 'LUIGI',  color: '#2ecc71', hat: '#27ae60', skin: '#ffccaa' },
        { id: 2, name: 'PEACH',  color: '#ff9ff3', hat: '#fd79a8', skin: '#ffccaa' },
        { id: 3, name: 'BOWSER', color: '#f1c40f', hat: '#e67e22', skin: '#e67e22' }
    ];

    const TRACK_COLORS = {
        grass:  { light: '#55aa44', dark: '#448833' },
        rumble: { light: '#ffffff', dark: '#ff0000' },
        road:   { light: '#666666', dark: '#606060' }
    };

    // -----------------------------------------------------------------
    // 2. CLASSE DO JOGO (ENGINE INTEGRADA)
    // -----------------------------------------------------------------
    class KartGame {
        constructor() {
            this.pos = 0;
            this.playerX = 0;
            this.speed = 0;
            this.steer = 0;
            this.score = 0;
            
            // Estado Visual
            this.segments = [];
            this.particles = [];
            this.nitro = 100;
            this.isTurbo = false;
            
            // UI Elements
            this.nitroBtn = null;
            this.virtualWheel = { x: 0, y: 0, r: 60, opacity: 0, angle: 0 };
            
            // Camera Shake
            this.shake = 0;
        }

        init() {
            this.pos = 0;
            this.speed = 0;
            this.playerX = 0;
            this.score = 0;
            this.segments = this.buildTrack();
            this.createUI();
            
            // Som de largada
            if(window.System.audio) window.System.audio.play(600, 'square', 0.5, 0.2);
            window.System.msg("LARGADA!");
        }

        cleanup() {
            if (this.nitroBtn) this.nitroBtn.remove();
            this.nitroBtn = null;
        }

        buildTrack() {
            const s = [];
            const add = (len, curve) => {
                for(let i=0; i<len; i++) {
                    s.push({
                        curve: curve,
                        color: Math.floor(s.length/3)%2 ? 'dark' : 'light' 
                    });
                }
            };
            
            // Pista Complexa
            add(50, 0); add(60, 2); add(40, 0); add(80, -3);
            add(40, 0); add(40, -2); add(60, 4); add(100, 0);
            
            return s;
        }

        createUI() {
            if (this.nitroBtn) this.nitroBtn.remove();
            
            this.nitroBtn = document.createElement('div');
            this.nitroBtn.innerHTML = "NITRO";
            Object.assign(this.nitroBtn.style, {
                position: 'absolute', bottom: '15%', right: '30px', 
                width: '90px', height: '90px', borderRadius: '50%',
                background: 'radial-gradient(#ffcc00, #ff6600)',
                border: '4px solid #fff', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '16px', fontWeight: 'bold',
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.6)', cursor: 'pointer', zIndex: '100',
                userSelect: 'none', touchAction: 'manipulation'
            });

            const activateTurbo = (e) => {
                if(e) e.preventDefault();
                if (this.nitro > 10) {
                    this.isTurbo = true;
                    if(window.System.audio) window.System.audio.play(800, 'sawtooth', 0.5, 0.2);
                }
            };
            const stopTurbo = (e) => { if(e) e.preventDefault(); this.isTurbo = false; };

            this.nitroBtn.addEventListener('mousedown', activateTurbo);
            this.nitroBtn.addEventListener('touchstart', activateTurbo);
            this.nitroBtn.addEventListener('mouseup', stopTurbo);
            this.nitroBtn.addEventListener('touchend', stopTurbo);
            
            document.getElementById('game-ui').appendChild(this.nitroBtn);
        }

        update(ctx, w, h, pose, dt) {
            this.handleInput(pose, w, h, dt);
            this.physics(dt);
            this.render(ctx, w, h);
            return Math.floor(this.score);
        }

        handleInput(pose, w, h, dt) {
            // Detecção de Gesto (Volante Virtual)
            if (pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    // Mapeia coordenadas normalizadas para tela
                    const lx = (1 - lw.x/640) * w; const ly = (lw.y/480) * h;
                    const rx = (1 - rw.x/640) * w; const ry = (rw.y/480) * h;
                    
                    // Cálculo do ângulo do volante
                    const dx = rx - lx;
                    const dy = ry - ly;
                    const angle = Math.atan2(dy, dx);
                    
                    this.steer = angle * 2.5; // Sensibilidade
                    
                    // Visual do volante
                    this.virtualWheel.x = (lx + rx) / 2;
                    this.virtualWheel.y = (ly + ry) / 2;
                    this.virtualWheel.angle = angle;
                    this.virtualWheel.opacity = 1;
                } else {
                    this.virtualWheel.opacity *= 0.9;
                    this.steer *= 0.9;
                }
            } else {
                this.steer *= 0.9; // Auto-center se perder tracking
            }
        }

        physics(dt) {
            const playerSeg = this.segments[Math.floor(this.pos / KART_CONF.SEGMENT_LENGTH) % this.segments.length];
            
            // Aceleração
            let maxSpeed = KART_CONF.MAX_SPEED;
            if (this.isTurbo && this.nitro > 0) {
                maxSpeed *= 1.5;
                this.nitro -= 50 * dt;
                this.shake = 5; // Tremedeira no turbo
            } else {
                this.nitro = Math.min(100, this.nitro + (10 * dt));
            }
            
            this.speed += (maxSpeed - this.speed) * KART_CONF.ACCEL * dt * 60;
            
            // Offroad
            if (Math.abs(this.playerX) > 1.2) {
                this.speed *= KART_CONF.OFFROAD_DECEL;
                this.shake = 3;
                this.spawnParticles();
            }

            // Curvas e Centrífuga
            const curveForce = (playerSeg.curve * (this.speed/KART_CONF.MAX_SPEED)) * KART_CONF.CENTRIFUGAL;
            this.playerX -= curveForce * dt * 60;
            this.playerX += (this.steer * 0.08) * (this.speed/KART_CONF.MAX_SPEED) * dt * 60;
            
            this.playerX = Math.max(-2.5, Math.min(2.5, this.playerX));
            this.pos += this.speed * dt * 60;
            this.score += (this.speed * 0.01) * dt * 60;

            // Shake decay
            this.shake *= 0.9;
        }

        spawnParticles() {
            if (Math.random() > 0.5) return;
            this.particles.push({
                x: (Math.random() - 0.5) * 50,
                y: 0,
                vx: (Math.random() - 0.5) * 10,
                vy: -Math.random() * 10 - 5,
                life: 1.0
            });
        }

        render(ctx, w, h) {
            const cx = w / 2;
            const cy = h / 2;
            const horizon = h * 0.45 + ((Math.random()-0.5) * this.shake);
            
            // Céu
            const gradSky = ctx.createLinearGradient(0,0,0,horizon);
            gradSky.addColorStop(0, '#0099ff'); gradSky.addColorStop(1, '#66ccff');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,horizon);
            
            // Chão
            ctx.fillStyle = TRACK_COLORS.grass.light; ctx.fillRect(0, horizon, w, h-horizon);

            // Renderização da Pista (Mode 7 style)
            let dx = 0; 
            let camX = this.playerX * (w * 0.35);
            let startPos = Math.floor(this.pos / KART_CONF.SEGMENT_LENGTH);
            let x = 0, dx_accum = 0;

            // Algoritmo do Pintor (Trás para frente)
            for (let n = 0; n < KART_CONF.DRAW_DISTANCE; n++) {
                const segIdx = (startPos + n) % this.segments.length;
                const seg = this.segments[segIdx];
                
                // Projeção
                const scale = 1 / (1 + n * 0.05);
                const nextScale = 1 / (1 + (n+1) * 0.05);
                
                const sy = horizon + (h - horizon) * scale;
                const nsy = horizon + (h - horizon) * nextScale;
                
                dx += seg.curve;
                const segmentX = cx - (camX * scale) - (dx * n * scale * 4);
                const nextSegmentX = cx - (camX * nextScale) - ((dx + seg.curve) * (n+1) * nextScale * 4);
                
                const rw = (w * 3) * scale; // Road Width
                const nrw = (w * 3) * nextScale;

                // Desenhar Grama (se for cor diferente para dar noção de velocidade)
                const grassColor = (seg.color === 'light') ? TRACK_COLORS.grass.light : TRACK_COLORS.grass.dark;
                ctx.fillStyle = grassColor;
                ctx.fillRect(0, nsy, w, sy-nsy);

                // Desenhar Pista
                ctx.beginPath();
                ctx.fillStyle = (seg.color === 'light') ? TRACK_COLORS.rumble.light : TRACK_COLORS.rumble.dark;
                // Rumble strips (Zebras)
                ctx.moveTo(segmentX - rw, sy); ctx.lineTo(segmentX + rw, sy);
                ctx.lineTo(nextSegmentX + nrw, nsy); ctx.lineTo(nextSegmentX - nrw, nsy);
                ctx.fill();

                ctx.fillStyle = (seg.color === 'light') ? TRACK_COLORS.road.light : TRACK_COLORS.road.dark;
                // Asfalto
                const roadW = rw * 0.85; 
                const nextRoadW = nrw * 0.85;
                ctx.beginPath();
                ctx.moveTo(segmentX - roadW, sy); ctx.lineTo(segmentX + roadW, sy);
                ctx.lineTo(nextSegmentX + nextRoadW, nsy); ctx.lineTo(nextSegmentX - nextRoadW, nsy);
                ctx.fill();
            }

            // Partículas
            this.renderParticles(ctx, w, h);

            // Render Player Sprite
            this.drawKartSprite(ctx, w/2, h * 0.85 + (this.shake*2), w, CHARACTERS[0]); // Mario por padrão

            // UI Overlay
            this.renderUI(ctx, w, h);
        }

        renderParticles(ctx, w, h) {
            this.particles.forEach((p, i) => {
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                if (p.life <= 0) this.particles.splice(i, 1);
                
                const px = w/2 + p.x;
                const py = h * 0.9 + p.y;
                
                ctx.globalAlpha = p.life;
                ctx.fillStyle = '#ccc';
                ctx.beginPath(); ctx.arc(px, py, 5 * p.life, 0, Math.PI*2); ctx.fill();
            });
            ctx.globalAlpha = 1;
        }

        drawKartSprite(ctx, cx, cy, w, char) {
            const scale = w * 0.005;
            const turn = this.steer * 0.5;

            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(scale, scale);
            ctx.rotate(turn * 0.1);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 20, 50, 10, 0, 0, Math.PI*2); ctx.fill();

            // Kart Body
            ctx.fillStyle = char.color;
            ctx.beginPath();
            ctx.moveTo(-30, -20); ctx.lineTo(30, -20);
            ctx.lineTo(40, 10); ctx.lineTo(20, 30);
            ctx.lineTo(-20, 30); ctx.lineTo(-40, 10);
            ctx.fill();
            
            // Rodas
            ctx.fillStyle = '#222';
            ctx.fillRect(-45, 0, 15, 25);
            ctx.fillRect(30, 0, 15, 25);

            // Personagem (Cabeça)
            ctx.fillStyle = char.skin;
            ctx.beginPath(); ctx.arc(0, -30, 15, 0, Math.PI*2); ctx.fill();
            
            // Boné
            ctx.fillStyle = char.hat;
            ctx.beginPath(); ctx.arc(0, -35, 15, Math.PI, 0); ctx.fill();
            ctx.fillRect(-15, -35, 30, 5);

            // Volante Físico do Personagem
            ctx.fillStyle = '#333';
            ctx.save();
            ctx.translate(0, -5);
            ctx.rotate(turn); // Gira o volante do sprite
            ctx.fillRect(-12, -2, 24, 4);
            ctx.restore();

            // Fogo do Turbo
            if (this.isTurbo) {
                ctx.fillStyle = (Math.random() > 0.5) ? '#ffaa00' : '#ff0000';
                ctx.beginPath();
                ctx.moveTo(-10, 30); ctx.lineTo(10, 30); ctx.lineTo(0, 50 + Math.random()*20);
                ctx.fill();
            }

            ctx.restore();
        }

        renderUI(ctx, w, h) {
            // HUD Nitro Bar
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(w/2 - 100, 20, 200, 20);
            ctx.fillStyle = this.isTurbo ? '#0ff' : '#ff9900';
            ctx.fillRect(w/2 - 98, 22, 196 * (this.nitro/100), 16);
            
            // Volante Virtual (O que você pediu!)
            if (this.virtualWheel.opacity > 0.1) {
                const vw = this.virtualWheel;
                ctx.save();
                ctx.globalAlpha = vw.opacity;
                ctx.translate(vw.x, vw.y);
                ctx.rotate(vw.angle);
                
                // Aro Externo
                ctx.beginPath(); ctx.arc(0, 0, vw.r, 0, Math.PI*2);
                ctx.lineWidth = 15; ctx.strokeStyle = '#333'; ctx.stroke();
                
                // Detalhe Vermelho (Topo)
                ctx.beginPath(); ctx.arc(0, 0, vw.r, -0.2, 0.2);
                ctx.strokeStyle = '#f00'; ctx.stroke();
                
                // Centro
                ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, 20, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#ccc'; ctx.fillRect(-vw.r+10, -5, vw.r*2-20, 10); // Haste horizontal
                
                ctx.fillStyle = '#fff'; ctx.font="12px Arial"; ctx.textAlign="center";
                ctx.fillText("AR DRIVE", 0, 4);
                
                ctx.restore();
            }

            // Speedometer
            const speedKmh = Math.floor(this.speed);
            ctx.fillStyle = '#fff'; ctx.font = "italic bold 30px 'Russo One'"; ctx.textAlign = 'right';
            ctx.fillText(speedKmh + " KM/H", w - 20, 60);
        }
    }

    // Registrar no Sistema
    window.System.registerGame('kart', 'Kart Legends', '🏎️', new KartGame(), { camOpacity: 0.1 });

})();