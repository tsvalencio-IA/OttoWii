/**
 * =============================================================================
 * OTTO TENNIS (WII SPORTS PHYSICS)
 * =============================================================================
 */

(function() {
    const Logic = {
        score: 0,
        state: 'calibrate',
        ball: { x:0, y:0, z:0, vx:0, vy:0, vz:0 },
        racket: { x:0, y:0 },
        handRef: { x:0, y:0 }, // Centro
        timer: 0,

        init: function() {
            this.score = 0;
            this.state = 'calibrate';
            this.timer = 0;
            this.racket = {x:0, y:0};
            window.System.msg("CENTRALIZAR MÃO");
        },

        resetBall: function() {
            this.ball = { x:0, y:-400, z:1400, vx:(Math.random()-0.5)*20, vy:5, vz:-35 };
        },

        update: function(ctx, w, h, pose) {
            const cx = w/2; const cy = h/2;

            // Input
            let hand = null;
            if(pose) {
                const r = pose.keypoints.find(k=>k.name==='right_wrist');
                if(r && r.score>0.4) hand = window.Gfx.map(r, w, h);
            }

            // Calibração
            if(this.state === 'calibrate') {
                ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,w,h);
                ctx.strokeStyle = '#0f0'; ctx.lineWidth = 5;
                ctx.beginPath(); ctx.arc(cx, cy, 60, 0, Math.PI*2); ctx.stroke();
                ctx.fillStyle = '#fff'; ctx.textAlign='center'; ctx.font='20px Arial';
                ctx.fillText("MANTENHA A MÃO NO CÍRCULO", cx, cy-80);

                if(hand) {
                    ctx.fillStyle='#0f0'; ctx.beginPath(); ctx.arc(hand.x, hand.y, 15, 0, Math.PI*2); ctx.fill();
                    if(Math.hypot(hand.x-cx, hand.y-cy) < 60) {
                        this.timer++;
                        ctx.fillRect(cx-50, cy+80, this.timer*2, 10);
                        if(this.timer>50) {
                            this.handRef = {x:hand.x, y:hand.y};
                            this.state = 'play';
                            this.resetBall();
                            window.System.msg("SAQUE!");
                            window.Sfx.coin();
                        }
                    } else this.timer=0;
                }
                return 0;
            }

            // Jogo
            if(hand) {
                this.racket.x = cx + (hand.x - this.handRef.x) * 2.5; // Amplifica movimento
                this.racket.y = cy + (hand.y - this.handRef.y) * 2.5;
            }

            // Física Bola
            this.ball.x += this.ball.vx;
            this.ball.y += this.ball.vy;
            this.ball.z += this.ball.vz;
            if(this.ball.y < 200) this.ball.vy += 0.9; // Gravidade
            if(this.ball.y > 200) { this.ball.y=200; this.ball.vy *= -0.8; } // Quique

            // Rebatida
            if(this.ball.z < 100 && this.ball.vz < 0) {
                const scale = 500/(500+this.ball.z);
                const bx = cx + this.ball.x * scale;
                const by = cy + (this.ball.y+100) * scale;
                
                if(Math.hypot(bx-this.racket.x, by-this.racket.y) < 120) {
                    window.Sfx.hit();
                    this.score++;
                    window.Gfx.shake(5);
                    this.ball.vz = 45; // Rebate fundo
                    this.ball.vy = -25;
                    this.ball.vx = (bx - this.racket.x) * 0.5;
                }
            }

            // CPU Devolve
            if(this.ball.z > 1400 && this.ball.vz > 0) {
                window.Sfx.click();
                this.ball.vz = -40;
                this.ball.vx = (Math.random()-0.5)*30;
                this.ball.vy = -20;
            }

            if(this.ball.z < -200) window.System.gameOver(this.score);

            // Render
            // Quadra Azul
            ctx.fillStyle = '#2980b9'; ctx.fillRect(0,0,w,h);
            ctx.strokeStyle = '#fff'; ctx.lineWidth=4;
            const p = (x,y,z) => { const s=500/(500+z); return {x:cx+x*s, y:cy+(y+200)*s}; };
            
            // Linhas
            const p1=p(-400,0,1400), p2=p(400,0,1400), p3=p(400,0,0), p4=p(-400,0,0);
            ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y); ctx.lineTo(p3.x,p3.y); ctx.lineTo(p4.x,p4.y); ctx.closePath(); ctx.stroke();
            
            // Rede
            const n1=p(-400,-100,700), n2=p(400,-100,700);
            ctx.beginPath(); ctx.moveTo(n1.x,n1.y); ctx.lineTo(n2.x,n2.y); ctx.stroke();

            // Sombra e Bola
            const sp = p(this.ball.x, 200, this.ball.z);
            const ssc = 500/(500+this.ball.z);
            ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(sp.x, sp.y, 20*ssc, 10*ssc, 0,0,Math.PI*2); ctx.fill();

            const bp = p(this.ball.x, this.ball.y, this.ball.z);
            ctx.fillStyle = '#ffeb3b'; ctx.beginPath(); ctx.arc(bp.x, bp.y, 25*ssc, 0, Math.PI*2); ctx.fill();

            // Raquete
            ctx.fillStyle = 'rgba(231,76,60,0.7)'; ctx.strokeStyle='#fff';
            ctx.beginPath(); ctx.arc(this.racket.x, this.racket.y, 60, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(this.racket.x, this.racket.y+60); ctx.lineTo(this.racket.x, this.racket.y+150); ctx.lineWidth=10; ctx.stroke();

            return this.score;
        }
    };

    window.OTTO_GAMES['tennis'] = { name: 'Otto Tennis', icon: '🎾', camOpacity: 0.5, logic: Logic };
})();
