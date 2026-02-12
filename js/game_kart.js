/* =================================================================
   KART LEGENDS - ULTIMATE ARCADE PHYSICS ENGINE
   ================================================================= */

(function() {
    const KART_CONF = {
        MAX_SPEED: 300,
        ACCEL: 0.12,
        FRICTION: 0.98,
        DRIFT_GRIP: 0.95,
        OFFROAD_MULT: 0.4,
        ROAD_WIDTH: 2200,
        SEG_LEN: 200,
        DRAW_DIST: 200
    };

    const TRACK_DATA = [
        { curve: 0, color: '#444' }, { curve: 0, color: '#444' },
        { curve: 0.02, color: '#333' }, { curve: 0.04, color: '#333' },
        { curve: 0, color: '#444' }, { curve: -0.05, color: '#333' }
    ];

    class KartGame {
        constructor() {
            this.pos = 0;
            this.speed = 0;
            this.x = 0; // -1 to 1
            this.steer = 0;
            this.drift = 0;
            this.segments = [];
            this.score = 0;
            this.particles = [];
            this.remotePlayers = {};
        }

        init() {
            this.pos = 0;
            this.speed = 0;
            this.x = 0;
            this.segments = this.generateTrack();
            if (window.DB) this.syncNet();
        }

        generateTrack() {
            let s = [];
            for(let i=0; i<500; i++) {
                const curve = Math.sin(i/20) * 0.04;
                s.push({ curve, color: Math.floor(i/4)%2 ? '#222' : '#282828' });
            }
            return s;
        }

        update(ctx, w, h, pose, dt) {
            this.handleInput(pose, dt);
            this.physics(dt);
            this.render(ctx, w, h);
            return this.score;
        }

        handleInput(pose, dt) {
            if (!pose) return;
            const lw = pose.keypoints.find(k => k.name === 'left_wrist');
            const rw = pose.keypoints.find(k => k.name === 'right_wrist');

            if (lw?.score > 0.3 && rw?.score > 0.3) {
                const angle = Math.atan2(rw.y - lw.y, rw.x - lw.x);
                this.steer = angle * 2.0;
            } else {
                this.steer *= 0.9;
            }
        }

        physics(dt) {
            const currentSeg = this.segments[Math.floor(this.pos / KART_CONF.SEG_LEN) % this.segments.length];
            
            // Accel
            this.speed += KART_CONF.ACCEL;
            if (this.speed > KART_CONF.MAX_SPEED) this.speed = KART_CONF.MAX_SPEED;
            this.speed *= KART_CONF.FRICTION;

            // Lateral movement
            const curveForce = currentSeg.curve * (this.speed * 0.01);
            this.x += (this.steer * 0.05) - curveForce;

            // Offroad check
            if (Math.abs(this.x) > 1.2) {
                this.speed *= 0.95;
                if (Math.random() > 0.5) this.spawnParticle(0, 'dust');
            }

            this.pos += this.speed;
            this.score += this.speed * 0.01;
            
            this.x = Math.max(-2, Math.min(2, this.x));
        }

        render(ctx, w, h) {
            const horizon = h * 0.45;
            const cx = w / 2;

            // Background
            const sky = ctx.createLinearGradient(0,0,0,horizon);
            sky.addColorStop(0, '#001a33'); sky.addColorStop(1, '#004d99');
            ctx.fillStyle = sky; ctx.fillRect(0,0,w,horizon);
            
            // Grass
            ctx.fillStyle = '#0a3d0a'; ctx.fillRect(0, horizon, w, h - horizon);

            let dx = 0;
            let camX = this.x * (w * 0.3);

            for (let n = 0; n < KART_CONF.DRAW_DIST; n++) {
                const segIdx = (Math.floor(this.pos / KART_CONF.SEG_LEN) + n) % this.segments.length;
                const seg = this.segments[segIdx];
                
                const scale = 1 / (1 + n * 0.05);
                const sy = horizon + (h - horizon) * scale;
                const rw = (w * 4) * scale;
                
                dx += seg.curve;
                const x = cx - (camX * scale) - (dx * n * scale * 5);

                ctx.fillStyle = seg.color;
                ctx.beginPath();
                ctx.moveTo(x - rw, sy);
                ctx.lineTo(x + rw, sy);
                const nextScale = 1 / (1 + (n+1) * 0.05);
                const nsy = horizon + (h - horizon) * nextScale;
                const nrw = (w * 4) * nextScale;
                const nx = cx - (camX * nextScale) - ((dx + seg.curve) * (n+1) * nextScale * 5);
                ctx.lineTo(nx + nrw, nsy);
                ctx.lineTo(nx - nrw, nsy);
                ctx.fill();

                // Zebra Line
                if (n % 4 < 2) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(x - rw - 10, sy, 10, 2);
                    ctx.fillRect(x + rw, sy, 10, 2);
                }
            }

            this.drawPlayer(ctx, w, h);
            this.renderParticles(ctx);
        }

        drawPlayer(ctx, w, h) {
            ctx.save();
            ctx.translate(w/2, h * 0.85);
            ctx.rotate(this.steer * 0.1);
            
            // Kart Sprite Simplificado High-Tech
            ctx.fillStyle = '#00f2ff';
            ctx.shadowBlur = 20; ctx.shadowColor = '#00f2ff';
            ctx.beginPath();
            ctx.moveTo(-40, 20); ctx.lineTo(40, 20); ctx.lineTo(30, -30); ctx.lineTo(-30, -30);
            ctx.fill();
            
            ctx.fillStyle = '#111';
            ctx.fillRect(-45, 0, 15, 25); ctx.fillRect(30, 0, 15, 25);
            ctx.restore();
        }

        spawnParticle(offset, type) {
            this.particles.push({ x: Math.random() * 100 - 50, y: 0, life: 1, type });
        }

        renderParticles(ctx) {
            this.particles = this.particles.filter(p => {
                p.life -= 0.05;
                ctx.globalAlpha = p.life;
                ctx.fillStyle = p.type === 'dust' ? '#888' : '#fff';
                ctx.fillRect(window.innerWidth/2 + p.x, window.innerHeight * 0.9, 5, 5);
                return p.life > 0;
            });
            ctx.globalAlpha = 1.0;
        }

        syncNet() {
            // Placeholder para Multiplayer Manager
        }

        cleanup() {
            this.particles = [];
        }
    }

    window.System.registerGame('kart', 'Velocity AR', '🏎️', new KartGame(), { camOpacity: 0.1 });
})();