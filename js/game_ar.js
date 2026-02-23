// =============================================================================
// AR TOY TRUCK SIMULATOR: MASTER ARCHITECT EDITION (V10)
// JOGO COMPLETO: GPS VIRTUAL, ECONOMIA, EVENTOS DINÂMICOS, IA SEGURA
// =============================================================================

(function() {
    "use strict";

    let particles = [];
    
    const Game = {
        state: 'BOOT', // BOOT, CALIBRATE, PLAY, EXTRACTING, BASE, TOWING
        
        // Sistema de Tempo Real e Segurança
        lastTime: 0,
        timeTotal: 0,
        score: 0,
        
        // IA Visual e Sensores
        objectModel: null,
        detectedItems: [],
        lastDetectTime: 0,
        floorColor: { r: 0, g: 0, b: 0 },
        targetColor: { r: 0, g: 0, b: 0 },
        
        // GPS Virtual (Odometria Relativa Imune a Falhas de Sinal)
        vPos: { x: 0, y: 0 },
        baseHeading: 0,
        currentHeading: 0,
        virtualSpeed: 0,
        
        // Elementos Dinâmicos do Mundo
        anomalies: [], 
        activeAnomaly: null,
        spawnTimer: 0,
        
        // Sistema de Eventos Aleatórios
        currentEvent: null,
        eventTimer: 0,
        
        // Extração Física
        extractProgress: 0,
        cooldown: 0,
        
        // Economia, Inventário e Progressão
        money: 0,
        cargo: [],
        level: 1,
        xp: 0,
        
        // Status do Caminhão
        fuel: 100,
        wear: { motor: 0, wheels: 0 }, 
        
        // Atributos baseados em Upgrades
        stats: {
            maxFuel: 100,
            maxCargo: 3,
            baseSpeed: 20,     
            fuelRate: 1.5,     
            wearRate: 0.3,     
            scanPower: 1.0,    
            radarRange: 150    
        },

        // Loja de Upgrades
        upgrades: {
            tank:    { lvl: 1, max: 5, baseCost: 1000, name: "TANQUE EXPANDIDO" },
            motor:   { lvl: 1, max: 5, baseCost: 1500, name: "MOTOR DE TITÂNIO" },
            chassis: { lvl: 1, max: 5, baseCost: 1200, name: "CHASSI REFORÇADO" },
            scanner: { lvl: 1, max: 5, baseCost: 2000, name: "RADAR QUÂNTICO" },
            cargo:   { lvl: 1, max: 3, baseCost: 2500, name: "CAÇAMBA EXTRA" }
        },

        colors: {
            main: '#00ffff', danger: '#ff003c', success: '#00ff66',
            warn: '#f1c40f', panel: 'rgba(5, 10, 20, 0.85)', rare: '#9b59b6'
        },

        init: function() {
            this.state = 'BOOT';
            this.lastTime = performance.now();
            this.timeTotal = 0;
            this.score = 0;
            
            this.vPos = { x: 0, y: 0 };
            this.fuel = this.stats.maxFuel;
            this.wear = { motor: 0, wheels: 0 };
            this.money = 0;
            this.xp = 0;
            this.level = 1;
            this.cargo = [];
            this.anomalies = [];
            this.currentEvent = null;
            particles = [];
            
            this.setupSensors();
            this.setupInput();
            this.loadAIModel();
        },

        setupSensors: function() {
            window.addEventListener('deviceorientation', (e) => {
                this.currentHeading = e.alpha || 0;
            });
            
            window.addEventListener('devicemotion', (e) => {
                let acc = e.acceleration || e.accelerationIncludingGravity;
                if (!acc) return;
                
                let mag = Math.sqrt((acc.x||0)*(acc.x||0) + (acc.y||0)*(acc.y||0) + (acc.z||0)*(acc.z||0));
                let g = e.acceleration ? 0 : 9.81;
                let force = Math.abs(mag - g);
                
                // O próprio ruído/vibração do motorzinho do caminhão gera uma pequena força contínua
                if (force > 0.3) {
                    this.virtualSpeed = Math.min(this.virtualSpeed + (force * 3), this.stats.baseSpeed);
                } else {
                    this.virtualSpeed = Math.max(this.virtualSpeed - 0.5, 0);
                }
            });
        },

        setupInput: function() {
            window.System.canvas.onclick = (e) => {
                const r = window.System.canvas.getBoundingClientRect();
                const x = e.clientX - r.left; const y = e.clientY - r.top;
                const w = r.width; const h = r.height;

                if (this.state === 'CALIBRATE') {
                    this.baseHeading = this.currentHeading;
                    this.setupGPS(); // Inicia o GPS Virtual
                    this.state = 'PLAY';
                    if(window.Sfx) window.Sfx.epic();
                    window.System.msg("SISTEMAS ONLINE. BOA CAÇADA!");
                }
                else if (this.state === 'PLAY') {
                    // Impulso manual caso o devicemotion falhe no dispositivo
                    this.virtualSpeed = Math.min(this.virtualSpeed + 5, this.stats.baseSpeed);

                    // Botão da Base
                    let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                    if (distToBase < 25 && y > h - 100 && x > w/2 - 100 && x < w/2 + 100) {
                        this.state = 'BASE';
                        this.virtualSpeed = 0;
                        if(window.Sfx) window.Sfx.play(400, 'square', 0.5, 0.2);
                        this.deliverCargo();
                    }
                }
                else if (this.state === 'BASE') {
                    this.handleBaseClicks(x, y, w, h);
                }
                else if (this.state === 'TOWING') {
                    if (y > h/2) {
                        this.state = 'BASE';
                        this.fuel = this.stats.maxFuel;
                        this.cargo = []; 
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
                    this.objectModel = await cocoSsd.load().catch(()=>null);
                    this.state = 'CALIBRATE';
                };
            } else {
                this.objectModel = await cocoSsd.load().catch(()=>null);
                this.state = 'CALIBRATE';
            }
        },

        // Agora não usa GPS real. Cria um marco zero virtual local.
        setupGPS: function() {
            this.vPos = { x: 0, y: 0 };
            this.spawnAnomalies(5); 
        },

        // ==========================================
        // MAIN LOOP (SEGURO E ESCALÁVEL)
        // ==========================================
        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; 
            this.lastTime = now;
            this.timeTotal += dt;

            if (this.state !== 'BASE' && this.state !== 'TOWING') {
                if (window.System.video && window.System.video.readyState === 4) {
                    const videoRatio = window.System.video.videoWidth / window.System.video.videoHeight;
                    const canvasRatio = w / h;
                    let drawW = w, drawH = h, drawX = 0, drawY = 0;
                    if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
                    else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                    
                    // Se houver evento de Glitch, distorce a câmera
                    if (this.currentEvent === 'GLITCH') {
                        drawX += (Math.random() - 0.5) * 20;
                        drawY += (Math.random() - 0.5) * 20;
                        ctx.filter = `hue-rotate(${Math.random()*360}deg)`;
                    }
                    
                    ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
                    ctx.filter = 'none';
                } else {
                    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
                }
                
                // Evento Tempestade
                if (this.currentEvent === 'STORM') {
                    ctx.fillStyle = `rgba(0, 0, 0, ${0.4 + Math.random()*0.2})`;
                    ctx.fillRect(0, 0, w, h);
                    if (Math.random() > 0.95) {
                        ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.fillRect(0,0,w,h);
                        if(window.Sfx) window.Sfx.error();
                    }
                } else {
                    ctx.fillStyle = `rgba(0, 50, 60, ${0.1 + Math.sin(this.timeTotal*2)*0.05})`;
                    ctx.fillRect(0, 0, w, h);
                }
            }

            switch (this.state) {
                case 'BOOT':
                    this.drawOverlay(ctx, w, h, "INICIALIZANDO SISTEMAS", "Carregando Módulos de Visão e Economia...");
                    break;
                case 'CALIBRATE':
                    this.drawOverlay(ctx, w, h, "CALIBRAR PONTO ZERO", "Aponte o caminhão para frente e TOQUE NA TELA");
                    break;
                case 'PLAY':
                case 'EXTRACTING':
                    this.updatePhysics(dt);
                    this.updateEvents(dt);
                    this.spawnAnomalies(dt);
                    this.processAR(ctx, w, h, dt);
                    this.drawHUD(ctx, w, h);
                    break;
                case 'BASE':
                    this.drawBaseMenu(ctx, w, h);
                    break;
                case 'TOWING':
                    this.drawOverlay(ctx, w, h, "PANE SECA!", "Combustível esgotado. Resgate acionado (-R$500). Toque para confirmar.");
                    break;
            }

            this.updateParticles(ctx, dt, w, h);
            return this.score || 0; // Garantir retorno numérico válido
        },

        updatePhysics: function(dt) {
            if (this.cooldown > 0) this.cooldown -= dt;

            if (this.virtualSpeed > 0.1 && this.state === 'PLAY') {
                let speedMod = 1.0 - (this.wear.motor / 200); 
                if (this.currentEvent === 'STORM') speedMod *= 0.5; // Tempestade deixa lento
                
                let currentSpeed = this.virtualSpeed * speedMod;
                let rad = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
                
                let jitter = (Math.random() - 0.5) * (this.wear.wheels / 100) * 0.5;
                rad += jitter;

                this.vPos.x += Math.sin(rad) * currentSpeed * dt;
                this.vPos.y -= Math.cos(rad) * currentSpeed * dt; 

                // Consumo (Eventos podem aumentar o consumo)
                let fuelMult = this.currentEvent === 'GLITCH' ? 3.0 : 1.0;
                let fuelCost = this.stats.fuelRate * (1 + (this.wear.motor / 100)) * fuelMult * dt;
                this.fuel = Math.max(0, this.fuel - fuelCost);

                let wearMod = 1.0 - (this.upgrades.chassis.lvl * 0.15); 
                this.wear.motor = Math.min(100, this.wear.motor + (this.stats.wearRate * wearMod * dt));
                this.wear.wheels = Math.min(100, this.wear.wheels + (this.stats.wearRate * wearMod * 1.5 * dt));

                if (this.fuel <= 0) {
                    this.state = 'TOWING';
                    this.money = Math.max(0, this.money - 500);
                    this.vPos = { x: 0, y: 0 }; 
                    if(window.Sfx) window.Sfx.error();
                }
            }
        },

        updateEvents: function(dt) {
            if (this.currentEvent) {
                this.eventTimer -= dt;
                if (this.eventTimer <= 0) this.currentEvent = null;
            } else if (Math.random() < (0.05 * dt)) { // Probabilidade dinâmica baseada no tempo
                this.currentEvent = Math.random() > 0.5 ? 'STORM' : 'GLITCH';
                this.eventTimer = 10 + Math.random() * 10;
                window.System.msg("ALERTA AMBIENTAL: " + this.currentEvent);
                if(window.Sfx) window.Sfx.error();
            }
        },

        spawnAnomalies: function(dt) {
            this.spawnTimer += dt;
            if (this.anomalies.length < 5 && this.spawnTimer > 2.0) {
                this.spawnTimer = 0;
                let isRare = Math.random() < 0.15;
                let isTrap = Math.random() < 0.10;
                let dist = 30 + Math.random() * 120;
                let ang = Math.random() * Math.PI * 2;
                
                this.anomalies.push({
                    id: Math.random().toString(36),
                    x: this.vPos.x + Math.cos(ang) * dist,
                    y: this.vPos.y + Math.sin(ang) * dist,
                    type: isRare ? 'RARE' : (isTrap ? 'TRAP' : 'NORMAL'),
                    val: isRare ? 5000 : (isTrap ? -500 : 1000 + Math.floor(Math.random()*1000)),
                    life: isRare ? 45 : 999 // Missão Dinâmica: Raros somem rápido
                });
            }
            
            // Decaimento de tempo limite das missões dinâmicas
            this.anomalies.forEach(a => { if (a.life < 999) a.life -= dt; });
            this.anomalies = this.anomalies.filter(a => a.life > 0);
        },

        getAverageColor: function(ctx, x, y, width, height) {
            try {
                const data = ctx.getImageData(x, y, width, height).data;
                let r = 0, g = 0, b = 0;
                for (let i = 0; i < data.length; i += 4) { r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
                const count = data.length / 4;
                return { r: r/count, g: g/count, b: b/count };
            } catch (e) { return { r: 0, g: 0, b: 0 }; }
        },

        processAR: function(ctx, w, h, dt) {
            const cx = w / 2; const cy = h / 2;
            let nearestDist = 9999;
            this.activeAnomaly = null;
            
            this.anomalies.forEach(ano => {
                let d = Math.hypot(ano.x - this.vPos.x, ano.y - this.vPos.y);
                if (d < nearestDist) { nearestDist = d; this.activeAnomaly = ano; }
            });

            if (nearestDist < 15 && this.state === 'PLAY' && this.cargo.length < this.stats.maxCargo && this.cooldown <= 0) {
                
                this.floorColor = this.getAverageColor(ctx, cx - 50, h * 0.85, 100, 40);
                this.targetColor = this.getAverageColor(ctx, cx - 40, cy - 40, 80, 80);
                
                let colorDiff = Math.abs(this.floorColor.r - this.targetColor.r) + 
                                Math.abs(this.floorColor.g - this.targetColor.g) + 
                                Math.abs(this.floorColor.b - this.targetColor.b);

                let visualFound = (colorDiff > 60);

                // IA Seguro contra gargalos
                if (this.objectModel && window.System.video && (this.timeTotal - this.lastDetectTime > 0.3)) {
                    this.objectModel.detect(window.System.video)
                        .then(preds => { this.detectedItems = preds || []; })
                        .catch(() => { this.detectedItems = []; });
                    this.lastDetectTime = this.timeTotal;
                }

                const scaleX = w / (window.System.video.videoWidth || w);
                const scaleY = h / (window.System.video.videoHeight || h);
                
                this.detectedItems.forEach(item => {
                    if (['person', 'bed', 'sofa', 'tv', 'door'].includes(item.class) || item.score < 0.15) return;
                    const boxW = item.bbox[2] * scaleX; const boxH = item.bbox[3] * scaleY;
                    if (boxW > w * 0.8) return;
                    
                    const itemCx = (item.bbox[0] * scaleX) + boxW/2;
                    const itemCy = (item.bbox[1] * scaleY) + boxH/2;
                    
                    if (Math.hypot(itemCx - cx, itemCy - cy) < 200) visualFound = true;
                });

                // UI de Busca Ativa
                let isRare = this.activeAnomaly.type === 'RARE';
                ctx.strokeStyle = isRare ? this.colors.rare : this.colors.main; 
                ctx.lineWidth = 4 + Math.sin(this.timeTotal*10)*2;
                ctx.strokeRect(cx - 150, cy - 150, 300, 300);
                
                ctx.fillStyle = isRare ? this.colors.rare : this.colors.main; 
                ctx.font = "bold 20px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.fillText(`ANOMALIA A ${Math.floor(nearestDist)}m. CONFIRME COM A CÂMERA...`, cx, cy - 160);

                if (visualFound) {
                    this.state = 'EXTRACTING';
                    this.extractProgress = 0;
                    if(window.Sfx) window.Sfx.play(1200, 'sawtooth', 0.1, 0.1);
                }
            }

            if (this.state === 'EXTRACTING') {
                let extractSpeed = this.stats.scanPower * (1.0 + (this.upgrades.scanner.lvl * 0.2));
                
                // Progresso misto: tempo natural + força física
                this.extractProgress += (15 * extractSpeed * dt);
                if (this.virtualSpeed > 1.0) {
                    this.extractProgress += (this.virtualSpeed * extractSpeed * dt * 5);
                    if(window.Gfx) window.Gfx.addShake(1);
                }

                ctx.fillStyle = `rgba(255, 0, 60, ${Math.abs(Math.sin(this.timeTotal*10))*0.3})`;
                ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center";
                ctx.font = "bold clamp(30px, 6vw, 60px) 'Russo One'";
                ctx.fillText("TRAVADO! ACELERE PARA EXTRAIR!", cx, cy - 100);

                ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(this.timeTotal*20)*0.5})`; ctx.lineWidth = 20;
                ctx.beginPath(); ctx.moveTo(cx, h); ctx.lineTo(cx, cy); ctx.stroke();

                const ringSize = Math.max(50, 250 - this.extractProgress);
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.timeTotal * 5);
                ctx.strokeStyle = this.colors.danger; ctx.lineWidth = 8; ctx.setLineDash([20, 15]);
                ctx.beginPath(); ctx.arc(0, 0, ringSize, 0, Math.PI*2); ctx.stroke(); ctx.restore();

                if (this.extractProgress >= 100) {
                    if (this.activeAnomaly.type === 'TRAP') {
                        this.fuel = Math.max(0, this.fuel - 20);
                        this.wear.motor = Math.min(100, this.wear.motor + 10);
                        window.System.msg("ARMADILHA! DANOS CRÍTICOS!");
                        if(window.Sfx) window.Sfx.error();
                    } else {
                        this.cargo.push(this.activeAnomaly.val);
                        this.score += this.activeAnomaly.val / 10;
                        window.System.msg(this.activeAnomaly.type === 'RARE' ? "CARGA RARA OBTIDA!" : "CARGA ADQUIRIDA!");
                        if(window.Sfx) window.Sfx.epic();
                    }
                    
                    this.anomalies = this.anomalies.filter(a => a.id !== this.activeAnomaly.id);
                    this.state = 'PLAY';
                    this.cooldown = 2.0; 
                    if(window.Gfx) window.Gfx.shakeScreen(30);
                    this.spawnParticles(cx, cy, 50, this.colors.main);
                }

                if (nearestDist > 25) {
                    this.state = 'PLAY';
                    if(window.Sfx) window.Sfx.error();
                    window.System.msg("ALVO ESCAPOU!");
                }
            }
        },

        drawHUD: function(ctx, w, h) {
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, 0, w, 60);
            ctx.strokeStyle = this.colors.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(w, 60); ctx.stroke();

            ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Chakra Petch'"; ctx.textAlign = "left";
            ctx.fillText(`NÍVEL: ${this.level} (XP: ${Math.floor(this.xp)})`, 20, 25);
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(20, 35, 200, 15);
            let fuelPct = this.fuel / this.stats.maxFuel;
            ctx.fillStyle = fuelPct > 0.3 ? this.colors.success : this.colors.danger;
            ctx.fillRect(20, 35, fuelPct * 200, 15);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(20, 35, 200, 15);
            ctx.fillStyle = "#fff"; ctx.fillText("COMBUSTÍVEL", 25, 47);

            ctx.textAlign = "right";
            ctx.fillStyle = this.wear.motor > 80 ? this.colors.danger : this.colors.main;
            ctx.fillText(`MOTOR: ${Math.floor(this.wear.motor)}%`, w - 20, 25);
            ctx.fillStyle = this.wear.wheels > 80 ? this.colors.danger : this.colors.main;
            ctx.fillText(`PNEUS: ${Math.floor(this.wear.wheels)}%`, w - 20, 45);

            // Radar Circular HUD
            const rCx = w - 80; const rCy = 160; const rR = 60;
            ctx.fillStyle = "rgba(0, 20, 40, 0.8)"; ctx.beginPath(); ctx.arc(rCx, rCy, rR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = this.currentEvent ? this.colors.danger : this.colors.main; 
            ctx.lineWidth = 2; ctx.stroke();

            let radHead = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
            
            const drawBlip = (worldX, worldY, color, size, isBlinking) => {
                let dx = worldX - this.vPos.x;
                let dy = worldY - this.vPos.y;
                let dist = Math.hypot(dx, dy);
                if (dist < this.stats.radarRange) {
                    if (isBlinking && Math.sin(this.timeTotal * 15) > 0) return;
                    let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2); 
                    let screenDist = (dist / this.stats.radarRange) * rR;
                    let mapX = rCx + Math.cos(angle) * screenDist;
                    let mapY = rCy + Math.sin(angle) * screenDist;
                    ctx.fillStyle = color; ctx.beginPath(); ctx.arc(mapX, mapY, size, 0, Math.PI*2); ctx.fill();
                }
            };

            drawBlip(0, 0, this.colors.success, 6, false);
            
            this.anomalies.forEach(ano => {
                let color = ano.type === 'RARE' ? this.colors.rare : (ano.type === 'TRAP' ? this.colors.danger : this.colors.warn);
                let blink = ano.type === 'RARE';
                drawBlip(ano.x, ano.y, color, 4, blink);
            });

            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(rCx, rCy - 8); ctx.lineTo(rCx + 5, rCy + 5); ctx.lineTo(rCx - 5, rCy + 5); ctx.fill();

            // Painel Inferior
            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, h - 80, w, 80);
            ctx.strokeStyle = this.colors.main; ctx.beginPath(); ctx.moveTo(0, h - 80); ctx.lineTo(w, h - 80); ctx.stroke();

            ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 20px 'Chakra Petch'";
            ctx.fillText(`CAÇAMBA: ${this.cargo.length} / ${this.stats.maxCargo}`, 20, h - 45);
            ctx.fillStyle = this.colors.success; ctx.font = "bold 24px 'Russo One'";
            ctx.fillText(`SALDO: R$ ${this.money.toLocaleString()}`, 20, h - 15);

            let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
            ctx.textAlign = "right"; ctx.fillStyle = this.colors.main; ctx.font = "16px Arial";
            ctx.fillText(`DIST. DA BASE: ${Math.floor(distToBase)}m`, w - 20, h - 45);

            if (distToBase < 25) {
                ctx.fillStyle = this.colors.success; ctx.fillRect(w/2 - 120, h - 70, 240, 50);
                ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.font = "bold 16px 'Russo One'";
                ctx.fillText("CLIQUE PARA MANUTENÇÃO", w/2, h - 40);
            }
        },

        deliverCargo: function() {
            if (this.cargo.length > 0) {
                let total = this.cargo.reduce((a, b) => a + b, 0);
                // Bônus de eficiência de combustível
                let effBonus = Math.floor(total * (this.fuel / this.stats.maxFuel) * 0.2); 
                total += effBonus;
                
                this.money += total;
                this.xp += this.cargo.length * 100;
                this.cargo = [];
                
                if (this.xp >= this.level * 500) {
                    this.xp = 0; this.level++;
                    window.System.msg("NÍVEL " + this.level + " ALCANÇADO!");
                    if(window.Sfx) window.Sfx.epic();
                } else {
                    window.System.msg(`ENTREGA: R$${total} (Bônus: R$${effBonus})`);
                    if(window.Sfx) window.Sfx.coin();
                }
                this.spawnParticles(window.innerWidth/2, window.innerHeight/2, 100, this.colors.success);
            }
        },

        drawBaseMenu: function(ctx, w, h) {
            ctx.fillStyle = "#0a192f"; ctx.fillRect(0, 0, w, h);
            ctx.strokeStyle = "rgba(0, 255, 255, 0.1)"; ctx.lineWidth = 1;
            for(let i=0; i<w; i+=40) { ctx.beginPath(); ctx.moveTo(i,0); ctx.lineTo(i,h); ctx.stroke(); }
            for(let i=0; i<h; i+=40) { ctx.beginPath(); ctx.moveTo(0,i); ctx.lineTo(w,i); ctx.stroke(); }

            const cx = w/2;
            
            ctx.fillStyle = this.colors.main; ctx.textAlign = "center";
            ctx.font = "bold clamp(30px, 6vw, 50px) 'Russo One'"; ctx.fillText("QUARTEL GENERAL", cx, 50);
            
            ctx.fillStyle = this.colors.success; ctx.font = "bold 24px Arial";
            ctx.fillText(`SALDO GLOBAL: R$ ${this.money.toLocaleString()}`, cx, 90);
            
            ctx.fillStyle = "#fff"; ctx.font = "18px 'Chakra Petch'";
            ctx.fillText(`NÍVEL DA FROTA: ${this.level}`, cx, 115);

            // Botões de Manutenção
            const drawRepBtn = (x, y, label, cost, condition) => {
                let canBuy = this.money >= cost && condition;
                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(x, y, 200, 60);
                ctx.strokeStyle = canBuy ? this.colors.warn : "#555"; ctx.lineWidth=2; ctx.strokeRect(x,y,200,60);
                ctx.textAlign="center"; ctx.fillStyle = "#fff"; ctx.font="bold 14px Arial"; ctx.fillText(label, x+100, y+25);
                ctx.fillStyle = canBuy ? this.colors.warn : "#555"; ctx.fillText(`R$ ${cost}`, x+100, y+45);
            };

            let repMotorCost = Math.floor(this.wear.motor * 5);
            let repWheelsCost = Math.floor(this.wear.wheels * 3);
            let fuelCost = Math.floor((this.stats.maxFuel - this.fuel) * 2);

            drawRepBtn(cx - 310, 140, "REPARAR MOTOR", repMotorCost, this.wear.motor > 5);
            drawRepBtn(cx - 100, 140, "TROCAR PNEUS", repWheelsCost, this.wear.wheels > 5);
            drawRepBtn(cx + 110, 140, "ABASTECER BATERIA", fuelCost, this.stats.maxFuel - this.fuel > 5);

            // Loja de Upgrades
            ctx.fillStyle = "#fff"; ctx.fillText("SISTEMAS DE APRIMORAMENTO", cx, 240);
            
            const drawUpgBtn = (y, key) => {
                let upg = this.upgrades[key];
                let isMax = upg.lvl >= upg.max;
                let cost = Math.floor(upg.baseCost * Math.pow(1.5, upg.lvl - 1));
                let canBuy = this.money >= cost && !isMax;

                ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(cx - 200, y, 400, 50);
                ctx.strokeStyle = isMax ? "#555" : (canBuy ? this.colors.success : this.colors.danger);
                ctx.strokeRect(cx - 200, y, 400, 50);

                ctx.textAlign="left"; ctx.fillStyle="#fff"; ctx.font="bold 16px 'Chakra Petch'";
                ctx.fillText(`LVL ${upg.lvl}: ${upg.name}`, cx - 180, y + 30);
                ctx.textAlign="right"; ctx.font="bold 18px 'Russo One'";
                ctx.fillStyle = isMax ? "#555" : (canBuy ? this.colors.success : this.colors.danger);
                ctx.fillText(isMax ? "MÁX" : `R$ ${cost}`, cx + 180, y + 30);
            };

            drawUpgBtn(260, 'tank'); drawUpgBtn(320, 'motor'); 
            drawUpgBtn(380, 'chassis'); drawUpgBtn(440, 'scanner'); drawUpgBtn(500, 'cargo');

            ctx.fillStyle = this.colors.main; ctx.fillRect(cx - 150, h - 80, 300, 60);
            ctx.fillStyle = "#000"; ctx.textAlign="center"; ctx.font="bold 20px 'Russo One'";
            ctx.fillText("INICIAR PATRULHA", cx, h - 45);
        },

        handleBaseClicks: function(x, y, w, h) {
            const cx = w/2;

            const buyObj = (cost, callback) => {
                if (this.money >= cost && cost > 0) { this.money -= cost; callback(); if(window.Sfx) window.Sfx.coin(); return true; }
                if(window.Sfx) window.Sfx.error(); return false;
            };

            if(y > 140 && y < 200) {
                if (x > cx - 310 && x < cx - 110) buyObj(Math.floor(this.wear.motor * 5), () => this.wear.motor = 0);
                if (x > cx - 100 && x < cx + 100) buyObj(Math.floor(this.wear.wheels * 3), () => this.wear.wheels = 0);
                if (x > cx + 110 && x < cx + 310) buyObj(Math.floor((this.stats.maxFuel - this.fuel) * 2), () => this.fuel = this.stats.maxFuel);
                return;
            }

            const tryUpgrade = (upgKey, btnY) => {
                if (y > btnY && y < btnY + 50 && x > cx - 200 && x < cx + 200) {
                    let upg = this.upgrades[upgKey];
                    let cost = Math.floor(upg.baseCost * Math.pow(1.5, upg.lvl - 1));
                    if (upg.lvl < upg.max && buyObj(cost, () => upg.lvl++)) {
                        this.applyStats();
                        window.System.msg("UPGRADE INSTALADO!");
                        this.spawnParticles(cx, btnY+25, 20, this.colors.warn);
                    }
                }
            };

            tryUpgrade('tank', 260); tryUpgrade('motor', 320); 
            tryUpgrade('chassis', 380); tryUpgrade('scanner', 440); tryUpgrade('cargo', 500);

            if (y > h - 80 && x > cx - 150 && x < cx + 150) {
                this.state = 'PLAY';
                // Garante que sai da base recarregado caso o usuário tenha esquecido
                if(this.fuel <= 0) this.fuel = this.stats.maxFuel;
                if(window.Sfx) window.Sfx.click();
            }
        },

        applyStats: function() {
            this.stats.maxFuel = 100 + (this.upgrades.tank.lvl * 50);
            this.stats.baseSpeed = 20 + (this.upgrades.motor.lvl * 5);
            this.stats.fuelRate = Math.max(0.5, 1.5 - (this.upgrades.motor.lvl * 0.15));
            this.stats.scanPower = 1.0 + (this.upgrades.scanner.lvl * 0.5);
            this.stats.radarRange = 150 + (this.upgrades.scanner.lvl * 50);
            this.stats.maxCargo = 2 + this.upgrades.cargo.lvl;
            
            if (this.fuel > this.stats.maxFuel) this.fuel = this.stats.maxFuel;
        },

        drawOverlay: function(ctx, w, h, title, sub) {
            ctx.fillStyle = "rgba(0, 10, 20, 0.9)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = this.colors.main; ctx.textAlign = "center";
            ctx.font = "bold clamp(30px, 6vw, 60px) 'Russo One'"; ctx.fillText(title, w/2, h/2 - 20);
            ctx.fillStyle = "#fff"; ctx.font = "bold 16px Arial"; ctx.fillText(sub, w/2, h/2 + 30);
        },

        spawnParticles: function(x, y, count, color) {
            for(let i=0; i<count; i++) {
                particles.push({
                    x: x, y: y,
                    vx: (Math.random()-0.5)*20, vy: (Math.random()-0.5)*20,
                    life: 1.0, color: color, size: Math.random()*8+4
                });
            }
        },

        updateParticles: function(ctx, dt, w, h) {
            ctx.globalCompositeOperation = 'screen';
            for (let i = particles.length - 1; i >= 0; i--) {
                let p = particles[i];
                p.x += p.vx * dt * 60; p.y += p.vy * dt * 60;
                p.life -= dt * 2;
                if (p.life <= 0) { particles.splice(i, 1); continue; }
                ctx.fillStyle = p.color; ctx.globalAlpha = Math.max(0, p.life);
                ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI*2); ctx.fill();
            }
            ctx.globalAlpha = 1.0; ctx.globalCompositeOperation = 'source-over';
        },

        cleanup: function() {}
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_truck_sim', 'AR Ops Master', '🚛', Game, {
                camera: 'environment',
                phases: [
                    { id: 'f1', name: 'EXPEDIÇÃO COMPLETA', desc: 'Missão contínua: gerencie recursos, colete raridades e expanda a frota.', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
