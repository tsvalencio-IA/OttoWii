/**
 * =============================================================================
 * OTTO TENNIS
 * =============================================================================
 */
(function() {
    const Logic = {
        ball: { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 },
        score: 0,
        state: 'serve', // serve, play

        init() {
            this.score = 0;
            this.resetBall();
        },

        resetBall() {
            this.ball = { x: 0, y: -200, z: 1000, vx: 0, vy: 0, vz: -800 };
            this.state = 'play';
        },

        update(ctx, w, h, pose, dt) {
            const cx = w/2;
            const cy = h/2;

            // Physics
            this.ball.x += this.ball.vx * dt;
            this.ball.y += this.ball.vy * dt;
            this.ball.z += this.ball.vz * dt;
            
            // Gravity & Bounce
            this.ball.vy += 400 * dt;
            if (this.ball.y > 100) {
                 this.ball.y = 100;
                 this.ball.vy *= -0.8; // Perda de energia
            }

            // Hit Check
            if (this.ball.z < 100 && this.ball.vz < 0 && pose) {
                const hand = pose.keypoints.find(k => k.name === 'right_wrist');
                if (hand && hand.score > 0.4) {
                    const hp = window.Gfx.project(hand, w, h);
                    // Projeção simples da bola 3D para 2D para checar colisão
                    const ballScale = 400 / (400 + this.ball.z);
                    const bx = cx + this.ball.x * ballScale;
                    const by = cy + this.ball.y * ballScale;

                    if (Math.hypot(hp.x - bx, hp.y - by) < 100) {
                        this.ball.vz = 1000; // Rebate
                        this.ball.vx = (bx - hp.x) * 5;
                        this.ball.vy = -300;
                        window.Sfx.hit();
                        this.score++;
                    }
                }
            }

            // AI return
            if (this.ball.z > 1200 && this.ball.vz > 0) {
                this.ball.vz = -1000;
                this.ball.vx = MathUtils.rand(-200, 200);
            }

            // Render Court
            ctx.fillStyle = '#2c3e50';
            ctx.fillRect(0, cy, w, h/2);
            ctx.strokeStyle = 'white';
            ctx.beginPath();
            ctx.moveTo(w/2 - 200, cy); ctx.lineTo(w/2 - 400, h);
            ctx.moveTo(w/2 + 200, cy); ctx.lineTo(w/2 + 400, h);
            ctx.stroke();

            // Render Ball
            const scale = 400 / (400 + this.ball.z);
            const sx = cx + this.ball.x * scale;
            const sy = cy + this.ball.y * scale;
            
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(sx, sy, 20 * scale, 0, Math.PI*2);
            ctx.fill();

            // Draw Racket Hand
             if (pose) {
                const hand = pose.keypoints.find(k => k.name === 'right_wrist');
                if(hand) {
                     const hp = window.Gfx.project(hand, w, h);
                     ctx.strokeStyle = '#e74c3c';
                     ctx.lineWidth = 5;
                     ctx.beginPath(); ctx.arc(hp.x, hp.y, 40, 0, Math.PI*2); ctx.stroke();
                }
             }

            return this.score;
        }
    };
    window.System.registerGame('tennis', { name: 'Otto Tennis', icon: '🎾' }, Logic);
})();