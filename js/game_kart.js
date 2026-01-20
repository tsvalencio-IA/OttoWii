/**
 * =============================================================================
 * OTTO KART GP - "PROJECT BLUE SHELL" ENGINE
 * =============================================================================
 * ARQUITETURA: Camera Follow System (Third Person)
 * DIFERENCIAL: O carro tem física de tração e a câmera tem "lag" de perseguição.
 * =============================================================================
 */

(function() {
    // Constantes de Física (Ajuste Fino "Nintendo Feel")
    const PHYS = {
        MAX_SPEED: 240,       // Velocidade máxima percebida
        ACCEL: 2.5,           // Curva de aceleração
        FRICTION: 0.96,       // Resistência do asfalto
        GRASS_DRAG: 0.85,     // Resistência da grama
        TURN_SPEED: 0.07,     // Velocidade angular do carro
        CAM_STIFFNESS: 0.1,   // Quão rápido a câmera segue o carro (0.1 = pesado/cinemático)
        FOV: 800              // Profundidade de campo
    };

    const Logic = {
        // Estado do Mundo
        pos: 0,               // Posição Z na pista
        playerX: 0,           // Posição X do carro no mundo (-1 a 1 na pista)
        speed: 0,             // Velocidade escalar atual
        
        // Estado da Câmera
        camX: 0,              // Posição X da câmera (segue o playerX com atraso)
        
        // Input & Controle
        steerInput: 0,        // Valor bruto do volante (-1 a 1)
        carAngle: 0,          // Ângulo visual do chassi (Yaw)
        
        // Gameplay
        lap: 1,
        score: 0,
        opponents: [],
        sprites: [],

        init: function() {
            this.pos = 0;
            this.playerX = 0;
            this.speed = 0;
            this.camX = 0;
            this.steerInput = 0;
            this.carAngle = 0;
            this.score = 0;
            
            // Popula Pista com Sprites (Billboards & Árvores)
            this.sprites = [];
            for(let i=0; i<50; i++) {
                this.sprites.push({
                    z: Math.random() * 30000,
                    x: (Math.random() > 0.5 ? 1 : -1) * (1.5 + Math.random()*2),
                    type: Math.random() > 0.8 ? 'billboard' : 'tree'
                });
            }
            
            // Oponentes (IA Simples)
            this.opponents = [];
            for(let i=0; i<3; i++) {
                this.opponents.push({
                    z: 500 + (i*800),
                    x: (Math.random()-0.5),
                    speed: PHYS.MAX_SPEED * (0.9 - (i*0.05)),
                    color: ['#e67e22', '#8e44ad', '#27ae60'][i]
                });
            }

            window.System.msg("LARGADA!");
            window.Sfx.boot(); // Som de motor ligando
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2;
            const cy = h / 2;
            const horizon = h * 0.4;
            
            // =================================================================
            // 1. INPUT SYSTEM (Volante Virtual)
            // =================================================================
            let hasInput = false;
            if(pose) {
                const lw = pose.keypoints.find(k=>k.name==='left_wrist');
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(lw && lw.score > 0.3 && rw && rw.score > 0.3) {
                    hasInput = true;
                    // Calcula ângulo entre pulsos
                    const dx = rw.x - lw.x;
                    const dy = rw.y - lw.y;
                    const angle = Math.atan2(dy, dx);
                    
                    // Desenha Volante na UI
                    this.drawWheelUI(ctx, w, h, angle);
                    
                    // Mapeia ângulo para direção (-1 a 1)
                    // Deadzone dinâmica para evitar tremedeira em retas
                    let steer = angle * 2.5; 
                    if(Math.abs(steer) < 0.1) steer = 0;
                    this.steerInput = Math.max(-1.5, Math.min(1.5, steer));
                }
            }

            // =================================================================
            // 2. FÍSICA DO CARRO (Vehicle Dynamics)
            // =================================================================
            if(hasInput) {
                this.speed += PHYS.ACCEL;
                if(this.speed > PHYS.MAX_SPEED) this.speed = PHYS.MAX_SPEED;
            } else {
                this.speed *= PHYS.FRICTION; // Desaceleração natural
                this.steerInput *= 0.8; // Retorno do volante ao centro
            }

            // Física de Curva: A velocidade afeta o quão rápido você vira
            // Carro parado não vira. Carro rápido vira mais.
            const turnFactor = (this.speed / PHYS.MAX_SPEED) * PHYS.TURN_SPEED;
            this.playerX += this.steerInput * turnFactor;
            
            // Física de Terreno (Grama)
            let onGrass = false;
            if(Math.abs(this.playerX) > 1.1) {
                this.speed *= PHYS.GRASS_DRAG;
                onGrass = true;
                if(this.speed > 50) window.Gfx.shake(2);
            }

            // Avanço no mundo
            this.pos += this.speed;
            this.score = Math.floor(this.pos / 100);

            // =================================================================
            // 3. FÍSICA DA CÂMERA (Camera Lag - O Segredo do "Feel")
            // =================================================================
            // A câmera não está "parafusada" no carro. Ela o persegue.
            // Isso faz o carro parecer que se move na tela quando vira.
            this.camX += (this.playerX - this.camX) * PHYS.CAM_STIFFNESS;
            
            // Inclinação Visual do Carro (Body Roll)
            // O carro inclina visualmente baseado na força G (steerInput)
            this.carAngle += (this.steerInput - this.carAngle) * 0.15;

            // Curvatura da Pista (Pseudo-aleatória baseada na posição)
            const trackCurve = Math.sin(this.pos * 0.003) * 2; 

            // =================================================================
            // 4. RENDERIZAÇÃO (Perspectiva Projetada)
            // =================================================================
            
            // A. CÉU (Parallax)
            // O céu se move inversamente à curva da pista
            const skyOffset = trackCurve * 200 + (this.carAngle * 100);
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, '#1a8cff'); gradSky.addColorStop(1, '#99ccff');
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);
            
            // Nuvens simples
            ctx.fillStyle = 'rgba(255,255,255,0.6)';
            ctx.beginPath(); ctx.arc(w*0.2 - skyOffset, horizon*0.5, 40, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(w*0.8 - skyOffset, horizon*0.3, 60, 0, Math.PI*2); ctx.fill();

            // B. CHÃO
            ctx.fillStyle = '#3cb371'; ctx.fillRect(0, horizon, w, h-horizon);

            // C. ESTRADA (Algoritmo de Segmentos Projetados)
            // Ao invés de mover a pista, movemos o "centro" da projeção baseado na câmera
            // ProjectX = WorldX - CameraX
            
            const roadW = 2000; // Largura real da pista
            
            // Função de Projeção
            const project = (roadX, roadZ) => {
                // Relativo à câmera
                const relX = roadX - (this.camX * roadW/2) - (trackCurve * (roadZ/100)); 
                const relZ = roadZ; // Câmera Z é 0 (fixa atrás)
                
                const scale = PHYS.FOV / (PHYS.FOV + relZ);
                const sx = cx + (relX * scale);
                const sy = horizon + (400 * scale); // 400 = altura da câmera
                return { x: sx, y: sy, s: scale };
            };

            // Desenha Estrada (Trapézio)
            const pNear = project(-roadW/2, 10);
            const pFar = project(-roadW/2, 2000); // Horizonte
            
            // Ajuste visual da curva no horizonte
            const curveVisual = trackCurve * w * 0.5;

            ctx.fillStyle = '#666'; // Asfalto
            ctx.beginPath();
            ctx.moveTo(cx - (w*0.02) + curveVisual, horizon); // Topo Esq
            ctx.lineTo(cx + (w*0.02) + curveVisual, horizon); // Topo Dir
            ctx.lineTo(w + (this.camX * w), h); // Base Dir (movida pela camera)
            ctx.lineTo(0 - (this.camX * w), h); // Base Esq (movida pela camera)
            ctx.fill();

            // D. ZEBRAS (Sensação de Velocidade)
            // A posição das zebras depende do Z do mundo
            const offsetZ = this.pos % 200;
            const segmentColor = Math.floor(this.pos / 200) % 2 === 0 ? '#cc0000' : '#ffffff';
            
            // Desenha bordas simplificadas
            ctx.strokeStyle = segmentColor; ctx.lineWidth = 15;
            ctx.beginPath();
            // Lado Esquerdo
            ctx.moveTo(cx - (w*0.02) + curveVisual, horizon);
            ctx.lineTo(0 - (this.camX * w) + (w*0.1), h);
            // Lado Direito
            ctx.moveTo(cx + (w*0.02) + curveVisual, horizon);
            ctx.lineTo(w + (this.camX * w) - (w*0.1), h);
            ctx.stroke();

            // E. OBJETOS DO MUNDO (Billboards, IA)
            // Renderização Z-Sorted (Painter's Algo)
            const renderList = [];
            
            // Sprites Cenário
            this.sprites.forEach(s => {
                let relZ = s.z - this.pos;
                while(relZ < 10) relZ += 30000; // Loop infinito
                if(relZ < 3000) renderList.push({ type: s.type, x: s.x, z: relZ });
            });
            
            // Oponentes
            this.opponents.forEach(o => {
                o.z += o.speed - this.speed; // Movimento relativo
                // IA básica de curva
                o.x -= trackCurve * 0.01;
                if(o.x > 1) o.x = 1; if(o.x < -1) o.x = -1;
                
                let relZ = o.z; 
                // Se ficar muito pra trás, respawn na frente (Rubber Banding Nintendo)
                if(relZ < -500) { o.z = 2000; o.x = (Math.random()-0.5); }
                
                renderList.push({ type: 'kart', obj: o, x: o.x, z: relZ });
            });

            renderList.sort((a,b) => b.z - a.z);

            renderList.forEach(item => {
                const pt = project(item.x * roadW/2, item.z);
                const size = item.z < 1000 ? (3000 / item.z) * 50 : 0;
                
                if(item.z > 50 && size > 5) {
                    if(item.type === 'tree') {
                        ctx.fillStyle = '#228b22';
                        ctx.beginPath(); ctx.moveTo(pt.x, pt.y - size*2);
                        ctx.lineTo(pt.x - size/2, pt.y); ctx.lineTo(pt.x + size/2, pt.y); ctx.fill();
                    } else if (item.type === 'billboard') {
                        ctx.fillStyle = '#f1c40f'; ctx.fillRect(pt.x-size/2, pt.y-size, size, size*0.8);
                        ctx.fillStyle = '#000'; ctx.font=`bold ${size*0.15}px Arial`; ctx.textAlign='center';
                        ctx.fillText("ThIAguinho", pt.x, pt.y-size*0.6);
                        ctx.fillText("Wii", pt.x, pt.y-size*0.4);
                    } else if (item.type === 'kart') {
                        ctx.fillStyle = item.obj.color;
                        ctx.fillRect(pt.x - size/2, pt.y - size/2, size, size/2);
                    }
                }
            });

            // F. O JOGADOR (HERÓI)
            // O jogador é desenhado fixo no Y, mas se move no X baseado no "Camera Lag"
            // Se a câmera está atrasada (camX < playerX), o carro aparece mais à direita.
            
            const screenCarX = cx + (this.playerX - this.camX) * (w * 0.8);
            const carScale = w * 0.0015;
            
            ctx.save();
            ctx.translate(screenCarX, h * 0.85);
            ctx.scale(carScale, carScale);
            // Inclinação nas curvas (Z-rotation)
            ctx.rotate(this.carAngle * 0.5); 
            
            // Partículas de fumaça/terra
            if(this.speed > 10) {
                if(onGrass) {
                    ctx.fillStyle = '#8B4513';
                    ctx.beginPath(); ctx.arc(-40 + Math.random()*20, 20, 10 + Math.random()*10, 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(40 + Math.random()*20, 20, 10 + Math.random()*10, 0, Math.PI*2); ctx.fill();
                }
            }

            // Sprite do Kart (Estilo SNES Mario Kart)
            this.drawKartSprite(ctx);
            
            ctx.restore();

            return this.score;
        },

        drawWheelUI: function(ctx, w, h, angle) {
            // HUD do Volante
            const size = 100;
            const x = w - 80;
            const y = 80;
            
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(angle);
            ctx.strokeStyle = 'rgba(255,255,255,0.8)';
            ctx.lineWidth = 8;
            ctx.beginPath(); ctx.arc(0,0,40,0,Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(0,-40); ctx.stroke(); // Marcador topo
            ctx.restore();
        },

        drawKartSprite: function(ctx) {
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath(); ctx.ellipse(0, 10, 60, 20, 0, 0, Math.PI*2); ctx.fill();

            // Corpo
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(-50, -40, 100, 50); // Chassis
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(-52, -10, 104, 15); // Parachoque lateral

            // Rodas
            ctx.fillStyle = '#222';
            ctx.fillRect(-65, -10, 20, 35); // Roda Esq
            ctx.fillRect(45, -10, 20, 35);  // Roda Dir

            // Motor
            ctx.fillStyle = '#555';
            ctx.fillRect(-30, -55, 60, 20);
            ctx.fillStyle = '#ffcc00'; // Escapamento
            ctx.beginPath(); ctx.arc(-20, -45, 8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(20, -45, 8, 0, Math.PI*2); ctx.fill();

            // Cabeça do Piloto
            ctx.fillStyle = '#fce4ec'; // Pele
            ctx.beginPath(); ctx.arc(0, -60, 25, 0, Math.PI*2); ctx.fill();
            // Capacete
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -65, 26, Math.PI, 0); ctx.fill();
            // Logo M
            ctx.fillStyle = 'red'; ctx.font="bold 15px Arial"; ctx.textAlign="center"; 
            ctx.fillText("M", 0, -65);
        }
    };

    window.System.registerGame('kart', { 
        name: 'Otto Kart GP', 
        icon: '🏎️', 
        camOpacity: 0.3,
        showWheel: false // Desenhamos nosso próprio
    }, Logic);
})();