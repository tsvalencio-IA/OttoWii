// =============================================================================
// LÓGICA DO JOGO: OTTO PRO TENNIS (REAL PHYSICS EDITION)
// =============================================================================

(function() {
    const TABLE_W = 600;        
    const TABLE_L = 1200;
    const NET_Z = 600;

    let particles = [];

    const Logic = {
        score: 0,
        state: 'calibrate', // calibrate, play
        
        // Bola com física completa
        ball: { x:0, y:-200, z:1200, vx:0, vy:0, vz:0 },
        
        // Mão do jogador
        hand: { x:0, y:0 }, 
        handVel: { x:0, y:0 }, // Para calcular spin
        lastHand: { x:0, y:0 },
        
        handCenter: { x:null, y:null }, // Calibração
        calibTimer: 0, 

        init: function() { 
            this.score = 0; 
            this.state = 'calibrate';
            this.calibTimer = 0;
            this.resetBall();
            window.System.msg("CENTRALIZAR MÃO"); 
        },

        resetBall: function() {
            this.ball = { 
                x: (Math.random()-0.5) * 200, // Saque aleatório
                y: -300, // Altura inicial
                z: 1400, // Fundo da quadra
                vx: (Math.random()-0.5) * 5, 
                vy: 8,   // Gravidade inicial (caindo)
                vz: -25 - (this.score * 2) // Velocidade aumenta
            };
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2; 
            const cy = h / 2;

            // 1. INPUT DA MÃO (RAQUETE)
            let rawHand = null;
            if(pose) {
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                if(rw && rw.score > 0.4) rawHand = window.Gfx.map(rw, w, h);
            }

            // 2. MÁQUINA DE ESTADOS
            if(this.state === 'calibrate') {
                // Fundo escuro para foco
                ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h);
                
                // Alvo
                ctx.strokeStyle = '#00ffff'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(cx, cy, 50, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.font="20px Arial"; ctx.textAlign="center";
                ctx.fillText("MANTENHA A MÃO NO CÍRCULO", cx, cy-70);

                if(rawHand) {
                    ctx.fillStyle = '#0f0'; ctx.beginPath(); ctx.arc(rawHand.x, rawHand.y, 10, 0, Math.PI*2); ctx.fill();
                    
                    if(Math.hypot(rawHand.x - cx, rawHand.y - cy) < 50) {
                        this.calibTimer++;
                        // Barra de progresso
                        ctx.fillStyle='#0f0'; ctx.fillRect(cx-50, cy+60, this.calibTimer*2, 10);
                        
                        if(this.calibTimer > 50) {
                            this.handCenter = { x: rawHand.x, y: rawHand.y };
                            this.state = 'play';
                            window.System.msg("SAQUE!");
                            window.Sfx.coin();
                        }
                    } else {
                        this.calibTimer = 0;
                    }
                }
                return 0;
            }

            // --- JOGO RODANDO ---
            
            // Atualiza posição da raquete relativa ao centro calibrado
            if(rawHand) {
                // Sensibilidade ajustada
                const sens = 2.5;
                const tx = (rawHand.x - this.handCenter.x) * sens;
                const ty = (rawHand.y - this.handCenter.y) * sens;
                
                // Suavização (Lerp)
                this.hand.x += (tx - this.hand.x) * 0.3;
                this.hand.y += (ty - this.hand.y) * 0.3;
                
                // Calcula velocidade da mão para Spin
                this.handVel.x = this.hand.x - this.lastHand.x;
                this.handVel.y = this.hand.y - this.lastHand.y;
                this.lastHand.x = this.hand.x;
                this.lastHand.y = this.hand.y;
            }

            // Física da Bola
            this.ball.x += this.ball.vx;
            this.ball.y += this.ball.vy;
            this.ball.z += this.ball.vz;
            
            // Gravidade e Quique no chão
            if(this.ball.y < 200) { // 200 é o "chão" virtual
                this.ball.vy += 0.8; // Gravidade
            } else if (this.ball.y >= 200 && this.ball.vy > 0) {
                // QUIQUE NO CHÃO
                this.ball.vy *= -0.8; // Perde energia
                window.Sfx.click(); // Som de quique
            }

            // COLISÃO COM RAQUETE (A Mágica da Realidade)
            // A bola só pode ser rebatida se estiver PERTO DA TELA (Z < 100)
            if(this.ball.z < 100 && this.ball.z > -100) {
                // Projetar bola na tela 2D
                const scale = 500 / (500 + this.ball.z);
                const ballScreenX = this.ball.x * scale;
                const ballScreenY = (this.ball.y - 150) * scale; // Ajuste visual de altura

                // Distância da Raquete
                const dist = Math.hypot(ballScreenX - this.hand.x, ballScreenY - this.hand.y);
                
                // Hitbox de 80 pixels
                if(dist < 80) {
                    window.Sfx.hit();
                    this.score++;
                    
                    // FÍSICA DE REBATIDA
                    this.ball.vz = Math.abs(this.ball.vz) + 2; // Rebate pra frente
                    this.ball.vy = -15; // Joga pra cima (Lob)
                    
                    // Controle Direcional (Onde bateu na raquete define o ângulo)
                    this.ball.vx = (ballScreenX - this.hand.x) * 0.5; 
                    
                    // Adiciona Spin da mão
                    this.ball.vx += this.handVel.x * 0.5;

                    // Partículas
                    for(let i=0;i<10;i++) particles.push({x:cx+ballScreenX, y:cy+ballScreenY, vx:(Math.random()-0.5)*10, vy:(Math.random()-0.5)*10, life:1});
                }
            }

            // IA Rebate de volta (Loop infinito)
            if(this.ball.z > 1400 && this.ball.vz > 0) {
                this.ball.vz *= -1; // Paredão invisível
                this.ball.vx = (Math.random()-0.5) * 15; // Muda direção
            }

            if(this.ball.z < -200) {
                 window.System.gameOver(this.score);
            }

            // --- RENDERIZAÇÃO 3D REALISTA ---
            
            // Fundo
            const gradSky = ctx.createLinearGradient(0,0,0,h);
            gradSky.addColorStop(0, '#87CEEB'); gradSky.addColorStop(1, '#E0F7FA');
            ctx.fillStyle = gradSky; ctx.fillRect(0,0,w,h);

            // Quadra (Trapézio)
            const project = (x, y, z) => {
                const scale = 500 / (500 + z);
                return { x: cx + x*scale, y: cy + (y+200)*scale, s: scale };
            };

            const p1 = project(-TABLE_W, 0, 1400);
            const p2 = project(TABLE_W, 0, 1400);
            const p3 = project(TABLE_W, 0, 0);
            const p4 = project(-TABLE_W, 0, 0);

            ctx.fillStyle = '#2E8B57'; // Verde Quadra
            ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.fill();
            
            // Linhas da Quadra
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.stroke(); // Contorno
            // Linha central
            const m1 = project(0,0,1400); const m2 = project(0,0,0);
            ctx.beginPath(); ctx.moveTo(m1.x, m1.y); ctx.lineTo(m2.x, m2.y); ctx.stroke();
            
            // Rede
            const n1 = project(-TABLE_W, -50, NET_Z); const n2 = project(TABLE_W, -50, NET_Z);
            const n3 = project(TABLE_W, 0, NET_Z); const n4 = project(-TABLE_W, 0, NET_Z);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.lineTo(n3.x, n3.y); ctx.lineTo(n4.x, n4.y); ctx.fill();

            // --- BOLA E SOMBRA (O SEGREDO DO REALISMO) ---
            
            const b = this.ball;
            const bPos = project(b.x, b.y, b.z);
            const sPos = project(b.x, 0, b.z); // Sombra no chão (y=0)

            // Desenha Sombra
            if(sPos.s > 0) {
                ctx.fillStyle = 'rgba(0,0,0,0.4)';
                const sSize = 20 * sPos.s;
                ctx.beginPath(); ctx.ellipse(sPos.x, sPos.y, sSize, sSize*0.5, 0, 0, Math.PI*2); ctx.fill();
            }

            // Desenha Bola
            if(bPos.s > 0) {
                const bSize = 15 * bPos.s;
                // Gradiente para parecer esfera
                const gradB = ctx.createRadialGradient(bPos.x-bSize*0.3, bPos.y-bSize*0.3, bSize*0.2, bPos.x, bPos.y, bSize);
                gradB.addColorStop(0, '#fff'); gradB.addColorStop(1, '#ccff00'); // Amarelo Tênis
                ctx.fillStyle = gradB;
                ctx.beginPath(); ctx.arc(bPos.x, bPos.y, bSize, 0, Math.PI*2); ctx.fill();
                ctx.strokeStyle='rgba(0,0,0,0.2)'; ctx.stroke();
            }

            // --- RAQUETE (SEGUINDO A MÃO) ---
            const rX = cx + this.hand.x;
            const rY = cy + this.hand.y;
            
            // Sombra da Raquete (Ajuda a alinhar com a bola)
            // Projetada no "chão" da tela
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.ellipse(rX, rY + 100, 40, 10, 0, 0, Math.PI*2); ctx.fill();

            // Cabo
            ctx.strokeStyle = '#333'; ctx.lineWidth = 8;
            ctx.beginPath(); ctx.moveTo(rX, rY+50); ctx.lineTo(rX, rY); ctx.stroke();
            
            // Cabeça da Raquete
            ctx.fillStyle = 'rgba(200, 0, 0, 0.6)'; // Rede vermelha semi-transparente
            ctx.strokeStyle = '#000'; ctx.lineWidth = 4;
            ctx.beginPath(); ctx.ellipse(rX, rY-30, 35, 45, 0, 0, Math.PI*2); 
            ctx.fill(); ctx.stroke();

            // Partículas
            particles.forEach((p,i)=>{
                p.x+=p.vx; p.y+=p.vy; p.life-=0.1;
                if(p.life<=0) particles.splice(i,1);
                else { ctx.fillStyle=`rgba(255,255,0,${p.life})`; ctx.fillRect(p.x,p.y,5,5); }
            });

            return this.score;
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('tennis', 'Otto Tennis Pro', '🎾', Logic, {camOpacity: 0.5, showWheel: false});
            clearInterval(regLoop);
        }
    }, 100);
})();