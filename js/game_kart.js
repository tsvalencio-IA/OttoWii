/**
 * =============================================================================
 * OTTO KART GP - "PROJECT BLUE SHELL" ENGINE (VISUAL REMASTER)
 * =============================================================================
 * Tecnologia: Pseudo-3D (Mode 7) com Câmera Elástica.
 * Renderização: Sprites procedurais (desenhados via código) para karts e itens.
 * =============================================================================
 */

(function() {
    const PHYS = {
        MAX_SPEED: 200,       // Sensação de 150cc
        ACCEL: 2.0,
        FRICTION: 0.97,
        TURN_SPEED: 0.08,     // Agilidade nas curvas
        CAM_LAG: 0.1,         // Atraso da câmera (Cinematic feel)
        FOV: 800,
        ROAD_WIDTH: 2200
    };

    const Logic = {
        pos: 0,               // Odômetro
        playerX: 0,           // Posição na pista (-1 a 1)
        speed: 0,
        
        // Câmera
        camX: 0,              // Posição suavizada da câmera
        carAngle: 0,          // Inclinação visual do chassi
        
        // Input
        steerInput: 0,
        
        // Mundo
        sprites: [],
        opponents: [],
        
        init: function() {
            this.pos = 0;
            this.playerX = 0;
            this.speed = 0;
            this.camX = 0;
            this.steerInput = 0;
            this.sprites = [];
            this.opponents = [];

            // Gerar Pista (Árvores e Placas)
            for(let i=0; i<60; i++) {
                this.sprites.push({
                    z: Math.random() * 30000,
                    x: (Math.random() > 0.5 ? 1 : -1) * (1.2 + Math.random() * 2), // Margem da pista
                    type: Math.random() > 0.7 ? 'billboard' : 'tree'
                });
            }

            // Gerar Oponentes (Luigi, Peach, Bowser - Cores)
            const colors = ['#2ecc71', '#ff69b4', '#f1c40f']; // Verde, Rosa, Amarelo
            for(let i=0; i<3; i++) {
                this.opponents.push({
                    z: 500 + (i * 600),
                    x: (Math.random() - 0.5) * 0.5,
                    speed: PHYS.MAX_SPEED * (0.85 + Math.random() * 0.1), // Velocidade variável
                    color: colors[i],
                    offset: Math.random() * 100
                });
            }

            window.System.msg("LARGADA!");
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2;
            const horizon = h * 0.45; // Horizonte mais baixo para ver mais pista

            // =================================================================
            // 1. INPUT (VOLANTE VIRTUAL)
            // =================================================================
            let hasInput = false;
            let targetSteer = 0;

            if(pose) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(lw && lw.score > 0.3 && rw && rw.score > 0.3) {
                    hasInput = true;
                    // Calcula ângulo entre pulsos
                    const dx = rw.x - lw.x;
                    const dy = rw.y - lw.y;
                    const angle = Math.atan2(dy, dx);
                    
                    // Deadzone e Sensibilidade
                    targetSteer = angle * 2.5; 
                    if(Math.abs(targetSteer) < 0.15) targetSteer = 0; // Deadzone central
                    targetSteer = Math.max(-1.5, Math.min(1.5, targetSteer));

                    // HUD Volante
                    this.drawWheelHUD(ctx, w, h, angle);
                }
            }

            // Suavização do Input (Inércia do volante)
            this.steerInput += (targetSteer - this.steerInput) * 0.2;

            // =================================================================
            // 2. FÍSICA
            // =================================================================
            if(hasInput) {
                this.speed += PHYS.ACCEL;
                if(this.speed > PHYS.MAX_SPEED) this.speed = PHYS.MAX_SPEED;
            } else {
                this.speed *= PHYS.FRICTION;
            }

            // Curva (Só vira se estiver andando)
            const turnRate = (this.speed / PHYS.MAX_SPEED) * PHYS.TURN_SPEED;
            this.playerX += this.steerInput * turnRate;

            // Grama (Drag)
            let onGrass = false;
            if(Math.abs(this.playerX) > 1.1) {
                this.speed *= 0.92;
                onGrass = true;
                if(this.speed > 50) window.Gfx.shake(2);
            }

            this.pos += this.speed;

            // Câmera Lag (O segredo do "Game Feel")
            this.camX += (this.playerX - this.camX) * PHYS.CAM_LAG;
            
            // Inclinação do Carro (Body Roll)
            this.carAngle += (this.steerInput - this.carAngle) * 0.1;

            // Curva da Pista (Procedural)
            const trackCurve = Math.sin(this.pos * 0.002) * 2.5;

            // =================================================================
            // 3. RENDERIZAÇÃO (MODE 7 SIMULADO)
            // =================================================================
            
            // CÉU (Parallax Inverso)
            const skyX = trackCurve * 100 + (this.carAngle * 50);
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, '#0099ff'); gradSky.addColorStop(1, '#aaccff');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,horizon);
            
            // NUVENS
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            this.drawCloud(ctx, w*0.2 - skyX, horizon*0.4, 50);
            this.drawCloud(ctx, w*0.8 - skyX, horizon*0.6, 70);

            // CHÃO
            ctx.fillStyle = '#2d9e45'; // Verde Grama Nintendo
            ctx.fillRect(0, horizon, w, h-horizon);

            // ESTRADA (Projeção)
            const project = (roadX, roadZ) => {
                // X relativo à câmera e curva
                const relX = roadX - (this.camX * PHYS.ROAD_WIDTH/2) - (trackCurve * (roadZ/100));
                const scale = PHYS.FOV / (PHYS.FOV + roadZ);
                const sx = cx + (relX * scale);
                const sy = horizon + (400 * scale); // 400 = altura da câmera
                return { x: sx, y: sy, s: scale };
            };

            // Desenha o trapézio da pista
            const pFarL = project(-PHYS.ROAD_WIDTH/2, 2000);
            const pFarR = project(PHYS.ROAD_WIDTH/2, 2000);
            const pNearL = project(-PHYS.ROAD_WIDTH/2, 10);
            const pNearR = project(PHYS.ROAD_WIDTH/2, 10);

            ctx.fillStyle = '#555'; // Asfalto
            ctx.beginPath();
            ctx.moveTo(pFarL.x, horizon); ctx.lineTo(pFarR.x, horizon);
            ctx.lineTo(pNearR.x, h); ctx.lineTo(pNearL.x, h);
            ctx.fill();

            // ZEBRAS (Stripes)
            const segmentSize = 300;
            const isWhite = Math.floor(this.pos / segmentSize) % 2 === 0;
            ctx.strokeStyle = isWhite ? '#ecf0f1' : '#e74c3c';
            ctx.lineWidth = 12;
            ctx.beginPath();
            ctx.moveTo(pFarL.x, horizon); ctx.lineTo(pNearL.x, h); // Esq
            ctx.moveTo(pFarR.x, horizon); ctx.lineTo(pNearR.x, h); // Dir
            ctx.stroke();

            // =================================================================
            // 4. SPRITES (BILLBOARDS & KART)
            // =================================================================
            const renderList = [];

            // Cenário
            this.sprites.forEach(s => {
                let relZ = s.z - this.pos;
                while(relZ < 0) relZ += 30000; // Loop infinito
                if(relZ < 5000) renderList.push({ type: s.type, x: s.x, z: relZ });
            });

            // Oponentes
            this.opponents.forEach(o => {
                o.z += o.speed - this.speed; // Movimento relativo
                // IA Curva
                o.x -= trackCurve * 0.005;
                if(o.x > 1) o.x = 1; if(o.x < -1) o.x = -1;
                
                // Respawn se ficar muito pra trás
                if(o.z < -500) { o.z = 3000; o.x = (Math.random()-0.5); }
                
                if(o.z > 50) renderList.push({ type: 'kart', obj: o, x: o.x, z: o.z });
            });

            // Ordena (Painter's Algorithm)
            renderList.sort((a,b) => b.z - a.z);

            renderList.forEach(item => {
                const pt = project(item.x * PHYS.ROAD_WIDTH/2, item.z);
                const size = (2000 / item.z) * 100;
                
                if(item.type === 'tree') this.drawTree(ctx, pt.x, pt.y, size);
                else if(item.type === 'billboard') this.drawBillboard(ctx, pt.x, pt.y, size);
                else if(item.type === 'kart') this.drawKart(ctx, pt.x, pt.y, size, 0, item.obj.color);
            });

            // JOGADOR (HERÓI)
            // Renderizado em posição fixa Y, mas X segue o lag da câmera
            const screenCarX = cx + (this.playerX - this.camX) * (w * 0.7);
            const carScale = w * 0.0012; // Escala responsiva

            // Partículas de fumaça
            if(onGrass && this.speed > 50) {
                ctx.fillStyle = 'rgba(100, 70, 50, 0.6)';
                const px = screenCarX + (Math.random()-0.5)*50;
                ctx.beginPath(); ctx.arc(px, h-50, 10+Math.random()*20, 0, Math.PI*2); ctx.fill();
            }

            this.drawKart(ctx, screenCarX, h - 80, 1.0, this.carAngle, '#e74c3c');

            return Math.floor(this.pos / 100);
        },

        // --- SPRITE DRAWING (PROCEDURAL PIXEL ART) ---
        
        drawCloud: function(ctx, x, y, s) {
            ctx.beginPath(); 
            ctx.arc(x, y, s, 0, Math.PI*2);
            ctx.arc(x+s, y+s*0.2, s*0.7, 0, Math.PI*2); 
            ctx.arc(x-s, y+s*0.2, s*0.7, 0, Math.PI*2);
            ctx.fill();
        },

        drawTree: function(ctx, x, y, s) {
            if(s <= 0) return;
            // Tronco
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(x - s*0.1, y - s*0.5, s*0.2, s*0.5);
            // Copa (3 Triângulos)
            ctx.fillStyle = '#006400';
            const drawTri = (oy, w) => {
                ctx.beginPath(); ctx.moveTo(x, y-oy-s); 
                ctx.lineTo(x-w, y-oy); ctx.lineTo(x+w, y-oy); ctx.fill();
            };
            drawTri(s*0.2, s*0.4);
            drawTri(s*0.5, s*0.35);
            drawTri(s*0.8, s*0.25);
        },

        drawBillboard: function(ctx, x, y, s) {
            if(s <= 0) return;
            // Postes
            ctx.fillStyle = '#7f8c8d';
            ctx.fillRect(x-s*0.3, y-s, s*0.05, s);
            ctx.fillRect(x+s*0.25, y-s, s*0.05, s);
            // Placa
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(x-s*0.5, y-s*1.2, s, s*0.6);
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = s*0.05;
            ctx.strokeRect(x-s*0.5, y-s*1.2, s, s*0.6);
            // Logo
            ctx.fillStyle = '#000'; ctx.font = `bold ${s*0.2}px Arial`; 
            ctx.textAlign='center'; ctx.fillText("THIAGO", x, y-s*0.9);
            ctx.fillStyle = '#c0392b'; ctx.fillText("Wii", x, y-s*0.7);
        },

        drawKart: function(ctx, x, y, scale, angle, color) {
            // Desenha o Kart estilo Mario Kart SNES
            ctx.save();
            ctx.translate(x, y);
            if(scale !== 1.0) ctx.scale(scale/200, scale/200); // Normaliza escala para projeção
            else ctx.scale(1.5, 1.5); // Escala fixa do player
            
            ctx.rotate(angle * 0.4); // Inclinação nas curvas

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(0, 15, 45, 12, 0, 0, Math.PI*2); ctx.fill();

            // Pneus Traseiros
            ctx.fillStyle = '#222';
            ctx.fillRect(-45, 0, 15, 25); ctx.fillRect(30, 0, 15, 25);

            // Chassi
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.moveTo(-35, -20); ctx.lineTo(35, -20);
            ctx.lineTo(40, 15); ctx.lineTo(-40, 15);
            ctx.fill();

            // Motor
            ctx.fillStyle = '#444'; ctx.fillRect(-25, -25, 50, 10);
            ctx.fillStyle = '#f1c40f'; // Escapamento
            ctx.beginPath(); ctx.arc(-15, -20, 5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(15, -20, 5, 0, Math.PI*2); ctx.fill();

            // Pneus Dianteiros (giram com o ângulo)
            ctx.save();
            ctx.translate(-40, 10); ctx.rotate(angle); ctx.fillRect(-5, -5, 10, 15);
            ctx.restore();
            ctx.save();
            ctx.translate(40, 10); ctx.rotate(angle); ctx.fillRect(-5, -5, 10, 15);
            ctx.restore();

            // Cabeça do Piloto
            ctx.fillStyle = '#ffccaa'; // Pele
            ctx.beginPath(); ctx.arc(0, -35, 18, 0, Math.PI*2); ctx.fill();
            
            // Capacete / Chapéu
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -40, 19, Math.PI, 0); ctx.fill();
            ctx.fillStyle = color; // Cor do time
            ctx.beginPath(); ctx.arc(0, -38, 10, 0, Math.PI*2); ctx.fill();

            ctx.restore();
        },

        drawWheelHUD: function(ctx, w, h, angle) {
            const size = 60;
            const x = w - 80;
            const y = 80;
            
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            
            // Volante UI
            ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0,0,30,0,Math.PI*2); ctx.stroke();
            
            // Marcador
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath(); ctx.arc(0, -30, 5, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        }
    };

    window.System.registerGame('kart', { name: 'Otto Kart', icon: '🏎️', camOpacity: 0.3, showWheel: false }, Logic);
})();
