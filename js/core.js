/**
 * =============================================================================
 * SUPER OTTO WORLD - VISUAL REMASTER (PIXEL ART ENGINE)
 * =============================================================================
 * Mudança: Substitui retângulos coloridos por desenho procedural de sprites
 * estilo 16-bit (Mario World). Renderiza canos com brilho, chão texturizado
 * e o personagem com chapéu e macacão detalhado.
 */

(function() {
    const PHYS = {
        GRAVITY: 0.8,
        JUMP: -17,
        GROUND_RATIO: 0.85, // Onde fica o chão na tela (85%)
        LANE_W: 0.25        // Largura da pista (25% da tela)
    };

    const Logic = {
        score: 0, distance: 0, speed: 10,
        player: { lane: 0, x: 0, y: 0, vy: 0, jump: false, frame: 0 },
        objects: [],
        clouds: [],
        bgOffset: 0,

        init: function() {
            this.score = 0; this.distance = 0; this.speed = 12;
            this.objects = []; this.clouds = [];
            this.player = { lane: 0, x: 0, y: 0, vy: 0, jump: false, frame: 0 };
            
            // Popula nuvens iniciais
            for(let i=0; i<6; i++) this.spawnCloud(Math.random() * 2000);
            window.System.msg("START!");
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2;
            const groundY = h * PHYS.GROUND_RATIO;
            
            // 1. INPUT (Nariz)
            if(pose) {
                const nose = pose.keypoints.find(k=>k.name==='nose');
                if(nose && nose.score > 0.4) {
                    const nx = nose.x / 640;
                    if(nx < 0.4) this.player.lane = 1;      // Esq
                    else if(nx > 0.6) this.player.lane = -1; // Dir
                    else this.player.lane = 0;              // Centro

                    // Pulo (Nariz sobe)
                    if(nose.y < 150 && !this.player.jump) {
                        this.player.vy = PHYS.JUMP;
                        this.player.jump = true;
                        window.Sfx.jump();
                    }
                }
            }

            // 2. FÍSICA
            this.speed += 0.005;
            this.distance += this.speed;
            this.score = Math.floor(this.distance/10);
            this.bgOffset += this.speed * 0.1;

            // Player Physics
            this.player.y += this.player.vy;
            this.player.vy += PHYS.GRAVITY;
            if(this.player.y > 0) {
                this.player.y = 0;
                this.player.vy = 0;
                this.player.jump = false;
            }
            
            // Suavização X
            const targetX = this.player.lane * (w * PHYS.LANE_W);
            this.player.x += (targetX - this.player.x) * 0.2;

            // Spawner
            this.manageSpawns();
            this.updateEntities();

            // 3. RENDERIZAÇÃO (SUPER MARIO STYLE)
            
            // Céu Azul
            const grad = ctx.createLinearGradient(0,0,0,groundY);
            grad.addColorStop(0, '#6495ED'); grad.addColorStop(1, '#B0E0E6');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            // Montanhas de Fundo (Parallax)
            this.drawMountains(ctx, w, groundY);
            
            // Nuvens
            this.drawClouds(ctx, w, h);

            // Chão (Textura Xadrez)
            const tileSize = 40;
            const offset = Math.floor(this.distance % tileSize);
            for(let x=0; x<w; x+=tileSize) {
                for(let y=groundY; y<h; y+=tileSize) {
                    const isDark = ((x+Math.floor(this.distance)) % (tileSize*2)) < tileSize;
                    ctx.fillStyle = isDark ? '#e67e22' : '#d35400';
                    ctx.fillRect(x, y, tileSize, tileSize);
                    // Borda topo grama
                    if(y === groundY) {
                        ctx.fillStyle = '#2ecc71';
                        ctx.fillRect(x, y-10, tileSize, 10);
                    }
                }
            }

            // Objetos (Z-order)
            this.objects.sort((a,b)=>b.z-a.z);
            this.objects.forEach(o => this.drawObj(ctx, o, cx, groundY));

            // Player (Otto/Mario)
            this.drawPlayer(ctx, cx + this.player.x, groundY + this.player.y);

            return this.score;
        },

        spawnCloud: function(z) {
            this.clouds.push({ x: (Math.random()-0.5)*2000, y: Math.random()*200, z: z });
        },

        manageSpawns: function() {
            const last = this.objects[this.objects.length-1];
            if(!last || (3000 - last.z) > (600 + this.speed*10)) {
                if(Math.random() < 0.4) {
                    const lanes = [-1, 0, 1];
                    const lane = lanes[Math.floor(Math.random()*3)];
                    this.objects.push({ 
                        type: Math.random()>0.4 ? 'pipe' : 'block', 
                        lane: lane, 
                        z: 3000,
                        passed: false 
                    });
                }
            }
            if(Math.random()<0.02) this.spawnCloud(3000);
        },

        updateEntities: function() {
            this.objects.forEach((o, i) => {
                o.z -= this.speed * 1.5;
                if(o.z < 100 && o.z > -100 && o.lane === this.player.lane) {
                    if(this.player.y > -80) { // Hitbox Altura
                        window.Gfx.shake(15);
                        window.System.gameOver(this.score);
                    } else if (!o.passed) {
                        o.passed = true;
                        window.Sfx.coin();
                    }
                }
            });
            this.objects = this.objects.filter(o => o.z > -200);
            
            this.clouds.forEach(c => c.z -= this.speed * 0.5);
            this.clouds = this.clouds.filter(c => c.z > 0);
        },

        // --- SPRITE DRAWING FUNCTIONS ---

        drawMountains: function(ctx, w, groundY) {
            const bgX = (this.bgOffset * 0.5) % w;
            ctx.fillStyle = '#27ae60';
            ctx.beginPath();
            // Montanha 1
            ctx.moveTo(w*0.2 - bgX, groundY); ctx.lineTo(w*0.4 - bgX, groundY-150); ctx.lineTo(w*0.6 - bgX, groundY);
            // Montanha 2
            ctx.moveTo(w*0.5 - bgX, groundY); ctx.lineTo(w*0.8 - bgX, groundY-250); ctx.lineTo(w*1.1 - bgX, groundY);
            // Loop
            ctx.moveTo(w*0.2 - bgX + w, groundY); ctx.lineTo(w*0.4 - bgX + w, groundY-150); ctx.lineTo(w*0.6 - bgX + w, groundY);
            ctx.fill();
            
            // Topo nevado
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.moveTo(w*0.4 - bgX, groundY-150); ctx.lineTo(w*0.45 - bgX, groundY-110); ctx.lineTo(w*0.35 - bgX, groundY-110);
            ctx.fill();
        },

        drawClouds: function(ctx, w, h) {
            ctx.fillStyle = '#fff';
            this.clouds.forEach(c => {
                const s = 800/(800+c.z);
                const x = w/2 + c.x * s;
                const y = h*0.2 + c.y * s;
                const size = 60 * s;
                
                ctx.beginPath();
                ctx.arc(x, y, size, 0, Math.PI*2);
                ctx.arc(x+size, y+size*0.2, size*0.8, 0, Math.PI*2);
                ctx.arc(x-size, y+size*0.2, size*0.8, 0, Math.PI*2);
                ctx.fill();
            });
        },

        drawObj: function(ctx, o, cx, groundY) {
            const s = 500/(500+o.z);
            const x = cx + (o.lane * (cx*0.6) * s * 2.0);
            const y = groundY + (100 * (1-s)); // Ajuste perspectiva chão
            const size = 120 * s;

            if(o.type === 'pipe') {
                // CANO VERDE COM GRADIENTE
                const grad = ctx.createLinearGradient(x-size/2, 0, x+size/2, 0);
                grad.addColorStop(0, '#006400'); grad.addColorStop(0.2, '#00e600'); grad.addColorStop(0.8, '#006400');
                
                ctx.fillStyle = grad;
                ctx.fillRect(x-size/2, y-size, size, size); // Base
                
                // Topo do cano
                ctx.fillRect(x-size*0.6, y-size-size*0.3, size*1.2, size*0.3);
                ctx.strokeStyle='#004400'; ctx.lineWidth=2;
                ctx.strokeRect(x-size*0.6, y-size-size*0.3, size*1.2, size*0.3);

            } else {
                // BLOCO ?
                ctx.fillStyle = '#f39c12';
                ctx.fillRect(x-size/2, y-size*2.5, size, size);
                
                // Detalhe rebite
                ctx.fillStyle = '#d35400';
                ctx.fillRect(x-size/2, y-size*2.5, size, size*0.1);
                ctx.fillRect(x-size/2, y-size*1.6, size, size*0.1);
                
                // Interrogação
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${size*0.8}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('?', x, y-size*1.8);
            }
        },

        drawPlayer: function(ctx, x, y) {
            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(x, y, 30, 10, 0, 0, Math.PI*2); ctx.fill();

            // SPRITE PROCEDURAL DO "MARIO" (OTTO)
            ctx.save();
            ctx.translate(x, y);
            if(this.player.jump) {
                ctx.translate(0, -20); // Estica no pulo
            } else {
                // Animação de caminhada
                const bob = Math.sin(Date.now()/50) * 5;
                ctx.translate(0, bob);
            }

            // Macacão Azul
            ctx.fillStyle = '#1e3799';
            ctx.fillRect(-15, -40, 30, 35);
            
            // Botões amarelos
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath(); ctx.arc(-8, -35, 3, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(8, -35, 3, 0, Math.PI*2); ctx.fill();

            // Camisa Vermelha
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath(); ctx.arc(0, -45, 18, 0, Math.PI*2); ctx.fill(); // Torso
            
            // Braços
            if(this.player.jump) {
                // Braço pra cima (Superman)
                ctx.beginPath(); ctx.ellipse(20, -60, 8, 15, -0.5, 0, Math.PI*2); ctx.fill();
            } else {
                // Balanço
                const swing = Math.sin(Date.now()/50) * 0.5;
                ctx.save(); ctx.rotate(swing);
                ctx.beginPath(); ctx.ellipse(20, -45, 8, 15, 0, 0, Math.PI*2); ctx.fill();
                ctx.restore();
            }

            // Cabeça
            ctx.fillStyle = '#ffccaa'; // Pele
            ctx.beginPath(); ctx.arc(0, -65, 22, 0, Math.PI*2); ctx.fill();
            
            // Bigode
            ctx.fillStyle = '#000';
            ctx.beginPath(); 
            ctx.moveTo(-10, -58); ctx.quadraticCurveTo(0, -50, 10, -58); 
            ctx.quadraticCurveTo(0, -65, -10, -58);
            ctx.fill();

            // Nariz
            ctx.fillStyle = '#ffccaa';
            ctx.beginPath(); ctx.arc(0, -62, 6, 0, Math.PI*2); ctx.fill();

            // Chapéu Vermelho com Aba
            ctx.fillStyle = '#c0392b';
            ctx.beginPath(); ctx.arc(0, -70, 23, Math.PI, 0); ctx.fill();
            ctx.fillRect(-25, -70, 50, 8); // Aba

            // Emblema M
            ctx.fillStyle = '#fff'; ctx.font='bold 12px Arial'; ctx.textAlign='center';
            ctx.fillText('M', 0, -72);

            ctx.restore();
        }
    };

    window.System.registerGame('run', { name: 'Super Otto', icon: '🍄', camOpacity: 0.2 }, Logic);
})();
