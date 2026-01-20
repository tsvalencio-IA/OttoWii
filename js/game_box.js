/**
 * =============================================================================
 * OTTO BOX - RHYTHM EDITION
 * =============================================================================
 * Diferencial: Usa um sequenciador de padrões (Pattern Sequencer) em vez de
 * aleatoriedade. Sincroniza spawns para criar "Flow".
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
        patternIndex: 0,
        bpm: 120,
        
        // Biblioteca de Padrões (L=Esq, R=Dir, B=Ambos)
        // 0 = Centro, -1 = Esq, 1 = Dir
        patterns: [
            [{t:'L', x:-0.5}, {t:'R', x:0.5}], // Jab-Cross básico
            [{t:'L', x:-0.5}, {t:'L', x:-0.8}, {t:'R', x:0.5}], // Double Jab
            [{t:'B', x:0}], // Block (Ambos no centro)
            [{t:'L', x:-0.5}, {t:'R', x:0.5}, {t:'L', x:-0.5}, {t:'R', x:0.5}], // Metralhadora
        ],
        currentPattern: [],

        init: function() {
            this.score = 0;
            this.combo = 0;
            this.health = 100;
            this.targets = [];
            this.particles = [];
            this.timer = 0;
            this.loadPattern();
            window.System.msg("ROUND 1");
            window.Sfx.boot();
        },

        loadPattern: function() {
            // Escolhe um padrão aleatório da lista
            const p = this.patterns[Math.floor(Math.random() * this.patterns.length)];
            // Cria uma cópia com delays
            this.currentPattern = p.map((hit, i) => ({
                ...hit,
                delay: i * 30 // Frames de distância entre golpes
            }));
        },

        update: function(ctx, w, h, pose) {
            this.timer++;

            // =================================================================
            // 1. SPAWNER RÍTMICO
            // =================================================================
            if(this.currentPattern.length > 0) {
                if(this.timer >= this.currentPattern[0].delay) {
                    const hit = this.currentPattern.shift();
                    this.spawnTarget(w, h, hit.t, hit.x);
                    this.timer = 0; // Reset timer para o próximo do padrão
                }
            } else if (this.targets.length === 0 && this.timer > 60) {
                // Padrão acabou, carrega próximo
                this.loadPattern();
            }

            // =================================================================
            // 2. RENDERIZAÇÃO DO AMBIENTE (CYBER GYM)
            // =================================================================
            // Fundo pulsante com combo
            const intensity = Math.min(0.3, this.combo * 0.01);
            ctx.fillStyle = `rgba(20, 0, 40, ${1.0})`; 
            ctx.fillRect(0, 0, w, h);
            
            // Grid de chão
            ctx.strokeStyle = '#ff00ff'; ctx.lineWidth = 2;
            ctx.beginPath();
            for(let z=0; z<h; z+=40) {
                const s = z/h;
                ctx.moveTo(w*0.5 - w*s, z); ctx.lineTo(w*0.5 + w*s, z);
            }
            ctx.stroke();

            // Esqueleto para feedback
            if(window.Gfx) window.Gfx.drawSkeleton(ctx, pose, w, h);

            // =================================================================
            // 3. ATUALIZA ALVOS E COLISÃO
            // =================================================================
            this.targets.forEach((t, i) => {
                t.z -= 15 + (this.combo * 0.2); // Acelera com combo

                // Projeção
                const scale = 600 / (600 + t.z);
                const screenX = w/2 + (t.x * w * 0.4 * scale);
                const screenY = h/2 + (t.y * scale);
                const radius = 70 * scale;

                // Render
                ctx.save();
                ctx.shadowBlur = 20; ctx.shadowColor = t.color;
                ctx.fillStyle = t.hit ? '#fff' : t.color; // Pisca branco se acertou
                ctx.beginPath(); ctx.arc(screenX, screenY, radius, 0, Math.PI*2); ctx.fill();
                
                // Anel externo
                ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.arc(screenX, screenY, radius*1.2, 0, Math.PI*2); ctx.stroke();
                
                // Texto
                ctx.fillStyle = '#fff'; ctx.font = `bold ${30*scale}px Arial`; 
                ctx.textAlign = 'center'; ctx.textBaseline='middle';
                ctx.fillText(t.label, screenX, screenY);
                ctx.restore();

                // Colisão (Só processa se não foi hitado ainda e está perto)
                if(!t.hit && t.z < 100 && t.z > -50 && pose) {
                    const handName = t.hand === 'L' ? 'left_wrist' : 'right_wrist';
                    const hand = pose.keypoints.find(k=>k.name === handName);
                    
                    if(hand && hand.score > 0.3) {
                        const hPos = window.Gfx.map(hand, w, h);
                        const dist = Math.hypot(hPos.x - screenX, hPos.y - screenY);
                        
                        if(dist < radius + 40) { // Hitbox generosa
                            t.hit = true;
                            this.hitTarget(t, screenX, screenY);
                        }
                    }
                    // Bônus: Se for alvo 'B' (Both), aceita qualquer mão
                    if(t.hand === 'B' && !t.hit) {
                       // Logica simplificada para ambos
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

            // Remove alvos já acertados (depois de um frame para visualizar o hit)
            this.targets = this.targets.filter(t => !(t.hit && t.z < 80));

            // Partículas
            this.updateParticles(ctx);

            if(this.health <= 0) window.System.gameOver(this.score);

            return this.score;
        },

        spawnTarget: function(w, h, type, xOffset) {
            this.targets.push({
                x: xOffset,
                y: 0, // Altura dos olhos
                z: 2000,
                color: type === 'L' ? '#00ffff' : (type === 'R' ? '#ff0055' : '#ffff00'),
                label: type,
                hand: type,
                hit: false
            });
        },

        hitTarget: function(t, x, y) {
            this.score += 100 + (this.combo * 10);
            this.combo++;
            window.Sfx.bump(); // Som de impacto grave
            
            // Explosão de Partículas
            for(let i=0; i<15; i++) {
                this.particles.push({
                    x: x, y: y,
                    vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20,
                    life: 1.0, color: t.color
                });
            }
        },

        updateParticles: function(ctx) {
            for(let i=this.particles.length-1; i>=0; i--) {
                const p = this.particles[i];
                p.x += p.vx; p.y += p.vy; p.life -= 0.05;
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