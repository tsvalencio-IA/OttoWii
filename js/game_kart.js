// LÓGICA DO JOGO: KART DO OTTO (ULTIMATE NINTENDO EDITION - PROGRESSIVE INPUT)
(function() {
    // Sistema de partículas para fumaça, terra e "speed lines"
    let particles = [];
    
    const Logic = {
        // --- FÍSICA E ESTADO ---
        speed: 0, 
        pos: 0, 
        x: 0,           // Posição lateral (-1.5 a 1.5)
        steer: 0,       // Valor suavizado do volante (-1.6 a 1.6)
        curve: 0,       // Curvatura da pista
        
        // --- ATRIBUTOS DE JOGO ---
        health: 100, 
        score: 0, 
        
        // --- EFEITOS VISUAIS ---
        visualTilt: 0,  // Inclinação do chassi (Body Roll)
        bounce: 0,      // Vibração do motor
        
        // --- ESTADO DO INPUT (PROGRESSIVO) ---
        inputState: 0,  // 0=Nenhuma, 1=Uma Mão, 2=Duas Mãos (Volante)
        hands: { left: null, right: null }, // Posições brutas para renderizar luvas
        
        wheel: {
            radius: 0, x: 0, y: 0, opacity: 0, angle: 0
        },
        
        // --- OBJETOS DO MUNDO ---
        obs: [], 
        enemies: [],
        
        init: function() { 
            this.speed = 0; 
            this.pos = 0; 
            this.x = 0; 
            this.steer = 0;
            this.health = 100; 
            this.score = 0;
            this.obs = []; 
            this.enemies = [];
            particles = [];
            this.inputState = 0;
            
            // Som de partida clássico estilo Mario Kart
            window.System.msg("PREPARAR..."); 
            window.Sfx.play(100, 'sawtooth', 0.5, 0.2); 
            setTimeout(() => {
                window.System.msg("VAI!");
                window.Sfx.play(400, 'square', 1.0, 0.1);
            }, 1500);
        },
        
        update: function(ctx, w, h, pose) {
            const d = Logic; 
            const cx = w / 2;
            const horizon = h * 0.35; // Horizonte fixo (Referência MK Wii)

            // =================================================================
            // 1. DETECÇÃO DE MÃOS E ESTADOS (PROGRESSIVE INPUT SYSTEM)
            // =================================================================
            d.inputState = 0;
            d.hands.left = null;
            d.hands.right = null;

            let targetAngle = 0;
            const speedRatio = Math.min(1.2, d.speed / (h * 0.08));

            if(pose) {
                const kp = pose.keypoints;
                const lw = kp.find(k=>k.name==='left_wrist');
                const rw = kp.find(k=>k.name==='right_wrist');
                
                // Mapeia coordenadas se existirem
                if(lw && lw.score > 0.4) d.hands.left = window.Gfx.map(lw, w, h);
                if(rw && rw.score > 0.4) d.hands.right = window.Gfx.map(rw, w, h);

                // Define Estado
                if(d.hands.left && d.hands.right) d.inputState = 2; // Volante Completo
                else if (d.hands.left || d.hands.right) d.inputState = 1; // Modo Luva Única
                else d.inputState = 0; // Sem Input
            }

            // =================================================================
            // 2. FÍSICA DO VOLANTE (QUANDO ATIVO)
            // =================================================================
            if(d.inputState === 2) {
                const p1 = d.hands.left;
                const p2 = d.hands.right;

                // Centro e Raio do Volante
                const centerX = (p1.x + p2.x) / 2;
                const centerY = (p1.y + p2.y) / 2;
                const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);

                // Suavização visual (Lerp)
                d.wheel.x += (centerX - d.wheel.x) * 0.25;
                d.wheel.y += (centerY - d.wheel.y) * 0.25;
                let targetRadius = Math.max(w * 0.10, Math.min(w * 0.28, dist / 2));
                d.wheel.radius += (targetRadius - d.wheel.radius) * 0.15;
                d.wheel.opacity = Math.min(1, d.wheel.opacity + 0.15); // Fade in rápido

                // Cálculo do Ângulo (Física)
                const dy = p2.y - p1.y; 
                const dx = p2.x - p1.x;
                let rawAngle = Math.atan2(dy, dx);

                // [MARIO KART PHYSICS 1] DEADZONE DINÂMICA
                // Aumenta com a velocidade para estabilidade em retas
                const dynamicDeadzone = 0.06 + (0.12 * speedRatio);
                
                if(Math.abs(rawAngle) < dynamicDeadzone) {
                    rawAngle = 0;
                } else {
                    rawAngle = rawAngle - (Math.sign(rawAngle) * dynamicDeadzone);
                }
                
                // [MARIO KART PHYSICS 2] RESPOSTA EXPONENCIAL
                // Centro suave, pontas agressivas (Drift feel)
                targetAngle = Math.sign(rawAngle) * Math.pow(Math.abs(rawAngle), 2.2) * 2.8 * window.System.sens;
                
                // Auto-Aceleração (Nintendo Style)
                if(d.speed < h * 0.075) d.speed += h * 0.0007; 

            } else {
                // Se não tem as duas mãos, volante desaparece e carro desacelera
                d.wheel.opacity *= 0.8;
                d.speed *= 0.96; // Freio motor
                targetAngle = 0; // Auto-center
            }

            // [MARIO KART PHYSICS 3] PESO E INÉRCIA
            // O volante virtual tem "peso". Não vira instantaneamente.
            const heavySteering = 0.05 + (0.10 * (1 - speedRatio)); 
            d.steer += (targetAngle - d.steer) * heavySteering;
            d.steer = Math.max(-1.6, Math.min(1.6, d.steer)); // Trava física

            // Atualiza ângulo visual do volante (separado da física para ser suave)
            d.wheel.angle = d.steer;

            // Esconde volante antigo da UI
            const uiWheel = document.getElementById('visual-wheel');
            if(uiWheel) uiWheel.style.opacity = '0'; 

            // =================================================================
            // 3. FÍSICA DE MOVIMENTO (PISTA x CARRO)
            // =================================================================
            d.pos += d.speed;
            d.score += Math.floor(d.speed * 0.2);
            
            // Curvatura da Pista
            d.curve = Math.sin(d.pos * 0.002) * 2.2; 
            
            // [MARIO KART PHYSICS 4] ASSISTÊNCIA DE CURVA INTELIGENTE
            let centrifugalForce = 0.85; 
            const turningIntoCurve = (Math.sign(d.curve) !== Math.sign(d.steer)); 
            if(turningIntoCurve && Math.abs(d.steer) > 0.25) {
                centrifugalForce = 0.40; // Se ajudar na curva, a pista "solta" o carro
            }

            // [MARIO KART PHYSICS 5] LANE ASSIST (IMÃ DE CENTRO)
            // Se estiver quase reto, puxa suavemente para o centro da pista
            if(Math.abs(d.steer) < 0.2) {
                d.x = d.x * 0.985; 
            }

            // Cálculo Final de Posição X
            const grip = 1.0 - (speedRatio * 0.05);
            d.x += (d.steer * 0.095 * grip) - (d.curve * (d.speed/h) * centrifugalForce);
            
            // Colisão Bordas
            let isOffRoad = false;
            if(Math.abs(d.x) > 1.5) { 
                d.speed *= 0.93; isOffRoad = true; d.x = d.x > 0 ? 1.5 : -1.5;
                if(d.speed > 2) { window.Gfx.shake(Math.random()*2.5); if(Math.random()<0.2) window.Sfx.play(100,'noise',0.1,0.05); }
            }

            // Vibração Visual
            d.bounce = Math.sin(Date.now() / 30) * (1 + speedRatio * 2);
            if(isOffRoad) d.bounce = (Math.random() - 0.5) * 12;
            d.visualTilt += (d.steer - d.visualTilt) * 0.2;

            // =================================================================
            // 4. OBJETOS DO MUNDO (SPAWN)
            // =================================================================
            if(Math.random() < 0.025 && d.speed > 5) {
                const type = Math.random() < 0.3 ? 'sign' : 'cone';
                let obsX = (Math.random() * 2.2) - 1.1;
                if(type === 'sign') obsX = (Math.random() < 0.5 ? -1.6 : 1.6);
                d.obs.push({ x: obsX, z: 2000, type: type, hit: false });
            }
            if(Math.random() < 0.012 && d.speed > 8) {
                d.enemies.push({
                    x: (Math.random() * 1.5) - 0.75, z: 2000, 
                    speed: d.speed * (0.6 + Math.random()*0.35),
                    color: Math.random() < 0.5 ? '#e67e22' : '#2980b9',
                    laneChange: (Math.random() - 0.5) * 0.02
                });
            }

            // =================================================================
            // 5. RENDERIZAÇÃO: CENÁRIO NINTENDO STYLE
            // =================================================================
            // Céu
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, "#0099ff"); gradSky.addColorStop(1, "#87CEEB");
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas/Nuvens Parallax
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            const bgX = d.steer * 80 + (d.curve * 150);
            const drawCloud = (cx, cy, s) => { ctx.beginPath(); ctx.arc(cx, cy, 30*s, 0, Math.PI*2); ctx.arc(cx+25*s, cy-10*s, 35*s, 0, Math.PI*2); ctx.arc(cx+50*s, cy, 30*s, 0, Math.PI*2); ctx.fill(); };
            drawCloud(w*0.2 - bgX, horizon*0.6, 1.2); drawCloud(w*0.8 - bgX, horizon*0.4, 0.8);

            ctx.fillStyle = '#2ecc71'; ctx.beginPath(); ctx.moveTo(0, horizon);
            ctx.quadraticCurveTo(w*0.3, horizon - 50, w*0.6, horizon);
            ctx.quadraticCurveTo(w*0.8, horizon - 80, w, horizon);
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill();

            // Grama
            const grassColor1 = '#32cd32'; ctx.fillStyle = grassColor1; ctx.fillRect(0, horizon, w, h);

            // PISTA (PROJEÇÃO)
            const roadW_Far = w * 0.01; const roadW_Near = w * 2.2;
            const roadCurveVis = d.curve * (w * 0.7);

            // Zebras (Curbs)
            const zebraSize = w * 0.35; const segmentSize = 40; const segmentPhase = Math.floor(d.pos / segmentSize) % 2;
            ctx.fillStyle = (segmentPhase === 0) ? '#ff0000' : '#ffffff';
            ctx.beginPath();
            ctx.moveTo(cx + roadCurveVis - roadW_Far - (zebraSize*0.05), horizon);
            ctx.lineTo(cx + roadCurveVis + roadW_Far + (zebraSize*0.05), horizon);
            ctx.lineTo(cx + roadW_Near + zebraSize, h);
            ctx.lineTo(cx - roadW_Near - zebraSize, h);
            ctx.fill();

            // Asfalto
            ctx.fillStyle = '#555'; 
            ctx.beginPath();
            ctx.moveTo(cx + roadCurveVis - roadW_Far, horizon);
            ctx.lineTo(cx + roadCurveVis + roadW_Far, horizon);
            ctx.lineTo(cx + roadW_Near, h);
            ctx.lineTo(cx - roadW_Near, h);
            ctx.fill();

            // Speed Lines (Textura)
            if(d.speed > 1) {
                ctx.strokeStyle = 'rgba(0,0,0,0.15)'; ctx.lineWidth = 4;
                ctx.beginPath();
                const lines = 4; const offset = (d.pos % 100) / 100;
                for(let i=0; i<lines; i++) {
                    const depth = (i + offset) / lines; 
                    const y = horizon + (h-horizon) * (depth*depth); 
                    const widthAtY = roadW_Far + (roadW_Near-roadW_Far) * (depth*depth);
                    const centerAtY = cx + roadCurveVis * (1-depth);
                    ctx.moveTo(centerAtY - widthAtY, y); ctx.lineTo(centerAtY + widthAtY, y);
                }
                ctx.stroke();
            }

            // Faixa Central
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = w * 0.015;
            ctx.setLineDash([h * 0.1, h * 0.15]); ctx.lineDashOffset = -d.pos * 1.5;
            ctx.beginPath();
            ctx.moveTo(cx + roadCurveVis, horizon);
            ctx.quadraticCurveTo(cx + (roadCurveVis * 0.3), h * 0.7, cx, h);
            ctx.stroke(); ctx.setLineDash([]);

            // =================================================================
            // 6. OBJETOS (Z-SORTING)
            // =================================================================
            let drawQueue = [];
            d.obs.forEach((o, i) => {
                o.z -= d.speed * 2.0; if(o.z < -300) { d.obs.splice(i,1); return; }
                drawQueue.push({ type: o.type, obj: o, z: o.z });
            });
            d.enemies.forEach((e, i) => {
                e.z -= (d.speed - e.speed) * 2.0; e.x += e.laneChange;
                if(e.x > 0.8) e.laneChange = -0.015; if(e.x < -0.8) e.laneChange = 0.015;
                if(e.z < -500 || e.z > 3000) { d.enemies.splice(i,1); return; }
                drawQueue.push({ type: 'kart', obj: e, z: e.z });
            });
            drawQueue.sort((a, b) => b.z - a.z);

            drawQueue.forEach(item => {
                const o = item.obj; const scale = 500 / (o.z + 500);
                if(scale > 0 && o.z < 2500) {
                    const screenX = cx + (d.curve * w * 0.8 * (o.z/2500)) + (o.x * w * 0.7 * scale);
                    const screenY = horizon + (30 * scale);
                    const size = (w * 0.18) * scale;
                    let hit = false;
                    if(o.z < 100 && o.z > -100 && Math.abs(d.x - o.x) < 0.45 && !o.hit) hit = true;

                    if(item.type === 'cone') {
                        ctx.fillStyle = '#ff6b6b'; ctx.beginPath(); ctx.moveTo(screenX, screenY - size);
                        ctx.lineTo(screenX - size*0.3, screenY); ctx.lineTo(screenX + size*0.3, screenY); ctx.fill();
                        ctx.fillStyle = '#fff'; ctx.fillRect(screenX - size*0.3, screenY-4*scale, size*0.6, 4*scale);
                        if(hit) { o.hit = true; d.speed *= 0.8; d.health -= 5; window.Sfx.crash(); window.Gfx.shake(10); d.obs.splice(d.obs.indexOf(o), 1); }
                    } 
                    else if(item.type === 'kart') {
                        const kScale = scale * w * 0.005;
                        ctx.save(); ctx.translate(screenX, screenY); ctx.scale(kScale, kScale);
                        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 10, 30, 8, 0, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle = o.color; ctx.fillRect(-20, -15, 40, 20);
                        ctx.fillStyle = '#222'; ctx.fillRect(-22, -5, 8, 15); ctx.fillRect(14, -5, 8, 15);
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 12, 0, Math.PI*2); ctx.fill();
                        ctx.restore();
                        if(hit) { o.hit = true; d.speed = 0; d.health -= 20; window.Sfx.crash(); window.Gfx.shake(30); o.z -= 500; }
                    }
                    else if(item.type === 'sign') {
                        const hSign = size * 2;
                        ctx.fillStyle = '#555'; ctx.fillRect(screenX-2*scale, screenY-hSign, 4*scale, hSign);
                        ctx.fillStyle = '#f1c40f'; ctx.beginPath(); 
                        ctx.moveTo(screenX - size*0.8, screenY - hSign); ctx.lineTo(screenX + size*0.8, screenY - hSign); ctx.lineTo(screenX, screenY - hSign - size); ctx.fill();
                        if(hit) { o.hit = true; d.speed *= 0.5; d.health -= 15; window.Sfx.crash(); window.Gfx.shake(20); d.obs.splice(d.obs.indexOf(o), 1); }
                    }
                }
            });

            // =================================================================
            // 7. PLAYER KART
            // =================================================================
            const carScale = w * 0.0055;
            const carX = cx + (d.x * w * 0.3);
            const carY = h * 0.88 + d.bounce;
            
            ctx.save(); ctx.translate(carX, carY); ctx.scale(carScale, carScale); ctx.rotate(d.visualTilt * 0.15);

            // Partículas
            if(Math.abs(d.steer) > 0.8 && d.speed > 5) {
                const color = (Math.floor(Date.now()/100)%2===0) ? '#ffcc00' : '#ff3300';
                if(Math.random()<0.5) { particles.push({x: carX - 30, y: carY+20, vx: -2, vy: 2, s: 5, c: color, l: 20}); particles.push({x: carX + 30, y: carY+20, vx: 2, vy: 2, s: 5, c: color, l: 20}); }
            }
            if(isOffRoad) particles.push({x: carX, y: carY+10, vx: (Math.random()-0.5)*5, vy: 5, s: 8, c: '#8B4513', l: 30});

            // Modelo do Kart (Retro)
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 25, 50, 15, 0, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#111'; ctx.fillRect(-50, 5, 25, 25); ctx.fillRect(25, 5, 25, 25);
            ctx.fillStyle = '#ddd'; ctx.fillRect(-45, 10, 15, 15); ctx.fillRect(30, 10, 15, 15);
            ctx.fillStyle = '#333'; ctx.fillRect(-25, 20, 50, 15);
            ctx.fillStyle = '#777'; ctx.beginPath(); ctx.arc(-15, 30, 6, 0, Math.PI*2); ctx.fill(); ctx.beginPath(); ctx.arc(15, 30, 6, 0, Math.PI*2); ctx.fill(); 
            const bodyGrad = ctx.createLinearGradient(-30, -20, 30, 20); bodyGrad.addColorStop(0, '#ff0000'); bodyGrad.addColorStop(1, '#cc0000');
            ctx.fillStyle = bodyGrad; ctx.beginPath(); ctx.moveTo(-20, -50); ctx.lineTo(20, -50); ctx.lineTo(35, 10); ctx.lineTo(40, 25); ctx.lineTo(-40, 25); ctx.lineTo(-35, 10); ctx.fill();
            ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(0, 0, 20, 15, 0, 0, Math.PI*2); ctx.fill();

            // Cockpit e Piloto
            ctx.save(); ctx.rotate(d.steer * 0.5); 
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -25, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ff0000'; ctx.font="bold 12px Arial"; ctx.textAlign="center"; ctx.fillText("M", 0, -32);
            ctx.fillStyle = '#333'; ctx.fillRect(-12, -28, 24, 8);
            ctx.restore();

            // Rodas Frente
            ctx.fillStyle = '#111';
            ctx.save(); ctx.translate(-35, -35); ctx.rotate(d.steer * 0.6); ctx.fillRect(-8, -10, 16, 20); ctx.restore();
            ctx.save(); ctx.translate(35, -35); ctx.rotate(d.steer * 0.6); ctx.fillRect(-8, -10, 16, 20); ctx.restore();
            ctx.restore();

            particles.forEach((p, i) => { p.x += p.vx; p.y += p.vy; p.l--; if(p.l <= 0) particles.splice(i, 1); else { ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI*2); ctx.fill(); } });

            // =================================================================
            // 8. HUD
            // =================================================================
            const hudX = w - 80; const hudY = h - 60;
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(hudX, hudY, 50, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.stroke();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = "bold 36px 'Russo One'"; ctx.fillText(Math.floor(d.speed * 20), hudX, hudY + 10);
            ctx.font = "12px Arial"; ctx.fillText("KM/H", hudX, hudY + 30);
            
            const hpW = w * 0.3;
            ctx.fillStyle = '#333'; ctx.fillRect(cx - hpW/2, 20, hpW, 10);
            const hpColor = d.health > 50 ? '#2ecc71' : '#e74c3c';
            ctx.fillStyle = hpColor; ctx.fillRect(cx - hpW/2 + 2, 22, (hpW-4) * (d.health/100), 6);

            // =================================================================
            // 9. RENDERIZAÇÃO DE INPUT PROGRESSIVO (GLOVE -> WHEEL)
            // =================================================================
            // Função auxiliar para desenhar uma luva flutuante
            const drawGlove = (x, y, label) => {
                const s = w * 0.08;
                const grad = ctx.createRadialGradient(x, y, s*0.2, x, y, s);
                grad.addColorStop(0, '#ffffff'); grad.addColorStop(1, '#cccccc');
                
                ctx.save();
                ctx.shadowColor = '#3498db'; ctx.shadowBlur = 15;
                ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, s, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#3498db'; ctx.beginPath(); ctx.arc(x, y, s*0.6, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font = "bold 24px Arial"; ctx.textAlign="center"; ctx.textBaseline="middle"; 
                ctx.fillText(label, x, y);
                ctx.restore();
            };

            if(d.inputState === 1) {
                // Estado: UMA MÃO (Mostra luva individual)
                if(d.hands.left) drawGlove(d.hands.left.x, d.hands.left.y, "L");
                if(d.hands.right) drawGlove(d.hands.right.x, d.hands.right.y, "R");
                
                // Texto de ajuda
                ctx.fillStyle = "#fff"; ctx.font = "bold 24px Arial"; ctx.textAlign = "center";
                ctx.shadowColor = "black"; ctx.shadowBlur = 5;
                ctx.fillText("USE AS DUAS MÃOS!", cx, h * 0.2);
                ctx.shadowBlur = 0;
            }
            else if (d.inputState === 2 && d.wheel.opacity > 0.05) {
                // Estado: DUAS MÃOS (VOLANTE ESPORTIVO COMPLETO)
                ctx.save();
                ctx.globalAlpha = d.wheel.opacity;
                ctx.translate(d.wheel.x, d.wheel.y);
                ctx.rotate(d.wheel.angle); // Usa o ângulo suavizado
                
                const r = d.wheel.radius;

                // Sombra Profunda (3D)
                ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 30; ctx.shadowOffsetY = 15;

                // Aro Externo (Branco Lustroso)
                ctx.fillStyle = '#f5f5f5'; 
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.fill();
                
                // Aro Interno (Buraco)
                ctx.globalCompositeOperation = 'destination-out';
                ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI*2); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';

                // Bordas de Acabamento
                ctx.strokeStyle = '#ccc'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI*2); ctx.stroke();
                ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI*2); ctx.stroke();

                // Miolo Central (Preto Esportivo)
                ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
                ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, Math.PI*2); ctx.fill();

                // Hastes (Spokes) Racing
                ctx.fillStyle = '#ddd';
                // Haste Esquerda
                ctx.beginPath(); ctx.moveTo(-r*0.2, 0); ctx.lineTo(-r*0.72, -r*0.1); ctx.lineTo(-r*0.72, r*0.1); ctx.lineTo(-r*0.2, 0); ctx.fill();
                // Haste Direita
                ctx.beginPath(); ctx.moveTo(r*0.2, 0); ctx.lineTo(r*0.72, -r*0.1); ctx.lineTo(r*0.72, r*0.1); ctx.lineTo(r*0.2, 0); ctx.fill();
                // Haste Baixo (Vazada)
                ctx.fillStyle = '#ccc';
                ctx.beginPath(); ctx.moveTo(-r*0.1, r*0.1); ctx.lineTo(r*0.1, r*0.1); ctx.lineTo(0, r*0.7); ctx.fill();

                // GRIPS (Pegada Azul Antiderrapante)
                ctx.fillStyle = '#3498db';
                ctx.beginPath(); ctx.arc(-r*0.85, 0, r*0.12, 0, Math.PI*2); ctx.fill(); // Esq
                ctx.beginPath(); ctx.arc(r*0.85, 0, r*0.12, 0, Math.PI*2); ctx.fill();  // Dir

                // SPORTY RED STRIPE (Marcador de Centro - 12 horas)
                ctx.fillStyle = '#e74c3c';
                ctx.beginPath();
                ctx.moveTo(-r*0.06, -r); ctx.lineTo(r*0.06, -r);
                ctx.lineTo(r*0.04, -r*0.7); ctx.lineTo(-r*0.04, -r*0.7);
                ctx.fill();

                // Logotipo
                ctx.fillStyle = '#fff'; ctx.font = `bold ${r*0.12}px Arial`; 
                ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
                ctx.fillText("Wii", 0, 0);

                ctx.restore();
            }

            if(d.health <= 0) window.System.gameOver("MOTOR QUEBROU!");

            return d.score;
        }
    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart', '🏎️', Logic, {camOpacity: 0.4, showWheel: false});
    }
})();
