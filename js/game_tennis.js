/**
 * =============================================================================
 * OTTO TENNIS PRO - REAL VECTOR PHYSICS (3D PROJECTION)
 * =============================================================================
 * Melhoria: Física de colisão real (Z-Depth check), sombras para percepção de
 * profundidade e IA que erra ocasionalmente.
 * =============================================================================
 */

(function() {
    // Dimensões da Quadra Virtual
    const COURT = { W: 300, DEPTH: 1200, NET_Z: 600, NET_H: 40 };

    const Logic = {
        score: 0,
        state: 'serve', // serve, play, end
        
        // Entidades
        ball: { x:0, y:0, z:0, vx:0, vy:0, vz:0 },
        racket: { x:0, y:0, z:0, vx:0, vy:0 },
        
        // Input History (para calcular velocidade do swing)
        lastHand: { x:0, y:0 },
        handRef: { x:0, y:0 }, // Centro de calibração

        init: function() {
            this.score = 0;
            this.state = 'serve';
            this.handRef = { x:0, y:0 };
            this.prepareServe();
            window.System.msg("SAQUE!");
        },

        prepareServe: function() {
            // Bola paira na frente do jogador
            this.ball = { x: 50, y: -100, z: 100, vx: 0, vy: 0, vz: 0 };
            this.state = 'serve';
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2;
            const cy = h/2;

            // =================================================================
            // 1. INPUT VETORIAL
            // =================================================================
            let handPos = null;
            if(pose) {
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                if(rw && rw.score > 0.3) {
                    handPos = window.Gfx.map(rw, w, h);
                    
                    // Auto-Calibração inicial
                    if(this.handRef.x === 0) this.handRef = { x: handPos.x, y: handPos.y + 100 };
                    
                    // Calcula Raquete (Amplificada para cobrir quadra)
                    this.racket.x = (handPos.x - this.handRef.x) * 2.2;
                    this.racket.y = (handPos.y - this.handRef.y) * 2.2;
                    
                    // Velocidade do Swing
                    this.racket.vx = this.racket.x - this.lastHand.x;
                    this.racket.vy = this.racket.y - this.lastHand.y;
                    this.lastHand = { x: this.racket.x, y: this.racket.y };
                }
            }

            // =================================================================
            // 2. FÍSICA
            // =================================================================
            if(this.state === 'play' || this.state === 'serve') {
                // Movimento
                if(this.state === 'play') {
                    this.ball.x += this.ball.vx;
                    this.ball.y += this.ball.vy;
                    this.ball.z += this.ball.vz;
                    this.ball.vy += 0.5; // Gravidade
                }

                // Quique no Chão (Y = 150 é o chão virtual)
                if(this.ball.y > 150) {
                    this.ball.y = 150;
                    this.ball.vy *= -0.75; // Perda de energia
                    if(Math.abs(this.ball.vy) > 2) window.Sfx.click();
                    
                    // Saiu da quadra?
                    if(this.ball.z > 0 && (Math.abs(this.ball.x) > COURT.W || this.ball.z > COURT.DEPTH)) {
                        this.failPoint("FORA!");
                    }
                }

                // Rede
                if(this.ball.z > COURT.NET_Z - 20 && this.ball.z < COURT.NET_Z + 20) {
                    if(this.ball.y > 150 - COURT.NET_H) {
                        this.ball.vz *= -0.1; // Bate na rede e cai
                        this.ball.vy = 5;
                    }
                }
            }

            // =================================================================
            // 3. COLISÃO (JOGADOR)
            // =================================================================
            // Z < 150 significa que a bola está perto da tela
            if(this.ball.z < 150 && this.ball.z > -50) {
                const dist = Math.hypot(this.ball.x - this.racket.x, this.ball.y - this.racket.y);
                
                // Raio da raquete = 80
                if(dist < 80) {
                    if(this.state === 'serve') this.state = 'play';
                    
                    window.Sfx.hit();
                    window.Gfx.shake(5);

                    // Vetor de Rebatida
                    this.ball.vz = 25 + Math.abs(this.racket.vy * 0.2); // Força para frente
                    this.ball.vy = -12 + (this.racket.vy * 0.2);        // Altura (Lob/Smash)
                    
                    // Direção (Aiming)
                    // Bater cedo/tarde define o ângulo
                    this.ball.vx = (this.ball.x - this.racket.x) * 0.4 + (this.racket.vx * 0.4);
                }
            } else if (this.ball.z < -200) {
                this.failPoint("ERRO!");
            }

            // =================================================================
            // 4. IA (OPONENTE)
            // =================================================================
            if(this.ball.z > 1300 && this.ball.vz > 0) {
                // Devolve
                window.Sfx.click();
                this.ball.vz = -30 - (this.score * 2); // Fica mais rápido
                this.ball.vy = -15;
                this.ball.vx = (Math.random()-0.5) * (COURT.W * 1.5); // Mira aleatória
                this.score++;
            }

            // =================================================================
            // 5. RENDERIZAÇÃO (PERSPECTIVA 3D)
            // =================================================================
            
            // Chão Azul / Céu
            const grad = ctx.createLinearGradient(0,0,0,cy);
            grad.addColorStop(0, '#87CEEB'); grad.addColorStop(1, '#E0F7FA');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,cy);
            ctx.fillStyle = '#2980b9'; ctx.fillRect(0,cy,w,h-cy); // Quadra

            // Função de Projeção
            const project = (x, y, z) => {
                const scale = 600 / (600 + z);
                return {
                    x: cx + x * scale,
                    y: cy + (y + 100) * scale, // +100 ajusta altura da câmera
                    s: scale
                };
            };

            // Desenha Linhas da Quadra
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
            ctx.beginPath();
            const pFL = project(-COURT.W, 150, 0);
            const pFR = project(COURT.W, 150, 0);
            const pBL = project(-COURT.W, 150, COURT.DEPTH);
            const pBR = project(COURT.W, 150, COURT.DEPTH);
            ctx.moveTo(pFL.x, pFL.y); ctx.lineTo(pFR.x, pFR.y); ctx.lineTo(pBR.x, pBR.y); ctx.lineTo(pBL.x, pBL.y); 
            ctx.closePath(); ctx.stroke();

            // Rede
            const nL = project(-COURT.W, 150, COURT.NET_Z);
            const nR = project(COURT.W, 150, COURT.NET_Z);
            const nLT = project(-COURT.W, 150 - COURT.NET_H, COURT.NET_Z);
            const nRT = project(COURT.W, 150 - COURT.NET_H, COURT.NET_Z);
            
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.moveTo(nL.x, nL.y); ctx.lineTo(nR.x, nR.y); ctx.lineTo(nRT.x, nRT.y); ctx.lineTo(nLT.x, nLT.y); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillRect(nLT.x, nLT.y, nRT.x-nLT.x, 3);

            // Sombra da Bola (Importante para profundidade!)
            const bShadow = project(this.ball.x, 150, this.ball.z);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(bShadow.x, bShadow.y, 20*bShadow.s, 10*bShadow.s, 0, 0, Math.PI*2); ctx.fill();

            // Bola
            const bProj = project(this.ball.x, this.ball.y, this.ball.z);
            ctx.fillStyle = '#f1c40f'; // Amarelo Tênis
            ctx.beginPath(); ctx.arc(bProj.x, bProj.y, 25*bProj.s, 0, Math.PI*2); ctx.fill();
            // Brilho
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(bProj.x - 5*bProj.s, bProj.y - 5*bProj.s, 8*bProj.s, 0, Math.PI*2); ctx.fill();

            // Raquete (Fantasma)
            const rProj = project(this.racket.x, this.racket.y, 0);
            ctx.save();
            ctx.translate(rProj.x, rProj.y);
            ctx.rotate(this.racket.vx * 0.02); // Inclinação do swing
            
            // Desenha Raquete Procedural
            ctx.fillStyle = '#333'; ctx.fillRect(-5, 0, 10, 80); // Cabo
            ctx.beginPath(); 
            ctx.strokeStyle = '#e74c3c'; ctx.lineWidth = 5;
            ctx.fillStyle = 'rgba(231, 76, 60, 0.4)';
            ctx.ellipse(0, -40, 45, 55, 0, 0, Math.PI*2); 
            ctx.fill(); ctx.stroke();
            
            ctx.restore();

            return this.score;
        },

        failPoint: function(msg) {
            window.System.msg(msg);
            window.System.gameOver(this.score);
        }
    };

    window.System.registerGame('tennis', { name: 'Pro Tennis', icon: '🎾', camOpacity: 0.4 }, Logic);
})();
