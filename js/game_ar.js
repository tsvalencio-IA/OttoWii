// =============================================================================
// USR AR COLLECTOR V5 - THE ULTIMATE EDITION
// SENSOR HÍBRIDO + GPS + CONFIRMAÇÃO FÍSICA (ACELERÓMETRO) + GARAGEM (UPGRADES)
// =============================================================================

(function() {
    "use strict";

    let particles = [];
    let time = 0;

    const Game = {
        state: 'BOOT', // BOOT, CALIBRATE_GPS, SCANNING, CONFIRMING, ANALYZING, RETURNING, SHOP
        score: 0,
        
        // IA Visual e Radares
        objectModel: null,
        detectedItems: [],
        lastDetectTime: 0,
        floorColor: { r: 0, g: 0, b: 0 },
        targetColor: { r: 0, g: 0, b: 0 },
        currentDiff: 0,
        
        // Mecânica de Captura e Confirmação
        scanProgress: 0,
        targetItem: null,
        graceTimer: 0, 
        cooldown: 0,
        truckMoveEnergy: 0, // Energia acumulada de movimento (Frente/Trás)
        currentReward: 0,   // Valor total da sucata atual
        
        // GPS e Navegação
        basePos: { lat: null, lng: null },
        currentPos: { lat: null, lng: null },
        distanceToBase: 999,
        gpsWatcher: null,
        compassHeading: 0,
        returnTimer: 0, 
        
        // Inventário e Progressão
        cargo: null,
        itemsRecovered: 0,
        moneyEarned: 0, 
        
        // Sistema de Upgrades (A Garagem)
        upgrades: {
            motor: { level: 1, max: 5, cost: 1000, name: "MOTOR TRATOR", desc: "Extração mais rápida" },
            pneus: { level: 1, max: 5, cost: 800,  name: "PNEUS OFF-ROAD", desc: "Mira mais estável" },
            oleo:  { level: 1, max: 5, cost: 500,  name: "ÓLEO PREMIUM", desc: "Bónus de Dinheiro (+10%)" }
        },

        // Estética
        colorMain: '#00ffff', 
        colorDanger: '#ff003c', 
        colorSuccess: '#00ff66', 
        colorShop: '#f39c12',

        init: function(faseData) {
            this.state = 'BOOT';
            this.score = 0;
            this.itemsRecovered = 0;
            this.moneyEarned = 0;
            this.cargo = null;
            this.scanProgress = 0;
            this.truckMoveEnergy = 0;
            particles = [];
            time = 0;
            
            this.startSensors();
            this.setupInput();
            this.loadAIModel();
        },

        startSensors: function() {
            // Bússola para o GPS
            window.addEventListener('deviceorientation', (event) => {
                this.compassHeading = event.alpha || 0;
            });
            
            // Acelerómetro para detetar o camião a ir para a Frente e para Trás (Confirmação)
            window.addEventListener('devicemotion', (event) => {
                if (this.state === 'CONFIRMING') {
                    let acc = event.acceleration || event.accelerationIncludingGravity;
                    if(acc && acc.y !== null) {
                        // Força de aceleração no eixo Y (comummente a direção de condução no telemóvel deitado)
                        let yForce = Math.abs(acc.y);
                        let zForce = Math.abs(acc.z);
                        let moveForce = Math.max(yForce, zForce); // Usa o maior caso o telemóvel esteja noutra posição
                        
                        // Ignora ruído leve. Se for um esticão forte do camião:
                        if (moveForce > 1.5) {
                            this.truckMoveEnergy += (moveForce * 1.5);
                        }
                    }
                }
            });
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = (e.clientX - r.left);
                const y = (e.clientY - r.top);
                const w = r.width;
                const h = r.height;

                if (this.state === 'CALIBRATE_GPS') {
                    // Ignora, deixa o timer automático fazer o GPS
                } 
                else if (this.state === 'SCANNING') {
                    // Botão da Garagem no canto superior direito
                    if (x > w - 120 && y < 80) {
                        this.state = 'SHOP';
                        if(window.Sfx) window.Sfx.click();
                    }
                }
                else if (this.state === 'SHOP') {
                    const cx = w / 2;
                    const btnW = 300; const btnH = 60;
                    
                    const checkBuy = (upgKey, btnY) => {
                        if (x > cx - btnW/2 && x < cx + btnW/2 && y > btnY && y < btnY + btnH) {
                            let upg = this.upgrades[upgKey];
                            if (upg.level < upg.max && this.moneyEarned >= upg.cost) {
                                this.moneyEarned -= upg.cost;
                                upg.level++;
                                upg.cost = Math.floor(upg.cost * 1.5); // Aumenta o preço
                                if(window.Sfx) window.Sfx.coin();
                                window.System.msg("UPGRADE INSTALADO!");
                            } else {
                                if(window.Sfx) window.Sfx.error();
                            }
                        }
                    };

                    checkBuy('motor', h*0.35);
                    checkBuy('pneus', h*0.50);
                    checkBuy('oleo', h*0.65);

                    // Botão Voltar (Sair da Loja)
                    if (x > cx - 100 && x < cx + 100 && y > h*0.85 && y < h*0.85 + 50) {
                        this.state = 'SCANNING';
                        if(window.Sfx) window.Sfx.click();
                    }
                }
                else if (this.state === 'RETURNING') {
                    // Botão de Emergência para descarregar caso o GPS não funcione indoor
                    if (y > h - 150) {
                        this.finishDelivery();
                    }
                }
            };
        },

        loadAIModel: async function() {
            if (typeof cocoSsd === 'undefined') {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                document.head.appendChild(script);
                
                script.onload = async () => {
                    this.objectModel = await cocoSsd.load();
                    this.state = 'CALIBRATE_GPS';
                    this.returnTimer = 100;
                    if(window.Sfx) window.Sfx.play(800, 'square', 0.5, 0.2);
                };
            } else {
                this.objectModel = await cocoSsd.load();
                this.state = 'CALIBRATE_GPS';
                this.returnTimer = 100;
            }
        },

        setupGPS: function() {
            if ("geolocation" in navigator) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    this.basePos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
                    this.gpsWatcher = navigator.geolocation.watchPosition((newPos) => {
                        this.currentPos = { lat: newPos.coords.latitude, lng: newPos.coords.longitude };
                        this.distanceToBase = this.calculateDistance(this.basePos.lat, this.basePos.lng, this.currentPos.lat, this.currentPos.lng);
                    }, null, { enableHighAccuracy: true });
                }, () => {
                    this.basePos = { lat: 0, lng: 0 }; this.distanceToBase = 0;
                });
            }
        },

        calculateDistance: function(lat1, lon1, lat2, lon2) {
            const R = 6371e3;
            const p1 = lat1 * Math.PI/180; const p2 = lat2 * Math.PI/180;
            const dp = (lat2-lat1) * Math.PI/180; const dl = (lon2-lon1) * Math.PI/180;
            const a = Math.sin(dp/2) * Math.sin(dp/2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl/2) * Math.sin(dl/2);
            return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        },

        update: function(ctx, w, h, pose) {
            time += 0.05;

            // Fundo da Câmara
            if (window.System.video && window.System.video.readyState === 4) {
                const videoRatio = window.System.video.videoWidth / window.System.video.videoHeight;
                const canvasRatio = w / h;
                let drawW = w, drawH = h, drawX = 0, drawY = 0;
                if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
                else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
            } else {
                ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
            }

            ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
            for(let i = 0; i < h; i += 4) { ctx.fillRect(0, i + (time * 10) % 4, w, 1); }

            if (this.state === 'BOOT') {
                this.drawGiantOverlay(ctx, w, h, "SISTEMA USR", "CONECTANDO IA...");
                return this.score;
            }

            if (this.state === 'CALIBRATE_GPS') {
                this.returnTimer--;
                this.drawGiantOverlay(ctx, w, h, "CRIANDO BASE", "ESTACIONE O CAMINHÃO PARA GRAVAR O GPS");
                
                ctx.strokeStyle = this.colorMain; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(w/2, h/2 + 150, 40 + Math.sin(time*5)*20, 0, Math.PI*2); ctx.stroke();

                if (this.returnTimer <= 0) {
                    this.setupGPS();
                    this.state = 'SCANNING';
                    if(window.Sfx) window.Sfx.epic();
                }
                return this.score;
            }

            if (this.state === 'SHOP') {
                this.drawShop(ctx, w, h);
                return this.score;
            }

            this.playMode(ctx, w, h);
            return this.score;
        },

        drawGiantOverlay: function(ctx, w, h, title, sub) {
            ctx.fillStyle = "rgba(0, 10, 20, 0.85)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = this.colorMain; ctx.textAlign = "center";
            ctx.font = "bold clamp(30px, 6vw, 60px) 'Russo One'";
            ctx.fillText(title, w/2, h/2);
            ctx.fillStyle = "#fff"; ctx.font = "bold clamp(16px, 4vw, 30px) 'Chakra Petch'";
            ctx.fillText(sub, w/2, h/2 + 60);
        },

        getAverageColor: function(ctx, x, y, width, height) {
            try {
                const data = ctx.getImageData(x, y, width, height).data;
                let r = 0, g = 0, b = 0;
                for (let i = 0; i < data.length; i += 4) { r += data[i]; g += data[i+1]; b += data[i+2]; }
                const count = data.length / 4;
                return { r: r/count, g: g/count, b: b/count };
            } catch (e) { return { r: 0, g: 0, b: 0 }; }
        },

        playMode: function(ctx, w, h) {
            const cx = w / 2;
            const cy = h / 2;
            let activeTarget = null;

            if (this.cooldown > 0) this.cooldown--;

            // ==========================================
            // DETECÇÃO (HÍBRIDA)
            // ==========================================
            if (this.state === 'SCANNING') {
                // Radar Óptico Visível
                const floorY = h * 0.82;
                this.floorColor = this.getAverageColor(ctx, cx - 50, floorY, 100, 40);
                this.targetColor = this.getAverageColor(ctx, cx - 40, cy - 40, 80, 80);
                
                ctx.strokeStyle = "rgba(0, 255, 100, 0.6)"; ctx.lineWidth = 2; ctx.strokeRect(cx - 50, floorY, 100, 40);
                ctx.fillStyle = "#fff"; ctx.font = "bold 12px monospace"; ctx.textAlign = "center"; ctx.fillText("REF: CHÃO", cx, floorY - 5);
                
                ctx.strokeStyle = "rgba(0, 255, 255, 0.6)"; ctx.lineWidth = 2; ctx.strokeRect(cx - 40, cy - 40, 80, 80);
                ctx.fillText("ALVO", cx, cy - 45);
                
                this.currentDiff = Math.abs(this.floorColor.r - this.targetColor.r) + Math.abs(this.floorColor.g - this.targetColor.g) + Math.abs(this.floorColor.b - this.targetColor.b);

                // Se houver anomalia na cor
                if (this.currentDiff > 55) { 
                    activeTarget = { cx: cx, cy: cy, w: 180, h: 180, label: "ANOMALIA", color: this.colorDanger };
                }

                // IA Neural 
                if (this.objectModel && window.System.video && window.System.video.readyState === 4) {
                    if (Date.now() - this.lastDetectTime > 200) {
                        this.objectModel.detect(window.System.video).then(predictions => { this.detectedItems = predictions; });
                        this.lastDetectTime = Date.now();
                    }
                    const scaleX = w / window.System.video.videoWidth;
                    const scaleY = h / window.System.video.videoHeight;

                    this.detectedItems.forEach(item => {
                        const ignoredClasses = ['person', 'bed', 'sofa', 'tv', 'refrigerator', 'door', 'dining table'];
                        if (ignoredClasses.includes(item.class) || item.score < 0.15) return;
                        const boxW = item.bbox[2] * scaleX; const boxH = item.bbox[3] * scaleY;
                        if (boxW > w * 0.8 || boxH > h * 0.8) return;

                        const boxX = item.bbox[0] * scaleX; const boxY = item.bbox[1] * scaleY;
                        const itemCx = boxX + (boxW/2); const itemCy = boxY + (boxH/2);

                        this.drawHologramBox(ctx, boxX, boxY, boxW, boxH, "ALVO IDENTIFICADO", "rgba(0,255,255,0.4)");
                        if (Math.hypot(itemCx - cx, itemCy - cy) < 250) {
                            activeTarget = { cx: itemCx, cy: cy, w: boxW, h: boxH, label: "SUCATA", color: this.colorMain };
                        }
                    });
                }

                if (activeTarget && this.cooldown <= 0) {
                    this.targetItem = activeTarget;
                    this.state = 'CONFIRMING';
                    this.truckMoveEnergy = 0; // Inicia a barra de confirmação física vazia
                    this.graceTimer = 60 + (this.upgrades.pneus.level * 10); // UPGRADE: Mais tempo para não perder o alvo
                    if(window.Sfx) window.Sfx.play(1000, 'sawtooth', 0.1, 0.1);
                }
            }

            // ==========================================
            // CONFIRMAÇÃO FÍSICA (MEXER PARA A FRENTE E TRÁS)
            // ==========================================
            if (this.state === 'CONFIRMING') {
                this.graceTimer--;
                if (this.graceTimer <= 0) {
                    this.state = 'SCANNING';
                    this.targetItem = null;
                    if(window.Sfx) window.Sfx.error();
                }

                if (this.targetItem) {
                    const tX = this.targetItem.cx; const tY = this.targetItem.cy;
                    
                    // Desenha o alvo amarelo (Esperando autorização)
                    ctx.save(); ctx.translate(tX, tY);
                    ctx.rotate(time); ctx.strokeStyle = "#f1c40f"; ctx.lineWidth = 6; ctx.setLineDash([15, 10]); 
                    ctx.beginPath(); ctx.arc(0, 0, 150, 0, Math.PI*2); ctx.stroke(); ctx.restore();

                    // MENSAGEM GIGANTE DE CONFIRMAÇÃO
                    ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(0, cy - 80, w, 160);
                    ctx.fillStyle = "#f1c40f"; ctx.font = "bold clamp(25px, 6vw, 45px) 'Russo One'"; ctx.textAlign = "center";
                    ctx.fillText("AUTORIZAÇÃO NECESSÁRIA!", w/2, cy - 20);
                    ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial";
                    ctx.fillText("MOVA O CAMINHÃO PARA FRENTE E TRÁS", w/2, cy + 10);

                    // BARRA DE ENERGIA DE MOVIMENTO
                    const energyPct = Math.min(100, this.truckMoveEnergy);
                    ctx.fillStyle = "#333"; ctx.fillRect(w/2 - 150, cy + 30, 300, 20);
                    ctx.fillStyle = "#2ecc71"; ctx.fillRect(w/2 - 150, cy + 30, energyPct * 3, 20);
                    ctx.strokeStyle = "#fff"; ctx.strokeRect(w/2 - 150, cy + 30, 300, 20);

                    // Se balançou o camião o suficiente
                    if (this.truckMoveEnergy >= 100) {
                        this.state = 'ANALYZING'; // Vai para a Extração
                        this.scanProgress = 0;
                        
                        // Calcula Recompensa Total Base
                        let baseVal = Math.floor(Math.random() * 800) + 400;
                        // Aplica Bónus do Óleo Premium!
                        let bonus = 1 + (this.upgrades.oleo.level * 0.10); 
                        this.currentReward = Math.floor(baseVal * bonus);

                        if(window.Sfx) window.Sfx.play(1200, 'square', 0.2, 0.2);
                    }
                }
            }

            // ==========================================
            // EXTRAÇÃO E ADIANTAMENTO
            // ==========================================
            if (this.state === 'ANALYZING') {
                if (this.targetItem) {
                    // UPGRADE: Motor Trator enche a barra mais rápido
                    let speedBoost = 1 + (this.upgrades.motor.level * 0.2);
                    this.scanProgress += (2.5 * speedBoost);
                    
                    if (this.scanProgress % 8 === 0 && window.Sfx) window.Sfx.hover();
                    if(window.Gfx) window.Gfx.addShake(2); // Camião a fazer força

                    const tX = this.targetItem.cx; const tY = this.targetItem.cy;
                    const ringSize = Math.max(80, 250 - (this.scanProgress * 1.7));
                    
                    ctx.save(); ctx.translate(tX, tY);
                    ctx.rotate(time * 3); ctx.strokeStyle = this.colorDanger; ctx.lineWidth = 10; ctx.setLineDash([20, 15]); ctx.beginPath(); ctx.arc(0, 0, ringSize, 0, Math.PI*2); ctx.stroke();
                    ctx.rotate(-time * 5); ctx.strokeStyle = this.colorMain; ctx.setLineDash([40, 10]); ctx.beginPath(); ctx.arc(0, 0, ringSize + 20, 0, Math.PI*2); ctx.stroke(); ctx.restore();

                    ctx.fillStyle = this.colorDanger; ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
                    ctx.fillText(`CARRREGANDO CAÇAMBA...`, tX, tY - ringSize - 20);
                    
                    ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(time*15)*0.5})`; ctx.lineWidth = 20; // Laser Azul Grosso
                    ctx.beginPath(); ctx.moveTo(cx, h); ctx.lineTo(tX, tY); ctx.stroke();

                    // CARREGAMENTO CONCLUÍDO! (ADIANTAMENTO)
                    if (this.scanProgress >= 100) {
                        this.cargo = "SUCATA PROCESSADA";
                        this.state = 'RETURNING';
                        this.scanProgress = 0;
                        this.returnTimer = 500; 
                        
                        // PAGA 30% DE ADIANTAMENTO
                        let advancePayment = Math.floor(this.currentReward * 0.3);
                        this.moneyEarned += advancePayment;
                        this.score += advancePayment / 10;
                        
                        if(window.Gfx) window.Gfx.shakeScreen(35);
                        if(window.Sfx) window.Sfx.epic();
                        this.spawnCaptureEffect(tX, tY, this.colorMain);
                        this.targetItem = null;
                        window.System.msg(`ADIANTAMENTO: R$ ${advancePayment}`);
                    }
                }
            }

            // ==========================================
            // RETORNO À BASE E ENTREGA FINAL
            // ==========================================
            if (this.state === 'RETURNING') {
                this.returnTimer--;
                
                // Se chegou na base (Distância < 3.5m)
                if (this.distanceToBase > 0 && this.distanceToBase < 3.5) {
                    this.finishDelivery();
                }
            }

            if(this.state !== 'CONFIRMING') {
                this.drawMachineHUD(ctx, w, h, cx, cy);
            }
            this.updateParticles(ctx, w, h);
        },

        finishDelivery: function() {
            if (this.state !== 'RETURNING') return;
            this.itemsRecovered++;
            
            // PAGA OS 70% RESTANTES
            let finalPayment = Math.floor(this.currentReward * 0.7);
            this.moneyEarned += finalPayment;
            this.score += finalPayment / 10;
            
            this.cargo = null;
            this.state = 'SCANNING';
            this.cooldown = 100;
            
            if(window.Gfx) window.Gfx.shakeScreen(30);
            if(window.Sfx) window.Sfx.epic();
            this.spawnCaptureEffect(window.innerWidth/2, window.innerHeight, this.colorSuccess);
            window.System.msg(`PAGAMENTO FINAL: R$ ${finalPayment}`);
        },

        drawHologramBox: function(ctx, x, y, bw, bh, label, color) {
            ctx.strokeStyle = color; ctx.lineWidth = 4; const l = 20; 
            ctx.beginPath(); ctx.moveTo(x, y+l); ctx.lineTo(x, y); ctx.lineTo(x+l, y); ctx.moveTo(x+bw-l, y); ctx.lineTo(x+bw, y); ctx.lineTo(x+bw, y+l); ctx.moveTo(x+bw, y+bh-l); ctx.lineTo(x+bw, y+bh); ctx.lineTo(x+bw-l, y+bh); ctx.moveTo(x+l, y+bh); ctx.lineTo(x, y+bh); ctx.lineTo(x, y+bh-l); ctx.stroke();
            ctx.fillStyle = color; ctx.font = "bold clamp(10px, 2vw, 16px) 'Chakra Petch'"; ctx.fillRect(x, y - 25, ctx.measureText(label).width + 10, 25); ctx.fillStyle = "#000"; ctx.textAlign = "left"; ctx.fillText(label, x + 5, y - 7);
        },

        drawMachineHUD: function(ctx, w, h, cx, cy) {
            const grad = ctx.createRadialGradient(cx, cy, h*0.35, cx, cy, h);
            grad.addColorStop(0, "rgba(0,0,0,0)"); grad.addColorStop(1, "rgba(0,10,20,0.85)");
            ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);

            // BOTÃO DE GARAGEM NO TOPO
            if (this.state === 'SCANNING') {
                ctx.fillStyle = "rgba(0,0,0,0.7)"; ctx.fillRect(w - 120, 20, 100, 50);
                ctx.strokeStyle = this.colorShop; ctx.lineWidth = 2; ctx.strokeRect(w - 120, 20, 100, 50);
                ctx.fillStyle = this.colorShop; ctx.textAlign = "center"; ctx.font = "bold 16px 'Russo One'";
                ctx.fillText("GARAGEM 🔧", w - 70, 50);
            }

            if (this.state === 'ANALYZING') {
                ctx.fillStyle = `rgba(0, 255, 255, ${Math.abs(Math.sin(time*10))*0.2})`; ctx.fillRect(0, 0, w, h); 
                ctx.fillStyle = this.colorMain; ctx.textAlign = "center"; ctx.font = "bold clamp(35px, 8vw, 70px) 'Russo One'"; ctx.fillText("CARREGANDO...", w/2, 80);
                
                ctx.fillStyle = "rgba(0, 0, 0, 0.8)"; ctx.fillRect(w*0.1, h*0.75, w*0.8, 40);
                ctx.fillStyle = this.colorMain; ctx.fillRect(w*0.1, h*0.75, (this.scanProgress/100) * (w*0.8), 40);
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.strokeRect(w*0.1, h*0.75, w*0.8, 40);
            } 
            else if (this.state === 'SCANNING') {
                const radarY = cy + Math.sin(time * 2) * (h * 0.3);
                ctx.fillStyle = "rgba(0, 255, 255, 0.4)"; ctx.fillRect(0, radarY, w, 4);
                
                ctx.strokeStyle = "rgba(0, 255, 255, 0.3)"; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(cx, cy, 180, 0, Math.PI*2); ctx.stroke();
                
                ctx.fillStyle = this.colorMain; ctx.textAlign = "center"; ctx.font = "bold clamp(30px, 6vw, 60px) 'Russo One'"; ctx.fillText("PROCURANDO SUCATA", w/2, 60);
                ctx.font = "14px monospace"; ctx.fillStyle = this.currentDiff > 55 ? "#ff003c" : "#00ffff"; ctx.fillText(`CONTRASTE ÓPTICO: ${Math.floor(this.currentDiff)} / 55`, w/2, 85);
            }
            else if (this.state === 'RETURNING') {
                ctx.fillStyle = `rgba(0, 255, 100, ${Math.abs(Math.sin(time*5))*0.1})`; ctx.fillRect(0, 0, w, h); 
                ctx.fillStyle = this.colorSuccess; ctx.textAlign = "center"; ctx.font = "bold clamp(35px, 8vw, 70px) 'Russo One'"; ctx.fillText("VOLTE PARA A BASE", w/2, 80);
                
                ctx.save(); ctx.translate(w/2, h/2 - 50);
                ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.strokeStyle = this.colorSuccess; ctx.lineWidth = 4;
                ctx.beginPath(); ctx.arc(0, 0, 80, 0, Math.PI*2); ctx.fill(); ctx.stroke();
                
                ctx.rotate(this.compassHeading * (Math.PI / 180));
                ctx.fillStyle = this.colorSuccess;
                ctx.beginPath(); ctx.moveTo(0, -60); ctx.lineTo(30, 20); ctx.lineTo(-30, 20); ctx.fill();
                ctx.restore();

                let distText = this.distanceToBase > 0 ? `${this.distanceToBase.toFixed(1)}m` : "CALCULANDO...";
                ctx.fillStyle = "#fff"; ctx.font = "bold 24px 'Chakra Petch'"; ctx.fillText(`DISTÂNCIA: ${distText}`, w/2, h/2 + 60);
                
                // Botão de Emergência
                ctx.fillStyle = "rgba(46, 204, 113, 0.4)"; ctx.fillRect(w/2 - 150, h - 170, 300, 50);
                ctx.strokeStyle = this.colorSuccess; ctx.strokeRect(w/2 - 150, h - 170, 300, 50);
                ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.fillText("CLIQUE AQUI PARA FORÇAR ENTREGA", w/2, h - 140);
            }

            // RODAPÉ GERAL
            ctx.fillStyle = "rgba(0, 15, 20, 0.95)"; ctx.fillRect(0, h - 110, w, 110);
            ctx.strokeStyle = this.state === 'RETURNING' ? this.colorSuccess : this.colorMain; ctx.lineWidth = 5; 
            ctx.beginPath(); ctx.moveTo(0, h - 110); ctx.lineTo(w, h - 110); ctx.stroke();

            ctx.textAlign = "left";
            ctx.fillStyle = "#fff"; ctx.font = "bold clamp(18px, 4vw, 24px) 'Chakra Petch'";
            ctx.fillText(`CAÇAMBA: ${this.cargo ? 'CHEIA' : 'VAZIA'}`, 20, h - 65);
            
            ctx.fillStyle = this.colorSuccess; ctx.font = "bold clamp(30px, 6vw, 50px) 'Russo One'";
            ctx.fillText(`R$ ${this.moneyEarned.toLocaleString('pt-BR')}`, 20, h - 20);
        },

        // --- SISTEMA DA GARAGEM / LOJA ---
        drawShop: function(ctx, w, h) {
            const cx = w / 2;
            ctx.fillStyle = "rgba(10, 10, 10, 0.95)"; ctx.fillRect(0, 0, w, h);
            
            ctx.fillStyle = this.colorShop; ctx.textAlign = "center";
            ctx.font = "bold clamp(35px, 8vw, 60px) 'Russo One'";
            ctx.fillText("GARAGEM USR", cx, 80);
            
            ctx.fillStyle = this.colorSuccess; ctx.font = "bold 26px Arial";
            ctx.fillText(`SALDO: R$ ${this.moneyEarned.toLocaleString('pt-BR')}`, cx, 120);

            const drawUpgradeBtn = (y, key) => {
                let upg = this.upgrades[key];
                let isMax = upg.level >= upg.max;
                let canAfford = this.moneyEarned >= upg.cost;
                
                ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
                ctx.fillRect(cx - 150, y, 300, 60);
                
                // Borda de acordo com disponibilidade
                ctx.strokeStyle = isMax ? "#aaa" : (canAfford ? this.colorSuccess : this.colorDanger);
                ctx.lineWidth = 3; ctx.strokeRect(cx - 150, y, 300, 60);

                ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 16px 'Chakra Petch'";
                ctx.fillText(`LVL ${upg.level}: ${upg.name}`, cx - 130, y + 25);
                ctx.fillStyle = "#aaa"; ctx.font = "12px Arial";
                ctx.fillText(upg.desc, cx - 130, y + 45);

                ctx.textAlign = "right"; ctx.font = "bold 18px 'Russo One'";
                ctx.fillStyle = isMax ? "#aaa" : (canAfford ? this.colorSuccess : this.colorDanger);
                ctx.fillText(isMax ? "MÁXIMO" : `R$ ${upg.cost}`, cx + 130, y + 35);
            };

            drawUpgradeBtn(h * 0.35, 'motor');
            drawUpgradeBtn(h * 0.50, 'pneus');
            drawUpgradeBtn(h * 0.65, 'oleo');

            // Botão Sair
            ctx.fillStyle = "#555"; ctx.fillRect(cx - 100, h * 0.85, 200, 50);
            ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.font = "bold 20px Arial";
            ctx.fillText("VOLTAR AO TRABALHO", cx, h * 0.85 + 32);
        },

        spawnCaptureEffect: function(x, y, color) {
            for(let i=0; i<50; i++) {
                const angle = Math.random() * Math.PI * 2; const speed = Math.random() * 30 + 10;
                particles.push({ type: 'binary', x: x, y: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.0, val: Math.random() > 0.5 ? '1' : '0', color: color });
            }
            particles.push({ type: 'flash', life: 1.0, color: color });
        },

        updateParticles: function(ctx) {
            ctx.globalCompositeOperation = 'screen';
            particles.forEach(p => {
                if (p.type === 'binary') {
                    p.x += p.vx; p.y += p.vy; p.life -= 0.04; 
                    ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life); ctx.font = "bold 20px monospace"; ctx.fillText(p.val, p.x, p.y);
                } 
                else if (p.type === 'flash') {
                    ctx.globalAlpha = Math.max(0, p.life * 0.7); ctx.fillStyle = p.color; ctx.fillRect(0, 0, window.innerWidth, window.innerHeight); p.life -= 0.1; 
                }
            });
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
            particles = particles.filter(p => p.life > 0);
        },

        cleanup: function() {
            if (this.gpsWatcher !== null) navigator.geolocation.clearWatch(this.gpsWatcher);
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_collector', 'AR Empresa USR', '🏢', Game, {
                camera: 'environment',
                phases: [
                    { id: 'f1', name: 'CONTRATO DE SUCATA', desc: 'Identifique, aprove e descarregue carrinhos com o GPS para lucrar.', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
