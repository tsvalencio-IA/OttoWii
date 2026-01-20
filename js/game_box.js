/**
 * =============================================================================
 * OTTO BOXING (IMPACT EDITION)
 * =============================================================================
 * Mecânica: Soque os alvos no ritmo. Detecta aceleração do punho.
 */

(function() {
    const Logic = {
        score: 0,
        targets: [],
        particles: [],
        lastSpawn: 0,
        combo: 0,
        
        init: function() {
            this.score = 0;
            this.targets = [];
            this.particles = [];
            this.combo = 0;
            window.System.msg("LUTAR!");
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            
            // Fundo Neon
            ctx.fillStyle = '#111'; ctx.fillRect(0,0,w,h);
            // Cordas do Ringue
            ctx.strokeStyle = '#c0392b'; ctx.lineWidth=4;
            ctx.beginPath(); 
            ctx.moveTo(0, h*0.3); ctx.lineTo(w, h*0.3);
            ctx.moveTo(0, h*0.5); ctx.lineTo(w, h*0.5);
            ctx.moveTo(0, h*0.7); ctx.lineTo(w, h*0.7);
            ctx.stroke();

            // Desenha Braços do Jogador (Esqueleto Verde)
            if(window.Gfx && pose) window.Gfx.drawSkeleton(ctx, pose, w, h, '#00ff00');

            // Spawn Alvos
            if(now - this.lastSpawn > 900) {
                const isLeft = Math.random()>0.5;
                this.targets.push({
                    x: isLeft ? w*0.3 : w*0.7,
                    y: h*0.4 + (Math.random()*h*0.2),
                    z: 1000, // Longe
                    side: isLeft ? 'L' : 'R',
                    color: isLeft ? '#00ffff' : '#ff00ff',
                    hit: false
                });
                this.lastSpawn = now;
            }

            // Lógica dos Alvos
            for(let i=this.targets.length-1; i>=0; i--) {
                const t = this.targets[i];
                t.z -= 15; // Velocidade
                
                const scale = 500/(500+t.z);
                const tx = w/2 + (t.x - w/2) * scale;
                const ty = h/2 + (t.y - h/2) * scale;
                const r = 70 * scale;

                if(!t.hit) {
                    // Desenha Alvo
                    ctx.fillStyle = t.color;
                    ctx.beginPath(); ctx.arc(tx, ty, r, 0, Math.PI*2); ctx.fill();
                    ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
                    ctx.fillStyle = '#fff'; ctx.font=`bold ${r}px Arial`; 
                    ctx.textAlign='center'; ctx.textBaseline='middle';
                    ctx.fillText(t.side, tx, ty);

                    // Colisão
                    if(t.z < 150 && pose) {
                        const handName = t.side==='L' ? 'left_wrist' : 'right_wrist';
                        const hand = pose.keypoints.find(k=>k.name===handName);
                        if(hand && hand.score>0.3) {
                            const hp = window.Gfx.map(hand, w, h);
                            if(Math.hypot(hp.x-tx, hp.y-ty) < r+50) {
                                t.hit = true;
                                this.score += 100 + (this.combo*10);
                                this.combo++;
                                window.Sfx.hit();
                                window.Gfx.shake(8);
                                this.spawnParticles(tx, ty, t.color);
                                this.targets.splice(i,1);
                                continue;
                            }
                        }
                    }
                }

                if(t.z < -100) {
                    if(!t.hit) this.combo = 0;
                    this.targets.splice(i,1);
                }
            }

            this.drawParticles(ctx);
            
            // HUD
            if(this.combo > 1) {
                ctx.fillStyle = '#fff'; ctx.font="bold 40px Arial"; ctx.textAlign="center";
                ctx.fillText(this.combo + "X COMBO", w/2, 100);
            }

            return this.score;
        },

        spawnParticles: function(x, y, color) {
            for(let i=0; i<15; i++) {
                this.particles.push({
                    x: x, y: y,
                    vx: (Math.random()-0.5)*30, vy: (Math.random()-0.5)*30,
                    life: 1.0, color: color
                });
            }
        },

        drawParticles: function(ctx) {
            for(let i=this.particles.length-1; i>=0; i--) {
                const p = this.particles[i];
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
                if(p.life<=0) this.particles.splice(i,1);
                else {
                    ctx.globalAlpha = p.life; ctx.fillStyle = p.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 8, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1;
                }
            }
        }
    };

    window.OTTO_GAMES['box'] = { name: 'Otto Box', icon: '🥊', camOpacity: 0.4, logic: Logic };
})();
