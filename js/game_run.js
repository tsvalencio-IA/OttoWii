/**
 * =============================================================================
 * SUPER OTTO WORLD - 3D RUNNER ENGINE
 * =============================================================================
 * Estilo: Mario Run / Crash Bandicoot
 * Mecânica: Controle por Posição do Nariz (Esquerda/Direita) e Agachamento/Pulo.
 */

(function() {
    // Configurações Físicas "Nintendo Feel"
    const PHYS = {
        GRAVITY: 0.6,
        JUMP_FORCE: -18,
        SPEED_BASE: 12,
        SPEED_MAX: 25,
        LANE_WIDTH: 220
    };

    const Logic = {
        score: 0,
        distance: 0,
        speed: 0,
        state: 'calibrate', // calibrate, play, hit
        
        // Jogador
        player: { 
            lane: 0, // -1, 0, 1
            visualX: 0, 
            y: 0, vy: 0, 
            groundY: 0,
            isJumping: false,
            animFrame: 0
        },

        // Calibração
        baseY: 0,
        calibSamples: [],

        // Mundo
        objects: [],
        clouds: [],
        bgOffset: 0,

        init() {
            this.score = 0;
            this.distance = 0;
            this.speed = PHYS.SPEED_BASE;
            this.state = 'calibrate';
            this.calibSamples = [];
            this.objects = [];
            this.clouds = [];
            
            // Cria nuvens iniciais
            for(let i=0; i<5; i++) this.addCloud(true);
            
            this.player = { lane:0, visualX:0, y:0, vy:0, groundY:0, isJumping:false, animFrame:0 };
            window.System.msg("FIQUE PARADO");
        },

        update(ctx, w, h, pose) {
            const cx = w/2;
            const horizon = h * 0.4;
            this.player.groundY = h - 50;

            // 1. INPUT (IA)
            if(pose) {
                const nose = pose.keypoints.find(k => k.name === 'nose');
                if(nose && nose.score > 0.4) {
                    
                    // FASE 1: CALIBRAÇÃO (Define a altura neutra do jogador)
                    if(this.state === 'calibrate') {
                        this.calibSamples.push(nose.y);
                        
                        // Desenha UI de Calibração
                        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,w,h);
                        ctx.fillStyle = '#fff'; ctx.font = '30px Roboto'; ctx.textAlign = 'center';
                        ctx.fillText("CALIBRANDO...", cx, h/2);
                        
                        // Barra de progresso
                        ctx.fillStyle = '#3498db'; 
                        ctx.fillRect(cx - 100, h/2 + 40, (this.calibSamples.length/60)*200, 20);

                        if(this.calibSamples.length > 60) {
                            // Média da altura
                            this.baseY = this.calibSamples.reduce((a,b)=>a+b) / this.calibSamples.length;
                            this.state = 'play';
                            window.System.msg("VAI!");
                            window.Sfx.play(600, 'square', 0.5, 0.1);
                        }
                        return 0;
                    }

                    // FASE 2: GAMEPLAY
                    if(this.state === 'play') {
                        // Controle Horizontal (Faixas)
                        const nx = nose.x / 640; // 0 a 1
                        if(nx < 0.35) this.player.lane = 1;      // Esquerda (Espelhado)
                        else if(nx > 0.65) this.player.lane = -1;// Direita
                        else this.player.lane = 0;               // Meio

                        // Controle Vertical (Pulo)
                        // Se o nariz subir muito em relação à calibração -> PULO
                        if(nose.y < this.baseY - 40 && !this.player.isJumping) {
                            this.player.vy = PHYS.JUMP_FORCE;
                            this.player.isJumping = true;
                            window.Sfx.jump();
                        }
                    }
                }
            }

            // 2. FÍSICA E LÓGICA
            if(this.state === 'play') {
                // Aceleração progressiva
                if(this.speed < PHYS.SPEED_MAX) this.speed += 0.005;
                this.distance += this.speed;
                this.score = Math.floor(this.distance/10);

                // Gravidade
                this.player.y += this.player.vy;
                this.player.vy += PHYS.GRAVITY;

                // Chão
                if(this.player.y > 0) {
                    this.player.y = 0;
                    this.player.vy = 0;
                    this.player.isJumping = false;
                }

                // Suavização do movimento lateral (Lerp)
                const targetX = this.player.lane * PHYS.LANE_WIDTH;
                this.player.visualX += (targetX - this.player.visualX) * 0.15;

                // Gerador de Obstáculos
                this.spawnManager();
                
                // Gerador de Nuvens
                if(Math.random() < 0.01) this.addCloud();

                // Colisão e Limpeza
                this.updateObjects();
            }

            // 3. RENDERIZAÇÃO (ESTILO MARIO WORLD)
            
            // Céu
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, '#5c94fc'); // Azul Mario
            grad.addColorStop(1, '#95b8ff');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            // Nuvens Parallax
            this.drawClouds(ctx, w, h);

            // Montanhas de Fundo
            this.drawMountains(ctx, w, horizon);

            // Chão (Quadriculado para sensação de velocidade)
            ctx.fillStyle = '#00AA00'; // Verde
            ctx.fillRect(0, horizon, w, h-horizon);
            
            // Estrada (Perspectiva Trapezoidal)
            const roadTop = w * 0.1;
            const roadBot = w * 1.5;
            ctx.fillStyle = '#e67e22'; // Terra
            ctx.beginPath();
            ctx.moveTo(cx - roadTop, horizon); ctx.lineTo(cx + roadTop, horizon);
            ctx.lineTo(cx + roadBot, h); ctx.lineTo(cx - roadBot, h);
            ctx.fill();

            // Objetos (Ordenados por Z)
            this.objects.sort((a,b) => b.z - a.z);
            this.objects.forEach(o => this.drawObject(ctx, o, w, h, horizon));

            // Jogador
            this.drawMario(ctx, cx + this.player.visualX, this.player.groundY + this.player.y, this.player.isJumping);

            // Score HUD já é tratado pelo Core
            return this.score;
        },

        // --- SISTEMAS AUXILIARES ---

        spawnManager() {
            // Distância mínima entre obstáculos baseada na velocidade
            const minZ = 1200 + (this.speed * 20);
            const lastObj = this.objects[this.objects.length-1];
            
            if(!lastObj || (2500 - lastObj.z) > 400) { // Spawn rate
                if(Math.random() < 0.05) {
                    const type = Math.random() < 0.6 ? 'pipe' : 'block';
                    const lane = Math.floor(Math.random()*3)-1;
                    this.objects.push({ z: 2500, lane: lane, type: type, passed: false });
                }
            }
        },

        updateObjects() {
            for(let i = this.objects.length-1; i>=0; i--) {
                const o = this.objects[i];
                o.z -= this.speed * 1.5;

                // Colisão (Hitbox 3D simplificada)
                if(o.z < 100 && o.z > -100 && o.lane === this.player.lane) {
                    // Colidiu?
                    let hit = true;
                    // Se estiver pulando alto o suficiente, passa por cima do cano
                    if(this.player.y < -150) hit = false; 

                    if(hit) {
                        window.Gfx.shake(20);
                        window.System.gameOver(this.score);
                    } else if (!o.passed) {
                        o.passed = true;
                        window.Sfx.coin(); // Som de sucesso ao pular
                    }
                }

                if(o.z < -300) this.objects.splice(i, 1);
            }
        },

        addCloud(randomZ = false) {
            this.clouds.push({
                x: (Math.random()-0.5) * 3000,
                y: Math.random() * 200,
                z: randomZ ? Math.random() * 2000 : 3000,
                size: 50 + Math.random()*50
            });
        },

        // --- RENDERIZADORES DE OBJETOS ---

        drawObject(ctx, o, w, h, hor) {
            const scale = 400 / (400 + o.z); // Perspectiva
            const x = (w/2) + (o.lane * PHYS.LANE_WIDTH * scale * 2); // Lane spread
            const y = hor + ((h-hor) * scale); // Cola no chão
            const s = 150 * scale; // Tamanho base

            if(o.type === 'pipe') {
                // Cano Verde (Estilo Mario)
                ctx.fillStyle = '#00aa00';
                ctx.fillRect(x - s/2, y - s, s, s); // Corpo
                ctx.fillRect(x - s*0.6, y - s*1.2, s*1.2, s*0.4); // Borda topo
                
                // Brilho
                ctx.fillStyle = '#55ff55';
                ctx.fillRect(x - s/3, y - s, s*0.1, s); // Reflexo corpo
                ctx.fillRect(x - s/3, y - s*1.2, s*0.1, s*0.4); // Reflexo borda
                
                // Contorno
                ctx.strokeStyle = '#004400'; ctx.lineWidth = 2;
                ctx.strokeRect(x - s/2, y - s, s, s);
                ctx.strokeRect(x - s*0.6, y - s*1.2, s*1.2, s*0.4);

            } else if (o.type === 'block') {
                // Bloco de Interrogação
                ctx.fillStyle = '#f1c40f'; // Ouro
                ctx.fillRect(x - s/2, y - s*2.5, s, s);
                
                // Pontos nos cantos
                ctx.fillStyle = '#b7950b';
                ctx.fillRect(x - s/2, y - s*2.5, s*0.1, s*0.1);
                ctx.fillRect(x + s/2 - s*0.1, y - s*2.5, s*0.1, s*0.1);

                // "?"
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${s*0.8}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('?', x, y - s*1.7);
                
                // Sombra no chão
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath(); ctx.ellipse(x, y, s/2, s/5, 0, 0, Math.PI*2); ctx.fill();
            }
        },

        drawMario(ctx, x, y, jumping) {
            // Desenha o personagem "Otto" (Mario Clone) usando primitivas
            
            // Sombra
            if(jumping) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath(); ctx.ellipse(x, y - this.player.y, 40, 10, 0, 0, Math.PI*2); ctx.fill();
            }

            // Corpo (Macacão Azul)
            ctx.fillStyle = '#0000ff';
            ctx.fillRect(x - 20, y - 60, 40, 40);
            
            // Botões amarelos
            ctx.fillStyle = '#ffff00';
            ctx.beginPath(); ctx.arc(x - 10, y - 50, 5, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(x + 10, y - 50, 5, 0, Math.PI*2); ctx.fill();

            // Camisa Vermelha (Braços)
            ctx.fillStyle = '#ff0000';
            if(jumping) {
                // Braços para cima
                ctx.fillRect(x - 35, y - 75, 15, 30);
                ctx.fillRect(x + 20, y - 75, 15, 30);
            } else {
                // Braços correndo
                const swing = Math.sin(Date.now()/50) * 10;
                ctx.fillRect(x - 35, y - 65 + swing, 15, 30);
                ctx.fillRect(x + 20, y - 65 - swing, 15, 30);
            }

            // Cabeça (Pele)
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath(); ctx.arc(x, y - 75, 25, 0, Math.PI*2); ctx.fill();

            // Bigode
            ctx.fillStyle = '#000';
            ctx.fillRect(x - 10, y - 70, 25, 8); // Bigode grosso
            ctx.fillRect(x - 10, y - 62, 15, 4); // Queixo

            // Nariz
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath(); ctx.arc(x + 12, y - 75, 8, 0, Math.PI*2); ctx.fill();

            // Chapéu Vermelho (Marca Registrada)
            ctx.fillStyle = '#ff0000';
            ctx.beginPath(); ctx.arc(x, y - 85, 26, 0, Math.PI, true); ctx.fill(); // Topo
            ctx.fillRect(x - 28, y - 85, 65, 10); // Aba

            // Logo "M"
            ctx.fillStyle = '#fff';
            ctx.beginPath(); ctx.arc(x, y - 90, 10, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ff0000';
            ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.fillText('M', x, y - 85);
        },

        drawClouds(ctx, w, h) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            this.clouds.forEach(c => {
                c.z -= this.speed * 0.5;
                if(c.z < 100) c.z = 3000; // Recycle

                const scale = 1000 / c.z;
                const cx = (w/2) + (c.x * scale);
                const cy = (h*0.4) - (c.y * scale);
                const size = c.size * scale;

                // Desenha nuvem "fofinha"
                ctx.beginPath();
                ctx.arc(cx, cy, size, 0, Math.PI*2);
                ctx.arc(cx + size, cy + size*0.2, size*0.8, 0, Math.PI*2);
                ctx.arc(cx - size, cy + size*0.2, size*0.8, 0, Math.PI*2);
                ctx.fill();
            });
        },
        
        drawMountains(ctx, w, hor) {
            const offset = (this.distance * 0.1) % w;
            ctx.fillStyle = '#1B5E20'; // Verde Escuro
            
            ctx.beginPath();
            // Montanha 1
            ctx.moveTo(w*0.2 - offset, hor); ctx.lineTo(w*0.5 - offset, hor - 150); ctx.lineTo(w*0.8 - offset, hor);
            // Montanha 2 (repetida)
            ctx.moveTo(w*0.2 - offset + w, hor); ctx.lineTo(w*0.5 - offset + w, hor - 150); ctx.lineTo(w*0.8 - offset + w, hor);
            ctx.fill();
            
            // Pico de neve
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(w*0.4 - offset, hor - 100); ctx.lineTo(w*0.5 - offset, hor - 150); ctx.lineTo(w*0.6 - offset, hor - 100);
            ctx.fill();
        }
    };

    // Registrar no Sistema
    window.System.registerGame('run', { name: 'Super Otto', icon: '🍄', camOpacity: 0.1 }, Logic);
})();