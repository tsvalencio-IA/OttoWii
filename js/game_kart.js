/**
 * =============================================================================
 * OTTO KART - WII EDITION
 * =============================================================================
 * Mecânica: Segure as mãos no ar como um volante invisível.
 * O jogo calcula o ângulo entre os pulsos para girar o carro.
 */

(function() {
    // Configurações de Física
    const KART = {
        MAX_SPEED: 180,
        ACCEL: 1.5,
        DECEL: 0.96, // Freio motor
        TURN_SENSITIVITY: 2.2, // Sensibilidade do volante
        FOV: 600, // Profundidade de campo
        ROAD_WIDTH: 2200
    };

    const Logic = {
        // Estado do Jogo
        speed: 0,
        posZ: 0,
        posX: 0,      // Posição lateral na pista (-1.5 a 1.5)
        steer: 0,     // Valor atual da direção
        score: 0,
        lap: 1,
        
        // Elementos do Mundo
        opponents: [],
        props: [],
        
        // Input
        wheelAngle: 0, // Ângulo detectado das mãos

        init() {
            this.speed = 0;
            this.posZ = 0;
            this.posX = 0;
            this.steer = 0;
            this.score = 0;
            this.lap = 1;
            
            // Limpa e recria listas
            this.opponents = [];
            this.props = [];
            
            // Cria Oponentes (Karts Coloridos)
            const colors = ['#e74c3c', '#2ecc71', '#f1c40f', '#9b59b6'];
            for(let i=0; i<4; i++) {
                this.opponents.push({
                    z: (i+1) * 800, // Começam à frente
                    x: (Math.random() - 0.5),
                    speed: KART.MAX_SPEED * (0.85 + Math.random()*0.1), // Velocidade variada
                    color: colors[i]
                });
            }
            
            // Cria Cenário (Árvores na beira da pista)
            for(let z=1000; z<20000; z+=600) {
                if(Math.random() < 0.6) {
                    this.props.push({ 
                        z: z, 
                        x: (Math.random() > 0.5 ? 2.0 : -2.0), // Longe da estrada
                        type: 'tree' 
                    });
                }
            }

            window.System.msg("SEGURE O VOLANTE!");
        },

        update(ctx, w, h, pose) {
            const cx = w/2;
            const horizon = h * 0.4;
            const dt = 0.016; // Time step fixo aproximado

            // =================================================================
            // 1. INPUT (VOLANTE VIRTUAL COM IA)
            // =================================================================
            let hasControl = false;
            
            if(pose) {
                const l = pose.keypoints.find(k => k.name === 'left_wrist');
                const r = pose.keypoints.find(k => k.name === 'right_wrist');
                
                // Só ativa se ver os dois pulsos com confiança
                if(l && l.score > 0.3 && r && r.score > 0.3) {
                    hasControl = true;
                    
                    // Matemática: Calcula o ângulo da linha entre as mãos
                    const dx = r.x - l.x;
                    const dy = r.y - l.y;
                    this.wheelAngle = Math.atan2(dy, dx); // Retorna radianos
                    
                    // Feedback Visual do Volante
                    this.drawUIWheel(this.wheelAngle);
                }
            }

            // Aceleração e Direção
            if(hasControl) {
                // Acelera
                if(this.speed < KART.MAX_SPEED) this.speed += KART.ACCEL;
                
                // Vira (Com suavização lerp)
                const targetSteer = this.wheelAngle * KART.TURN_SENSITIVITY;
                this.steer += (targetSteer - this.steer) * 0.1; 
            } else {
                // Desacelera se soltar o volante
                this.speed *= KART.DECEL;
                this.steer *= 0.8; // Centraliza volante
            }

            // =================================================================
            // 2. FÍSICA E MOVIMENTO
            // =================================================================
            this.posZ += this.speed;
            
            // Move lateralmente baseado na velocidade e direção
            this.posX += this.steer * (this.speed / KART.MAX_SPEED) * 0.09;
            
            // Força Centrífuga (Se curvar muito rápido, o carro derrapa para fora)
            this.posX -= this.steer * 0.03;

            // Colisão com Bordas (Grama)
            if(Math.abs(this.posX) > 1.5) {
                this.speed *= 0.92; // Perde velocidade na grama
                window.Gfx.shake(3); // Treme a tela
                // Mantém dentro do limite visual
                this.posX = Math.max(-1.8, Math.min(1.8, this.posX));
            }

            this.score = Math.floor(this.posZ / 100);

            // =================================================================
            // 3. RENDERIZAÇÃO (PSEUDO-3D / MODE 7)
            // =================================================================
            
            // Céu Azul Nintendo
            const grad = ctx.createLinearGradient(0, 0, 0, horizon);
            grad.addColorStop(0, '#0099ff'); 
            grad.addColorStop(1, '#87CEEB');
            ctx.fillStyle = grad; 
            ctx.fillRect(0, 0, w, horizon);
            
            // Chão Verde (Grama)
            ctx.fillStyle = '#2ecc71'; 
            ctx.fillRect(0, horizon, w, h - horizon);

            // Estrada Trapézio (Perspectiva)
            const roadW_Far = w * 0.01;
            const roadW_Near = w * 2.5;
            
            // O segredo da curva visual: Deslocar o centro baseado na direção
            const centerFar = cx - (this.steer * w * 0.6);
            const centerNear = cx - (this.posX * w * 1.5);
            
            ctx.fillStyle = '#555'; // Asfalto
            ctx.beginPath();
            ctx.moveTo(centerFar - roadW_Far, horizon);
            ctx.lineTo(centerFar + roadW_Far, horizon);
            ctx.lineTo(centerNear + roadW_Near, h);
            ctx.lineTo(centerNear - roadW_Near, h);
            ctx.fill();
            
            // Zebras (Faixas laterais)
            ctx.strokeStyle = (Math.floor(this.posZ / 200) % 2 === 0) ? '#e74c3c' : '#fff';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.moveTo(centerFar - roadW_Far, horizon); ctx.lineTo(centerNear - roadW_Near, h);
            ctx.moveTo(centerFar + roadW_Far, horizon); ctx.lineTo(centerNear + roadW_Near, h);
            ctx.stroke();

            // =================================================================
            // 4. OBJETOS E RIVAIS
            // =================================================================
            const renderList = [...this.props, ...this.opponents];
            
            // Ordena para desenhar do fundo para frente (Painter's Algorithm)
            // A distância relativa (dz) deve considerar o "loop" da pista
            renderList.forEach(o => {
                let dz = o.z - this.posZ;
                // Faz os objetos repetirem a cada 20000 unidades
                while(dz < -500) dz += 20000;
                o._renderZ = dz; // Guarda valor temporário
            });

            renderList.sort((a, b) => b._renderZ - a._renderZ);

            renderList.forEach(o => {
                const dz = o._renderZ;
                
                // Só desenha se estiver na frente da câmera
                if(dz > 10 && dz < KART.FOV * 4) {
                    const scale = KART.FOV / (KART.FOV + dz);
                    
                    // Posição X projetada na tela
                    const objX = centerFar + (centerNear - centerFar) * scale + (o.x * w * scale);
                    const objY = horizon + (h - horizon) * scale;
                    const size = 200 * scale;

                    if(o.type === 'tree') {
                        // Desenha Árvore
                        ctx.fillStyle = '#27ae60'; // Copa
                        ctx.beginPath();
                        ctx.moveTo(objX, objY - size);
                        ctx.lineTo(objX - size/2, objY);
                        ctx.lineTo(objX + size/2, objY);
                        ctx.fill();
                        ctx.fillStyle = '#795548'; // Tronco
                        ctx.fillRect(objX - size/6, objY - size/4, size/3, size/4);
                    } else if (o.color) {
                        // Desenha Oponente (Kart)
                        o.z += o.speed; // Atualiza posição física do rival
                        
                        ctx.fillStyle = o.color;
                        ctx.fillRect(objX - size/2, objY - size/2, size, size/2);
                        
                        // Rodas
                        ctx.fillStyle = '#111';
                        ctx.fillRect(objX - size/2, objY, size/4, size/5);
                        ctx.fillRect(objX + size/4, objY, size/4, size/5);
                    }
                }
            });

            // =================================================================
            // 5. O JOGADOR (KART HERÓI)
            // =================================================================
            const carY = h - 100;
            const tilt = this.steer * 25; // Inclinação do chassi nas curvas

            ctx.save();
            ctx.translate(cx, carY);
            ctx.rotate(tilt * Math.PI / 180); // Aplica rotação

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(-60, 20, 120, 30);

            // Carroceria (Estilo Mario Kart)
            ctx.fillStyle = '#e74c3c'; // Vermelho
            ctx.beginPath();
            ctx.roundRect(-60, -40, 120, 60, 10);
            ctx.fill();

            // Detalhes do Motor
            ctx.fillStyle = '#333';
            ctx.fillRect(-50, -50, 100, 20); // Grade traseira

            // Rodas (Visão Traseira)
            ctx.fillStyle = '#111';
            ctx.fillRect(-75, -10, 25, 50); // Roda Esq
            ctx.fillRect(50, -10, 25, 50);  // Roda Dir

            // Piloto (Capacete)
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(0, -60, 25, 0, Math.PI*2); ctx.fill();
            // Letra M
            ctx.fillStyle = '#e74c3c'; 
            ctx.font = 'bold 20px Arial'; ctx.textAlign='center'; ctx.fillText('M', 0, -55);

            ctx.restore();

            return this.score;
        },

        drawUIWheel(angle) {
            // Atualiza o elemento HTML do volante se ele existir
            const el = document.getElementById('visual-wheel');
            if(el) {
                // Desenha o volante via CSS border para performance
                el.style.width = '200px';
                el.style.height = '200px';
                el.style.borderRadius = '50%';
                el.style.border = '15px solid rgba(255,255,255,0.8)';
                el.style.transform = `rotate(${angle}rad)`;
                // Marcador vermelho no topo
                el.style.borderTopColor = '#ff0000';
            }
        }
    };

    // Registra o jogo no sistema principal
    window.System.registerGame('kart', { 
        name: 'Otto Kart', 
        icon: '🏎️', 
        camOpacity: 0.3, 
        showWheel: true 
    }, Logic);
})();