/**
 * =============================================================================
 * NEON BOXING - RHYTHM EDITION
 * =============================================================================
 * Diferencial: Sequenciador de padrões (não aleatório).
 * Visual: Neon Cyberpunk com efeito de 'Glow'.
 * =============================================================================
 */

(function() {
    const Logic = {
        score: 0,
        combo: 0,
        health: 100,
        targets: [],
        particles: [],
        
        // Sequenciador
        timer: 0,
        bpm: 0,
        patterns: [
            [{t:'L', x:-0.5}, {t:'R', x:0.5}], // 1-2
            [{t:'L', x:-0.5}, {t:'L', x:-0.8}, {t:'R', x:0.5}], // Jab-Jab-Cross
            [{t:'B', x:0}], // Bloqueio
            [{t:'L', x:-0.6}, {t:'R', x:0.6}, {t:'L', x:-0.4}, {t:'R', x:0.4}] // Flurry
        ],
        queue: [],

        init: function() {
            this.score = 0;
            this.combo = 0;
            this.health = 100;
            this.targets = [];
            this.particles = [];
            this.timer = 0;
            this.loadPattern();
            window.System.msg("ROUND 1");
        },

        loadPattern: function() {
            const p = this.patterns[Math.floor(Math.random()*this.patterns.length)];
            this.queue = p.map((hit, i) => ({ ...hit, delay: i * 30 + 10 }));
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2;
            const cy = h/2;
            this.timer++;

            // =================================================================
            // 1. SPAWNER
            // =================================================================
            if(this.queue.length > 0) {
                if(this.timer >= this.queue[0].delay) {
                    const hit = this.queue.shift();
                    this.spawnTarget(hit.t, hit.x);
                    this.timer = 0;
                }
            } else if (this.targets.length === 0 && this.timer > 50) {
                this.loadPattern();
            }

            // =================================================================
            // 2. RENDERIZAÇÃO (NEON STYLE)
            // =================================================================
            
            // Fundo Cyber
            const pulse = Math.sin(Date.now()/500) * 0.2 + 0.8;
            ctx.fillStyle = '#050510'; ctx.fillRect(0,0,w,h);
            
            // Grid de Chão (Perspectiva)
            ctx.strokeStyle = `rgba(255, 0, 255, ${0.2 * pulse})`;
            ctx.lineWidth = 2;
            ctx.beginPath();
            for(let i=0; i<w; i+=100) {
                ctx.moveTo(cx, cy); ctx.lineTo((i-cx)*4 + cx, h);
            }
            ctx.stroke();

            // Esqueleto Neon (Feedback)
            if(window.Gfx) window.Gfx.drawSkeleton(ctx, pose, w, h);

            // =================================================================
            // 3. LOGICA DOS ALVOS
            // =================================================================
            this.targets.forEach((t, i) => {
                t.z -= 15 + (this.combo * 0.3); // Acelera com combo

                const scale = 800 / (800 + t.z);
                const screenX = cx + (t.x * w * 0.4 * scale);
                const screenY = cy + (t.y * scale);
                const r = 80 * scale;

                // Render Alvo
                ctx.save();
                ctx.shadowBlur = 20; ctx.shadowColor = t.color;
                
                // Círculo Externo
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 4 * scale;
                ctx.beginPath(); ctx.arc(screenX, screenY, r, 0, Math.PI*2); ctx.stroke();
                
                // Centro (Preenchido)
                ctx.fillStyle = t.hit ? '#fff' : t.color;
                ctx.beginPath(); ctx.arc(screenX, screenY, r*0.6, 0, Math.PI*2); ctx.fill();
                
                // Texto
                ctx.fillStyle = '#000'; ctx.font=`bold ${r*0.5}px Arial`; 
                ctx.textAlign='center'; ctx.textBaseline='middle';
                ctx.fillText(t.label, screenX, screenY);
                
                ctx.restore();

                // Colisão
                if(!t.hit && t.z < 150 && t.z > -50 && pose) {
                    // Verifica Mãos
                    const handName = t.hand === 'L' ? 'left_wrist' : 'right_wrist';
                    const hand = pose.keypoints.find(k=>k.name===handName);
                    
                    if(hand && hand.score > 0.3) {
                        const hPos = window.Gfx.map(hand, w, h);
                        const dist = Math.hypot(hPos.x - screenX, hPos.y - screenY);
                        
                        if(dist < r + 40) {
                            t.hit = true;
                            this.hitTarget(t, screenX, screenY);
                        }
                    }
                }

                // Miss
                if(t.z < -200) {
                    if(!t.hit) {
                        this.combo = 0;
                        this.health -= 10;
                        window.System.msg("MISS");
                    }
                    this.targets.splice(i, 1);
                }
            });

            // Limpeza
            this.targets = this.targets.filter(t => !(t.hit && t.z < 50));
            this.updateParticles(ctx);

            // HUD Vida
            ctx.fillStyle = '#333'; ctx.fillRect(w/2 - 100, 20, 200, 10);
            ctx.fillStyle = this.health > 30 ? '#0f0' : '#f00';
            ctx.fillRect(w/2 - 100, 20, 200 * (this.health/100), 10);

            if(this.health <= 0) window.System.gameOver(this.score);
            return this.score;
        },

        spawnTarget: function(type, x) {
            const color = type === 'L' ? '#00ffff' : (type === 'R' ? '#ff0055' : '#ffff00');
            this.targets.push({
                x: x, y: 0, z: 2000,
                color: color,
                label: type,
                hand: type === 'B' ? 'R' : type, // Simplificação
                hit: false
            });
        },

        hitTarget: function(t, x, y) {
            this.score += 100 + (this.combo*10);
            this.combo++;
            window.Sfx.bump();
            // Partículas
            for(let i=0; i<10; i++) {
                this.particles.push({
                    x:x, y:y, 
                    vx:(Math.random()-0.5)*20, vy:(Math.random()-0.5)*20, 
                    life:1, color: t.color
                });
            }
        },

        updateParticles: function(ctx) {
            for(let i=this.particles.length-1; i>=0; i--) {
                const p = this.particles[i];
                p.x += p.vx; p.y += p.vy; p.life -= 0.08;
                if(p.life <= 0) this.particles.splice(i,1);
                else {
                    ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        }
    };

    window.System.registerGame('box', { name: 'Neon Box', icon: '🥊', camOpacity: 0.3 }, Logic);
})();
