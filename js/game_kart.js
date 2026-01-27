/**
 * =============================================================================
 * OTTO KART GP - ENGINE "MODE-7" (VERSÃO FINAL COMERCIAL)
 * =============================================================================
 * ARQUITETURA: Segment-based Pseudo-3D (Estilo Super Mario Kart / OutRun)
 * CORREÇÕES:
 * 1. Física: Carro vira trocando sprites (Yaw) e não girando a tela (Roll).
 * 2. Pista: Geometria real com curvas em S, colinas e zebras.
 * 3. Visual: Sprites Pixel Art desenhados proceduralmente no Canvas.
 * =============================================================================
 */

(function() {
    // --- CONSTANTES DE ENGENHARIA (TUNING) ---
    const CONF = {
        FPS: 60,
        FOV: 100,
        CAMERA_HEIGHT: 1000,
        CAMERA_DEPTH: 0.84,    // Distância da câmera
        SEGMENT_LENGTH: 200,   // Resolução da pista
        RUMBLE_LENGTH: 3,      // Frequência das zebras
        ROAD_WIDTH: 2000,      // Largura da pista
        LANES: 3,              // Faixas
        DRAW_DISTANCE: 300,    // Quantos segmentos desenhar
        
        // Física do Kart (150cc)
        MAX_SPEED: 12000,      
        ACCEL: 40,             
        BREAKING: -100,        
        DECEL: -20,            
        OFF_ROAD_DECEL: -180,  // Penalidade na grama
        OFF_ROAD_LIMIT: 16000, 
        CENTRIFUGAL: 0.35      // Força G nas curvas
    };

    // --- PALETA DE CORES NINTENDO ---
    const COLORS = {
        SKY:  ['#0099CC', '#99CCFF'], // Degradê Azul Mario
        ROAD: {
            LIGHT: { road: '#6B6B6B', grass: '#10AA10', rumble: '#FFFFFF', lane: '#CCCCCC' },
            DARK:  { road: '#636363', grass: '#009A00', rumble: '#CC0000', lane: '#000000' } // Zebra Vermelha/Branca
        }
    };

    const Logic = {
        // Estado do Mundo
        position: 0,        // Posição Z absoluta
        playerX: 0,         // Posição X relativa (-1 a 1)
        playerZ: 0,         // Offset da câmera
        speed: 0,           // Velocidade atual
        
        // Input & Controle
        steer: 0,           // Valor do volante (-1 a 1)
        gas: false,         // Acelerador
        
        // Geometria
        segments: [],       // Array de segmentos da pista
        trackLength: 0,     // Comprimento total
        
        // Entidades
        cars: [],           // Oponentes
        
        // Gameplay
        lap: 1,
        totalLaps: 3,
        rank: 8,
        time: 0,

        // --- INICIALIZAÇÃO ---
        init: function() {
            this.position = 0;
            this.playerX = 0;
            this.speed = 0;
            this.steer = 0;
            this.lap = 1;
            this.time = 0;
            
            // Construir Pista e Carros
            this.resetRoad();
            this.createOpponents();
            
            window.System.msg("LARGADA!");
            window.Sfx.play(100, 'sawtooth', 1.5, 0.3); // Ronco do motor
        },

        // --- GERADOR DE PISTA (GEOMETRIA) ---
        resetRoad: function() {
            this.segments = [];
            
            // Função auxiliar para adicionar um segmento
            const addSegment = (curve, y) => {
                const n = this.segments.length;
                this.segments.push({
                    index: n,
                    p1: { world: { y: this.getLastY(), z:  n   * CONF.SEGMENT_LENGTH }, camera: {}, screen: {} },
                    p2: { world: { y: y,       z: (n+1) * CONF.SEGMENT_LENGTH }, camera: {}, screen: {} },
                    curve: curve,
                    sprites: [],
                    cars: [],
                    color: Math.floor(n/CONF.RUMBLE_LENGTH)%2 ? COLORS.ROAD.DARK : COLORS.ROAD.LIGHT
                });
            };

            // Funções de construção de trechos
            const addRoad = (enter, hold, leave, curve, y) => {
                const startY = this.getLastY();
                const endY = startY + (y * CONF.SEGMENT_LENGTH);
                const total = enter + hold + leave;
                for(let i=0; i<enter; i++) addSegment(this.easeIn(0, curve, i/enter), this.easeInOut(startY, endY, i/total));
                for(let i=0; i<hold; i++)  addSegment(curve, this.easeInOut(startY, endY, (enter+i)/total));
                for(let i=0; i<leave; i++) addSegment(this.easeInOut(curve, 0, i/leave), this.easeInOut(startY, endY, (enter+hold+i)/total));
            };
            
            const addStraight = (num) => addRoad(num, num, num, 0, 0);
            const addCurve = (num, curve) => addRoad(num, num, num, curve, 0);
            const addHill = (num, height) => addRoad(num, num, num, 0, height);
            const addSCurve = () => { addCurve(30, 3); addCurve(30, -3); addCurve(30, 3); addCurve(30, -3); };

            // === DESIGN DA PISTA (MUSHROOM CUP) ===
            addStraight(50);              // Reta de Largada
            addCurve(50, 4);              // Curva Longa Direita
            addHill(60, 60);              // Subida Grande
            addCurve(40, -4);             // Curva Esquerda no Topo
            addHill(60, -60);             // Descida Rápida
            addStraight(30);              // Reta
            addSCurve();                  // Chicane Técnica
            addCurve(60, 5);              // Curva Fechada Direita
            addHill(90, 40);              // Subida Suave
            addCurve(50, -5);             // Grampo Esquerda
            addStraight(80);              // Reta Final

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
            
            // === DECORAÇÃO (SPRITES) ===
            this.segments.forEach((s, i) => {
                // Árvores e Tubos
                if (i % 20 === 0) {
                    const type = Math.random() > 0.7 ? 'pipe' : 'tree';
                    const offset = 2 + Math.random();
                    s.sprites.push({ source: type, offset: -offset }); // Esquerda
                    s.sprites.push({ source: type, offset: offset });  // Direita
                }
                // Moedas
                if (i % 40 === 0 && i > 50) {
                    s.sprites.push({ source: 'coin', offset: (Math.random()*2)-1 });
                }
            });
        },

        getLastY: function() { return (this.segments.length === 0) ? 0 : this.segments[this.segments.length-1].p2.world.y; },
        easeIn: (a,b,p) => a + (b-a)*Math.pow(p,2),
        easeInOut: (a,b,p) => a + (b-a)*((-Math.cos(p*Math.PI)/2) + 0.5),
        percentRemaining: (n, total) => (n%total)/total,
        interpolate: (a,b,p) => a + (b-a)*p,

        // --- GERAÇÃO DE OPONENTES ---
        createOpponents: function() {
            this.cars = [];
            const names = ['LUIGI', 'PEACH', 'BOWSER', 'TOAD', 'YOSHI', 'DK', 'WARIO'];
            const colors = ['#2ecc71', '#ff69b4', '#f39c12', '#e74c3c', '#27ae60', '#8e44ad', '#f1c40f'];
            
            for(let i=0; i<names.length; i++) {
                this.cars.push({
                    offset: (Math.random() * 0.8) * (i%2?1:-1), 
                    z: (this.trackLength - (i+1)*800) % this.trackLength, // Espalhados
                    speed: 0,
                    maxSpeed: CONF.MAX_SPEED * (0.85 + Math.random()*0.12),
                    name: names[i],
                    color: colors[i]
                });
            }
        },

        // =================================================================
        // LOOP LÓGICO PRINCIPAL (UPDATE)
        // =================================================================
        update: function(ctx, w, h, pose) {
            this.time++;
            
            // 1. INPUT (Pose Detection)
            let targetSteer = 0;
            if(pose) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(lw && lw.score > 0.4 && rw && rw.score > 0.4) {
                    const dx = rw.x - lw.x;
                    const dy = rw.y - lw.y;
                    const angle = Math.atan2(dy, dx);
                    
                    // Desenha HUD Volante
                    this.drawWheelUI(ctx, w, h, angle);
                    
                    // Lógica de Volante
                    targetSteer = angle * 2.5; 
                    if(Math.abs(targetSteer) < 0.1) targetSteer = 0; // Deadzone
                    targetSteer = Math.max(-1.5, Math.min(1.5, targetSteer));
                    this.gas = true; 
                } else {
                    this.gas = false;
                }
            }
            
            // Suavização do volante (Inércia)
            this.steer = this.steer + (targetSteer - this.steer) * 0.1;

            // 2. FÍSICA DO CARRO
            const maxSpeed = (Math.abs(this.playerX) > 1.2) ? CONF.MAX_SPEED/4 : CONF.MAX_SPEED; // Grama = Lento
            const accel = (this.gas) ? CONF.ACCEL : CONF.DECEL;
            
            this.speed = Math.max(0, Math.min(this.speed + accel, maxSpeed));
            
            // Movimento Lateral (Derrapagem + Força Centrífuga)
            const segIdx = Math.floor(this.position / CONF.SEGMENT_LENGTH) % this.segments.length;
            const playerSegment = this.segments[segIdx];
            const speedPct = this.speed / CONF.MAX_SPEED;
            
            // A curva da pista te empurra para o lado oposto (Física Real)
            this.playerX = this.playerX - (this.steer * speedPct * 0.06) - (playerSegment.curve * speedPct * CONF.CENTRIFUGAL * 0.05);
            this.playerX = Math.max(-2.5, Math.min(2.5, this.playerX)); // Paredes invisíveis

            // Avanço Z
            this.position += this.speed;
            while (this.position >= this.trackLength) {
                this.position -= this.trackLength;
                this.lap++;
                window.Sfx.play(800, 'square', 0.2, 0.1); // Som de volta
                if(this.lap > CONF.totalLaps) window.System.gameOver("FIM DA CORRIDA!");
            }

            // 3. IA DOS OPONENTES
            this.cars.forEach(car => {
                const carSegIdx = Math.floor(car.z / CONF.SEGMENT_LENGTH) % this.segments.length;
                const carSeg = this.segments[carSegIdx];
                
                // IA tenta ficar no centro da pista
                if(car.speed < car.maxSpeed) car.speed += CONF.ACCEL * 0.6;
                car.offset -= carSeg.curve * 0.01 * (car.speed/CONF.MAX_SPEED); // Compensa curva
                car.z += car.speed;
                
                // Loop
                if(car.z >= this.trackLength) car.z -= this.trackLength;
                if(car.z < 0) car.z += this.trackLength;
                
                // Colisão Player vs IA
                // Se o player alcançar a IA (Z relativo)
                let carRelZ = car.z - this.position;
                if (carRelZ < -this.trackLength/2) carRelZ += this.trackLength;
                if (carRelZ > this.trackLength/2) carRelZ -= this.trackLength;

                if(Math.abs(carRelZ) < CONF.SEGMENT_LENGTH && Math.abs(car.offset - this.playerX) < 0.3) {
                    this.speed *= 0.6; // Impacto
                    window.Sfx.play(100, 'sawtooth', 0.1, 0.5);
                    window.Gfx.shake(10);
                }
            });

            // 4. RENDERIZAÇÃO
            // Fundo
            this.drawBackground(ctx, w, h, playerSegment.curve);
            
            // Pista e Sprites
            this.render3D(ctx, w, h);
            
            // Jogador (Mario) - CORRIGIDO: Desenha com rotação de sprite, não de tela
            this.drawPlayerSprite(ctx, w, h, this.steer);
            
            // HUD
            this.drawHUD(ctx, w, h);

            return Math.floor(this.speed/100);
        },

        // --- ENGINE DE RENDERIZAÇÃO (ALGORITMO DE SCANLINE) ---
        render3D: function(ctx, w, h) {
            const baseSegment = this.segments[Math.floor(this.position / CONF.SEGMENT_LENGTH) % this.segments.length];
            const basePercent = this.percentRemaining(this.position, CONF.SEGMENT_LENGTH);
            const playerY = this.interpolate(baseSegment.p1.world.y, baseSegment.p2.world.y, basePercent);
            
            let maxY = h; // Buffer de horizonte (corte)
            let x = 0;
            let dx = - (baseSegment.curve * basePercent);

            // Projetar segmentos (do próximo até o horizonte)
            for(let n = 0; n < 300; n++) {
                const segment = this.segments[(baseSegment.index + n) % this.segments.length];
                
                // Offset de câmera Z para loop infinito
                let cameraZ = (n * CONF.SEGMENT_LENGTH) - (basePercent * CONF.SEGMENT_LENGTH);
                cameraZ = Math.max(1, cameraZ); // Evita divisão por zero

                // Curvatura acumulada
                x += dx;
                dx += segment.curve;

                // Projeção
                segment.p1.camera.x = this.playerX * CONF.ROAD_WIDTH - x;
                segment.p1.camera.y = CONF.CAMERA_HEIGHT + playerY - segment.p1.world.y; // Altura relativa
                segment.p1.camera.z = cameraZ;
                segment.p1.screen.scale = CONF.FOV / cameraZ;
                segment.p1.screen.x = Math.round((w/2) + (segment.p1.screen.scale * segment.p1.camera.x  * w/2));
                segment.p1.screen.y = Math.round((h/2) + (segment.p1.screen.scale * segment.p1.camera.y  * h/2));
                segment.p1.screen.w = Math.round(     (segment.p1.screen.scale * CONF.ROAD_WIDTH   * w/2));

                // Ponto 2 (Fim do segmento) é o Ponto 1 do próximo
                const nextSeg = this.segments[(segment.index + 1) % this.segments.length];
                const cameraZ2 = cameraZ + CONF.SEGMENT_LENGTH;
                const scale2 = CONF.FOV / cameraZ2;
                const screenY2 = Math.round((h/2) + (scale2 * (CONF.CAMERA_HEIGHT + playerY - nextSeg.p1.world.y) * h/2));

                // Culling (Se estiver abaixo da tela ou acima do horizonte desenhado)
                if (segment.p1.screen.y >= maxY || cameraZ <= CONF.CAMERA_DEPTH) continue;

                // Desenha Segmento
                this.drawSegment(ctx, w, segment.p1.screen.y, screenY2, segment.p1.screen.w, segment.color);
                
                maxY = screenY2; // Atualiza horizonte clip

                // --- SPRITES (BILLBOARDS) ---
                const spriteScale = segment.p1.screen.scale;
                const spriteY = segment.p1.screen.y;

                // 1. Cenário
                for(let i = 0 ; i < segment.sprites.length ; i++) {
                    const sprite = segment.sprites[i];
                    const spriteX = segment.p1.screen.x + (spriteScale * sprite.offset * CONF.ROAD_WIDTH * w/2);
                    this.drawSprite(ctx, sprite.source, spriteX, spriteY, spriteScale, sprite.offset < 0);
                }

                // 2. Oponentes
                for(let i = 0 ; i < segment.cars.length ; i++) {
                    const car = segment.cars[i];
                    const carX = segment.p1.screen.x + (spriteScale * car.offset * CONF.ROAD_WIDTH * w/2);
                    this.drawOpponentKart(ctx, carX, spriteY, spriteScale, car.color);
                }
            }
        },

        drawSegment: function(ctx, w, y1, y2, width, color) {
            // Grama
            ctx.fillStyle = color.grass;
            ctx.fillRect(0, y2, w, y1 - y2);
            
            // Pista
            ctx.fillStyle = color.road;
            ctx.beginPath();
            ctx.moveTo(w/2 - width, y1);
            ctx.lineTo(w/2 + width, y1);
            ctx.lineTo(w/2 + width, y2); // Simplificado
            ctx.lineTo(w/2 - width, y2);
            ctx.fill();
            
            // Zebras
            const rumbleW = width * 0.15;
            ctx.fillStyle = color.rumble;
            ctx.beginPath();
            ctx.fillRect(w/2 - width - rumbleW, y2, rumbleW, y1-y2);
            ctx.fillRect(w/2 + width, y2, rumbleW, y1-y2);

            // Faixas
            if (color.lane) {
                ctx.fillStyle = color.lane;
                const laneW = width * 0.02;
                ctx.fillRect(w/2 - width*0.33 - laneW/2, y2, laneW, y1-y2);
                ctx.fillRect(w/2 + width*0.33 - laneW/2, y2, laneW, y1-y2);
            }
        },

        // --- RENDERIZADOR DE SPRITES PROCEDURAIS (PIXEL ART VIA CÓDIGO) ---
        drawSprite: function(ctx, type, x, y, scale, flip) {
            const s = scale * w * 2.5; // Tamanho base
            if (s < 2) return;

            ctx.save();
            ctx.translate(x, y);
            
            if (type === 'tree') {
                // Árvore Mario World
                ctx.fillStyle = '#5C4033'; ctx.fillRect(-s*0.1, -s, s*0.2, s); // Tronco
                ctx.fillStyle = '#006400'; 
                ctx.beginPath(); ctx.arc(0, -s*1.2, s*0.5, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#008000'; 
                ctx.beginPath(); ctx.arc(-s*0.2, -s*1.3, s*0.2, 0, Math.PI*2); ctx.fill();
            } 
            else if (type === 'pipe') {
                // Tubo Verde
                ctx.fillStyle = '#00aa00'; 
                ctx.fillRect(-s*0.25, -s*0.8, s*0.5, s*0.8);
                ctx.fillStyle = '#008800'; 
                ctx.fillRect(-s*0.28, -s*0.8, s*0.56, s*0.25); // Borda topo
                ctx.strokeRect(-s*0.28, -s*0.8, s*0.56, s*0.25);
            }
            else if (type === 'coin') {
                // Moeda
                ctx.fillStyle = '#FFD700';
                ctx.beginPath(); ctx.ellipse(0, -s*0.2, s*0.15, s*0.2, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#FFF';
                ctx.font = `bold ${s*0.2}px Arial`; ctx.textAlign='center'; ctx.fillText('$', 0, -s*0.15);
            }
            
            ctx.restore();
        },

        // --- DESENHO DO JOGADOR (MARIO KART STYLE) ---
        drawPlayerSprite: function(ctx, w, h, steer) {
            const x = w/2;
            const y = h - 20;
            const s = w * 0.0003; // Escala do player
            
            // Determina Frame de Animação baseado no volante
            // 0 = Reto, 1 = Leve Esq, 2 = Forte Esq, etc.
            let turnFrame = 0;
            if (steer < -0.3) turnFrame = -1;
            if (steer < -0.7) turnFrame = -2;
            if (steer > 0.3) turnFrame = 1;
            if (steer > 0.7) turnFrame = 2;

            ctx.save();
            ctx.translate(x, y);
            ctx.scale(s*800, s*800); // Normaliza tamanho

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(0, -5, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Lógica de Sprites Diferentes para cada ângulo
            if (Math.abs(turnFrame) === 2) {
                // CURVA FORTE (Mostra lateral)
                const dir = Math.sign(turnFrame); // -1 ou 1
                ctx.scale(dir, 1); // Espelha se for para o outro lado
                
                // Pneus (Perfil)
                ctx.fillStyle = '#222';
                ctx.fillRect(-50, -40, 20, 40); // Traseiro
                ctx.fillRect(30, -40, 20, 40);  // Dianteiro
                
                // Chassis (Perfil)
                ctx.fillStyle = '#E70000'; // Vermelho Mario
                ctx.beginPath();
                ctx.moveTo(-40, -30); ctx.lineTo(40, -20); ctx.lineTo(45, 0); ctx.lineTo(-45, 0);
                ctx.fill();
                
                // Piloto (Perfil)
                ctx.fillStyle = '#0000FF'; // Azul
                ctx.fillRect(-10, -50, 20, 30); // Corpo
                ctx.fillStyle = '#E70000';
                ctx.fillRect(0, -45, 20, 10); // Braço esticado
                ctx.fillStyle = '#FFCCAA'; // Pele
                ctx.beginPath(); ctx.arc(5, -65, 15, 0, Math.PI*2); ctx.fill(); // Cabeça
                ctx.fillStyle = '#E70000';
                ctx.beginPath(); ctx.arc(5, -70, 16, Math.PI, 0); ctx.fill(); // Boné
            } 
            else {
                // RETO OU LEVE (Traseira)
                // Pneus
                ctx.fillStyle = '#222';
                ctx.fillRect(-60, -30, 25, 30);
                ctx.fillRect(35, -30, 25, 30);
                
                // Motor/Escapamento
                ctx.fillStyle = '#444';
                ctx.fillRect(-30, -25, 60, 20);
                ctx.fillStyle = '#FFD700';
                ctx.beginPath(); ctx.arc(-20, -20, 5, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -20, 5, 0, Math.PI*2); ctx.fill();

                // Corpo
                ctx.fillStyle = '#E70000';
                ctx.fillRect(-35, -45, 70, 25);
                
                // Piloto (Costas)
                ctx.fillStyle = '#0000FF'; // Macacão
                ctx.beginPath(); ctx.ellipse(0, -50, 20, 25, 0, 0, Math.PI*2); ctx.fill();
                
                ctx.fillStyle = '#E70000'; // Boné
                ctx.beginPath(); ctx.arc(0, -75, 18, 0, Math.PI*2); ctx.fill();
                
                // Inclinação Leve (se turnFrame for 1 ou -1)
                if(turnFrame !== 0) {
                    ctx.fillStyle = '#FFF'; // Luva visível
                    const lx = turnFrame === 1 ? 30 : -30;
                    ctx.beginPath(); ctx.arc(lx, -60, 8, 0, Math.PI*2); ctx.fill();
                }
            }

            ctx.restore();
        },

        drawOpponentKart: function(ctx, x, y, scale, color) {
            const s = scale * w * 2.5;
            if(s < 2) return;
            
            ctx.save();
            ctx.translate(x, y);
            
            // Kart Genérico (Low Poly 2D)
            ctx.fillStyle = '#222'; // Pneus
            ctx.fillRect(-s*0.3, -s*0.2, s*0.15, s*0.2);
            ctx.fillRect(s*0.15, -s*0.2, s*0.15, s*0.2);
            
            ctx.fillStyle = color; // Cor do inimigo
            ctx.fillRect(-s*0.2, -s*0.3, s*0.4, s*0.25);
            
            ctx.fillStyle = '#fff'; // Capacete
            ctx.beginPath(); ctx.arc(0, -s*0.45, s*0.1, 0, Math.PI*2); ctx.fill();
            
            ctx.restore();
        },

        drawBackground: function(ctx, w, h, curve) {
            // Céu Azul
            const grad = ctx.createLinearGradient(0, 0, 0, h/2);
            grad.addColorStop(0, COLORS.SKY[0]); grad.addColorStop(1, COLORS.SKY[1]);
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
            
            // Montanhas (Parallax real)
            // A posição das montanhas move oposta à curva
            const mountainOffset = curve * 200; 
            
            ctx.fillStyle = '#1D8348'; // Verde Escuro
            ctx.beginPath();
            ctx.moveTo(0, h/2);
            for(let i=0; i<=w; i+=50) {
                // Gera montanhas processuais baseadas no X
                const hM = Math.sin((i + mountainOffset) * 0.01) * 50 + 30;
                ctx.lineTo(i, h/2 - hM);
            }
            ctx.lineTo(w, h/2);
            ctx.fill();
        },

        drawWheelUI: function(ctx, w, h, angle) {
            const x = w - 80; const y = 80;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            
            ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
            ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.arc(0,0,40,0,Math.PI*2); ctx.stroke();
            
            // Marcador
            ctx.fillStyle = '#E70000'; ctx.fillRect(-5, -40, 10, 15);
            ctx.restore();
        },

        drawHUD: function(ctx, w, h) {
            const speedKmh = Math.floor(this.speed / 60);
            
            ctx.font = "bold 40px 'Russo One'";
            ctx.textAlign = "right";
            ctx.fillStyle = "#fff";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3;
            ctx.strokeText(speedKmh + " km/h", w-20, h-20);
            ctx.fillText(speedKmh + " km/h", w-20, h-20);
            
            ctx.textAlign = "left";
            ctx.strokeText("LAP " + this.lap + "/3", 20, 50);
            ctx.fillText("LAP " + this.lap + "/3", 20, 50);
        }
    };

    window.System.registerGame('kart', 'Otto Kart GP', '🏎️', Logic, {camOpacity: 0.3, showWheel: false});
})();
