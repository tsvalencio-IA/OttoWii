/**
 * =============================================================================
 * OTTO TENNIS - WII SPORTS STYLE
 * =============================================================================
 * Mecânica: Primeiro calibra o centro da mão. Depois, move a mão para rebater.
 */

(function() {
    const Logic = {
        score: 0,
        state: 'calibrate', // Estados: 'calibrate', 'play'
        
        // Física da Bola
        ball: { x:0, y:0, z:0, vx:0, vy:0, vz:0 },
        
        // Raquete do Jogador
        racket: { x:0, y:0 },
        
        // Dados de Calibração
        handRef: { x:0, y:0 }, // Onde é o "centro" do jogador
        calibTimer: 0,
        
        init() {
            this.score = 0;
            this.state = 'calibrate';
            this.calibTimer = 0;
            this.racket = { x:0, y:0 };
            window.System.msg("CENTRALIZAR MÃO");
        },

        resetBall() {
            // Lança a bola do fundo da quadra para o jogador
            this.ball = {
                x: 0,
                y: -300,  // Alta
                z: 1400,  // Longe
                vx: (Math.random() - 0.5) * 15, // Curva aleatória
                vy: 5,
                vz: -30   // Vem rápido em direção à tela
            };
        },

        update(ctx, w, h, pose) {
            const cx = w/2; 
            const cy = h/2;

            // =================================================================
            // 1. INPUT (RASTREAMENTO DA MÃO)
            // =================================================================
            let hand = null;
            if(pose) {
                // Tenta pegar mão direita, se não der, pega a esquerda
                const r = pose.keypoints.find(k => k.name === 'right_wrist');
                const l = pose.keypoints.find(k => k.name === 'left_wrist');
                const k = (r && r.score > 0.3) ? r : l;
                
                if(k && k.score > 0.3) {
                    hand = window.Gfx.map(k, w, h);
                }
            }

            // =================================================================
            // 2. ESTADO: CALIBRAÇÃO (Essencial para precisão)
            // =================================================================
            if(this.state === 'calibrate') {
                // Escurece a tela
                ctx.fillStyle = 'rgba(0,0,0,0.85)'; ctx.fillRect(0,0,w,h);
                
                // Desenha alvo de calibração
                ctx.strokeStyle = '#00ff00'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI*2); ctx.stroke();
                
                ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font='20px Arial';
                ctx.fillText("MANTENHA A MÃO NO CÍRCULO", cx, cy - 80);

                if(hand) {
                    // Desenha a mão do jogador (ponto verde)
                    ctx.fillStyle = '#0f0'; 
                    ctx.beginPath(); ctx.arc(hand.x, hand.y, 15, 0, Math.PI*2); ctx.fill();

                    // Verifica se está dentro do círculo
                    const dist = Math.hypot(hand.x - cx, hand.y - cy);
                    if(dist < 60) {
                        this.calibTimer++;
                        // Barra de progresso
                        ctx.fillStyle = '#00ff00';
                        ctx.fillRect(cx - 50, cy + 80, this.calibTimer * 2, 10);

                        if(this.calibTimer > 50) {
                            // Calibração Concluída!
                            this.handRef = { x: hand.x, y: hand.y };
                            this.state = 'play';
                            this.resetBall();
                            window.System.msg("SAQUE!");
                            window.Sfx.coin();
                        }
                    } else {
                        this.calibTimer = 0; // Reinicia se sair
                    }
                }
                return 0; // Sai do update visual do jogo
            }

            // =================================================================
            // 3. ESTADO: JOGO (PLAY)
            // =================================================================
            
            // Atualiza posição da raquete relativa à calibração
            if(hand) {
                // Multiplicador 2.5x para permitir alcançar os cantos movendo pouco o braço
                this.racket.x = cx + (hand.x - this.handRef.x) * 2.5;
                this.racket.y = cy + (hand.y - this.handRef.y) * 2.5;
            }

            // Física da Bola
            this.ball.x += this.ball.vx;
            this.ball.y += this.ball.vy;
            this.ball.z += this.ball.vz;
            
            // Gravidade
            if(this.ball.y < 200) this.ball.vy += 0.8; 
            
            // Quique no chão
            if(this.ball.y > 200) {
                this.ball.y = 200;
                this.ball.vy *= -0.7; // Perde energia
            }

            // Lógica de Rebatida (Colisão Jogador)
            // Se a bola estiver perto da tela (Z < 100) e vindo na nossa direção (vz < 0)
            if(this.ball.z < 100 && this.ball.vz < 0) {
                // Projeta a bola na tela 2D para checar colisão com a raquete
                const scale = 500 / (500 + this.ball.z);
                const ballScreenX = cx + this.ball.x * scale;
                const ballScreenY = cy + (this.ball.y + 100) * scale;
                
                // Distância entre bola e raquete
                const dist = Math.hypot(ballScreenX - this.racket.x, ballScreenY - this.racket.y);
                
                if(dist < 100) { // Hitbox da raquete
                    window.Sfx.hit();
                    this.score++;
                    window.Gfx.shake(5);

                    // Devolve a bola
                    this.ball.vz = 40; // Vai para o fundo
                    this.ball.vy = -20; // Sobe
                    
                    // Efeito lateral baseado em onde bateu na raquete
                    this.ball.vx = (ballScreenX - this.racket.x) * 0.5; 
                }
            }

            // Lógica da CPU (Oponente Fantasma)
            // Se a bola for longe (Z > 1200), a CPU devolve
            if(this.ball.z > 1400 && this.ball.vz > 0) {
                window.Sfx.click(); // Som suave de rebatida longe
                this.ball.vz = -35; // Vem de volta
                this.ball.vx = (Math.random() - 0.5) * 25; // Mira aleatória
                this.ball.vy = -15;
            }

            // Game Over (Bola passou do jogador)
            if(this.ball.z < -200) {
                window.System.gameOver(this.score);
            }

            // =================================================================
            // 4. RENDERIZAÇÃO
            // =================================================================
            
            // Quadra Azul
            ctx.fillStyle = '#2980b9'; 
            ctx.fillRect(0, 0, w, h);
            
            // Função auxiliar de projeção 3D
            const project = (x, y, z) => {
                const s = 500 / (500 + z);
                return { x: cx + x * s, y: cy + (y + 200) * s };
            };
            
            // Linhas da Quadra
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
            const p1 = project(-300, 0, 1400); // Fundo Esq
            const p2 = project(300, 0, 1400);  // Fundo Dir
            const p3 = project(300, 0, 0);     // Frente Dir
            const p4 = project(-300, 0, 0);    // Frente Esq
            
            ctx.beginPath(); 
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); 
            ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); 
            ctx.closePath(); 
            ctx.stroke();
            
            // Rede
            const n1 = project(-300, -50, 700);
            const n2 = project(300, -50, 700);
            ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.stroke();

            // Sombra da Bola
            const shadowPos = project(this.ball.x, 200, this.ball.z);
            const shadowScale = 500 / (500 + this.ball.z);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(shadowPos.x, shadowPos.y, 20*shadowScale, 10*shadowScale, 0, 0, Math.PI*2); ctx.fill();

            // Bola Amarela
            const bPos = project(this.ball.x, this.ball.y, this.ball.z);
            ctx.fillStyle = '#ffeb3b'; 
            ctx.beginPath(); ctx.arc(bPos.x, bPos.y, 25 * shadowScale, 0, Math.PI*2); ctx.fill();
            
            // Raquete do Jogador (Vermelha semitransparente)
            ctx.fillStyle = 'rgba(231, 76, 60, 0.7)';
            ctx.beginPath(); ctx.arc(this.racket.x, this.racket.y, 60, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            // Cabo visual
            ctx.beginPath(); ctx.moveTo(this.racket.x, this.racket.y+60); ctx.lineTo(this.racket.x, this.racket.y+100); ctx.stroke();

            return this.score;
        }
    };

    window.System.registerGame('tennis', { 
        name: 'Otto Tennis', 
        icon: '🎾', 
        camOpacity: 0.5 
    }, Logic);
})();