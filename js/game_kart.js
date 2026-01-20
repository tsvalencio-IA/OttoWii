/**
 * =============================================================================
 * OTTO KART - NINTENDO RACING ENGINE
 * =============================================================================
 * Simulador de corrida com física de inércia, sistema de drift e 
 * adversários com IA.
 */

(function() {
    const CONFIG = {
        MAX_SPEED: 800,
        ACCEL: 200,
        FRICTION: 0.98,
        STEER_SPEED: 5,
        TRACK_LENGTH: 20000,
        LANE_WIDTH: 1200,
        FOCAL_LENGTH: 300
    };

    const Logic = {
        score: 0,
        speed: 0,
        posZ: 0,
        posX: 0,
        steer: 0,
        lap: 1,
        state: 'warmup', // warmup, race, finish
        
        // Entities
        opponents: [],
        props: [],
        
        // Input
        wheelAngle: 0,

        init() {
            this.score = 0;
            this.speed = 0;
            this.posZ = 0;
            this.posX = 0;
            this.steer = 0;
            this.lap = 1;
            this.state = 'warmup';
            this.opponents = [];
            this.props = [];
            
            // Spawn Opponents
            for(let i=0; i<5; i++) {
                this.opponents.push({
                    id: i,
                    x: (Math.random() - 0.5) * 2000,
                    z: 500 + i * 1000,
                    speed: 600 + Math.random() * 150,
                    color: ['#f00', '#0f0', '#00f', '#ff0', '#f0f'][i]
                });
            }

            // Spawn Props (Trees, Pipes)
            for(let z=1000; z<CONFIG.TRACK_LENGTH; z+=400) {
                this.props.push({
                    x: (Math.random() > 0.5 ? 1 : -1) * 2000,
                    z: z,
                    type: Math.random() > 0.5 ? 'tree' : 'pipe'
                });
            }

            window.System.msg("PREPARAR...");
            setTimeout(() => { 
                this.state = 'race'; 
                window.System.msg("GO!"); 
            }, 3000);
        },

        update(ctx, w, h, pose, dt) {
            const cx = w / 2;
            const cy = h * 0.4;

            // 1. INPUT (Steering Wheel Logic)
            if (pose && this.state === 'race') {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');

                if (lw && rw && lw.score > 0.4 && rw.score > 0.4) {
                    const p1 = window.Gfx.map(lw, w, h);
                    const p2 = window.Gfx.map(rw, w, h);
                    
                    const dx = p2.x - p1.x;
                    const dy = p2.y - p1.y;
                    this.wheelAngle = Math.atan2(dy, dx);
                    
                    // Physics Application
                    this.steer = this.wheelAngle * CONFIG.STEER_SPEED;
                    this.speed = Math.min(CONFIG.MAX_SPEED, this.speed + CONFIG.ACCEL * dt);
                } else {
                    this.speed *= CONFIG.FRICTION;
                }
            }

            if (this.state === 'race') {
                this.posZ += this.speed * dt;
                this.posX += this.steer * (this.speed / CONFIG.MAX_SPEED) * 10;
                
                // Boundary
                if (Math.abs(this.posX) > 2500) {
                    this.speed *= 0.95;
                    window.Gfx.shake(5);
                }

                // Lap Logic
                if (this.posZ > CONFIG.TRACK_LENGTH) {
                    this.posZ = 0;
                    this.lap++;
                    window.System.msg("VOLTA " + this.lap);
                    if (this.lap > 3) {
                        this.state = 'finish';
                        window.System.gameOver(this.score);
                    }
                }

                this.score = this.posZ / 10;

                // Update Opponents
                this.opponents.forEach(o => {
                    o.z += o.speed * dt;
                    if (o.z > CONFIG.TRACK_LENGTH) o.z = 0;
                });
            }

            // 2. RENDERING
            this.drawWorld(ctx, w, h, cy);
            
            // Z-Sorting for all objects
            const renderQueue = [];
            this.props.forEach(p => renderQueue.push({ type: 'prop', obj: p, z: p.z - (this.posZ % CONFIG.TRACK_LENGTH) }));
            this.opponents.forEach(o => renderQueue.push({ type: 'opp', obj: o, z: o.z - (this.posZ % CONFIG.TRACK_LENGTH) }));
            
            renderQueue
                .filter(item => item.z > 0 && item.z < 5000)
                .sort((a, b) => b.z - a.z)
                .forEach(item => {
                    this.drawObject(ctx, w, h, cy, item);
                });

            this.drawUI(ctx, w, h);

            return this.score;
        },

        drawWorld(ctx, w, h, cy) {
            // Sky & Grass
            ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, w, cy);
            ctx.fillStyle = '#32cd32'; ctx.fillRect(0, cy, w, h - cy);

            // Road Perspective
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.moveTo(w/2, cy);
            ctx.lineTo(w * 1.5 - this.posX * 0.1, h);
            ctx.lineTo(-w * 0.5 - this.posX * 0.1, h);
            ctx.fill();

            // Road Lines
            ctx.strokeStyle = '#fff';
            ctx.setLineDash([20, 20]);
            ctx.beginPath();
            ctx.moveTo(w/2, cy);
            ctx.lineTo(w/2 - this.posX * 0.1, h);
            ctx.stroke();
            ctx.setLineDash([]);
        },

        drawObject(ctx, w, h, cy, item) {
            const scale = CONFIG.FOCAL_LENGTH / (CONFIG.FOCAL_LENGTH + item.z);
            const x = w/2 + (item.obj.x - this.posX) * scale;
            const y = cy + (h - cy) * scale;
            const size = 200 * scale;

            ctx.save();
            if (item.type === 'prop') {
                ctx.fillStyle = item.obj.type === 'tree' ? '#2d5a27' : '#00aa00';
                ctx.fillRect(x - size/2, y - size, size, size);
            } else {
                ctx.fillStyle = item.obj.color;
                ctx.fillRect(x - size, y - size/2, size * 2, size/2);
                ctx.fillStyle = '#000';
                ctx.fillRect(x - size, y, size/2, size/4);
                ctx.fillRect(x + size/2, y, size/2, size/4);
            }
            ctx.restore();
        },

        drawUI(ctx, w, h) {
            // Draw Steering Wheel Overlay
            const wheel = document.getElementById('visual-wheel');
            if (wheel) {
                wheel.style.transform = `rotate(${this.wheelAngle}rad)`;
            }
        }
    };

    // Register
    const check = setInterval(() => {
        if (window.System) {
            window.System.registerGame('kart', 'Otto Kart', '🏎️', Logic, { showWheel: true });
            clearInterval(check);
        }
    }, 100);
})();
