/**
 * =============================================================================
 * OTTO BOXING - NEON IMPACT ENGINE
 * =============================================================================
 * Jogo de combate rítmico com detecção de impacto de alta precisão,
 * efeitos de partículas e feedback tátil visual.
 */

(function() {
    const CONFIG = {
        TARGET_RADIUS: 80,
        SPAWN_RATE: 1000, // ms
        MAX_TARGETS: 3,
        COMBO_TIMEOUT: 2000
    };

    const Logic = {
        score: 0,
        targets: [],
        particles: [],
        lastSpawn: 0,
        combo: 0,
        lastHit: 0,

        init() {
            this.score = 0;
            this.targets = [];
            this.particles = [];
            this.combo = 0;
            this.lastSpawn = 0;
            window.System.msg("FIGHT!");
        },

        update(ctx, w, h, pose, dt) {
            const now = performance.now();

            // 1. BACKGROUND & SKELETON
            ctx.fillStyle = '#050505';
            ctx.fillRect(0, 0, w, h);
            
            // Desenha o esqueleto do jogador (Feedback visual crítico)
            if (window.Gfx && pose) {
                window.Gfx.drawSkeleton(ctx, pose, w, h);
            }

            // 2. TARGET MANAGEMENT
            if (now - this.lastSpawn > CONFIG.SPAWN_RATE && this.targets.length < CONFIG.MAX_TARGETS) {
                this.spawnTarget(w, h);
                this.lastSpawn = now;
            }

            // 3. COLLISION DETECTION
            if (pose) {
                const hands = [
                    pose.keypoints.find(k => k.name === 'left_wrist'),
                    pose.keypoints.find(k => k.name === 'right_wrist')
                ];

                hands.forEach(hand => {
                    if (hand && hand.score > 0.5) {
                        const m = window.Gfx.map(hand, w, h);
                        this.checkHit(m.x, m.y);
                        this.drawGlove(ctx, m.x, m.y);
                    }
                });
            }

            // 4. UPDATE & DRAW TARGETS
            this.targets.forEach((t, i) => {
                t.life -= dt;
                if (t.life <= 0) {
                    this.targets.splice(i, 1);
                    this.combo = 0; // Quebra o combo se perder o alvo
                } else {
                    this.drawTarget(ctx, t);
                }
            });

            // 5. PARTICLES
            this.updateParticles(ctx, dt);

            // 6. COMBO UI
            if (this.combo > 1) {
                ctx.fillStyle = '#fff';
                ctx.font = "bold 40px 'Russo One'";
                ctx.textAlign = "center";
                ctx.fillText(`${this.combo}X COMBO`, w/2, 100);
            }

            return this.score;
        },

        spawnTarget(w, h) {
            this.targets.push({
                x: w * 0.2 + Math.random() * w * 0.6,
                y: h * 0.2 + Math.random() * h * 0.5,
                life: 2.0,
                maxLife: 2.0,
                pulse: 0
            });
        },

        checkHit(hx, hy) {
            this.targets.forEach((t, i) => {
                const dist = Math.hypot(hx - t.x, hy - t.y);
                if (dist < CONFIG.TARGET_RADIUS * 1.5) {
                    this.hitTarget(i, t);
                }
            });
        },

        hitTarget(index, t) {
            this.targets.splice(index, 1);
            this.combo++;
            this.score += 100 * this.combo;
            this.lastHit = performance.now();
            
            window.Sfx.hit();
            window.Gfx.shake(10);
            
            // Spawn Particles
            for (let i = 0; i < 15; i++) {
                this.particles.push({
                    x: t.x, y: t.y,
                    vx: (Math.random() - 0.5) * 500,
                    vy: (Math.random() - 0.5) * 500,
                    life: 0.5,
                    color: '#0ff'
                });
            }
        },

        drawTarget(ctx, t) {
            const pct = t.life / t.maxLife;
            const radius = CONFIG.TARGET_RADIUS * (1 + Math.sin(performance.now() * 0.01) * 0.1);
            
            ctx.save();
            ctx.shadowBlur = 20;
            ctx.shadowColor = '#0ff';
            
            // Outer Ring (Timer)
            ctx.beginPath();
            ctx.arc(t.x, t.y, radius + 10, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * pct));
            ctx.strokeStyle = '#0ff';
            ctx.lineWidth = 5;
            ctx.stroke();

            // Inner Orb
            const grad = ctx.createRadialGradient(t.x, t.y, 0, t.x, t.y, radius);
            grad.addColorStop(0, '#fff');
            grad.addColorStop(0.3, '#0ff');
            grad.addColorStop(1, 'transparent');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(t.x, t.y, radius, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.restore();
        },

        drawGlove(ctx, x, y) {
            ctx.save();
            ctx.shadowBlur = 15;
            ctx.shadowColor = '#f00';
            ctx.fillStyle = '#f00';
            ctx.beginPath();
            ctx.arc(x, y, 40, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.restore();
        },

        updateParticles(ctx, dt) {
            this.particles.forEach((p, i) => {
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                p.life -= dt;
                if (p.life <= 0) {
                    this.particles.splice(i, 1);
                } else {
                    ctx.fillStyle = p.color;
                    ctx.globalAlpha = p.life * 2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            });
            ctx.globalAlpha = 1.0;
        }
    };

    // Registro Robusto
    function tryRegister() {
        if (window.System && typeof window.System.registerGame === 'function') {
            window.System.registerGame('fight', 'Otto Boxing', '🥊', Logic);
        } else {
            setTimeout(tryRegister, 200);
        }
    }
    tryRegister();
})();
