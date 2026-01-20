/**
 * =============================================================================
 * OTTO RUN - PLATAFORMA 2.5D (PHYSICS OVERHAUL)
 * =============================================================================
 * Lógica baseada em Mario: Aceleração, Inércia e Pulo Variável.
 */

(function() {
    const PHYS = {
        GRAVITY: 2000,
        JUMP_FORCE: -900,     // Força inicial
        JUMP_HOLD: -1200,     // Força extra se segurar "cima"
        RUN_BASE: 500,
        RUN_MAX: 900,
        ACCEL: 300,
        LANE_W: 200
    };

    const Logic = {
        score: 0,
        state: 'ready', // ready, playing, dead
        
        // Player Physics Entity
        player: {
            y: 0,
            vy: 0,
            lane: 0,        // -1, 0, 1
            visualX: 0,     // Para suavizar troca de lane
            onGround: true,
            isCrouching: false,
            jumpTimer: 0    // Para pulo variável
        },

        // World Generation
        objects: [],
        decor: [],
        distance: 0,
        speed: 0,
        
        // Calibration
        baseY: 0,
        calibrated: false,

        init() {
            this.score = 0;
            this.state = 'ready';
            this.distance = 0;
            this.speed = PHYS.RUN_BASE;
            this.objects = [];
            this.decor = [];
            this.player = { y: 0, vy: 0, lane: 0, visualX: 0, onGround: true, isCrouching: false, jumpTimer: 0 };
            this.calibrated = false;
        },

        update(ctx, w, h, pose, dt) {
            const cx = w / 2;
            const horizon = h * 0.4;
            const groundY = h;

            // 1. INPUT PROCESSING & PHYSICS
            if (pose) {
                this.handleInput(pose, w, h, dt);
            }

            if (this.state === 'playing') {
                // Aceleração progressiva (Mario style)
                this.speed = MathUtils.clamp(this.speed + PHYS.ACCEL * dt, PHYS.RUN_BASE, PHYS.RUN_MAX);
                this.distance += this.speed * dt;
                this.score = Math.floor(this.distance / 100);

                // Player Physics (Vertical)
                this.player.vy += PHYS.GRAVITY * dt;
                this.player.y += this.player.vy * dt;

                // Ground Collision
                if (this.player.y >= 0) {
                    this.player.y = 0;
                    this.player.vy = 0;
                    this.player.onGround = true;
                } else {
                    this.player.onGround = false;
                }

                // Smooth Lane Switching (Lerp)
                const targetX = this.player.lane * PHYS.LANE_W;
                this.player.visualX = MathUtils.lerp(this.player.visualX, targetX, 10 * dt);

                // Spawner
                this.spawnManager();
                
                // Entity Update & Collision
                this.updateEntities(dt);
            }

            // 2. RENDER (Painter's Algorithm)
            this.drawBackground(ctx, w, h, horizon);
            this.drawTrack(ctx, w, h, horizon);
            
            // Sort objects by Z depth (far to near)
            const renderList = [...this.objects].sort((a, b) => b.z - a.z);
            renderList.forEach(obj => this.drawObject(ctx, obj, w, h, horizon));

            this.drawPlayer(ctx, w, h, horizon);

            // UI de Calibração
            if (!this.calibrated) {
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(0,0,w,h);
                ctx.fillStyle = '#fff';
                ctx.textAlign = 'center';
                ctx.font = '30px Inter';
                ctx.fillText("FIQUE PARADO PARA CALIBRAR", w/2, h/2);
            }

            return this.score;
        },

        handleInput(pose, w, h, dt) {
            const nose = pose.keypoints.find(k => k.name === 'nose');
            if (!nose || nose.score < 0.5) return;

            // Calibração Inicial (define altura base do jogador)
            if (!this.calibrated) {
                this.baseY = nose.y;
                this.calibrated = true;
                this.state = 'playing';
                window.Sfx.play(600, 'sine', 0.5, 0.1);
                return;
            }

            // Lane Control (Zonas mortas para evitar jitter)
            const nX = nose.x / 640; // 0.0 a 1.0
            if (nX < 0.4) this.player.lane = 1;      // Esquerda (espelhado)
            else if (nX > 0.6) this.player.lane = -1; // Direita
            else this.player.lane = 0;

            // Jump / Crouch Control
            const diffY = nose.y - this.baseY;

            // Pulo: Se nariz subir muito E estiver no chão
            if (diffY < -40 && this.player.onGround) {
                this.player.vy = PHYS.JUMP_FORCE;
                this.player.onGround = false;
                window.Sfx.jump();
                // Efeito de partículas aqui seria ideal
            }

            // Agachar
            this.player.isCrouching = diffY > 50;
        },

        spawnManager() {
            // Gera obstáculos a cada X metros
            const spawnZ = 2000 + this.distance;
            const lastObj = this.objects[this.objects.length - 1];
            
            if (!lastObj || (spawnZ - (lastObj.z + this.distance)) > 600) {
                if (Math.random() < 0.6) {
                    const type = Math.random() > 0.5 ? 'box' : 'barrier';
                    this.objects.push({
                        z: 2000, // Z relativo ao player
                        lane: Math.floor(Math.random() * 3) - 1,
                        type: type,
                        passed: false
                    });
                }
            }
        },

        updateEntities(dt) {
            // Move objects towards player
            for (let i = this.objects.length - 1; i >= 0; i--) {
                const o = this.objects[i];
                o.z -= this.speed * dt;

                // Colisão (AABB simples em 3D)
                if (o.z < 50 && o.z > -50 && o.lane === this.player.lane) {
                    let hit = false;
                    
                    if (o.type === 'barrier') {
                        // Barreira precisa pular
                        if (this.player.y > -50) hit = true; 
                    } else if (o.type === 'box') {
                        // Caixa precisa agachar
                        if (!this.player.isCrouching) hit = true;
                    }

                    if (hit) {
                        window.System.gameOver(this.score);
                        return;
                    }
                }

                // Cleanup e Score
                if (o.z < -200) {
                    this.objects.splice(i, 1);
                    if (!o.passed) {
                        o.passed = true;
                        window.Sfx.coin();
                    }
                }
            }
        },

        // --- RENDERIZADORES ---

        drawBackground(ctx, w, h, hor) {
            // Céu gradiente
            const grad = ctx.createLinearGradient(0, 0, 0, hor);
            grad.addColorStop(0, '#87CEEB');
            grad.addColorStop(1, '#E0F7FA');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, w, hor);
            
            // Sol
            ctx.fillStyle = '#FFD700';
            ctx.beginPath();
            ctx.arc(w * 0.8, hor * 0.3, 40, 0, Math.PI*2);
            ctx.fill();
        },

        drawTrack(ctx, w, h, hor) {
            // Chão
            ctx.fillStyle = '#4CAF50';
            ctx.fillRect(0, hor, w, h - hor);

            // Pista (trapézio para perspectiva)
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.moveTo(w/2 - 20, hor); // Ponto de fuga
            ctx.lineTo(w/2 + 20, hor);
            ctx.lineTo(w, h);
            ctx.lineTo(0, h);
            ctx.fill();

            // Linhas das lanes
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            [-1, 1].forEach(dir => {
                const xTop = w/2 + (dir * 10);
                const xBot = w/2 + (dir * w/3);
                ctx.beginPath();
                ctx.moveTo(xTop, hor);
                ctx.lineTo(xBot, h);
                ctx.stroke();
            });
        },

        drawObject(ctx, obj, w, h, hor) {
            // Perspectiva simples: Scale = 1 / z
            const k = 400; // Focal length
            const scale = k / (k + obj.z);
            if (scale < 0) return;

            const dw = w / 2;
            const dh = h - hor; // Altura do chão na tela
            
            // Posição X projetada
            const screenX = w/2 + (obj.lane * PHYS.LANE_W * scale);
            const screenY = hor + (dh * scale); // Base do objeto no chão
            
            const size = 150 * scale;

            ctx.save();
            ctx.translate(screenX, screenY);

            if (obj.type === 'barrier') {
                // Obstáculo baixo (pular)
                ctx.fillStyle = '#e74c3c';
                ctx.fillRect(-size/2, -size/2, size, size/2);
                ctx.fillStyle = '#c0392b'; // Shading
                ctx.fillRect(-size/2, -size/2, size, 5);
            } else {
                // Obstáculo alto (agachar)
                ctx.fillStyle = '#f39c12';
                ctx.fillRect(-size/2, -size*1.5, size, size);
                // Detalhe de caixa (?)
                ctx.strokeStyle = '#d35400';
                ctx.lineWidth = 2;
                ctx.strokeRect(-size/2, -size*1.5, size, size);
            }
            ctx.restore();
        },

        drawPlayer(ctx, w, h, hor) {
            const playerScreenX = w/2 + this.player.visualX; // Player está sempre "perto" da câmera (Z=0 visualmente)
            const playerScreenY = h - 50 + this.player.y; // Y é negativo quando pula

            ctx.save();
            ctx.translate(playerScreenX, playerScreenY);

            // Sombra (dá noção de altura)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(0, -this.player.y, 40 + (this.player.y*0.1), 10, 0, 0, Math.PI*2);
            ctx.fill();

            // Corpo
            ctx.fillStyle = '#3498db';
            const height = this.player.isCrouching ? 40 : 80;
            
            // Squash & Stretch simples
            let scaleX = 1, scaleY = 1;
            if (!this.player.onGround) { scaleX = 0.9; scaleY = 1.1; } // Stretch no ar
            if (Math.abs(this.player.vy) < 10 && this.player.onGround) { scaleX = 1.1; scaleY = 0.9; } // Squash no impacto

            ctx.scale(scaleX, scaleY);
            
            // Corpo (Capsula)
            ctx.beginPath();
            ctx.roundRect(-25, -height, 50, height, 10);
            ctx.fill();

            // Cabeça
            ctx.fillStyle = '#f1c40f'; // Rosto
            ctx.beginPath();
            ctx.arc(0, -height - 15, 20, 0, Math.PI*2);
            ctx.fill();

            // Bonezinho
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(-22, -height - 35, 44, 10);

            ctx.restore();
        }
    };

    window.System.registerGame('run', { name: 'Otto Run', icon: '🏃' }, Logic);
})();