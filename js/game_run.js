/**
 * =============================================================================
 * SUPER OTTO WORLD - PLATAFORMA 2.5D
 * =============================================================================
 * Estilo: New Super Mario Bros (Wii)
 */

(function() {
    const PHYS = {
        GRAVITY: 0.65,
        JUMP_FORCE: -16,
        SPEED_START: 12,
        SPEED_MAX: 22,
        LANE_WIDTH: 220
    };

    const Logic = {
        score: 0,
        distance: 0,
        speed: 0,
        state: 'play',
        
        player: { 
            lane: 0, 
            visualX: 0, 
            y: 0, vy: 0, 
            jumping: false 
        },

        objects: [],
        clouds: [],

        init: function() {
            this.score = 0;
            this.distance = 0;
            this.speed = PHYS.SPEED_START;
            this.state = 'play';
            this.objects = [];
            this.clouds = [];
            
            // Cria nuvens iniciais
            for(let i=0; i<6; i++) this.addCloud(true);
            
            this.player = { lane:0, visualX:0, y:0, vy:0, jumping:false };
            window.System.msg("CORRA!");
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2;
            const horizon = h * 0.45;

            // 1. INPUT (Nariz para os lados, Pulo por altura)
            if(pose) {
                const nose = pose.keypoints.find(k=>k.name==='nose');
                if(nose && nose.score > 0.4) {
                    // Faixas
                    const nx = nose.x / 640;
                    if(nx < 0.4) this.player.lane = 1;
                    else if(nx > 0.6) this.player.lane = -1;
                    else this.player.lane = 0;

                    // Pulo (Se o nariz subir na tela)
                    if(nose.y < 200 && !this.player.jumping) {
                        this.player.vy = PHYS.JUMP_FORCE;
                        this.player.jumping = true;
                        window.Sfx.jump();
                    }
                }
            }

            // 2. FÍSICA
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
                this.player.jumping = false;
            }

            // Suaviza X
            const targetX = this.player.lane * PHYS.LANE_WIDTH;
            this.player.visualX += (targetX - this.player.visualX) * 0.15;

            // Gera Obstáculos
            this.spawnManager();
            if(Math.random() < 0.02) this.addCloud();
            this.updateEntities();

            // 3. RENDER (Estilo Nintendo)
            
            // Céu Azul Degradê
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, '#5c94fc'); 
            grad.addColorStop(1, '#95b8ff');
            ctx.fillStyle = grad; 
            ctx.fillRect(0,0,w,h);

            // Nuvens
            this.drawClouds(ctx, w, h);

            // Grama
            ctx.fillStyle = '#00aa00'; 
            ctx.fillRect(0, horizon, w, h-horizon);
            
            // Pista de Terra
            const roadTop = 20; 
            const roadBot = w * 0.8;
            ctx.fillStyle = '#e67e22'; 
            ctx.beginPath();
            ctx.moveTo(cx - roadTop, horizon); 
            ctx.lineTo(cx + roadTop, horizon);
            ctx.lineTo(cx + roadBot, h); 
            ctx.lineTo(cx - roadBot, h);
            ctx.fill();
            
            // Linhas da Pista
            ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx, horizon); ctx.lineTo(cx, h); ctx.stroke();

            // Objetos (Z-Sort)
            this.objects.sort((a,b)=>b.z-a.z).forEach(o => this.drawObj(ctx, o, w, h, horizon));

            // Mario (Player)
            this.drawMario(ctx, cx + this.player.visualX, h - 50 + this.player.y, this.player.jumping);

            return this.score;
        },

        spawnManager: function() {
            const last = this.objects[this.objects.length-1];
            if(!last || (3000 - last.z) > 500) {
                if(Math.random() < 0.06) {
                    this.objects.push({
                        z: 3000,
                        lane: Math.floor(Math.random()*3)-1,
                        type: Math.random()>0.5 ? 'pipe' : 'block'
                    });
                }
            }
        },

        updateEntities: function() {
            for(let i=this.objects.length-1; i>=0; i--) {
                const o = this.objects[i];
                o.z -= this.speed * 1.5;
                
                // Colisão
                if(o.z < 100 && o.z > -100 && o.lane === this.player.lane) {
                    let hit = true;
                    // Se pular alto o suficiente, passa
                    if(this.player.y < -120) hit = false;

                    if(hit) {
                        window.Gfx.shake(20);
                        window.System.gameOver(this.score);
                    } else if(!o.passed) {
                        o.passed = true;
                        window.Sfx.coin();
                    }
                }
                
                if(o.z < -200) this.objects.splice(i,1);
            }
        },

        addCloud: function(start) {
            this.clouds.push({
                x: (Math.random()-0.5)*3000,
                y: Math.random()*200,
                z: start ? Math.random()*3000 : 3000,
                s: 50+Math.random()*50
            });
        },

        drawClouds: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            this.clouds.forEach(c => {
                c.z -= this.speed * 0.5;
                if(c.z < 100) c.z = 3000;
                
                const s = 1000/c.z;
                const cx = w/2 + c.x * s;
                const cy = h*0.4 - c.y * s;
                const size = c.s * s;
                
                ctx.beginPath();
                ctx.arc(cx, cy, size, 0, Math.PI*2);
                ctx.arc(cx+size, cy+size*0.2, size*0.8, 0, Math.PI*2);
                ctx.arc(cx-size, cy+size*0.2, size*0.8, 0, Math.PI*2);
                ctx.fill();
            });
        },

        drawObj: function(ctx, o, w, h, hor) {
            const s = 400/(400+o.z);
            const x = w/2 + (o.lane * PHYS.LANE_WIDTH * s * 2.5);
            const y = hor + (h-hor)*s;
            const size = 150 * s;

            if(o.type === 'pipe') {
                // Cano Clássico
                ctx.fillStyle = '#00aa00'; 
                ctx.fillRect(x-size/2, y-size, size, size);
                ctx.fillStyle = '#00cc00'; // Brilho
                ctx.fillRect(x-size/2+5, y-size, size*0.1, size);
                
                // Topo do Cano
                ctx.fillStyle = '#008800'; 
                ctx.fillRect(x-size*0.6, y-size*1.2, size*1.2, size*0.4);
                ctx.strokeStyle = '#003300'; ctx.lineWidth = 2;
                ctx.strokeRect(x-size*0.6, y-size*1.2, size*1.2, size*0.4);
            } else {
                // Bloco ?
                ctx.fillStyle = '#f1c40f'; 
                ctx.fillRect(x-size/2, y-size*2, size, size);
                ctx.fillStyle = '#d35400';
                ctx.fillRect(x-size/2, y-size*2, size, size*0.1); // Sombra 3D
                
                ctx.fillStyle = '#fff'; 
                ctx.font = `bold ${size*0.8}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText('?', x, y-size*1.2);
            }
        },

        drawMario: function(ctx, x, y, jump) {
            // Sombra
            if(jump) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath(); ctx.ellipse(x, y-this.player.y, 40, 10, 0, 0, Math.PI*2); ctx.fill();
            }

            // Corpo Azul
            ctx.fillStyle = '#0039e6'; 
            ctx.fillRect(x-20, y-60, 40, 40);
            
            // Camisa Vermelha
            ctx.fillStyle = '#e60000';
            if(jump) {
                ctx.fillRect(x-35, y-75, 15, 30); // Braço Esq
                ctx.fillRect(x+20, y-75, 15, 30); // Braço Dir
            } else {
                ctx.fillRect(x-35, y-65, 15, 30);
                ctx.fillRect(x+20, y-65, 15, 30);
            }

            // Cabeça
            ctx.fillStyle = '#ffccaa'; 
            ctx.beginPath(); ctx.arc(x, y-75, 25, 0, Math.PI*2); ctx.fill();

            // Bigode
            ctx.fillStyle = '#000';
            ctx.fillRect(x-10, y-70, 25, 8);
            ctx.fillRect(x-5, y-62, 10, 5); // Queixo

            // Chapéu com Aba
            ctx.fillStyle = '#e60000';
            ctx.beginPath(); ctx.arc(x, y-85, 26, 0, Math.PI, true); ctx.fill();
            ctx.fillRect(x-28, y-85, 65, 12);

            // Emblema M
            ctx.fillStyle = '#fff'; 
            ctx.beginPath(); ctx.arc(x, y-92, 10, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = 'red'; 
            ctx.font = 'bold 14px Arial'; 
            ctx.textAlign = 'center'; 
            ctx.fillText('M', x, y-88);
        }
    };

    window.System.registerGame('run', { name: 'Super Otto', icon: '🍄', camOpacity: 0.2 }, Logic);
})();