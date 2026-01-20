/**
 * =============================================================================
 * OTTO TENNIS PRO - REAL VECTOR PHYSICS
 * =============================================================================
 * Lógica: Utiliza álgebra vetorial real para calcular a trajetória da bola.
 * Diferencial: Controle direcional baseado no ponto de impacto (Sweet Spot).
 * =============================================================================
 */

(function() {
    // Configurações da Quadra (Metros virtuais)
    const COURT = { W: 400, L: 1000, NET_H: 50 };
    
    // Física
    const PHYS = {
        GRAVITY: 0.5,
        DRAG: 0.99,
        BOUNCE_LOSS: 0.75,
        HIT_POWER: 28,      // Força base da raquete
        SPIN_FACTOR: 0.3    // Influência do movimento vertical da mão
    };

    const Logic = {
        score: 0,
        state: 'serve', // serve, play, point_end
        msg: "",
        
        // Entidades
        ball: { x:0, y:0, z:0, vx:0, vy:0, vz:0, spinning:0 },
        racket: { x:0, y:0, z:0, vx:0, vy:0 }, // Z é fixo na tela (0)
        
        // Hand Tracking History (para calcular velocidade do swing)
        lastHand: { x:0, y:0, time:0 },
        handVel: { x:0, y:0 },

        // Calibração
        centerRef: { x:0, y:0 },

        init: function() {
            this.score = 0;
            this.state = 'serve';
            this.centerRef = { x:0, y:0 };
            this.prepareServe();
            window.System.msg("SAQUE!");
        },

        prepareServe: function() {
            // Bola flutua na frente do jogador esperando o saque
            this.ball = { x: 50, y: -150, z: 50, vx: 0, vy: 0, vz: 0, spinning: 0 };
            this.state = 'serve';
        },

        update: function(ctx, w, h, pose) {
            const now = Date.now();
            const cx = w/2; 
            const cy = h/2;

            // =================================================================
            // 1. INPUT VETORIAL
            // =================================================================
            if(pose) {
                // Prioriza mão direita
                const rw = pose.keypoints.find(k=>k.name==='right_wrist');
                if(rw && rw.score > 0.3) {
                    // Mapeia para coordenadas do canvas
                    const handPos = window.Gfx.map(rw, w, h);
                    
                    // Se for o primeiro frame, calibra o centro
                    if(this.centerRef.x === 0) this.centerRef = { x: handPos.x, y: handPos.y + 100 };

                    // Calcula Posição da Raquete (Relativa ao centro do corpo)
                    // Amplificação x2.0 para cobrir a quadra sem andar
                    this.racket.x = (handPos.x - this.centerRef.x) * 2.5;
                    this.racket.y = (handPos.y - this.centerRef.y) * 2.0;
                    
                    // Calcula VELOCIDADE DO SWING (px/ms)
                    const dt = now - this.lastHand.time;
                    if(dt > 0) {
                        this.racket.vx = (this.racket.x - this.lastHand.x); // Swing lateral
                        this.racket.vy = (this.racket.y - this.lastHand.y); // Top Spin/Slice
                    }
                    this.lastHand = { x: this.racket.x, y: this.racket.y, time: now };
                }
            }

            // =================================================================
            // 2. FÍSICA DA BOLA
            // =================================================================
            if(this.state !== 'serve') {
                this.ball.x += this.ball.vx;
                this.ball.y += this.ball.vy;
                this.ball.z += this.ball.vz;
                this.ball.vy += PHYS.GRAVITY; // Gravidade
                
                // Quique no chão (y = 200 é o chão)
                if(this.ball.y > 200) {
                    this.ball.y = 200;
                    this.ball.vy *= -PHYS.BOUNCE_LOSS;
                    window.Sfx.click(); // Som de quique
                    
                    // Verifica se saiu da quadra
                    if(Math.abs(this.ball.x) > COURT.W && this.ball.z > 0) {
                        this.finishPoint("FORA!", -1);
                    }
                }

                // Rede (Colisão simples)
                if(this.ball.z > 680 && this.ball.z < 720 && this.ball.y > 200 - COURT.NET_H) {
                    this.ball.vz *= -0.2; // Bate e cai
                    this.ball.vy = 5;
                }
            }

            // =================================================================
            // 3. DETECÇÃO DE COLISÃO (O SEGREDO DA JOGABILIDADE)
            // =================================================================
            // A bola só é rebatível se estiver perto do plano da câmera (Z < 100)
            if(this.ball.z < 100 && this.ball.z > -50) {
                
                // Distância Raquete <-> Bola
                // Nota: racket.x/y são coordenadas de mundo local, ball.x/y também
                const dist = Math.hypot(this.ball.x - this.racket.x, this.ball.y - this.racket.y);
                
                // Raio da raquete = 80
                if(dist < 80) {
                    if(this.state === 'serve') this.state = 'play';
                    
                    window.Sfx.hit();
                    window.Gfx.shake(5);

                    // --- VETOR DE REBATIDA ---
                    
                    // 1. Direção Básica (Para o fundo)
                    this.ball.vz = PHYS.HIT_POWER + Math.abs(this.racket.vy * 0.2);
                    
                    // 2. Direção Lateral (Aiming)
                    // Se bater cedo (bola a direita), vai pra esquerda (cruzada)
                    // Se bater tarde (bola a esquerda), vai pra direita
                    // + Influência do movimento lateral da mão
                    this.ball.vx = (this.ball.x - this.racket.x) * 0.5 + (this.racket.vx * 0.5);
                    
                    // 3. Altura (Lob vs Smash)
                    // Se bater de cima pra baixo (Smash), vy aumenta
                    this.ball.vy = -10 + (this.racket.vy * 0.3); 
                    
                    // Spin visual
                    this.ball.spinning = this.racket.vx;
                }
            }
            
            // Perdeu a bola?
            if(this.ball.z < -200) {
                this.finishPoint("MISS", -1);
            }

            // =================================================================
            // 4. IA DO OPONENTE (GHOST)
            // =================================================================
            if(this.ball.z > 1400 && this.ball.vz > 0) {
                // CPU devolve
                window.Sfx.click();
                this.ball.vz = -(PHYS.HIT_POWER * 0.9 + (this.score * 0.5)); // Fica mais rápido
                this.ball.vx = (Math.random() - 0.5) * (COURT.W * 1.5); // Mira na quadra toda
                this.ball.vy = -15; // Lob padrão
                this.score++;
            }

            // =================================================================
            // 5. RENDERIZAÇÃO 3D
            // =================================================================
            
            // Projeção Perspectiva
            const project = (x, y, z) => {
                const fov = 600;
                const scale = fov / (fov + z);
                return { 
                    x: cx + x * scale, 
                    y: cy + y * scale, 
                    s: scale 
                };
            };

            // Céu e Chão
            ctx.fillStyle = '#2980b9'; ctx.fillRect(0,0,w,h); // Chão Azul
            ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0,w,cy); // Céu

            // Desenha Quadra
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.beginPath();
            const p1 = project(-COURT.W, 200, 1400);
            const p2 = project(COURT.W, 200, 1400);
            const p3 = project(COURT.W, 200, 0);
            const p4 = project(-COURT.W, 200, 0);
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y); ctx.closePath(); ctx.stroke();
            
            // Rede
            const n1 = project(-COURT.W, 200 - COURT.NET_H, 700);
            const n2 = project(COURT.W, 200 - COURT.NET_H, 700);
            const n3 = project(COURT.W, 200, 700);
            const n4 = project(-COURT.W, 200, 700);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.beginPath(); ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y); ctx.lineTo(n3.x, n3.y); ctx.lineTo(n4.x, n4.y); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.fillRect(n1.x, n1.y, n2.x-n1.x, 2); // Faixa branca

            // Sombra da Bola
            const bShadow = project(this.ball.x, 200, this.ball.z);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(bShadow.x, bShadow.y, 20*bShadow.s, 10*bShadow.s, 0, 0, Math.PI*2); ctx.fill();

            // Bola
            const bProj = project(this.ball.x, this.ball.y, this.ball.z);
            ctx.fillStyle = '#eeff00';
            ctx.beginPath(); ctx.arc(bProj.x, bProj.y, 25*bProj.s, 0, Math.PI*2); ctx.fill();
            // Detalhe do Spin na bola
            ctx.strokeStyle = '#cca000'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bProj.x, bProj.y, 25*bProj.s, 0, Math.PI*2); ctx.stroke();

            // Raquete (Fantasma vermelho seguindo a mão)
            const rProj = project(this.racket.x, this.racket.y, 0);
            ctx.save();
            ctx.translate(rProj.x, rProj.y);
            // Inclina a raquete com o movimento
            ctx.rotate(this.racket.vx * 0.02);
            
            // Cabo
            ctx.fillStyle = '#333'; ctx.fillRect(-5, 0, 10, 80);
            // Cabeça
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 5;
            ctx.fillStyle = 'rgba(192, 57, 43, 0.3)';
            ctx.beginPath(); ctx.ellipse(0, -40, 40, 50, 0, 0, Math.PI*2); 
            ctx.fill(); ctx.stroke();
            ctx.restore();

            return this.score;
        },

        finishPoint: function(msg, points) {
            window.System.msg(msg);
            if(points < 0) {
                window.System.gameOver(this.score);
            } else {
                this.score += points;
                setTimeout(() => this.prepareServe(), 1000);
            }
        }
    };

    window.System.registerGame('tennis', { name: 'Pro Tennis', icon: '🎾', camOpacity: 0.4 }, Logic);
})();