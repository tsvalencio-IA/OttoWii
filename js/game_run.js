/**
 * =============================================================================
 * OTTO SUPER RUN - NINTENDO 2.5D PLATFORMER ENGINE
 * =============================================================================
 * Lógica de plataforma com profundidade, física de pulo variável e 
 * detecção de colisão precisa.
 */

(function() {
    const CONFIG = {
        GRAVITY: 0.8,
        JUMP_FORCE: -16,
        RUN_SPEED: 12,
        LANE_WIDTH: 250,
        HORIZON: 0.4,
        FOCAL_LENGTH: 400
    };

    const Logic = {
        score: 0,
        distance: 0,
        state: 'calibrate', // calibrate, play, hit
        
        // Player State
        player: {
            lane: 0,        // -1, 0, 1
            visualX: 0,
            y: 0,
            vy: 0,
            isJumping: false,
            isCrouching: false,
            animFrame: 0
        },

        // Calibration
        calibData: [],
        baseY: 0,

        // World Objects
        obstacles: [],
        decor: [],
        lastSpawn: 0,

        init() {
            this.score = 0;
            this.distance = 0;
            this.state = 'calibrate';
            this.calibData = [];
            this.obstacles = [];
            this.decor = [];
            this.player = {
                lane: 0, visualX: 0, y: 0, vy: 0,
                isJumping: false, isCrouching: false, animFrame: 0
            };
            window.System.msg("POSIÇÃO INICIAL");
        },

        update(ctx, w, h, pose, dt) {
            const cx = w / 2;
            const cy = h * CONFIG.HORIZON;
            const groundH = h - cy;

            // 1. INPUT & CALIBRATION
            if (pose) {
                const nose = pose.keypoints.find(k => k.name === 'nose');
                if (nose && nose.score > 0.5) {
                    if (this.state === 'calibrate') {
                        this.calibData.push(nose.y);
                        this.drawCalibration(ctx, w, h, nose);
                        if (this.calibData.length > 50) {
                            this.baseY = this.calibData.reduce((a, b) => a + b) / this.calibData.length;
                            this.state = 'play';
                            window.System.msg("CORRA!");
                        }
                        return 0;
                    }

                    // Lane Control (Horizontal)
                    if (nose.x < 640 * 0.35) this.player.lane = 1;
                    else if (nose.x > 640 * 0.65) this.player.lane = -1;
                    else this.player.lane = 0;

                    // Jump/Crouch Control (Vertical)
                    const diffY = nose.y - this.baseY;
                    if (diffY < -50 && !this.player.isJumping) {
                        this.player.vy = CONFIG.JUMP_FORCE;
                        this.player.isJumping = true;
                        window.Sfx.jump();
                    }
                    this.player.isCrouching = diffY > 60;
                }
            }

            if (this.state === 'play') {
                this.distance += CONFIG.RUN_SPEED;
                this.score = this.distance / 10;

                // Physics
                this.player.y += this.player.vy;
                this.player.vy += CONFIG.GRAVITY;
                if (this.player.y > 0) {
                    this.player.y = 0;
                    this.player.vy = 0;
                    this.player.isJumping = false;
                }

                // Smooth Lane Transition
                const targetX = this.player.lane * CONFIG.LANE_WIDTH;
                this.player.visualX += (targetX - this.player.visualX) * 0.2;

                // Spawning
                if (this.distance - this.lastSpawn > 800) {
                    this.spawnObstacle();
                    this.lastSpawn = this.distance;
                }

                // Update Obstacles
                this.obstacles.forEach((o, i) => {
                    o.z -= CONFIG.RUN_SPEED;
                    if (o.z < -100) this.obstacles.splice(i, 1);
                    
                    // Collision Detection
                    if (o.z > -20 && o.z < 20 && o.lane === this.player.lane) {
                        const playerTop = this.player.y - (this.player.isCrouching ? 30 : 80);
                        const playerBot = this.player.y;
                        
                        let hit = false;
                        if (o.type === 'hurdle' && !this.player.isJumping) hit = true;
                        if (o.type === 'block' && !this.player.isCrouching) hit = true;
                        
                        if (hit) {
                            window.System.gameOver(this.score);
                        }
                    }
                });
            }

            // 2. RENDERING
            this.drawBackground(ctx, w, h, cy);
            this.drawTrack(ctx, w, h, cy);
            
            // Draw Obstacles (Z-Sorted)
            this.obstacles.sort((a, b) => b.z - a.z).forEach(o => {
                this.drawObject(ctx, w, h, cy, o);
            });

            this.drawPlayer(ctx, w, h, cy);

            return this.score;
        },

        drawCalibration(ctx, w, h, nose) {
            const m = window.Gfx.map(nose, w, h);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = '#00ffff';
            ctx.lineWidth = 5;
            ctx.beginPath();
            ctx.arc(m.x, m.y, 40, 0, Math.PI * 2);
            ctx.stroke();
            
            const progress = this.calibData.length / 50;
            ctx.beginPath();
            ctx.arc(w/2, h/2, 60, -Math.PI/2, -Math.PI/2 + (Math.PI*2*progress));
            ctx.stroke();
        },

        drawBackground(ctx, w, h, cy) {
            // Sky
            const grad = ctx.createLinearGradient(0, 0, 0, cy);
            grad.addColorStop(0, '#5c94fc');
            grad.addColorStop(1, '#95b8ff');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, cy);

            // Mountains/Clouds
            ctx.fillStyle = '#7ba4f9';
            for(let i=0; i<5; i++) {
                const x = (i * w/4 + (this.distance*0.1)) % (w + 200) - 100;
                ctx.beginPath();
                ctx.arc(x, cy, 100, Math.PI, 0);
                ctx.fill();
            }
        },

        drawTrack(ctx, w, h, cy) {
            const groundH = h - cy;
            ctx.fillStyle = '#00cc00'; // Grass
            ctx.fillRect(0, cy, w, groundH);

            // Road Perspective
            ctx.fillStyle = '#d65a4e'; // Track
            ctx.beginPath();
            ctx.moveTo(w/2 - 40, cy);
            ctx.lineTo(w/2 + 40, cy);
            ctx.lineTo(w * 1.2, h);
            ctx.lineTo(-w * 0.2, h);
            ctx.fill();

            // Lane Lines
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 2;
            [-1, -0.33, 0.33, 1].forEach(l => {
                ctx.beginPath();
                ctx.moveTo(w/2 + l * 40, cy);
                ctx.lineTo(w/2 + l * w * 0.6, h);
                ctx.stroke();
            });
        },

        spawnObstacle() {
            const types = ['hurdle', 'block'];
            this.obstacles.push({
                lane: Math.floor(Math.random() * 3) - 1,
                z: 2000,
                type: types[Math.floor(Math.random() * types.length)]
            });
        },

        drawObject(ctx, w, h, cy, o) {
            const scale = CONFIG.FOCAL_LENGTH / (CONFIG.FOCAL_LENGTH + o.z);
            if (scale < 0.05) return;

            const x = w/2 + (o.lane * CONFIG.LANE_WIDTH * scale);
            const y = cy + (h - cy) * scale;
            const size = 100 * scale;

            ctx.save();
            if (o.type === 'hurdle') {
                ctx.fillStyle = '#fff';
                ctx.fillRect(x - size, y - size, size * 2, size);
                ctx.fillStyle = '#f00';
                ctx.fillRect(x - size, y - size, size * 2, size * 0.3);
            } else {
                ctx.fillStyle = '#f90';
                ctx.fillRect(x - size, y - size * 2, size * 2, size * 0.8);
                ctx.strokeStyle = '#fff';
                ctx.strokeRect(x - size, y - size * 2, size * 2, size * 0.8);
            }
            ctx.restore();
        },

        drawPlayer(ctx, w, h, cy) {
            const scale = 1.0;
            const x = w/2 + this.player.visualX;
            const y = h - 100 + this.player.y;
            
            ctx.save();
            ctx.translate(x, y);
            
            // Shadow
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, 0, 40, 15, 0, 0, Math.PI*2);
            ctx.fill();

            // Character (Mario Style Placeholder)
            const bodyH = this.player.isCrouching ? 40 : 80;
            ctx.fillStyle = '#f00'; // Red Shirt
            ctx.fillRect(-25, -bodyH, 50, bodyH);
            ctx.fillStyle = '#00f'; // Blue Pants
            ctx.fillRect(-25, -bodyH * 0.4, 50, bodyH * 0.4);
            ctx.fillStyle = '#ffdbac'; // Face
            ctx.beginPath();
            ctx.arc(0, -bodyH - 20, 25, 0, Math.PI*2);
            ctx.fill();
            ctx.fillStyle = '#f00'; // Hat
            ctx.fillRect(-25, -bodyH - 45, 50, 15);
            
            ctx.restore();
        }
    };

    // Registro Robusto
    function tryRegister() {
        if (window.System && typeof window.System.registerGame === 'function') {
            window.System.registerGame('run', 'Otto Run', '🏃', Logic);
        } else {
            setTimeout(tryRegister, 200);
        }
    }
    tryRegister();
})();
