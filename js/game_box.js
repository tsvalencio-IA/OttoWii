/**
 * =============================================================================
 * OTTO BOX - RHYTHM FIGHT
 * =============================================================================
 */
(function() {
    const Logic = {
        targets: [],
        particles: [],
        lastSpawn: 0,
        score: 0,
        combo: 0,

        init() {
            this.targets = [];
            this.particles = [];
            this.score = 0;
            this.combo = 0;
        },

        update(ctx, w, h, pose, dt) {
            // Spawn
            if (performance.now() - this.lastSpawn > 800) {
                this.spawn(w, h);
                this.lastSpawn = performance.now();
            }

            // Draw Skeleton Mirror
            window.Gfx.drawSkeleton(ctx, pose, w, h);

            // Update Targets
            for(let i = this.targets.length - 1; i >= 0; i--) {
                const t = this.targets[i];
                t.life -= dt;
                
                // Draw
                const r = t.radius * (t.life / t.maxLife);
                ctx.fillStyle = t.color;
                ctx.beginPath();
                ctx.arc(t.x, t.y, r, 0, Math.PI*2);
                ctx.fill();
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 3;
                ctx.stroke();

                // Hit Detection
                if (pose) {
                    const wrists = pose.keypoints.filter(k => k.name.includes('wrist') && k.score > 0.4);
                    for(let k of wrists) {
                        const p = window.Gfx.project(k, w, h);
                        const dist = Math.hypot(p.x - t.x, p.y - t.y);
                        if (dist < t.radius + 20) {
                            this.hit(t, i);
                            break;
                        }
                    }
                }

                if (t.life <= 0) {
                    this.targets.splice(i, 1);
                    this.combo = 0;
                }
            }
            
            // Draw Particles
            this.updateParticles(ctx, dt);

            // Draw Hands
            if(pose) {
                const wrists = pose.keypoints.filter(k => k.name.includes('wrist') && k.score > 0.4);
                ctx.fillStyle = 'rgba(255,0,0,0.5)';
                for(let k of wrists) {
                     const p = window.Gfx.project(k, w, h);
                     ctx.beginPath();
                     ctx.arc(p.x, p.y, 30, 0, Math.PI*2);
                     ctx.fill();
                }
            }

            return this.score;
        },

        spawn(w, h) {
            this.targets.push({
                x: MathUtils.rand(w * 0.2, w * 0.8),
                y: MathUtils.rand(h * 0.2, h * 0.6),
                radius: 60,
                life: 1.5,
                maxLife: 1.5,
                color: Math.random() > 0.5 ? '#3498db' : '#e74c3c'
            });
        },

        hit(t, i) {
            this.targets.splice(i, 1);
            this.score += 100 * (this.combo + 1);
            this.combo++;
            window.Sfx.hit();
            window.Gfx.shake(5);
            
            // Spawn particles
            for(let k=0; k<10; k++) {
                this.particles.push({
                    x: t.x, y: t.y,
                    vx: MathUtils.rand(-200, 200),
                    vy: MathUtils.rand(-200, 200),
                    life: 0.5,
                    color: t.color
                });
            }
        },

        updateParticles(ctx, dt) {
            for(let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt;
                
                if (p.life <= 0) this.particles.splice(i, 1);
                else {
                    ctx.globalAlpha = p.life * 2;
                    ctx.fillStyle = p.color;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 5, 0, Math.PI*2);
                    ctx.fill();
                }
            }
            ctx.globalAlpha = 1;
        }
    };

    window.System.registerGame('box', { name: 'Otto Box', icon: '🥊' }, Logic);
})();