/**
 * =============================================================================
 * OTTO KART - WII EDITION (MODE 7 PHYSICS)
 * =============================================================================
 * Mecânica: A estrada curva, o carro desliza. Sensação de Arcade.
 * Controle: Ângulo entre os dois pulsos (Volante Virtual).
 */

(function() {
    const KART = {
        MAX_SPEED: 220,
        ACCEL: 2.0,
        FRICTION: 0.96,
        TURN_SPEED: 0.06,
        ROAD_WIDTH: 2200,
        SEGMENT_LENGTH: 200
    };

    const Logic = {
        speed: 0,
        pos: 0,       // Posição Z na pista
        playerX: 0,   // Posição X na estrada (-1 a 1)
        score: 0,
        steer: 0,     // Input do volante
        
        // Elementos
        opponents: [],
        scenery: [],
        
        // Input
        wheelAngle: 0,

        init: function() {
            this.speed = 0;
            this.pos = 0;
            this.playerX = 0;
            this.score = 0;
            this.opponents = [];
            this.scenery = [];
            
            // Cria Rivais
            const colors = ['#e74c3c', '#f1c40f', '#9b59b6', '#2ecc71'];
            for(let i=0; i<4; i++) {
                this.opponents.push({
                    z: (i+1) * 600 + 1000,
                    x: (Math.random()-0.5) * 0.8,
                    speed: KART.MAX_SPEED * 0.9,
                    color: colors[i]
                });
            }
            
            // Cria Cenário (Árvores)
            for(let z=0; z<20000; z+=800) {
                if(Math.random()<0.6) this.scenery.push({ z: z, type: 'tree', side: -1 });
                if(Math.random()<0.6) this.scenery.push({ z: z, type: 'tree', side: 1 });
            }

            window.System.msg("SEGURE O VOLANTE!");
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2;
            const horizon = h * 0.45;

            // 1. INPUT (VOLANTE VIRTUAL)
            let hasControl = false;
            if(pose) {
                const l = pose.keypoints.find(k=>k.name==='left_wrist');
                const r = pose.keypoints.find(k=>k.name==='right_wrist');
                
                if(l && l.score>0.3 && r && r.score>0.3) {
                    hasControl = true;
                    const dx = r.x - l.x;
                    const dy = r.y - l.y;
                    this.wheelAngle = Math.atan2(dy, dx); // Inclinação das mãos
                    
                    // Desenha feedback do volante na tela
                    this.updateUI(this.wheelAngle);
                }
            }

            // Física de Direção
            if(hasControl) {
                const targetSteer = this.wheelAngle * 2.5;
                this.steer += (targetSteer - this.steer) * 0.1; // Suavização
                if(this.speed < KART.MAX_SPEED) this.speed += KART.ACCEL;
            } else {
                this.steer *= 0.8; // Centraliza
                this.speed *= KART.FRICTION;
            }

            // Movimento
            this.pos += this.speed;
            this.playerX -= this.steer * (this.speed / KART.MAX_SPEED) * KART.TURN_SENSITIVITY || 0;
            this.playerX -= this.steer * 0.02; // Força centrífuga nas curvas

            // Limites da pista (Grama)
            if(Math.abs(this.playerX) > 1.2) {
                this.speed *= 0.9;
                window.Gfx.shake(3);
                if(this.playerX > 1.2) this.playerX = 1.2;
                if(this.playerX < -1.2) this.playerX = -1.2;
            }

            this.score = Math.floor(this.pos / 100);

            // 2. RENDERIZAÇÃO (PSEUDO 3D)
            
            // Céu
            const grad = ctx.createLinearGradient(0,0,0,horizon);
            grad.addColorStop(0, '#0099ff'); grad.addColorStop(1, '#87CEEB');
            ctx.fillStyle = grad; ctx.fillRect(0,0,w,horizon);
            
            // Chão (Verde Nintendo)
            ctx.fillStyle = '#32cd32'; ctx.fillRect(0,horizon,w,h-horizon);

            // Estrada Trapézio (A pista curva deslocando o centro X)
            const roadW_Far = w * 0.02;
            const roadW_Near = w * 2.2;
            const curveOffset = this.steer * w * 0.8; // Curva visual
            
            const xFar = cx - curveOffset - (this.playerX * w * 0.1); // Ponto de fuga
            const xNear = cx - (this.playerX * w * 1.5); // Frente do carro
            
            ctx.fillStyle = '#555';
            ctx.beginPath();
            ctx.moveTo(xFar - roadW_Far, horizon);
            ctx.lineTo(xFar + roadW_Far, horizon);
            ctx.lineTo(xNear + roadW_Near, h);
            ctx.lineTo(xNear - roadW_Near, h);
            ctx.fill();
            
            // Zebras (Animação de velocidade)
            const stripeOffset = (this.pos % 200) / 200;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 4;
            ctx.setLineDash([20, 40]); ctx.lineDashOffset = -stripeOffset * 60;
            ctx.beginPath();
            ctx.moveTo(xFar, horizon); ctx.lineTo(xNear, h);
            ctx.stroke();
            ctx.setLineDash([]);

            // 3. OBJETOS
            const renderList = [...this.scenery, ...this.opponents];
            
            renderList.forEach(o => {
                let dz = o.z - this.pos;
                while(dz < -500) dz += 20000; // Loop infinito
                o._renderZ = dz;
            });
            
            // Ordena do fundo para frente
            renderList.sort((a,b) => b._renderZ - a._renderZ);

            renderList.forEach(o => {
                const dz = o._renderZ;
                if(dz > 10 && dz < 5000) {
                    const scale = 500 / (500 + dz);
                    // Projeção baseada na curva da estrada
                    const roadX = xFar + (xNear - xFar) * scale;
                    const objX = roadX + (o.x || (o.side * 1.5)) * (w * scale * 1.5);
                    const objY = horizon + (h - horizon) * scale;
                    const size = 200 * scale;

                    if(o.type === 'tree') {
                        // Árvore "Papel" (Billboard)
                        ctx.fillStyle = '#228B22';
                        ctx.beginPath(); ctx.moveTo(objX, objY-size); 
                        ctx.lineTo(objX-size/3, objY); ctx.lineTo(objX+size/3, objY); ctx.fill();
                        ctx.fillStyle = '#5D4037'; ctx.fillRect(objX-size/8, objY, size/4, size/4);
                    } else if(o.color) {
                        // Oponente (Kart)
                        o.z += o.speed * 0.016;
                        ctx.fillStyle = o.color;
                        ctx.fillRect(objX-size/2, objY-size/2, size, size/2);
                        // Rodas
                        ctx.fillStyle = '#111';
                        ctx.fillRect(objX-size/2, objY, size/4, size/6);
                        ctx.fillRect(objX+size/4, objY, size/4, size/6);
                    }
                }
            });

            // 4. PLAYER (KART)
            // O kart não tomba, ele inclina levemente na curva (Drift)
            this.drawPlayerKart(ctx, cx, h-80, this.steer);

            return this.score;
        },

        drawPlayerKart: function(ctx, x, y, steer) {
            ctx.save();
            ctx.translate(x, y);
            
            // Inclinação leve para simular suspensão, não capotamento
            ctx.rotate(steer * 0.2); 

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.4)';
            ctx.fillRect(-60, 10, 120, 20);

            // Chassi (Vermelho Mario)
            ctx.fillStyle = '#e74c3c';
            ctx.beginPath();
            ctx.roundRect(-65, -30, 130, 50, 10);
            ctx.fill();

            // Pneus Traseiros (Largos)
            ctx.fillStyle = '#222';
            ctx.fillRect(-80, -10, 25, 40); // Esq
            ctx.fillRect(55, -10, 25, 40);  // Dir

            // Motor
            ctx.fillStyle = '#444';
            ctx.fillRect(-40, -45, 80, 20);
            // Escapamento
            ctx.fillStyle = '#777';
            ctx.beginPath(); ctx.arc(-30, -35, 8, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.arc(30, -35, 8, 0, Math.PI*2); ctx.fill();

            // Capacete do Mario
            ctx.fillStyle = '#fff'; // Branco base
            ctx.beginPath(); ctx.arc(0, -50, 28, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#e74c3c'; // M
            ctx.font = "bold 20px Arial"; ctx.textAlign="center"; ctx.fillText("M", 0, -45);

            ctx.restore();
        },

        updateUI: function(angle) {
            const el = document.getElementById('visual-wheel');
            if(el) el.style.transform = `rotate(${angle}rad)`;
        }
    };

    // REGISTRO SEGURO (VARAL GLOBAL)
    window.OTTO_GAMES['kart'] = { name: 'Otto Kart', icon: '🏎️', camOpacity: 0.3, showWheel: true, logic: Logic };
})();
