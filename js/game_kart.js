/**
 * =============================================================================
 * OTTO KART GP - "PROJECT MODE-7" ENGINE (COMMERCIAL GRADE)
 * =============================================================================
 * ARQUITETURA: Segment-based Pseudo-3D (Estilo SNES/Genesis)
 * RENDERIZAÇÃO: Pixel Art Procedural (Mario/Luigi/Peach)
 * FÍSICA: Vetorial com Força Centrífuga e Colinas
 * =============================================================================
 */

(function() {
    // --- CONSTANTES DE TUNAGEM (GAME DESIGN) ---
    const CONF = {
        FPS: 60,
        FOV: 100,
        CAMERA_HEIGHT: 1000,
        CAMERA_DEPTH: 0.8,     // Distância da câmera atrás do player
        SEGMENT_LENGTH: 200,   // Comprimento de cada pedaço da pista
        RUMBLE_LENGTH: 3,      // Tamanho das zebras
        ROAD_WIDTH: 2000,      // Largura da pista
        LANES: 3,
        MAX_SPEED: 12000,      // Velocidade máxima (150cc)
        ACCEL: 40,             // Aceleração
        BREAKING: -100,        // Freio
        DECEL: -20,            // Desaceleração natural
        OFF_ROAD_DECEL: -150,  // Grama
        OFF_ROAD_LIMIT: 16000, // Limite fora da pista
        CENTRIFUGAL: 0.3       // Força que joga pra fora na curva
    };

    // --- CORES DA NINTENDO ---
    const PALETTE = {
        SKY: ['#7ec0ee', '#4a80ba'], // Degradê Céu
        GRASS: { light: '#10a010', dark: '#009000' },
        ROAD:  { light: '#666666', dark: '#606060' },
        RUMBLE:{ light: '#ffffff', dark: '#cc0000' }, // Zebras Branca/Vermelha
        LANE:  { light: '#cccccc', dark: '#666666' }  // Faixas
    };

    const Logic = {
        // Estado do Jogo
        position: 0,        // Z absoluto do jogador
        playerX: 0,         // X relativo (-1 a 1)
        playerZ: 0,         // Offset da câmera
        speed: 0,           // Velocidade atual
        
        // Input
        steer: 0,           // Valor do volante (-1 a 1)
        
        // Mundo
        segments: [],       // Array da pista
        trackLength: 0,     // Comprimento total
        cars: [],           // Oponentes
        
        // Assets (Sprites em memória)
        sprites: [],        // Árvores, moedas, tubos

        // Gameplay
        lap: 1,
        totalLaps: 3,
        rank: 8,
        
        init: function() {
            this.resetVariables();
            this.buildTrack();
            this.createOpponents();
            window.System.msg("LARGADA!");
            window.Sfx.play(100, 'square', 0.5, 0.2); // Som motor
        },

        resetVariables: function() {
            this.position = 0;
            this.playerX = 0;
            this.speed = 0;
            this.steer = 0;
            this.lap = 1;
        },

        // --- GERADOR DE PISTA (GEOMETRIA) ---
        buildTrack: function() {
            this.segments = [];
            
            // Helpers para criar partes da pista
            const addSegment = (curve, y) => {
                const n = this.segments.length;
                this.segments.push({
                    index: n,
                    p1: { world: { y: this.getLastY(), z:  n   * CONF.SEGMENT_LENGTH }, camera: {}, screen: {} },
                    p2: { world: { y: y,       z: (n+1) * CONF.SEGMENT_LENGTH }, camera: {}, screen: {} },
                    curve: curve,
                    sprites: [],
                    cars: [],
                    color: Math.floor(n/CONF.RUMBLE_LENGTH)%2 ? 'dark' : 'light'
                });
            };

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
            const addSCurve = (num) => { addRoad(num,num,num, -2, 0); addRoad(num,num,num, 2, 0); };

            // LAYOUT DA PISTA (Mushroom Cup Style)
            addStraight(50); // Largada
            addCurve(60, 2); // Curva Direita Longa
            addHill(60, 40); // Subida
            addCurve(40, -2); // Curva Esquerda no topo
            addHill(60, -40); // Descida
            addStraight(30);
            addSCurve(40);    // Chicane
            addCurve(80, 3);  // Curva fechada final
            addStraight(100); // Reta final

            this.trackLength = this.segments.length * CONF.SEGMENT_LENGTH;
            
            // Adicionar Sprites (Árvores e Tubos)
            this.segments.forEach((seg, i) => {
                if(i % 20 === 0 && Math.random() > 0.5) {
                    seg.sprites.push({ type: 'tree', offset: -2.5 }); // Arvore esq
                }
                if(i % 35 === 0 && Math.random() > 0.5) {
                    seg.sprites.push({ type: 'pipe', offset: 2.0 }); // Tubo dir
                }
                if(i % 15 === 0 && i > 50) {
                    seg.sprites.push({ type: 'coin', offset: (Math.random()*3)-1.5 });
                }
            });
        },

        getLastY: function() {
            return (this.segments.length === 0) ? 0 : this.segments[this.segments.length-1].p2.world.y;
        },

        createOpponents: function() {
            this.cars = [];
            const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6', '#34495e', '#e67e22', '#1abc9c'];
            const names = ['MARIO', 'LUIGI', 'WARIO', 'WALUIGI', 'TOAD', 'DAISY', 'YOSHI'];
            
            for(let i=0; i<7; i++) {
                this.cars.push({
                    offset: (Math.random() * 0.8) * (Math.random() > 0.5 ? 1 : -1), // Posição lateral
                    z: 500 + (i * 2000), // Espalhados na largada
                    speed: 0,
                    maxSpeed: CONF.MAX_SPEED * (0.85 + Math.random()*0.1), // Velocidade variada
                    color: colors[i],
                    name: names[i]
                });
            }
        },

        // --- MATH HELPERS ---
        easeIn: (a,b,p) => a + (b-a)*Math.pow(p,2),
        easeInOut: (a,b,p) => a + (b-a)*((-Math.cos(p*Math.PI)/2) + 0.5),
        percentRemaining: (n, total) => (n%total)/total,
        interpolate: (a,b,p) => a + (b-a)*p,

        // --- LOOP PRINCIPAL ---
        update: function(ctx, w, h, pose) {
            // 1. INPUT (VOLANTE VIRTUAL)
            let steerIntent = 0;
            if(pose) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(lw && lw.score > 0.4 && rw && rw.score > 0.4) {
                    // Ângulo entre os pulsos
                    const dx = rw.x - lw.x;
                    const dy = rw.y - lw.y;
                    const angle = Math.atan2(dy, dx);
                    
                    // Desenha HUD Volante
                    this.drawWheelUI(ctx, w, h, angle);
                    
                    // Mapeia para direção (-1 a 1)
                    steerIntent = angle * 2.5; 
                    if(Math.abs(steerIntent) < 0.1) steerIntent = 0; // Deadzone
                    steerIntent = Math.max(-1.5, Math.min(1.5, steerIntent));
                }
            }
            
            // Suaviza volante (Inércia)
            this.steer += (steerIntent - this.steer) * 0.1;

            // 2. FÍSICA DO CARRO
            const maxSpeed = (this.playerX < -1 || this.playerX > 1) ? CONF.MAX_SPEED/4 : CONF.MAX_SPEED; // Fora da pista = lento
            const accel = (this.speed < maxSpeed) ? CONF.ACCEL : CONF.OFF_ROAD_DECEL;
            
            // Aceleração automática se estiver com volante ativo (Auto-gas)
            if(steerIntent !== 0 || this.speed > 0) {
                this.speed += accel;
            } else {
                this.speed += CONF.DECEL;
            }
            
            this.speed = Math.max(0, Math.min(this.speed, maxSpeed));

            // Movimento Lateral
            const segIdx = Math.floor(this.position / CONF.SEGMENT_LENGTH) % this.segments.length;
            const playerSegment = this.segments[segIdx];
            
            // Curva joga pra fora (Centrífuga)
            const speedPct = this.speed / CONF.MAX_SPEED;
            const dx = (this.steer * speedPct * 0.04) - (playerSegment.curve * speedPct * CONF.CENTRIFUGAL * 0.01);
            
            this.playerX += dx;
            this.playerX = Math.max(-2, Math.min(2, this.playerX)); // Limite do mundo

            // Avanço Z
            this.position += this.speed;
            while (this.position >= this.trackLength) {
                this.position -= this.trackLength;
                this.lap++;
                window.System.msg(`VOLTA ${this.lap}/3`);
                window.Sfx.play(600, 'sine', 0.2, 0.1);
            }

            // 3. IA DOS OPONENTES
            this.cars.forEach(car => {
                // IA Básica: Segue em frente e acelera
                if(car.speed < car.maxSpeed) car.speed += CONF.ACCEL * 0.8;
                car.z += car.speed;
                
                // Loop da pista
                if(car.z >= this.trackLength) car.z -= this.trackLength;
                if(car.z < 0) car.z += this.trackLength;
                
                // IA tenta ficar na pista
                const carSegIdx = Math.floor(car.z / CONF.SEGMENT_LENGTH) % this.segments.length;
                const carSeg = this.segments[carSegIdx];
                car.offset -= carSeg.curve * 0.01 * (car.speed/CONF.MAX_SPEED);
                
                // Inserir carro no segmento para renderização
                // Remove do segmento antigo (jeito simples: limpar array cars do segmento)
            });
            
            // Limpa carros dos segmentos e reinsere
            this.segments.forEach(s => s.cars = []);
            this.cars.forEach(car => {
                const idx = Math.floor(car.z / CONF.SEGMENT_LENGTH) % this.segments.length;
                this.segments[idx].cars.push(car);
            });

            // 4. RENDERIZAÇÃO
            
            // Fundo (Parallax)
            const bgOffset = playerSegment.curve * speedPct;
            this.drawBackground(ctx, w, h, bgOffset);

            // Pista
            this.renderTrack(ctx, w, h);

            // Jogador (Mario)
            this.drawPlayerKart(ctx, w, h, this.steer);

            // HUD
            this.drawHUD(ctx, w, h);

            return Math.floor(this.speed / 100);
        },

        // --- MOTOR DE RENDERIZAÇÃO (SCANLINE) ---
        renderTrack: function(ctx, w, h) {
            const baseSegment = this.segments[Math.floor(this.position / CONF.SEGMENT_LENGTH) % this.segments.length];
            const basePercent = this.percentRemaining(this.position, CONF.SEGMENT_LENGTH);
            const playerY = this.interpolate(baseSegment.p1.world.y, baseSegment.p2.world.y, basePercent);
            
            let maxY = h; // Z-Buffer manual (horizonte clip)
            let x = 0;
            let dx = - (baseSegment.curve * basePercent); // Curvatura acumulada

            // Desenha 300 segmentos à frente (Draw Distance)
            for(let n=0; n<300; n++) {
                const segment = this.segments[(baseSegment.index + n) % this.segments.length];
                const looped = segment.index < baseSegment.index;
                
                // Projeção 3D -> 2D
                // Camera Z offset para loop infinito
                let cameraZ = (n * CONF.SEGMENT_LENGTH) - (basePercent * CONF.SEGMENT_LENGTH); 
                cameraZ = Math.max(1, cameraZ); // Evita divisão por zero

                // Curvatura
                x += dx;
                dx += segment.curve;

                // Câmera segue altura da pista (suavizado)
                const cameraY = playerY + CONF.CAMERA_HEIGHT;
                
                const scale = CONF.FOV / (cameraZ);
                const screenX = w/2 + (scale * (x - this.playerX * CONF.ROAD_WIDTH) * w/2);
                const screenY = (h/2) - (scale * (segment.p1.world.y - cameraY) * h/2); 
                const screenW = scale * CONF.ROAD_WIDTH * w/2;

                // Desenha apenas se estiver visível e acima do segmento anterior
                if(screenY >= maxY) continue;
                
                // Geometria
                // Só precisamos da altura do próximo segmento para fechar o polígono
                const nextSeg = this.segments[(segment.index + 1) % this.segments.length];
                const scale2 = CONF.FOV / (cameraZ + CONF.SEGMENT_LENGTH);
                const screenY2 = (h/2) - (scale2 * (nextSeg.p1.world.y - cameraY) * h/2);
                
                if(screenY2 < screenY) { // Se for visível
                    this.drawSegment(ctx, w, screenY2, screenY, screenW, segment.color);
                    maxY = screenY2; // Novo horizonte
                }

                // Desenha Sprites e Carros deste segmento (Painter's Algorithm Inverso)
                // Nota: Carros são desenhados DEPOIS da pista, mas PRECISAM ser escalados
                // Aqui desenhamos sprites de TRÁS para FRENTE, então na verdade, a ordem do loop inverte
                // Para simplificar, desenhamos sprites apenas se visíveis
                
                // Melhor abordagem: Coletar sprites e desenhar no final ordenado por Z?
                // Em engines scanline clássicas, desenhamos aqui mesmo.
                
                const spriteScale = scale;
                const spriteY = screenY;

                // Renderiza Cenário (Árvores)
                segment.sprites.forEach(spr => {
                    const spriteX = w/2 + (scale * (x + spr.offset * CONF.ROAD_WIDTH - this.playerX * CONF.ROAD_WIDTH) * w/2);
                    this.drawSpriteObj(ctx, spr.type, spriteX, spriteY, spriteScale);
                });

                // Renderiza Oponentes
                segment.cars.forEach(car => {
                    // Interpolação lateral do carro
                    const carX = w/2 + (scale * (x + car.offset * CONF.ROAD_WIDTH - this.playerX * CONF.ROAD_WIDTH) * w/2);
                    // Colisão simples
                    if(n < 5 && Math.abs(car.offset - this.playerX) < 0.1) {
                        this.speed *= 0.8; // Bateu
                        window.Gfx.shake(10);
                    }
                    this.drawKartSprite(ctx, carX, spriteY, spriteScale, 0, car.color, false);
                });
            }
        },

        drawSegment: function(ctx, w, y1, y2, width, colorType) {
            const c = PALETTE;
            const r1 = width; // Largura no topo
            const r2 = width; // Largura na base (aproximado para scanline simples)
            
            // Grama
            ctx.fillStyle = c.GRASS[colorType];
            ctx.fillRect(0, y1, w, y2-y1);

            // Pista
            ctx.fillStyle = c.ROAD[colorType];
            ctx.beginPath();
            ctx.moveTo(w/2 - r1, y1);
            ctx.lineTo(w/2 + r1, y1);
            ctx.lineTo(w/2 + width*1.05, y2); // Leve perspectiva trapezoidal manual
            ctx.lineTo(w/2 - width*1.05, y2);
            ctx.fill();

            // Zebras
            const rumbleW = width * 0.15;
            ctx.fillStyle = c.RUMBLE[colorType];
            ctx.beginPath();
            ctx.fillRect(w/2 - width*1.05 - rumbleW, y1, rumbleW, y2-y1);
            ctx.fillRect(w/2 + width*1.05, y1, rumbleW, y2-y1);
            
            // Faixa central
            if(colorType === 'light') {
                ctx.fillStyle = '#fff';
                ctx.fillRect(w/2 - width*0.02, y1, width*0.04, y2-y1);
            }
        },

        // --- ARTISTA VISUAL (DESENHO DE SPRITES) ---
        
        drawBackground: function(ctx, w, h, offset) {
            // Céu
            const grad = ctx.createLinearGradient(0,0,0,h/2);
            grad.addColorStop(0, PALETTE.SKY[0]); grad.addColorStop(1, PALETTE.SKY[1]);
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);
            
            // Montanhas Parallax
            ctx.fillStyle = '#2ecc71'; // Montanhas verdes
            const mountainH = h * 0.2;
            ctx.beginPath();
            for(let i=0; i<w; i+=10) {
                const mh = Math.sin((i + this.position*0.05)*0.01) * 50 + Math.cos((i)*0.03)*30;
                ctx.lineTo(i, h/2 - mh);
            }
            ctx.lineTo(w, h/2); ctx.lineTo(0, h/2);
            ctx.fill();
        },

        drawSpriteObj: function(ctx, type, x, y, scale) {
            const s = scale * 4000; // Fator de tamanho base
            if(s < 2) return;

            if(type === 'tree') {
                // Árvore Super Mario World Style
                ctx.fillStyle = '#8B4513'; ctx.fillRect(x-s*0.1, y-s, s*0.2, s); // Tronco
                ctx.fillStyle = '#006400'; 
                ctx.beginPath(); ctx.arc(x, y-s*1.2, s*0.5, 0, Math.PI*2); ctx.fill(); // Copa
                ctx.fillStyle = '#008000'; 
                ctx.beginPath(); ctx.arc(x-s*0.2, y-s*1.3, s*0.2, 0, Math.PI*2); ctx.fill(); // Brilho
            } else if (type === 'pipe') {
                // Tubo Verde
                ctx.fillStyle = '#00aa00'; ctx.fillRect(x-s*0.3, y-s*0.8, s*0.6, s*0.8);
                ctx.strokeStyle = '#004400'; ctx.lineWidth = 2; ctx.strokeRect(x-s*0.3, y-s*0.8, s*0.6, s*0.8);
                ctx.fillRect(x-s*0.35, y-s*0.8, s*0.7, s*0.2); // Topo
                ctx.strokeRect(x-s*0.35, y-s*0.8, s*0.7, s*0.2);
            } else if (type === 'coin') {
                // Moeda
                ctx.fillStyle = '#f1c40f';
                ctx.beginPath(); ctx.ellipse(x, y-s*0.5, s*0.2, s*0.3, 0, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = '#fff'; ctx.font=`${s*0.4}px Arial`; ctx.fillText('$', x-s*0.1, y-s*0.4);
            }
        },

        drawPlayerKart: function(ctx, w, h, steer) {
            // Posição fixa na tela (centro baixo)
            const x = w/2;
            const y = h - 20;
            // Escala fixa
            const scale = w * 0.00025; 
            
            // Mapeia steer para frames de animação
            let frame = 0; // 0 = Reto, 1 = Leve, 2 = Forte
            if(Math.abs(steer) > 0.3) frame = 1;
            if(Math.abs(steer) > 0.8) frame = 2;
            const dir = Math.sign(steer); // -1 Esq, 1 Dir

            this.drawKartSprite(ctx, x, y, scale, frame * dir, '#e70000', true);
        },

        // A Mágica do Pixel Art Procedural
        drawKartSprite: function(ctx, x, y, scale, turnState, color, isPlayer) {
            // turnState: 0 (reto), -1/-2 (esq), 1/2 (dir)
            const s = scale * 800; 
            if(s < 5) return;

            ctx.save();
            ctx.translate(x, y);
            
            // Inclinação visual sem tombar (Shear transform seria ideal, mas rotate suave serve)
            // O erro anterior era girar 90 graus. Aqui giramos no máximo 0.1 rad
            if(isPlayer) ctx.rotate(turnState * 0.05);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.beginPath(); ctx.ellipse(0, -s*0.1, s*0.8, s*0.2, 0, 0, Math.PI*2); ctx.fill();

            // Pneus Traseiros
            ctx.fillStyle = '#222';
            ctx.fillRect(-s*0.7, -s*0.4, s*0.3, s*0.4); // Esq
            ctx.fillRect(s*0.4, -s*0.4, s*0.3, s*0.4);  // Dir

            // Chassis (Mario Kart Style)
            ctx.fillStyle = color; // Cor do Personagem
            // Corpo principal
            ctx.fillRect(-s*0.4, -s*0.5, s*0.8, s*0.4); 
            // Motor
            ctx.fillStyle = '#444';
            ctx.fillRect(-s*0.3, -s*0.7, s*0.6, s*0.2);
            // Escapamentos
            ctx.fillStyle = '#ffd700';
            ctx.beginPath(); ctx.arc(-s*0.2, -s*0.6, s*0.1, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(s*0.2, -s*0.6, s*0.1, 0, Math.PI*2); ctx.fill();

            // Pneus Dianteiros (Mudam com a curva)
            ctx.fillStyle = '#222';
            const tireOffset = turnState * s * 0.1; 
            // Se virar muito, mostra a lateral do pneu
            ctx.fillRect(-s*0.75 + tireOffset, -s*0.1, s*0.25, s*0.3);
            ctx.fillRect(s*0.5 + tireOffset, -s*0.1, s*0.25, s*0.3);

            // --- PILOTO (MARIO SPRITE PROCEDURAL) ---
            const pS = s * 0.9; // Player Scale
            
            // Corpo (Macacão Azul)
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(-pS*0.3, -pS*0.7, pS*0.6, pS*0.4);
            
            // Braços (Vermelho)
            ctx.fillStyle = color;
            if(Math.abs(turnState) > 1) {
                // Braços virando volante
                ctx.fillRect(-pS*0.5, -pS*0.75, pS*0.2, pS*0.25); // Braço levantado
                ctx.fillRect(pS*0.3, -pS*0.65, pS*0.2, pS*0.25);  // Braço abaixado
            } else {
                ctx.fillRect(-pS*0.45, -pS*0.7, pS*0.15, pS*0.3);
                ctx.fillRect(pS*0.3, -pS*0.7, pS*0.15, pS*0.3);
            }

            // Cabeça (Pele)
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath(); ctx.arc(0, -pS*0.9, pS*0.25, 0, Math.PI*2); ctx.fill();

            // Boné (Vermelho com M)
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(0, -pS*0.95, pS*0.26, Math.PI, 0); ctx.fill(); // Topo
            ctx.fillRect(-pS*0.26, -pS*0.95, pS*0.52, pS*0.1); // Aba
            
            // Letra M
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${pS*0.2}px Arial`; ctx.textAlign='center'; 
            ctx.fillText(isPlayer ? 'M' : '?', 0, -pS*0.95);

            // Cabelo nuca
            ctx.fillStyle = '#330000';
            ctx.beginPath(); ctx.arc(0, -pS*0.9, pS*0.2, 0, Math.PI, false); ctx.fill();

            ctx.restore();
        },

        drawWheelUI: function(ctx, w, h, angle) {
            // HUD Visual do Volante
            const x = w - 80; const y = 80;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.shadowBlur = 10; ctx.shadowColor = '#fff';
            ctx.strokeStyle = '#ddd'; ctx.lineWidth = 8;
            ctx.beginPath(); ctx.arc(0,0,40,0,Math.PI*2); ctx.stroke();
            // Marcador Centro
            ctx.fillStyle = '#ff0000'; ctx.fillRect(-5, -40, 10, 15);
            ctx.restore();
        },

        drawHUD: function(ctx, w, h) {
            // Speedometer
            const speedKmh = Math.floor(this.speed / 50);
            ctx.fillStyle = '#fff'; 
            ctx.font = "bold 40px 'Russo One'"; 
            ctx.textAlign = 'right';
            ctx.fillText(speedKmh + " km/h", w - 20, h - 20);
            
            // Laps
            ctx.textAlign = 'left';
            ctx.fillText("LAP " + this.lap + "/3", 20, 60);
            
            // Posição
            ctx.font = "bold 80px 'Russo One'";
            ctx.fillStyle = '#ffcc00';
            ctx.fillText(this.rank + "th", w - 140, 100);
        }
    };

    window.System.registerGame('drive', 'Otto Kart GP', '🏎️', Logic, {camOpacity: 0.3, showWheel: false});
})();
