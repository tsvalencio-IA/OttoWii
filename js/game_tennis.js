/**
 * =============================================================================
 * OTTO TENNIS - NINTENDO SPORTS ENGINE
 * =============================================================================
 * Jogo de tênis com física de trajetória 3D, detecção de colisão de raquete
 * e sistema de calibração de espaço.
 */

(function() {
    const CONFIG = {
        TABLE_W: 600,
        TABLE_L: 1200,
        BALL_SPEED: 800,
        GRAVITY: 400,
        FOCAL_LENGTH: 400
    };

    const Logic = {
        score: 0,
        state: 'calibrate', // calibrate, serve, play, over
        
        // Ball Physics
        ball: { x: 0, y: -100, z: 1000, vx: 0, vy: 0, vz: 0 },
        
        // Racket
        racket: { x: 0, y: 0, z: 0, visualX: 0, visualY: 0 },
        
        // Calibration
        calibCount: 0,
        handOrigin: { x: 0, y: 0 },

        init() {
            this.score = 0;
            this.state = 'calibrate';
            this.calibCount = 0;
            this.resetBall(1);
            window.System.msg("CALIBRAR MÃO");
        },

        resetBall(dir) {
            this.ball = {
                x: 0, y: -150, z: dir > 0 ? 1200 : 100,
                vx: (Math.random() - 0.5) * 200,
                vy: 0,
                vz: dir * -CONFIG.BALL_SPEED
            };
        },

        update(ctx, w, h, pose, dt) {
            const cx = w / 2;
            const cy = h / 2;

            // 1. INPUT & CALIBRATION
            if (pose) {
                const hand = pose.keypoints.find(k => k.name === 'right_wrist') || 
                             pose.keypoints.find(k => k.name === 'left_wrist');
                
                if (hand && hand.score > 0.5) {
                    const m = window.Gfx.map(hand, w, h);
                    
                    if (this.state === 'calibrate') {
                        this.drawCalibUI(ctx, w, h, m);
                        const dist = Math.hypot(m.x - cx, m.y - cy);
                        if (dist < 50) {
                            this.calibCount++;
                            if (this.calibCount > 60) {
                                this.handOrigin = { x: m.x, y: m.y };
                                this.state = 'serve';
                                window.System.msg("SAQUE!");
                                window.Sfx.coin();
                            }
                        } else {
                            this.calibCount = 0;
                        }
                    } else {
                        // Racket Movement
                        this.racket.visualX = (m.x - this.handOrigin.x) * 2;
                        this.racket.visualY = (m.y - this.handOrigin.y) * 2;
                    }
                }
            }

            if (this.state === 'play' || this.state === 'serve') {
                // Ball Physics
                this.ball.x += this.ball.vx * dt;
                this.ball.y += this.ball.vy * dt;
                this.ball.z += this.ball.vz * dt;
                this.ball.vy += CONFIG.GRAVITY * dt;

                // Table Bounce
                if (this.ball.y > 0 && Math.abs(this.ball.x) < CONFIG.TABLE_W/2 && this.ball.z > 0 && this.ball.z < CONFIG.TABLE_L) {
                    this.ball.y = 0;
                    this.ball.vy = -200;
                    window.Sfx.play(400, 'sine', 0.1, 0.1);
                }

                // Player Hit
                if (this.ball.z < 50 && this.ball.vz < 0) {
                    const dist = Math.hypot(this.ball.x - this.racket.visualX, (this.ball.y + 100) - this.racket.visualY);
                    if (dist < 150) {
                        this.ball.vz = CONFIG.BALL_SPEED + this.score * 10;
                        this.ball.vx = (this.ball.x - this.racket.visualX) * 2;
                        this.ball.vy = -300;
                        this.score++;
                        window.Sfx.hit();
                        window.Gfx.shake(5);
                        if (this.state === 'serve') this.state = 'play';
                    } else if (this.ball.z < -200) {
                        window.System.gameOver(this.score);
                    }
                }

                // AI Hit (Simple)
                if (this.ball.z > CONFIG.TABLE_L && this.ball.vz > 0) {
                    this.ball.vz = -CONFIG.BALL_SPEED - this.score * 10;
                    this.ball.vx = (Math.random() - 0.5) * 300;
                    this.ball.vy = -200;
                    window.Sfx.play(300, 'sine', 0.1, 0.1);
                }
            }

            // 2. RENDERING
            this.drawCourt(ctx, w, h, cx, cy);
            this.drawBall(ctx, w, h, cx, cy);
            this.drawRacket(ctx, w, h, cx, cy);

            return this.score;
        },

        drawCalibUI(ctx, w, h, m) {
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(w/2, h/2, 50, 0, Math.PI*2);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.arc(m.x, m.y, 20, 0, Math.PI*2);
            ctx.fillStyle = '#0f0';
            ctx.fill();
        },

        drawCourt(ctx, w, h, cx, cy) {
            ctx.fillStyle = '#1a1a1a';
            ctx.fillRect(0, 0, w, h);

            const project = (x, y, z) => {
                const scale = CONFIG.FOCAL_LENGTH / (CONFIG.FOCAL_LENGTH + z);
                return { x: cx + x * scale, y: cy + (y + 200) * scale };
            };

            const p1 = project(-CONFIG.TABLE_W/2, 0, 0);
            const p2 = project(CONFIG.TABLE_W/2, 0, 0);
            const p3 = project(CONFIG.TABLE_W/2, 0, CONFIG.TABLE_L);
            const p4 = project(-CONFIG.TABLE_W/2, 0, CONFIG.TABLE_L);

            ctx.fillStyle = '#2980b9';
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
            ctx.lineTo(p3.x, p3.y); ctx.lineTo(p4.x, p4.y);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Net
            const n1 = project(-CONFIG.TABLE_W/2, 0, CONFIG.TABLE_L/2);
            const n2 = project(CONFIG.TABLE_W/2, 0, CONFIG.TABLE_L/2);
            const n3 = project(CONFIG.TABLE_W/2, -50, CONFIG.TABLE_L/2);
            const n4 = project(-CONFIG.TABLE_W/2, -50, CONFIG.TABLE_L/2);
            ctx.fillStyle = 'rgba(255,255,255,0.5)';
            ctx.beginPath();
            ctx.moveTo(n1.x, n1.y); ctx.lineTo(n2.x, n2.y);
            ctx.lineTo(n3.x, n3.y); ctx.lineTo(n4.x, n4.y);
            ctx.fill();
        },

        drawBall(ctx, w, h, cx, cy) {
            const scale = CONFIG.FOCAL_LENGTH / (CONFIG.FOCAL_LENGTH + this.ball.z);
            const x = cx + this.ball.x * scale;
            const y = cy + (this.ball.y + 200) * scale;
            const r = 15 * scale;

            ctx.fillStyle = '#ffff00';
            ctx.shadowBlur = 10;
            ctx.shadowColor = '#ffff00';
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI*2);
            ctx.fill();
            ctx.shadowBlur = 0;
        },

        drawRacket(ctx, w, h, cx, cy) {
            if (this.state === 'calibrate') return;
            
            ctx.save();
            ctx.translate(cx + this.racket.visualX, cy + this.racket.visualY + 100);
            
            // Handle
            ctx.fillStyle = '#8b4513';
            ctx.fillRect(-10, 40, 20, 60);
            
            // Head
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.ellipse(0, 0, 50, 60, 0, 0, Math.PI*2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
            
            ctx.restore();
        }
    };

    // Register
    const check = setInterval(() => {
        if (window.System) {
            window.System.registerGame('tennis', 'Otto Tennis', '🎾', Logic);
            clearInterval(check);
        }
    }, 100);
})();
