/**
 * =============================================================================
 * OTTO KART - RACING ENGINE
 * =============================================================================
 * Simulação Pseudo-3D (Mode 7 style).
 */

(function() {
    const KART = {
        MAX_SPEED: 12000,
        ACCEL: 3000,
        DECEL: 2000,
        OFF_ROAD_DECEL: 6000,
        TURN_SPEED: 2000,
        ROAD_WIDTH: 2000,
        SEGMENT_LENGTH: 200
    };

    const Logic = {
        pos: 0,
        speed: 0,
        playerX: 0, // -1 a 1 (normalizado pela largura da pista)
        trackLength: 0,
        segments: [],
        
        // Input
        steerAngle: 0, // Calculado pelas mãos
        
        init() {
            this.pos = 0;
            this.speed = 0;
            this.playerX = 0;
            this.generateTrack();
        },

        generateTrack() {
            this.segments = [];
            const addSegment = (curve) => {
                this.segments.push({
                    curve: curve,
                    y: 0, // Poderia adicionar colinas aqui
                    clip: 0
                });
            };

            // Layout da pista
            for(let i=0; i<50; i++) addSegment(0); // Reta
            for(let i=0; i<40; i++) addSegment(2); // Direita suave
            for(let i=0; i<20; i++) addSegment(0);
            for(let i=0; i<40; i++) addSegment(-3); // Esquerda forte
            for(let i=0; i<100; i++) addSegment(0);
            
            this.trackLength = this.segments.length * KART.SEGMENT_LENGTH;
        },

        update(ctx, w, h, pose, dt) {
            // 1. INPUT (Volante Virtual)
            if (pose) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && rw && lw.score > 0.3 && rw.score > 0.3) {
                    const diffY = rw.y - lw.y;
                    const diffX = rw.x - lw.x;
                    this.steerAngle = Math.atan2(diffY, diffX); // Ângulo em radianos
                    
                    // Acelera se segurar o volante estável
                    this.speed += KART.ACCEL * dt;
                } else {
                    this.speed -= KART.DECEL * dt;
                }
            } else {
                this.speed -= KART.DECEL * dt;
            }

            // Clampar velocidade e aplicar atrito off-road
            if (Math.abs(this.playerX) > 1.2) this.speed -= KART.OFF_ROAD_DECEL * dt;
            this.speed = MathUtils.clamp(this.speed, 0, KART.MAX_SPEED);

            // Mover Player
            this.pos += this.speed * dt;
            while (this.pos >= this.trackLength) this.pos -= this.trackLength;
            while (this.pos < 0) this.pos += this.trackLength;

            // Curva e Física X
            // Pegar segmento atual para saber a curva
            const currentSegIndex = Math.floor(this.pos / KART.SEGMENT_LENGTH);
            const currentSeg = this.segments[currentSegIndex % this.segments.length];
            
            // Steering input (inverso, porque inclinar para direita (mão dir baixa) = ângulo positivo)
            // Ajuste fino para sensação de direção
            const steerInput = MathUtils.clamp(this.steerAngle * 2, -1, 1); 
            
            // Física centrífuga: Curva empurra player para fora, volante empurra para dentro
            const centrifugal = (currentSeg.curve * this.speed / KART.MAX_SPEED) * dt;
            this.playerX -= centrifugal * 2; 
            this.playerX -= steerInput * (this.speed / KART.MAX_SPEED) * dt * 2;

            this.playerX = MathUtils.clamp(this.playerX, -2, 2);

            // RENDER
            this.renderTrack(ctx, w, h);
            this.renderPlayer(ctx, w, h, steerInput);
            
            // Draw Wheel Guide
            this.drawWheelGuide(ctx, w, h);

            return Math.floor(this.speed / 100);
        },

        renderTrack(ctx, w, h) {
            ctx.fillStyle = '#72D7EE'; // Sky
            ctx.fillRect(0,0,w,h/2);
            ctx.fillStyle = '#333'; // Ground backup
            ctx.fillRect(0,h/2,w,h/2);

            const startPos = this.pos;
            const startIdx = Math.floor(this.pos / KART.SEGMENT_LENGTH);
            let x = 0, dx = 0;
            let maxY = h;

            // Projection variables
            const camH = 1000;
            const camD = 1 / Math.tan(100 * Math.PI / 180); // FOV

            for(let n = startIdx; n < startIdx + 50; n++) {
                const seg = this.segments[n % this.segments.length];
                const loop = Math.floor(n / this.segments.length);
                const segZ = (n * KART.SEGMENT_LENGTH) - startPos; // Z relativo à câmera
                
                // Project
                const scale = camD / segZ;
                const screenY = (1 + scale * camH) * (h/2); // Y centralizado
                
                // Curve X accumulation
                x += dx;
                dx += seg.curve;
                const screenX = w/2 + (scale * (x - this.playerX * KART.ROAD_WIDTH) * w/2);
                
                const segmentWidth = KART.ROAD_WIDTH * scale * w/2;

                if (screenY >= maxY || segZ <= 10) continue;
                
                // Draw Segment
                const color = (n % 2) ? '#fff' : '#c0392b'; // Rumble strip
                const roadColor = (Math.floor(n/3)%2) ? '#666' : '#606060';

                ctx.fillStyle = '#2c3e50'; // Grass
                ctx.fillRect(0, screenY, w, maxY - screenY);

                ctx.fillStyle = roadColor; // Road
                const H = maxY - screenY;
                ctx.beginPath();
                ctx.moveTo(screenX - segmentWidth, screenY);
                ctx.lineTo(screenX + segmentWidth, screenY);
                ctx.lineTo(screenX + segmentWidth * 1.05, screenY + H); // Simplificado
                ctx.lineTo(screenX - segmentWidth * 1.05, screenY + H);
                ctx.fill();

                maxY = screenY;
            }
        },

        renderPlayer(ctx, w, h, steer) {
            const cx = w/2;
            const cy = h - 100;
            
            ctx.save();
            ctx.translate(cx, cy);
            // Tilt do kart baseado na curva
            ctx.rotate(steer * 0.5); 
            
            // Kart simples
            ctx.fillStyle = '#e74c3c';
            ctx.fillRect(-40, -40, 80, 40);
            ctx.fillStyle = '#333';
            ctx.fillRect(-45, -20, 10, 20); // Pneu
            ctx.fillRect(35, -20, 10, 20); // Pneu

            // Driver
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.arc(0, -50, 20, 0, Math.PI*2);
            ctx.fill();

            ctx.restore();
        },
        
        drawWheelGuide(ctx, w, h) {
             ctx.save();
             ctx.translate(w - 100, 100);
             ctx.rotate(this.steerAngle);
             ctx.strokeStyle = 'rgba(255,255,255,0.5)';
             ctx.lineWidth = 5;
             ctx.beginPath();
             ctx.arc(0,0,40,0,Math.PI*2);
             ctx.stroke();
             ctx.beginPath();
             ctx.moveTo(-40,0); ctx.lineTo(40,0);
             ctx.stroke();
             ctx.restore();
        }
    };

    window.System.registerGame('kart', { name: 'Otto Kart', icon: '🏎️' }, Logic);
})()