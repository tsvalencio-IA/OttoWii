/**
 * =============================================================================
 * SUPER OTTO WORLD - 3D RUNNER ENGINE (FIXED)
 * =============================================================================
 * Estilo: Mario Run / Crash Bandicoot
 * Mecânica: Controle por Posição do Nariz (Esquerda/Direita) e Agachamento/Pulo.
 */

(function() {
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
        state: 'calibrate', 
        
        // Jogador
        player: { 
            lane: 0, 
            visualX: 0, 
            y: 0, vy: 0, 
            groundY: 0,
            isJumping: false
        },

        // Calibração
        baseY: 0,
        calibSamples: [],

        // Listas de Objetos (Inicializadas no init)
        objects: [],
        clouds: [],

        init() {
            this.score = 0;
            this.distance = 0;
            this.speed = PHYS.SPEED_BASE;
            this.state = 'calibrate';
            this.calibSamples = [];
            
            // LIMPEZA SEGURA DAS LISTAS
            this.objects = [];
            this.clouds = []; // Garante que a lista existe
            
            // Gera nuvens iniciais
            for(let i=0; i<5; i++) this.addCloud(true);
            
            this.player = { lane:0, visualX:0, y:0, vy:0, groundY:0, isJumping:false };
            window.System.msg("FIQUE PARADO");
        },

        update(ctx, w, h, pose) {
            const cx = w/2;
            const horizon = h * 0.4;
            this.player.groundY = h - 50;

            // 1. INPUT
            if(pose) {
                const nose = pose.keypoints.find(k => k.name === 'nose');
                if(nose && nose.score > 0.4) {
                    if(this.state === 'calibrate') {
                        this.calibSamples.push(nose.y);
                        
                        // UI Calibração
                        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,w,h);
                        ctx.fillStyle = '#fff'; ctx.font = '30px Arial'; ctx.textAlign = 'center';
                        ctx.fillText("CALIBRANDO...", cx, h/2);
                        ctx.fillStyle = '#3498db'; 
                        ctx.fillRect(cx - 100, h/2 + 40, (this.calibSamples.length/60)*200, 20);

                        if(this.calibSamples.length > 60) {
                            this.baseY = this.calibSamples.reduce((a,b)=>a+b) / this.calibSamples.length;
                            this.state = 'play';
                            window.System.msg("VAI!");
                            window.Sfx.boot();
                        }
                        return 0;
                    }
                    else if(this.state === 'play') {
                        const nx = nose.x / 640; 
                        if(nx < 0.35) this.player.lane = 1;      
                        else if(nx > 0.65) this.player.lane = -1;
                        else this.player.lane = 0;

                        if(nose.y < this.baseY - 40 && !this.player.isJumping) {
                            this.player.vy = PHYS.JUMP_FORCE;
                            this.player.isJumping = true;
                            window.Sfx.jump();
                        }
                    }
                }
            }

            // 2. FÍSICA
            if(this.state === 'play') {
                if(this.speed < PHYS.SPEED_MAX) this.speed += 0.005;
                this.distance += this.speed;
                this.score = Math.floor(this.distance/10);

                this.player.y += this.player.vy;
                this.player.vy += PHYS.GRAVITY;

                if(this.player.y > 0) {
                    this.player.y = 0;
                    this.player.vy = 0;
                    this.player.isJumping = false;
                }

                const targetX = this.player.lane * PHYS.LANE_WIDTH;
                this.player.visualX += (targetX - this.player.visualX) * 0.15;

                this.spawnManager();
                if(Math.random() < 0.01) this.addCloud();
                this.updateObjects();
            }

            // 3. RENDER
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, '#5c94fc'); grad.addColorStop(1, '#95b8ff');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,h);

            this.drawClouds(ctx, w, h);
            
            ctx.fillStyle = '#00AA00'; ctx.fillRect(0, horizon, w, h-horizon);
            
            // Pista
            const roadTop = w * 0.1; const roadBot = w * 1.5;
            ctx.fillStyle = '#e67e22'; 
            ctx.beginPath();
            ctx.moveTo(cx - roadTop, horizon); ctx.lineTo(cx + roadTop, horizon);
            ctx.lineTo(cx + roadBot, h); ctx.lineTo(cx - roadBot, h);
            ctx.fill();

            // Objetos
            this.objects.sort((a,b) => b.z - a.z);
            this.objects.forEach(o => this.drawObject(ctx, o, w, h, horizon));

            // Jogador
            this.drawMario(ctx, cx + this.player.visualX, this.player.groundY + this.player.y, this.player.isJumping);

            return this.score;
        },

        spawnManager() {
            const lastObj = this.objects[this.objects.length-1];
            if(!lastObj || (2500 - lastObj.z) > 400) {
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

                if(o.z < 100 && o.z > -100 && o.lane === this.player.lane) {
                    let hit = true;
                    if(this.player.y < -150) hit = false; 

                    if(hit) {
                        window.Gfx.shake(20);
                        window.System.gameOver(this.score);
                    } else if (!o.passed) {
                        o.passed = true;
                        window.Sfx.coin();
                    }
                }
                if(o.z < -300) this.objects.splice(i, 1);
            }
        },

        addCloud(randomZ = false) {
            // SEGURANÇA: Garante que a lista existe
            if (!this.clouds) this.clouds = [];
            this.clouds.push({
                x: (Math.random()-0.5) * 3000,
                y: Math.random() * 200,
                z: randomZ ? Math.random() * 2000 : 3000,
                size: 50 + Math.random()*50
            });
        },

        drawObject(ctx, o, w, h, hor) {
            const scale = 400 / (400 + o.z);
            const x = (w/2) + (o.lane * PHYS.LANE_WIDTH * scale * 2);
            const y = hor + ((h-hor) * scale);
            const s = 150 * scale;

            if(o.type === 'pipe') {
                ctx.fillStyle = '#00aa00';
                ctx.fillRect(x - s/2, y - s, s, s);
                ctx.strokeStyle = '#004400'; ctx.lineWidth = 2; ctx.strokeRect(x - s/2, y - s, s, s);
            } else {
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(x - s/2, y - s*2.5, s, s);
                ctx.fillStyle = '#fff'; ctx.font = `bold ${s*0.8}px monospace`;
                ctx.textAlign = 'center'; ctx.fillText('?', x, y - s*1.7);
            }
        },

        drawMario(ctx, x, y, jumping) {
            if(jumping) {
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath(); ctx.ellipse(x, y - this.player.y, 40, 10, 0, 0, Math.PI*2); ctx.fill();
            }
            
            // Corpo
            ctx.fillStyle = '#0000ff'; ctx.fillRect(x - 20, y - 60, 40, 40);
            // Camisa
            ctx.fillStyle = '#ff0000';
            if(jumping) { ctx.fillRect(x - 35, y - 75, 15, 30); ctx.fillRect(x + 20, y - 75, 15, 30); }
            else { ctx.fillRect(x - 35, y - 65, 15, 30); ctx.fillRect(x + 20, y - 65, 15, 30); }
            
            // Cabeça
            ctx.fillStyle = '#ffccaa'; ctx.beginPath(); ctx.arc(x, y - 75, 25, 0, Math.PI*2); ctx.fill();
            // Chapéu
            ctx.fillStyle = '#ff0000'; ctx.beginPath(); ctx.arc(x, y - 85, 26, 0, Math.PI, true); ctx.fill();
            ctx.fillRect(x - 28, y - 85, 65, 10);
            
            // Logo M
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, y - 90, 10, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#ff0000'; ctx.font = 'bold 15px Arial'; ctx.textAlign = 'center'; ctx.fillText('M', x, y - 85);
        },

        drawClouds(ctx, w, h) {
            // SEGURANÇA CONTRA CRASH
            if(!this.clouds) return; 
            
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            this.clouds.forEach(c => {
                c.z -= this.speed * 0.5;
                if(c.z < 100) c.z = 3000;

                const scale = 1000 / c.z;
                const cx = (w/2) + (c.x * scale);
                const cy = (h*0.4) - (c.y * scale);
                const size = c.size * scale;

                ctx.beginPath();
                ctx.arc(cx, cy, size, 0, Math.PI*2);
                ctx.arc(cx + size, cy + size*0.2, size*0.8, 0, Math.PI*2);
                ctx.arc(cx - size, cy + size*0.2, size*0.8, 0, Math.PI*2);
                ctx.fill();
            });
        }
    };

    window.System.registerGame('run', { name: 'Super Otto', icon: '🍄', camOpacity: 0.1 }, Logic);
})();