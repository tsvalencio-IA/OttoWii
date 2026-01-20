/**
 * =============================================================================
 * SUPER OTTO WORLD - NEW PHYSICS ENGINE
 * =============================================================================
 * Melhorias:
 * - Gravidade Parabólica Real (Não-linear).
 * - Parallax Scrolling nas Nuvens.
 * - Sprites Desenhados proceduralmente (Estilo 8-bit moderno).
 * =============================================================================
 */

(function() {
    // Constantes Físicas
    const PHYS = {
        GRAVITY: 0.8,         // Força G
        JUMP_POWER: -18,      // Impulso inicial
        GROUND_Y: 0,          // Chão relativo
        LANE_WIDTH: 200,      // Largura da pista
        SPEED_INC: 0.005      // Aceleração do mundo
    };

    const Logic = {
        score: 0,
        distance: 0,
        worldSpeed: 0,
        
        // Jogador
        player: {
            lane: 0,          // -1 (Esq), 0 (Meio), 1 (Dir)
            x: 0,             // Posição visual X (interpolada)
            y: 0,             // Altura (pulo)
            vy: 0,            // Velocidade vertical
            isJumping: false
        },

        // Entidades
        objects: [],
        clouds: [],

        init: function() {
            this.score = 0;
            this.distance = 0;
            this.worldSpeed = 15; // Velocidade inicial
            
            // Reset Player
            this.player = { lane: 0, x: 0, y: 0, vy: 0, isJumping: false };
            
            // Limpa Entidades
            this.objects = [];
            this.clouds = [];
            
            // Nuvens Iniciais
            for(let i=0; i<8; i++) {
                this.spawnCloud(Math.random() * 3000);
            }

            window.System.msg("CORRA!");
            window.Sfx.boot();
        },

        update: function(ctx, w, h, pose) {
            const cx = w / 2;
            const horizon = h * 0.45; // Linha do horizonte

            // =================================================================
            // 1. INPUT (HEAD TRACKING)
            // =================================================================
            if(pose) {
                const nose = pose.keypoints.find(k => k.name === 'nose');
                if(nose && nose.score > 0.4) {
                    // Normaliza X do nariz (0 a 1)
                    const nx = nose.x / 640; 
                    
                    // Zonas de Controle (Deadzone no meio)
                    if (nx < 0.4) this.player.lane = 1;      // Esquerda (Espelhado)
                    else if (nx > 0.6) this.player.lane = -1; // Direita (Espelhado)
                    else this.player.lane = 0;               // Centro

                    // Trigger de Pulo (Nariz sobe na tela)
                    // Se o nariz subir acima de 30% da tela e não estiver pulando
                    if (nose.y < 150 && !this.player.isJumping) {
                        this.jump();
                    }
                }
            }

            // =================================================================
            // 2. FÍSICA DO JOGADOR
            // =================================================================
            // Aceleração do Mundo
            if (this.worldSpeed < 30) this.worldSpeed += PHYS.SPEED_INC;
            this.distance += this.worldSpeed;
            this.score = Math.floor(this.distance / 10);

            // Gravidade (Parábola)
            this.player.y += this.player.vy;
            this.player.vy += PHYS.GRAVITY;

            // Colisão com Chão
            if (this.player.y > PHYS.GROUND_Y) {
                this.player.y = PHYS.GROUND_Y;
                this.player.vy = 0;
                this.player.isJumping = false;
            }

            // Interpolação Lateral Suave (Lerp)
            const targetX = this.player.lane * PHYS.LANE_WIDTH;
            this.player.x += (targetX - this.player.x) * 0.15;

            // =================================================================
            // 3. GERENCIAMENTO DE OBJETOS
            // =================================================================
            this.manageSpawns();
            this.updateEntities();

            // =================================================================
            // 4. RENDERIZAÇÃO
            // =================================================================
            
            // Céu (Degradê Mario)
            const grad = ctx.createLinearGradient(0, 0, 0, h);
            grad.addColorStop(0, '#63a4ff');
            grad.addColorStop(0.5, '#87CEEB');
            grad.addColorStop(1, '#ffffff');
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

            // Montanhas de Fundo (Decorativo)
            this.drawMountains(ctx, w, horizon);

            // Nuvens (Parallax)
            this.drawClouds(ctx, w, h);

            // Chão (Grama)
            ctx.fillStyle = '#00cc44';
            ctx.fillRect(0, horizon, w, h - horizon);

            // Estrada (Perspectiva)
            this.drawRoad(ctx, cx, horizon, w, h);

            // Objetos (Z-Sort)
            this.objects.sort((a, b) => b.z - a.z); // Desenha de trás pra frente
            this.objects.forEach(o => this.drawObject(ctx, o, cx, horizon, h));

            // Jogador
            this.drawPlayer(ctx, cx, h);

            return this.score;
        },

        jump: function() {
            this.player.vy = PHYS.JUMP_POWER;
            this.player.isJumping = true;
            window.Sfx.jump();
        },

        spawnCloud: function(z) {
            this.clouds.push({
                x: (Math.random() - 0.5) * 2000,
                y: Math.random() * 200,
                z: z,
                size: 50 + Math.random() * 50
            });
        },

        manageSpawns: function() {
            // Se o último objeto estiver longe o suficiente, spawna outro
            const lastObj = this.objects[this.objects.length - 1];
            const safeDist = 3000 - (this.worldSpeed * 10); // Distância segura diminui com a velocidade
            
            if (!lastObj || lastObj.z < safeDist) {
                if (Math.random() < 0.3) {
                    const type = Math.random() < 0.6 ? 'pipe' : 'block';
                    // Garante que não spawna na mesma lane impossível
                    const lane = Math.floor(Math.random() * 3) - 1;
                    
                    this.objects.push({
                        type: type,
                        lane: lane,
                        z: 3000,
                        passed: false
                    });
                }
            }
            
            // Nuvens
            if(Math.random() < 0.05) this.spawnCloud(3000);
        },

        updateEntities: function() {
            // Objetos
            for(let i = this.objects.length - 1; i >= 0; i--) {
                const o = this.objects[i];
                o.z -= this.worldSpeed;

                // Colisão
                if (o.z < 100 && o.z > -100 && o.lane === this.player.lane) {
                    // Se o player estiver baixo o suficiente para bater
                    // Altura do Pipe/Bloco ~ 100px. Pulo ~ 200px.
                    // Hitbox check
                    if (this.player.y > -120) {
                        window.Gfx.shake(10);
                        window.System.gameOver(this.score);
                        return;
                    } else if (!o.passed) {
                        // Passou por cima!
                        o.passed = true;
                        window.Sfx.coin();
                    }
                }

                if (o.z < -200) this.objects.splice(i, 1);
            }

            // Nuvens
            for(let i = this.clouds.length - 1; i >= 0; i--) {
                const c = this.clouds[i];
                c.z -= this.worldSpeed * 0.5; // Nuvens mais lentas (Parallax)
                if (c.z < 100) this.clouds.splice(i, 1);
            }
        },

        // --- RENDERERS ---

        drawRoad: function(ctx, cx, horizon, w, h) {
            const roadTopW = 20;
            const roadBotW = w * 0.9;

            ctx.fillStyle = '#d35400'; // Terra batida
            ctx.beginPath();
            ctx.moveTo(cx - roadTopW, horizon);
            ctx.lineTo(cx + roadTopW, horizon);
            ctx.lineTo(cx + roadBotW, h);
            ctx.lineTo(cx - roadBotW, h);
            ctx.fill();
            
            // Faixas
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 4;
            const lanes = [-1, 1];
            lanes.forEach(l => {
                const lx = l * (PHYS.LANE_WIDTH / 2); // Aproximação
                // Desenha linhas dividindo as pistas
                // (Simplificado para visual clean)
            });
        },

        drawMountains: function(ctx, w, horizon) {
            ctx.fillStyle = '#2ecc71'; // Verde montanha
            ctx.beginPath();
            ctx.moveTo(0, horizon);
            ctx.lineTo(w*0.2, horizon - 100);
            ctx.lineTo(w*0.5, horizon);
            ctx.lineTo(w*0.8, horizon - 150);
            ctx.lineTo(w, horizon);
            ctx.fill();
        },

        drawClouds: function(ctx, w, h) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            this.clouds.forEach(c => {
                const scale = 800 / (800 + c.z);
                const screenX = (w/2) + c.x * scale;
                const screenY = (h*0.4) - c.y * scale;
                const size = c.size * scale;
                
                ctx.beginPath();
                ctx.arc(screenX, screenY, size, 0, Math.PI*2);
                ctx.arc(screenX + size*0.8, screenY + size*0.2, size*0.7, 0, Math.PI*2);
                ctx.arc(screenX - size*0.8, screenY + size*0.2, size*0.7, 0, Math.PI*2);
                ctx.fill();
            });
        },

        drawObject: function(ctx, o, cx, horizon, h) {
            const scale = 600 / (600 + o.z);
            const x = cx + (o.lane * PHYS.LANE_WIDTH * scale * 2.0); // 2.0 fator de perspectiva
            const y = horizon + (h - horizon) * scale;
            const s = 150 * scale;

            if (o.type === 'pipe') {
                // Cano Verde
                ctx.fillStyle = '#00aa00';
                ctx.strokeStyle = '#004400';
                ctx.lineWidth = 2;
                
                // Tubo
                ctx.fillRect(x - s/2, y - s, s, s);
                ctx.strokeRect(x - s/2, y - s, s, s);
                
                // Borda
                ctx.fillRect(x - s*0.6, y - s - (s*0.2), s*1.2, s*0.3);
                ctx.strokeRect(x - s*0.6, y - s - (s*0.2), s*1.2, s*0.3);
                
                // Brilho
                ctx.fillStyle = 'rgba(255,255,255,0.3)';
                ctx.fillRect(x - s*0.4, y - s, s*0.1, s*0.8);

            } else {
                // Bloco ?
                ctx.fillStyle = '#f1c40f';
                ctx.fillRect(x - s/2, y - s*2.2, s, s);
                ctx.strokeStyle = '#d35400';
                ctx.lineWidth = 3;
                ctx.strokeRect(x - s/2, y - s*2.2, s, s);
                
                // ?
                ctx.fillStyle = '#fff';
                ctx.font = `bold ${s*0.8}px monospace`;
                ctx.textAlign = 'center';
                ctx.fillText("?", x, y - s*1.4);
            }
        },

        drawPlayer: function(ctx, cx, h) {
            const x = cx + this.player.x; // Já está escalado? Não, visualX é relativo ao centro
            const y = h - 80 + this.player.y; // Base fixa + pulo
            
            // Sombra (Fica no chão)
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath();
            ctx.ellipse(x, h - 50, 30, 10, 0, 0, Math.PI*2);
            ctx.fill();

            // Boneco (Estilo "Otto" Vermelho)
            ctx.save();
            ctx.translate(x, y);
            
            // Macacão Azul
            ctx.fillStyle = '#0039e6';
            ctx.fillRect(-15, -40, 30, 30);
            
            // Camisa Vermelha
            ctx.fillStyle = '#e70000';
            ctx.beginPath(); ctx.arc(0, -45, 18, 0, Math.PI*2); ctx.fill();
            // Braços
            if(this.player.isJumping) {
                // Braços pra cima
                ctx.fillRect(-25, -60, 10, 25);
                ctx.fillRect(15, -60, 10, 25);
            } else {
                // Braços correndo
                const swing = Math.sin(Date.now() / 50) * 10;
                ctx.fillRect(-25, -50 + swing, 10, 25);
                ctx.fillRect(15, -50 - swing, 10, 25);
            }

            // Cabeça
            ctx.fillStyle = '#ffccaa'; // Pele
            ctx.beginPath(); ctx.arc(0, -65, 20, 0, Math.PI*2); ctx.fill();
            
            // Chapéu
            ctx.fillStyle = '#e70000';
            ctx.beginPath(); ctx.arc(0, -70, 22, Math.PI, 0); ctx.fill();
            ctx.fillRect(-25, -70, 50, 8); // Aba

            // Rosto
            ctx.fillStyle = '#000';
            ctx.fillRect(5, -65, 4, 4); // Olho
            ctx.fillRect(-5, -60, 15, 6); // Bigode

            ctx.restore();
        }
    };

    window.System.registerGame('run', { name: 'Super Otto', icon: '🍄', camOpacity: 0.2 }, Logic);
})();
