// =============================================================================
// KART DO OTTO – VERSÃO FINAL (RENDER ORIGINAL + FÍSICA SIMULADOR + NETCODE FIX)
// BASE: ESTRUTURA ORIGINAL DO ZIP (SEM ALTERAÇÕES VISUAIS)
// =============================================================================

(function() {

    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÕES E DADOS (ORIGINAIS)
    // -----------------------------------------------------------------
    const CHARACTERS = [
        { id: 0, name: 'OTTO',    color: '#e74c3c', speedInfo: 1.0, turnInfo: 1.0 },
        { id: 1, name: 'THIAGO',  color: '#f1c40f', speedInfo: 1.08, turnInfo: 0.85 },
        { id: 2, name: 'THAMIS',  color: '#3498db', speedInfo: 0.92, turnInfo: 1.15 }
    ];

    const TRACKS = [
        { id: 0, name: 'GP CIRCUITO', theme: 'grass', sky: 0, curveMult: 1.0, targetTime: 120 },
        { id: 1, name: 'DESERTO SECO', theme: 'sand', sky: 1, curveMult: 0.8, targetTime: 130 },
        { id: 2, name: 'PICO NEVADO', theme: 'snow', sky: 2, curveMult: 1.3, targetTime: 140 }
    ];

    // TUNING DE JOGABILIDADE (SIMULADOR)
    const CONF = {
        MAX_SPEED: 220,
        TURBO_MAX_SPEED: 320,
        ACCEL: 0.15,
        BREAKING: 0.4,
        DECEL: 0.05,
        
        // FÍSICA PRO
        OFFROAD_DECEL: 0.90,  // Freia forte na grama
        OFFROAD_LIMIT: 2.2,   // Limite visual da pista
        CENTRIFUGAL: 0.45,    // Força que joga pra fora da curva
        FRICTION: 0.96,       // Atrito lateral
        
        // RENDER (INTOCADO)
        SEGMENT_LENGTH: 200,
        DRAW_DISTANCE: 160,
        ROAD_WIDTH: 2000,
        RUMBLE_LENGTH: 3
    };

    // Variáveis Globais
    let segments = [];
    let trackLength = 0;
    let minimapPoints = [];
    let particles = [];
    let nitroBtn = null;

    // UI
    let lapPopupTimer = 0;
    let lapPopupText = "";

    const DUMMY_SEG = { curve: 0, y: 0, color: 'light', obs: [], theme: 'grass' };

    function getSegment(index) {
        if (!segments || segments.length === 0) return DUMMY_SEG;
        return segments[((Math.floor(index) % segments.length) + segments.length) % segments.length] || DUMMY_SEG;
    }

    function buildMiniMap(segments) {
        minimapPoints = [];
        let x = 0; let y = 0; let dir = -Math.PI / 2;
        // Pula segmentos para otimizar
        for(let i=0; i<segments.length; i+=5) {
            const seg = segments[i];
            dir += seg.curve * 0.007; 
            x += Math.cos(dir) * 3; 
            y += Math.sin(dir) * 3;
            minimapPoints.push({ x, y });
        }
    }

    // -----------------------------------------------------------------
    // 2. LÓGICA DO JOGO
    // -----------------------------------------------------------------
    const Logic = {
        state: 'MODE_SELECT', // MODE_SELECT, LOBBY, WAITING, RACE, FINISHED
        roomId: 'kart_room_v3',
        
        // Jogador
        selectedChar: 0,
        selectedTrack: 0,
        
        speed: 0, 
        pos: 0, 
        playerX: 0, 
        steer: 0, 
        targetSteer: 0,
        
        // Mecânicas
        nitro: 100, 
        turboLock: false,
        spinAngle: 0,    // Rotação visual (Z)
        spinVelocity: 0, // Velocidade do giro
        
        lap: 1, 
        totalLaps: 3, 
        time: 0, 
        rank: 1,
        
        // Multiplayer
        isOnline: false,
        isReady: false,
        rivals: [],
        dbRef: null,
        lastSync: 0,
        autoStartTimer: null,

        // Input
        virtualWheel: { x:0, y:0, r:60, opacity:0, isHigh: false },
        visualTilt: 0,
        bounce: 0,

        // --- INICIALIZAÇÃO ---
        init: function() { 
            this.cleanup();
            this.state = 'MODE_SELECT';
            this.setupUI(); 
            particles = [];
            window.System.msg("OTTO KART: PRO");
        },

        cleanup: function() {
            if (this.dbRef) {
                try { this.dbRef.child('players').off(); } catch(e){}
            }
            if(nitroBtn) nitroBtn.remove();
            window.System.canvas.onclick = null;
        },

        setupUI: function() {
            const old = document.getElementById('nitro-btn-kart');
            if(old) old.remove();

            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            // Estilo Original
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '40%', right: '20px', width: '90px', height: '90px',
                borderRadius: '50%', background: 'radial-gradient(circle, #ffaa00, #ff4500)', 
                border: '4px solid #fff', color: '#fff', display: 'none', 
                alignItems: 'center', justifyContent: 'center',
                fontFamily: "'Russo One', sans-serif", fontSize: '18px', zIndex: '100',
                boxShadow: '0 0 25px rgba(255, 69, 0, 0.8)', cursor: 'pointer', userSelect: 'none',
                transform: 'scale(1)', transition: 'transform 0.1s'
            });

            const toggleTurbo = (e) => {
                if(e) { if(e.cancelable) e.preventDefault(); e.stopPropagation(); }
                if(this.state !== 'RACE') return;
                
                if(this.nitro > 5) {
                    this.turboLock = !this.turboLock;
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.9)' : 'scale(1)';
                    nitroBtn.style.borderColor = this.turboLock ? '#00ffff' : '#fff';
                    if(this.turboLock) window.Sfx.play(600, 'square', 0.1, 0.1);
                }
            };
            
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            document.getElementById('game-ui').appendChild(nitroBtn);

            // Input Global
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
                    if (pY > 0.75) this.toggleReady();
                    else if (pY < 0.4) {
                        this.selectedChar = (this.selectedChar + 1) % CHARACTERS.length;
                        window.Sfx.hover();
                        if(this.isOnline) this.syncLobby();
                    }
                    else {
                        this.selectedTrack = (this.selectedTrack + 1) % TRACKS.length;
                        window.Sfx.hover();
                        if(this.isOnline) this.syncLobby();
                    }
                }
            };
        },

        // --- GAME LOOP ---
        update: function(ctx, w, h, pose) {
            if (this.state === 'MODE_SELECT') { this.renderModeSelect(ctx, w, h); return; }
            if (this.state === 'LOBBY' || this.state === 'WAITING') { this.renderLobby(ctx, w, h); return; }
            
            if (!segments || segments.length === 0) return 0;

            this.updatePhysics(w, h, pose);
            this.renderWorld(ctx, w, h);
            this.renderUI(ctx, w, h);
            
            if (this.isOnline) this.syncMultiplayer();

            return Math.floor(this.score);
        },

        // =================================================================
        // FÍSICA PRO (A SOLUÇÃO REAL)
        // =================================================================
        updatePhysics: function(w, h, pose) {
            const charStats = CHARACTERS[this.selectedChar];
            const trackStats = TRACKS[this.selectedTrack];

            // 1. INPUT
            let detected = false;
            if (pose && pose.keypoints) {
                const mapP = (k) => ({ x: (1 - k.x/640)*w, y: (k.y/480)*h });
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                const n  = pose.keypoints.find(k => k.name === 'nose');

                if(lw && rw && lw.score > 0.2 && rw.score > 0.2) {
                    detected = true;
                    const pL = mapP(lw); const pR = mapP(rw);
                    
                    this.virtualWheel.x = (pL.x + pR.x) / 2;
                    this.virtualWheel.y = (pL.y + pR.y) / 2;
                    this.virtualWheel.opacity = 1;

                    // Direção
                    const dy = pR.y - pL.y;
                    this.targetSteer = dy / 45; 

                    // Turbo (Mãos altas)
                    if (n && n.score > 0.2) {
                        const pN = mapP(n);
                        const handsHigh = (pL.y < pN.y && pR.y < pN.y);
                        this.virtualWheel.isHigh = handsHigh;
                        if (handsHigh && this.nitro > 5) this.turboLock = true;
                        else if (!handsHigh && this.nitro <= 0) this.turboLock = false;
                    }
                }
            }

            if (!detected) {
                this.virtualWheel.opacity *= 0.9;
                this.targetSteer = 0;
            }

            // Suavização
            this.steer += (this.targetSteer - this.steer) * 0.15;
            this.steer = Math.max(-1.5, Math.min(1.5, this.steer));

            // 2. MOTOR
            let maxS = CONF.MAX_SPEED * charStats.speedInfo;
            if (this.turboLock && this.nitro > 0) {
                maxS = CONF.TURBO_MAX_SPEED;
                this.nitro -= 0.5;
            } else {
                this.nitro = Math.min(100, this.nitro + 0.08);
            }

            // Perda por Spin
            if (Math.abs(this.spinVelocity) > 1) maxS *= 0.2;

            if (this.state === 'RACE') {
                this.speed += (maxS - this.speed) * CONF.ACCEL;
            } else {
                this.speed *= 0.95;
            }

            // 3. PISTA E FORÇA G (SEM TRILHOS)
            const speedRatio = this.speed / CONF.MAX_SPEED;
            const segIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            const seg = getSegment(segIdx);
            
            // Força Centrífuga: A pista joga o carro para fora
            const centrifugal = -seg.curve * (speedRatio * speedRatio) * CONF.CENTRIFUGAL;
            const control = 0.16 * charStats.turnInfo;
            
            // Aplica forças (Input + Centrífuga)
            this.playerX += (this.steer * control * speedRatio) + centrifugal;

            // 4. TERRENO E COLISÃO (REALISTA)
            const absX = Math.abs(this.playerX);
            
            // Zebra
            if (absX > 2.0 && absX < CONF.OFFROAD_LIMIT) {
                this.speed *= 0.99;
                this.bounce = (Math.random()-0.5) * 4;
            }
            // Grama (Punição Forte)
            else if (absX >= CONF.OFFROAD_LIMIT) {
                this.speed *= CONF.OFFROAD_DECEL;
                this.bounce = (Math.random()-0.5) * 8;
                if(this.speed > 50) this.speed -= 2; 
            } else {
                this.bounce = 0;
            }

            // Paredes Invisíveis Distantes
            if(this.playerX < -5) { this.playerX = -5; this.speed = 0; }
            if(this.playerX > 5)  { this.playerX = 5;  this.speed = 0; }

            // Obstáculos
            seg.obs.forEach(o => {
                if (o.x < 10 && Math.abs(this.playerX - o.x) < 0.6) {
                    this.triggerSpin('HARD');
                    o.x = 999; 
                }
            });

            // Rivais
            this.rivals.forEach(r => {
                let dist = r.pos - this.pos;
                if (dist > trackLength/2) dist -= trackLength;
                if (dist < -trackLength/2) dist += trackLength;
                
                if (Math.abs(dist) < 250 && Math.abs(r.x - this.playerX) < 0.7) {
                    this.triggerSpin('SOFT');
                    const push = (this.playerX > r.x) ? 0.6 : -0.6;
                    this.playerX += push;
                }
            });

            // 5. SPIN HORIZONTAL (O CARRO GIRA, O MUNDO NÃO)
            if (Math.abs(this.spinVelocity) > 0.1) {
                this.spinAngle += this.spinVelocity;
                this.spinVelocity *= 0.92; // Atrito angular
                
                // Normaliza 0-360 para não estourar
                if(this.spinAngle > 360) this.spinAngle -= 360;
                if(this.spinAngle < 0) this.spinAngle += 360;

                // Para quando lento
                if (Math.abs(this.spinVelocity) < 1) {
                    this.spinVelocity = 0;
                    this.spinAngle = 0; 
                }
            } else {
                this.spinAngle = 0;
            }

            // 6. PROGRESSÃO
            this.pos += this.speed;
            while (this.pos >= trackLength) {
                this.pos -= trackLength;
                this.lap++;
                if(this.lap <= this.totalLaps) {
                    lapPopupText = `VOLTA ${this.lap}/${this.totalLaps}`;
                    lapPopupTimer = 120;
                    window.System.msg(lapPopupText);
                }
            }
            while (this.pos < 0) this.pos += trackLength;

            this.time += 1/60;

            // Fim de Jogo
            if (this.lap > this.totalLaps && this.state === 'RACE') {
                this.state = 'FINISHED';
                const target = TRACKS[this.selectedTrack].targetTime;
                const success = this.rank <= 3 && this.time < target;
                window.System.gameOver(success ? `VITÓRIA! RANK ${this.rank}` : `FIM! RANK ${this.rank}`);
            }

            // Rank
            let ahead = 0;
            this.rivals.forEach(r => {
                let rDist = r.pos + (r.lap||1)*trackLength;
                let pDist = this.pos + (this.lap)*trackLength;
                if (rDist > pDist) ahead++;
            });
            this.rank = 1 + ahead;

            this.visualTilt += ((this.steer * 20) - this.visualTilt) * 0.1;
        },

        triggerSpin: function(severity) {
            window.Sfx.crash();
            window.Gfx.shakeScreen(severity === 'HARD' ? 20 : 10);
            
            // Inicia velocidade de giro (Eixo Z, não capota)
            this.spinVelocity = severity === 'HARD' ? 35 : 20;
            if (Math.random() > 0.5) this.spinVelocity *= -1;
            
            this.speed *= 0.5;
            this.nitro = Math.max(0, this.nitro - 15);
        },

        // =================================================================
        // RENDERIZAÇÃO (ESTILO ORIGINAL RESTAURADO)
        // =================================================================
        renderWorld: function(ctx, w, h) {
            const cx = w / 2;
            const horizon = h * 0.45;
            const currentSegIdx = Math.floor(this.pos / CONF.SEGMENT_LENGTH);
            const camX = this.playerX * (w * 0.35); 
            
            this.drawBackground(ctx, w, h, horizon);

            let dx = 0;
            let sprites = [];

            for (let n = 0; n < CONF.DRAW_DISTANCE; n++) {
                const segIdx = (currentSegIdx + n) % segments.length;
                const seg = segments[segIdx];
                
                dx += seg.curve;
                const segZ = n * CONF.SEGMENT_LENGTH;
                const scale = 160 / (160 + segZ); // FOV Original
                const scaleNext = 160 / (160 + segZ + CONF.SEGMENT_LENGTH);

                const screenX = cx + (-camX - dx * n) * scale;
                const screenXNext = cx + (-camX - (dx + seg.curve) * (n+1)) * scaleNext;
                
                const screenY = horizon + (1000 * scale);
                const screenYNext = horizon + (1000 * scaleNext);
                
                const width = w * 2 * scale;
                const widthNext = w * 2 * scaleNext;

                this.drawSegment(ctx, w, screenY, screenYNext, screenX, screenXNext, width, widthNext, seg);

                // Sprites
                seg.obs.forEach(o => {
                    const sx = screenX + (o.x * width * 0.4);
                    sprites.push({ type: 'obs', obj: o, x: sx, y: screenY, s: scale });
                });

                this.rivals.forEach(r => {
                    let dist = r.pos - this.pos;
                    if (dist > trackLength/2) dist -= trackLength;
                    if (dist < -trackLength/2) dist += trackLength;

                    if (dist >= n*200 && dist < (n+1)*200) {
                        const sx = screenX + (r.x * width * 0.4);
                        sprites.push({ type: 'rival', obj: r, x: sx, y: screenY, s: scale });
                    }
                });
            }

            for (let i = sprites.length - 1; i >= 0; i--) {
                const s = sprites[i];
                if (s.type === 'obs') this.drawObstacle(ctx, s.obj.type, s.x, s.y, s.s * w * 0.005);
                else this.drawKartSprite(ctx, s.x, s.y, s.s * w * 0.005, 0, 0, s.obj.color, true);
            }

            // Jogador (Com rotação horizontal corrigida)
            const pScale = w * 0.005;
            const pColor = CHARACTERS[this.selectedChar].color;
            this.drawKartSprite(ctx, cx, h*0.85 + this.bounce, pScale, this.visualTilt, this.spinAngle, pColor, false);
        },

        drawSegment: function(ctx, w, y1, y2, x1, x2, w1, w2, seg) {
            const theme = seg.theme;
            const dark = seg.color === 'dark';
            
            let grass, road, rumble;
            if (theme === 'snow') { grass = dark?'#b2bec3':'#dfe6e9'; road = dark?'#636e72':'#6c7a89'; }
            else if (theme === 'sand') { grass = dark?'#e67e22':'#f1c40f'; road = dark?'#7f8c8d':'#95a5a6'; }
            else { grass = dark?'#27ae60':'#2ecc71'; road = dark?'#34495e':'#2c3e50'; }
            rumble = dark ? '#c0392b' : '#ecf0f1';

            ctx.fillStyle = grass; ctx.fillRect(0, y2, w, y1-y2);
            ctx.fillStyle = rumble; ctx.beginPath();
            ctx.moveTo(x1-w1*1.2/2, y1); ctx.lineTo(x1+w1*1.2/2, y1);
            ctx.lineTo(x2+w2*1.2/2, y2); ctx.lineTo(x2-w2*1.2/2, y2); ctx.fill();
            ctx.fillStyle = road; ctx.beginPath();
            ctx.moveTo(x1-w1/2, y1); ctx.lineTo(x1+w1/2, y1);
            ctx.lineTo(x2+w2/2, y2); ctx.lineTo(x2-w2/2, y2); ctx.fill();
        },

        drawKartSprite: function(ctx, x, y, scale, tilt, spin, color, isRival) {
            ctx.save();
            ctx.translate(x, y);
            ctx.scale(scale, scale);
            
            // ROTAÇÃO CORRIGIDA (Eixo Z - como um volante ou pião)
            const rotation = (tilt * 0.02) + (spin * Math.PI / 180);
            ctx.rotate(rotation);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 30, 50, 15, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            const grad = ctx.createLinearGradient(-30, 0, 30, 0);
            grad.addColorStop(0, color); grad.addColorStop(0.5, '#fff'); grad.addColorStop(1, color);
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.moveTo(-25, -20); ctx.lineTo(25, -20);
            ctx.lineTo(40, 10); ctx.lineTo(15, 40);
            ctx.lineTo(-15, 40); ctx.lineTo(-40, 10);
            ctx.fill();

            // Motor
            ctx.fillStyle = '#333'; ctx.fillRect(-20, -30, 40, 15);

            // Rodas
            ctx.fillStyle = '#111';
            ctx.fillRect(-45, 0, 15, 30);
            ctx.fillRect(30, 0, 15, 30);

            // Capacete
            ctx.fillStyle = isRival ? '#fff' : '#f1c40f';
            ctx.beginPath(); ctx.arc(0, -10, 20, 0, Math.PI*2); ctx.fill();
            
            if ((this.turboLock || isRival) && Math.random() > 0.5) {
                ctx.fillStyle = '#0ff';
                ctx.beginPath(); ctx.moveTo(-10,-30); ctx.lineTo(10,-30); ctx.lineTo(0,-60); ctx.fill();
            }

            if(isRival) {
                ctx.fillStyle = '#0f0'; ctx.font="bold 20px Arial"; ctx.textAlign="center";
                ctx.fillText("P2", 0, -50);
            }

            ctx.restore();
        },

        drawObstacle: function(ctx, type, x, y, scale) {
            ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
            if (type === 'cone') {
                ctx.fillStyle = '#e67e22'; ctx.beginPath(); 
                ctx.moveTo(-15, 0); ctx.lineTo(15, 0); ctx.lineTo(0, -40); ctx.fill();
            } else { 
                ctx.fillStyle = '#7f8c8d'; 
                ctx.beginPath(); ctx.arc(0, -10, 20, 0, Math.PI*2); ctx.fill();
            }
            ctx.restore();
        },

        drawBackground: function(ctx, w, h, horizon) {
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            const skyId = TRACKS[this.selectedTrack].sky;
            const colors = [ ['#3498db','#85c1e9'], ['#d35400','#f39c12'], ['#2c3e50','#bdc3c7'] ];
            const c = colors[skyId];
            grad.addColorStop(0, c[0]); grad.addColorStop(1, c[1]);
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);
            
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            const off = (this.pos * 0.002) + (this.playerX * 0.1);
            ctx.beginPath();
            for(let i=0; i<10; i++) {
                const mx = ((i * w/4) - (off * w)) % (w*4);
                ctx.lineTo(mx, horizon);
                ctx.lineTo(mx + w/8, horizon - 100);
                ctx.lineTo(mx + w/4, horizon);
            }
            ctx.fill();
        },

        renderUI: function(ctx, w, h) {
            if (this.state === 'RACE') {
                // HUD
                const hudX = w - 80; const hudY = h - 60;
                ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.beginPath(); ctx.arc(hudX, hudY, 60, 0, Math.PI*2); ctx.fill();
                const speedPct = this.speed / CONF.TURBO_MAX_SPEED;
                ctx.beginPath(); ctx.arc(hudX, hudY, 55, Math.PI, Math.PI + speedPct*Math.PI); 
                ctx.lineWidth = 6; ctx.strokeStyle = this.turboLock ? '#0ff' : '#f00'; ctx.stroke();
                
                ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 20px Arial";
                ctx.fillText(Math.floor(this.speed), hudX, hudY+10);
                
                const nW = 200;
                ctx.fillStyle = '#333'; ctx.fillRect(w/2 - nW/2, 20, nW, 20);
                ctx.fillStyle = this.turboLock ? '#0ff' : '#f39c12'; 
                ctx.fillRect(w/2 - nW/2+2, 22, (nW-4)*(this.nitro/100), 16);
                
                // Mapa
                if (minimapPoints.length > 0) {
                    const mX = 20; const mY = 100;
                    ctx.save(); ctx.translate(mX+60, mY+60);
                    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(0,0,60,0,Math.PI*2); ctx.fill();
                    ctx.strokeStyle='#fff'; ctx.lineWidth=2; ctx.stroke();
                    ctx.fillStyle='#555';
                    minimapPoints.forEach(p => ctx.fillRect(p.x*0.5, p.y*0.5, 2, 2));
                    const pIdx = Math.floor((this.pos/trackLength)*minimapPoints.length);
                    const pp = minimapPoints[pIdx] || {x:0,y:0};
                    ctx.fillStyle='#f00'; ctx.beginPath(); ctx.arc(pp.x*0.5, pp.y*0.5, 3, 0, Math.PI*2); ctx.fill();
                    
                    this.rivals.forEach(r => {
                        const rIdx = Math.floor((r.pos/trackLength)*minimapPoints.length);
                        const rp = minimapPoints[rIdx];
                        if(rp) { ctx.fillStyle='#0f0'; ctx.beginPath(); ctx.arc(rp.x*0.5, rp.y*0.5, 3, 0, Math.PI*2); ctx.fill(); }
                    });
                    ctx.restore();
                }

                // Objetivos
                ctx.fillStyle = '#fff'; ctx.textAlign='left';
                ctx.fillText(`VOLTA ${this.lap}/${this.totalLaps}`, 20, 40);
                ctx.fillText(`RANK ${this.rank}`, 20, 70);
                const target = TRACKS[this.selectedTrack].targetTime;
                ctx.fillText(`META: ${target}s (${Math.floor(this.time)}s)`, 20, 95);

                if(this.virtualWheel.opacity > 0) {
                    ctx.save(); ctx.translate(this.virtualWheel.x, this.virtualWheel.y);
                    ctx.rotate(this.steer);
                    ctx.strokeStyle = this.virtualWheel.isHigh ? '#0ff' : '#fff';
                    ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0,0,50,0,Math.PI*2); ctx.stroke();
                    ctx.fillStyle='#fff'; ctx.fillRect(-5,-50,10,20);
                    ctx.restore();
                }

            } else if (this.state === 'FINISHED') {
                ctx.fillStyle = 'rgba(0,0,0,0.9)'; ctx.fillRect(0,0,w,h);
                ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 50px Arial";
                ctx.fillText("RESULTADO", w/2, h/2 - 60);
                
                ctx.font="30px Arial";
                const target = TRACKS[this.selectedTrack].targetTime;
                const success = this.rank <= 3 && this.time < target;
                ctx.fillStyle = success ? '#0f0' : '#f00';
                
                ctx.fillText(success ? "OBJETIVO CUMPRIDO!" : "TENTE NOVAMENTE", w/2, h/2);
                ctx.fillStyle = '#ccc'; ctx.font="20px Arial";
                ctx.fillText(`POSIÇÃO: ${this.rank}º | TEMPO: ${Math.floor(this.time)}s`, w/2, h/2 + 40);
                ctx.fillText("Toque para Menu", w/2, h - 50);
                
                if(!window.System.canvas.onclick) {
                    window.System.canvas.onclick = () => window.System.menu();
                }
            }
        },

        renderModeSelect: function(ctx, w, h) {
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 40px 'Russo One'";
            ctx.fillText("OTTO KART GP", w/2, 100);

            const btn = (y, color, txt) => {
                ctx.fillStyle = color; ctx.fillRect(w/2-150, y, 300, 80);
                ctx.fillStyle = '#fff'; ctx.font="24px Arial"; ctx.fillText(txt, w/2, y+50);
            };
            btn(h*0.3, '#e67e22', "JOGAR SOLO");
            btn(h*0.55, '#27ae60', "MULTIPLAYER");
        },

        renderLobby: function(ctx, w, h) {
            ctx.fillStyle = '#34495e'; ctx.fillRect(0,0,w,h);
            ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font="bold 30px Arial";
            ctx.fillText("GARAGEM", w/2, 60);

            const char = CHARACTERS[this.selectedChar];
            ctx.fillStyle = char.color; ctx.beginPath(); ctx.arc(w/2, h*0.25, 50, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillText(char.name, w/2, h*0.25 + 80);

            const trk = TRACKS[this.selectedTrack];
            ctx.fillStyle = '#2c3e50'; ctx.fillRect(w/2-150, h*0.55, 300, 60);
            ctx.fillStyle = '#fff'; ctx.fillText(`PISTA: ${trk.name}`, w/2, h*0.55 + 40);

            const readyTxt = this.state === 'WAITING' ? "AGUARDANDO..." : "INICIAR";
            const readyCol = this.state === 'WAITING' ? '#95a5a6' : '#27ae60';
            ctx.fillStyle = readyCol; ctx.fillRect(w/2-150, h*0.8, 300, 70);
            ctx.fillStyle = '#fff'; ctx.fillText(readyTxt, w/2, h*0.8 + 45);
        },

        // --- SISTEMAS DE CONEXÃO E PISTA (NETCODE CLONADO DO GAME_BOX) ---
        selectMode: function(mode) {
            this.speed = 0; this.pos = 0; this.playerX = 0; this.lap = 1; this.nitro = 100;
            if (mode === 'OFFLINE') {
                this.isOnline = false;
                this.state = 'LOBBY';
                this.rivals = [
                    { id:'cpu1', pos:0, x:-0.5, speed:0, color:'#9b59b6' },
                    { id:'cpu2', pos:0, x:0.5, speed:0, color:'#2ecc71' }
                ];
            } else {
                if(!window.DB) { window.System.msg("ERRO: OFFLINE"); return; }
                this.isOnline = true;
                this.state = 'LOBBY';
                this.connectNet();
            }
        },

        connectNet: function() {
            // Lógica exata do game_box.js adaptada
            this.dbRef = window.DB.ref(`rooms/${this.roomId}`);
            const myRef = this.dbRef.child(`players/${window.System.playerId}`);
            
            myRef.set({
                name: 'Player', charId: this.selectedChar, ready: false,
                lastSeen: firebase.database.ServerValue.TIMESTAMP
            });
            myRef.onDisconnect().remove();

            this.dbRef.child('players').on('value', snap => {
                const data = snap.val();
                if(!data) return;

                const now = Date.now();
                this.rivals = Object.keys(data)
                    .filter(k => k !== window.System.playerId)
                    .filter(k => (now - (data[k].lastSeen||0)) < 15000)
                    .map(k => {
                        const p = data[k];
                        return {
                            id: k,
                            pos: p.pos || 0,
                            x: p.x || 0,
                            color: CHARACTERS[p.charId||0].color,
                            ready: p.ready,
                            lap: p.lap || 1
                        };
                    });

                if(this.state === 'WAITING') {
                    const allReady = this.rivals.length > 0 && this.rivals.every(r => r.ready);
                    if(allReady && this.isReady) this.startRace();
                }
            });
        },

        syncLobby: function() {
            if(this.isOnline) {
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    charId: this.selectedChar,
                    trackId: this.selectedTrack,
                    ready: this.isReady
                });
            }
        },

        syncMultiplayer: function() {
            if(Date.now() - this.lastSync > 100) {
                this.lastSync = Date.now();
                this.dbRef.child(`players/${window.System.playerId}`).update({
                    pos: Math.floor(this.pos),
                    x: this.playerX,
                    lap: this.lap,
                    lastSeen: firebase.database.ServerValue.TIMESTAMP
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
            if(nitroBtn) nitroBtn.style.display = 'flex';
            window.System.msg("LARGADA!");
            
            document.getElementById('game-ui').style.pointerEvents = 'auto';
        },

        buildTrack: function(id) {
            segments = [];
            const trk = TRACKS[id];
            
            const addRoad = (n, c, y) => {
                for(let i=0; i<n; i++) {
                    const dark = Math.floor(segments.length/CONF.RUMBLE_LENGTH)%2;
                    segments.push({
                        curve: c * trk.curveMult,
                        y: y,
                        color: dark ? 'dark' : 'light',
                        obs: [],
                        theme: trk.theme
                    });
                }
            };
            
            addRoad(50, 0, 0);
            addRoad(50, 1.5, 0);
            addRoad(50, -1.5, 0);
            addRoad(30, 0, 0);
            
            for(let i=0; i<15; i++) {
                addRoad(20, (Math.random()-0.5)*2, 0);
                if(Math.random()>0.5) {
                    segments[segments.length-1].obs.push({
                        type: trk.theme==='snow'?'rock':'cone',
                        x: (Math.random()-0.5)*3
                    });
                }
            }
            
            addRoad(50, 0, 0);
            trackLength = segments.length * CONF.SEGMENT_LENGTH;
            buildMiniMap(segments);
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'OTTO KART GP', '🏎️', Logic, {
            camOpacity: 0.2,
            showWheel: true
        });
    }

})();