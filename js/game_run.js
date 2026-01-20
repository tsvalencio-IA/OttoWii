window.log("Carregando Game Run...");

(function() {
    const Logic = {
        score: 0,
        playerY: 0,
        
        init: function() {
            window.log("Run: Init iniciado");
            this.score = 0;
            this.playerY = 0;
            window.System.msg("TESTE RUN");
        },

        update: function(ctx, w, h, pose) {
            // Fundo simples
            ctx.fillStyle = "#87CEEB";
            ctx.fillRect(0, 0, w, h);
            
            // Chão
            ctx.fillStyle = "#228B22";
            ctx.fillRect(0, h*0.6, w, h*0.4);

            // Jogador (Mario Quadrado)
            ctx.fillStyle = "red";
            let y = h*0.6 - 50;
            
            // Se detectar nariz, move
            if(pose) {
                const nose = pose.keypoints.find(k => k.name === 'nose');
                if(nose) {
                    ctx.fillStyle = "yellow"; // Ficou amarelo = detectou
                    if(nose.y < 200) y -= 100; // Pulo
                }
            }
            
            ctx.fillRect(w/2 - 25, y, 50, 50);
            
            this.score++;
            return Math.floor(this.score / 10);
        }
    };

    if(window.System) {
        window.System.registerGame('run', { name: 'Super Otto', icon: '🍄', camOpacity: 0.2 }, Logic);
    } else {
        window.log("ERRO: System não existe ao carregar Run!");
    }
})();