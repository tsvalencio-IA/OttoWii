/**
 * =============================================================================
 * OTTO BOX - NEON RHYTHM
 * =============================================================================
 * Estilo: Beat Saber / Boxing.
 * Mecânica: Detecta socos rápidos (velocidade do punho) contra alvos virtuais.
 */

(function() {
    const Logic = {
        score: 0,
        targets: [],
        particles: [],
        lastSpawn: 0,
        combo: 0,
        
        // Configuração de Dificuldade
        spawnRate: 900, // ms entre alvos

        init() {
            this.score = 0;
            this.targets = [];
            this.particles = [];
            this.combo = 0;
            this.lastSpawn = 0;
            window.System.msg("PREPARE-SE!");
        },

        update(ctx, w, h, pose) {
            const now = performance.now();
            
            // =================================================================
            // 1. AMBIENTE (NEON CLUB)
            // =================================================================
            // Fundo escuro com grid
            ctx.fillStyle = '#050505'; 
            ctx.fillRect(0, 0, w, h);
            
            // Linhas de perspectiva no chão
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            // Linhas verticais
            for(let x = 0; x <= w; x += w/4) {
                ctx.moveTo(x, h/2); ctx.lineTo(x - (x-w/2)*2, h);
            }
            // Linha do horizonte
            ctx.moveTo(0, h/2); ctx.lineTo(w, h/2);
            ctx.stroke();

            // =================================================================
            // 2. DESENHA JOGADOR (ESQUELETO NEON)
            // =================================================================
            // Ajuda o jogador a saber onde suas mãos estão virtuais
            if(window.Gfx && pose) {
                window.Gfx.drawSkeleton(ctx, pose, w, h, '#00ff00');
            }

            // =================================================================
            // 3. GERENCIADOR DE ALVOS
            // =================================================================
            // Spawner
            if(now - this.lastSpawn > this.spawnRate) {
                const isLeft = Math.random() > 0.5; // Aleatório Esq/Dir
                
                this.targets.push({
                    x: isLeft ? w * 0.3 : w * 0.7, // Posição X
                    y: h * 0.4,                    // Altura inicial
                    z: 1000,                       // Profundidade (Longe)
                    type: isLeft ? 'left' : 'right',
                    color: isLeft ? '#00ffff' : '#ff0055', // Ciano ou Magenta
                    hit: false
                });
                
                this.lastSpawn = now;
                // Aumenta dificuldade levemente
                if(this.spawnRate > 400) this.spawnRate -= 1;
            }

            // Loop dos Alvos
            for(let i = this.targets.length - 1; i >= 0; i--) {
                const t = this.targets[i];
                
                // Move alvo em direção à tela
                t.z -= 15; 
                
                // Cálcula projeção 3D -> 2D
                const scale = 500 / (500 + t.z);
                const screenX = w/2 + (t.x - w/2) * scale;
                const screenY = h/2 + (t.y - h/2) * scale;
                const radius = 60 * scale;

                // Renderiza Alvo
                if(!t.hit) {
                    ctx.save();
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = t.color;
                    
                    // Círculo externo
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 4 * scale;
                    ctx.beginPath(); ctx.arc(screenX, screenY, radius, 0, Math.PI*2); ctx.stroke();
                    
                    // Centro colorido
                    ctx.fillStyle = t.color;
                    ctx.beginPath(); ctx.arc(screenX, screenY, radius * 0.6, 0, Math.PI*2); ctx.fill();
                    
                    // Texto (L ou R)
                    ctx.fillStyle = '#fff';
                    ctx.font = `bold ${radius}px Arial`;
                    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                    ctx.fillText(t.type === 'left' ? 'L' : 'R', screenX, screenY);
                    
                    ctx.restore();
                }

                // Detecção de Colisão (Soco)
                if(t.z < 150 && !t.hit && pose) {
                    const handName = t.type === 'left' ? 'left_wrist' : 'right_wrist';
                    const hand = pose.keypoints.find(k => k.name === handName);
                    
                    if(hand && hand.score > 0.3) {
                        const hPos = window.Gfx.map(hand, w, h);
                        const dist = Math.hypot(hPos.x - screenX, hPos.y - screenY);
                        
                        // Se a mão estiver dentro do círculo do alvo
                        if(dist < radius + 50) {
                            // HIT CONFIRMADO!
                            t.hit = true;
                            this.score += 100 + (this.combo * 10);
                            this.combo++;
                            
                            // Feedback
                            window.Sfx.bump();
                            window.Gfx.shake(5); // Impacto na câmera
                            this.spawnParticles(screenX, screenY, t.color);
                            
                            // Remove alvo processado
                            this.targets.splice(i, 1);
                            continue;
                        }
                    }
                }

                // Remove se passar da tela (Miss)
                if(t.z < -100) {
                    if(!t.hit) this.combo = 0; // Quebra combo
                    this.targets.splice(i, 1);
                }
            }

            // =================================================================
            // 4. SISTEMA DE PARTÍCULAS
            // =================================================================
            this.updateParticles(ctx);
            
            // HUD Combo
            if(this.combo > 1) {
                ctx.fillStyle = '#fff';
                ctx.font = "bold 40px Arial";
                ctx.textAlign = "center";
                ctx.fillText(`${this.combo}X COMBO`, w/2, 100);
            }

            return this.score;
        },

        spawnParticles(x, y, color) {
            for(let i=0; i<12; i++) {
                this.particles.push({
                    x: x, y: y,
                    vx: (Math.random() - 0.5) * 20,
                    vy: (Math.random() - 0.5) * 20,
                    life: 1.0,
                    color: color
                });
            }
        },

        updateParticles(ctx) {
            for(let i = this.particles.length - 1; i >= 0; i--) {
                const p = this.particles[i];
                p.x += p.vx;
                p.y += p.vy;
                p.life -= 0.05; // Decaimento
                
                if(p.life <= 0) {
                    this.particles.splice(i, 1);
                } else {
                    ctx.globalAlpha = p.life;
                    ctx.fillStyle = p.color;
                    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI*2); ctx.fill();
                    ctx.globalAlpha = 1.0;
                }
            }
        }
    };

    window.System.registerGame('box', { 
        name: 'Otto Box', 
        icon: '🥊', 
        camOpacity: 0.4 
    }, Logic);
})();