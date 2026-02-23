// =============================================================================
// AR TOY TRUCK SIMULATOR: MASTER ARCHITECT EDITION (V15 - PREMIUM FEEL)
// ENGINE AR HÍBRIDA PROFISSIONAL: FÍSICA REAL, FEEDBACK AAA, MISSÕES E UPGRADES
// =============================================================================

(function() {
    "use strict";

    // =========================================================================
    // 1) CAMERA MANAGER OBRIGATÓRIO
    // =========================================================================
    const CameraManager = {
        isSwitching: false,
        timeoutMs: 5000,

        stopCurrentStream: function() {
            const video = window.System?.video;
            if (video && video.srcObject) {
                const tracks = video.srcObject.getTracks();
                tracks.forEach(track => {
                    track.stop();
                });
                video.srcObject = null;
            }
        },

        safeSwitch: async function(mode) {
            if (this.isSwitching) return false;
            this.isSwitching = true;
            this.stopCurrentStream();

            try {
                const constraints = {
                    video: { facingMode: { ideal: mode }, width: { ideal: 1280 }, height: { ideal: 720 } },
                    audio: false
                };

                const streamPromise = navigator.mediaDevices.getUserMedia(constraints);
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Camera Timeout")), this.timeoutMs));
                
                const stream = await Promise.race([streamPromise, timeoutPromise]);
                
                const video = window.System?.video;
                if (!video) {
                    this.isSwitching = false;
                    return false;
                }

                video.srcObject = stream;
                
                if (mode === 'environment') {
                    video.style.transform = "none";
                } else {
                    video.style.transform = "scaleX(-1)";
                }

                const metadataPromise = new Promise((resolve) => {
                    video.onloadedmetadata = () => resolve();
                });
                const metaTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Metadata Timeout")), 3000));
                
                await Promise.race([metadataPromise, metaTimeout]);

                try {
                    await video.play();
                } catch(playErr) {}

                this.isSwitching = false;
                window.System.currentCameraMode = mode;
                return true;
            } catch (err) {
                this.isSwitching = false;
                return false; 
            }
        },

        startRearCamera: async function() {
            return await this.safeSwitch('environment');
        },

        startFrontCamera: async function() {
            return await this.safeSwitch('user');
        }
    };

    // =========================================================================
    // 2) FRONT_AR_OFFICE (GESTURE MODULE)
    // =========================================================================
    const GestureOffice = {
        hands: null,
        isActive: false,
        cursor: { x: 0, y: 0, active: false },
        hoverTime: 0,
        hoveredBtn: null,
        lastProcessTime: 0,
        eventCallback: null,
        
        buttons: [
            { id: 'REFUEL', label: 'ABASTECER', x: 0, y: 0, w: 180, h: 60, color: '#f39c12' },
            { id: 'REPAIR', label: 'REPARAR', x: 0, y: 0, w: 180, h: 60, color: '#e74c3c' },
            { id: 'UPG_ENGINE', label: 'UPG MOTOR', x: 0, y: 0, w: 180, h: 60, color: '#3498db' },
            { id: 'UPG_TANK', label: 'UPG TANQUE', x: 0, y: 0, w: 180, h: 60, color: '#9b59b6' },
            { id: 'UPG_RADAR', label: 'UPG RADAR', x: 0, y: 0, w: 180, h: 60, color: '#00ffff' },
            { id: 'UPG_TRUCK', label: 'UPG CHASSI', x: 0, y: 0, w: 180, h: 60, color: '#f1c40f' },
            { id: 'EXIT', label: 'SAIR DA BASE', x: 0, y: 0, w: 300, h: 60, color: '#00ff66' }
        ],

        init: async function(callback) {
            this.eventCallback = callback;
            this.isActive = true;
            this.cursor = { x: window.innerWidth/2, y: window.innerHeight/2, active: false };
            this.hoverTime = 0;
            this.hoveredBtn = null;

            if (typeof window.Hands === 'undefined') {
                await this.loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js");
                await this.loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js");
                await this.loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js");
            }

            if (!this.hands && window.Hands) {
                this.hands = new window.Hands({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
                });
                this.hands.setOptions({
                    maxNumHands: 1,
                    modelComplexity: 1,
                    minDetectionConfidence: 0.5,
                    minTrackingConfidence: 0.5
                });
                this.hands.onResults(this.onResults.bind(this));
            }
        },

        loadScript: function(src) {
            return new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = src;
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        },

        onResults: function(results) {
            if (!this.isActive) return;
            if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
                const indexFinger = results.multiHandLandmarks[0][8]; 
                this.cursor.x = (1 - indexFinger.x) * window.innerWidth;
                this.cursor.y = indexFinger.y * window.innerHeight;
                this.cursor.active = true;
            } else {
                this.cursor.active = false;
                this.hoverTime = 0;
            }
        },

        update: async function(ctx, w, h, dt, gameState) {
            if (!this.isActive) return;

            const now = Date.now();
            if (now - this.lastProcessTime > 100 && window.System?.video && window.System.video.readyState === 4) {
                this.lastProcessTime = now;
                try { await this.hands.send({image: window.System.video}); } catch(e) {}
            }

            const cx = w / 2; const cy = h / 2;
            
            this.buttons[0].x = cx - 290; this.buttons[0].y = cy - 100;
            this.buttons[1].x = cx - 90;  this.buttons[1].y = cy - 100;
            this.buttons[2].x = cx + 110; this.buttons[2].y = cy - 100;
            this.buttons[3].x = cx - 290; this.buttons[3].y = cy - 10;
            this.buttons[4].x = cx - 90;  this.buttons[4].y = cy - 10;
            this.buttons[5].x = cx + 110; this.buttons[5].y = cy - 10;
            this.buttons[6].x = cx - 150; this.buttons[6].y = cy + 100;

            ctx.fillStyle = "rgba(0, 15, 30, 0.85)"; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = "#00ffff"; ctx.textAlign = "center";
            ctx.font = "bold clamp(30px, 5vw, 50px) 'Russo One'";
            ctx.fillText("GARAGEM HOLOGRÁFICA", cx, cy - 180);
            
            ctx.fillStyle = "#00ff66"; ctx.font = "bold 24px 'Chakra Petch'";
            ctx.fillText(`SALDO: R$ ${Math.floor(gameState.displayMoney).toLocaleString()}`, cx, cy - 140);
            ctx.fillStyle = "#fff"; ctx.font = "16px Arial";
            ctx.fillText(`VIDA: ${Math.floor(gameState.health)}/100 | COMB: ${Math.floor(gameState.displayFuel)}/${gameState.stats.maxFuel}`, cx, cy - 115);

            let currentlyHovering = null;

            this.buttons.forEach(btn => {
                let isHover = false;
                if (this.cursor.active) {
                    if (this.cursor.x > btn.x && this.cursor.x < btn.x + btn.w &&
                        this.cursor.y > btn.y && this.cursor.y < btn.y + btn.h) {
                        isHover = true;
                        currentlyHovering = btn.id;
                    }
                }

                ctx.fillStyle = isHover ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.6)";
                ctx.fillRect(btn.x, btn.y, btn.w, btn.h);
                ctx.strokeStyle = btn.color; ctx.lineWidth = isHover ? 4 : 2;
                ctx.strokeRect(btn.x, btn.y, btn.w, btn.h);
                
                ctx.fillStyle = "#fff"; ctx.font = "bold 16px 'Chakra Petch'"; ctx.textAlign = "center";
                ctx.fillText(btn.label, btn.x + btn.w/2, btn.y + btn.h/2 + 2);
                
                ctx.font = "12px Arial"; ctx.fillStyle = btn.color;
                let costTxt = "";
                if(btn.id==='REFUEL') costTxt = `R$ ${Math.floor((gameState.stats.maxFuel - gameState.fuel)*2)}`;
                if(btn.id==='REPAIR') costTxt = `R$ ${Math.floor((100 - gameState.health)*5)}`;
                if(btn.id==='UPG_ENGINE') costTxt = gameState.upgrades.engine.lvl < gameState.upgrades.engine.max ? `R$ ${gameState.upgrades.engine.cost}` : 'MÁX';
                if(btn.id==='UPG_TANK') costTxt = gameState.upgrades.tank.lvl < gameState.upgrades.tank.max ? `R$ ${gameState.upgrades.tank.cost}` : 'MÁX';
                if(btn.id==='UPG_RADAR') costTxt = gameState.upgrades.radar.lvl < gameState.upgrades.radar.max ? `R$ ${gameState.upgrades.radar.cost}` : 'MÁX';
                if(btn.id==='UPG_TRUCK') costTxt = gameState.upgrades.truck.lvl < gameState.upgrades.truck.max ? `R$ ${gameState.upgrades.truck.cost}` : 'MÁX';
                if(costTxt) ctx.fillText(costTxt, btn.x + btn.w/2, btn.y + btn.h - 8);
            });

            if (currentlyHovering) {
                if (this.hoveredBtn === currentlyHovering) {
                    this.hoverTime += dt;
                    if (this.hoverTime >= 1.2) {
                        if (this.eventCallback) this.eventCallback(this.hoveredBtn);
                        this.hoverTime = 0; 
                    }
                } else {
                    this.hoveredBtn = currentlyHovering;
                    this.hoverTime = 0;
                }
            } else {
                this.hoveredBtn = null;
                this.hoverTime = 0;
            }

            if (this.cursor.active) {
                ctx.fillStyle = "rgba(0, 255, 255, 0.8)";
                ctx.beginPath(); ctx.arc(this.cursor.x, this.cursor.y, 10, 0, Math.PI*2); ctx.fill();
                if (this.hoverTime > 0) {
                    ctx.strokeStyle = "#00ff66"; ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(this.cursor.x, this.cursor.y, 25, -Math.PI/2, -Math.PI/2 + (this.hoverTime/1.2)*(Math.PI*2));
                    ctx.stroke();
                }
            } else {
                ctx.fillStyle = "#fff"; ctx.font = "16px Arial"; ctx.textAlign = "center";
                ctx.fillText("MOSTRE A MÃO PARA A CÂMERA PARA CONTROLAR", cx, h - 30);
            }
        },

        destroy: function() {
            this.isActive = false;
            if (this.hands) {
                this.hands.onResults(() => {});
                if (typeof this.hands.close === 'function') {
                    this.hands.close();
                }
            }
            this.cursor = { x: 0, y: 0, active: false };
        }
    };

    // =========================================================================
    // 3) ARQUITETURA GLOBAL (MÁQUINA DE ESTADOS)
    // =========================================================================
    let particles = [];
    
    const Game = {
        state: 'BOOT', 
        lastTime: 0,
        timeTotal: 0,
        score: 0,
        
        transitionAlpha: 0,
        transitionPhase: 0,
        
        vPos: { x: 0, y: 0 },
        baseHeading: 0,
        currentHeading: 0,
        virtualSpeed: 0,
        targetSpeed: 0,
        manualAccelerate: false,
        deviceForce: 0,
        _deviceOrientationHandler: null,
        _deviceMotionHandler: null,
        
        objectModel: null,
        detectedItems: [],
        lastAiTime: 0,
        aiIntervalMs: 500,
        aiIntervalId: null,
        aiProcessing: false,
        floorColor: { r: 0, g: 0, b: 0 },
        targetColor: { r: 0, g: 0, b: 0 },
        activeAnomaly: null,
        anomalies: [],
        spawnTimer: 0,
        
        isExtracting: false,
        extractProgress: 0,
        cooldown: 0,
        currentEvent: null,
        eventTimer: 0,
        _sensorsReady: false,
        
        // Premium Feedback Vars
        displayMoney: 0,
        displayFuel: 100,
        collectGlow: 0,
        collectZoom: 0,
        baseFlash: 0,

        // Missões
        currentMission: { type: 'NORMAL', goal: 3, progress: 0, timer: 0, active: false },
        
        health: 100,
        fuel: 100,
        wear: { motor: 0, wheels: 0 },
        money: 0,
        cargo: [],
        level: 1,
        xp: 0,
        
        stats: { maxFuel: 100, maxCargo: 3, baseSpeed: 20, scanPower: 1.0, radarRange: 150, wearRate: 0.3 },
        
        upgrades: {
            engine: { lvl: 1, max: 5, cost: 1000 },
            tank:   { lvl: 1, max: 5, cost: 800 },
            radar:  { lvl: 1, max: 5, cost: 1200 },
            truck:  { lvl: 1, max: 5, cost: 1500 }
        },

        colors: { 
            main: '#00ffff', 
            danger: '#ff003c', 
            success: '#00ff66', 
            warn: '#f1c40f', 
            panel: 'rgba(0,15,30,0.8)', 
            rare: '#ff00ff' 
        },

        init: function() {
            this.lastTime = performance.now();
            this.timeTotal = 0;
            this.score = 0;
            this.health = 100;
            this.fuel = this.stats.maxFuel;
            this.wear = { motor: 0, wheels: 0 };
            this.displayFuel = this.fuel;
            this.money = 0;
            this.displayMoney = 0;
            this.xp = 0;
            this.level = 1;
            this.cargo = [];
            this.anomalies = [];
            this.isExtracting = false;
            this.collectGlow = 0;
            this.collectZoom = 0;
            this.baseFlash = 0;
            particles = [];
            
            this.generateMission();
            this.setupSensors();
            this.setupInput();
            this.changeState('BOOT');
        },

        generateMission: function() {
            const types = ['COMBO', 'HEAVY LOAD', 'TIMED'];
            let t = types[Math.floor(Math.random() * types.length)];
            this.currentMission = {
                type: t,
                goal: 3 + Math.floor(Math.random() * 3),
                progress: 0,
                timer: t === 'TIMED' ? 90 : 0,
                active: true
            };
        },

        completeMission: function() {
            this.currentMission.active = false;
            let bonus = this.currentMission.goal * 1000;
            this.money += bonus;
            window.System.msg("OBJETIVO CUMPRIDO! BÔNUS: R$" + bonus);
            this.baseFlash = 1.0;
            if (window.Sfx) window.Sfx.epic();
        },

        changeState: function(newState) {
            if (this.state === newState) return;
            
            if (this.state === 'FRONT_AR_OFFICE') GestureOffice.destroy();
            
            this.state = newState;
            
            switch(newState) {
                case 'BOOT':
                    this.loadAIModel();
                    break;
                case 'CALIBRATION':
                    window.System.msg("SISTEMAS ONLINE.");
                    break;
                case 'PLAY_REAR_AR':
                    this.startAILoop();
                    if (!this.currentMission.active) this.generateMission();
                    break;
                case 'ENTER_BASE_TRANSITION':
                    this.stopAILoop();
                    this.transitionAlpha = 0;
                    this.transitionPhase = 'FADE_OUT';
                    this.virtualSpeed = 0;
                    this.isExtracting = false;
                    this.manualAccelerate = false;
                    break;
                case 'FRONT_AR_OFFICE':
                    this.virtualSpeed = 0;
                    this.deliverCargo();
                    this.baseFlash = 1.0;
                    GestureOffice.init(this.handleOfficeAction.bind(this));
                    break;
                case 'EXIT_BASE_TRANSITION':
                    this.transitionAlpha = 0;
                    this.transitionPhase = 'FADE_OUT';
                    this.manualAccelerate = false;
                    break;
                case 'TOW_MODE':
                    this.isExtracting = false;
                    window.System.msg("SISTEMAS CRÍTICOS! VOLTANDO À BASE.");
                    break;
                case 'GAME_OVER':
                    window.System.gameOver(this.score, true, this.money);
                    break;
            }
        },

        setupSensors: function() {
            if (!this._deviceOrientationHandler) {
                this._deviceOrientationHandler = (e) => {
                    this.currentHeading = e.alpha || 0;
                };
            }
            if (!this._deviceMotionHandler) {
                this._deviceMotionHandler = (e) => {
                    if (this.state === 'ENTER_BASE_TRANSITION' || this.state === 'EXIT_BASE_TRANSITION') return;
                    
                    let acc = e.acceleration || e.accelerationIncludingGravity;
                    if (!acc) return;
                    let mag = Math.sqrt((acc.x||0)*(acc.x||0) + (acc.y||0)*(acc.y||0) + (acc.z||0)*(acc.z||0));
                    let force = Math.abs(mag - (e.acceleration ? 0 : 9.81));
                    
                    if (force > 0.3) {
                        this.deviceForce = force;
                        if (force > 15 && this.state === 'PLAY_REAR_AR') {
                            let impactDmg = force * 0.5;
                            this.health -= impactDmg;
                            if(navigator.vibrate) navigator.vibrate(200);
                            this.spawnParticles(window.innerWidth/2, window.innerHeight/2, 20, this.colors.danger);
                            window.System.msg("IMPACTO DETECTADO!");
                            
                            if (this.health <= 0 && this.state !== 'TOW_MODE') {
                                this.changeState('TOW_MODE');
                            }
                        }
                    } else {
                        this.deviceForce = 0;
                    }
                };
            }

            window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            window.removeEventListener('devicemotion', this._deviceMotionHandler);

            window.addEventListener('deviceorientation', this._deviceOrientationHandler);
            window.addEventListener('devicemotion', this._deviceMotionHandler);
        },

        setupInput: function() {
            const canvas = window.System?.canvas;
            if (!canvas) return;

            canvas.onpointerdown = (e) => {
                if (this.state === 'ENTER_BASE_TRANSITION' || this.state === 'EXIT_BASE_TRANSITION') return;
                
                const r = canvas.getBoundingClientRect();
                const x = e.clientX - r.left; const y = e.clientY - r.top;
                const w = r.width; const h = r.height;

                if (this.state === 'CALIBRATION') {
                    this.baseHeading = this.currentHeading;
                    this.vPos = { x: 0, y: 0 }; 
                    this.changeState('PLAY_REAR_AR');
                }
                else if (this.state === 'PLAY_REAR_AR' || this.state === 'TOW_MODE') {
                    let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                    if (y > 70 && y < 120 && x > w - 70 && x < w - 20) {
                        if (distToBase < 30) {
                            this.changeState('ENTER_BASE_TRANSITION');
                        } else {
                            window.System.msg("MUITO LONGE DA BASE!");
                        }
                        return;
                    }
                    if (x < 150 && y > h - 150 && this.state !== 'TOW_MODE') {
                        this.manualAccelerate = true;
                    }
                }
            };
            canvas.onpointerup = () => { this.manualAccelerate = false; };
        },

        loadAIModel: async function() {
            if (typeof cocoSsd === 'undefined') {
                const script = document.createElement('script');
                script.src = "https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd";
                document.head.appendChild(script);
                script.onload = async () => {
                    this.objectModel = await cocoSsd.load().catch(()=>null);
                    this.changeState('CALIBRATION');
                };
            } else {
                this.objectModel = await cocoSsd.load().catch(()=>null);
                this.changeState('CALIBRATION');
            }
        },

        startAILoop: function() {
            if (this.aiIntervalId !== null) {
                clearInterval(this.aiIntervalId);
                this.aiIntervalId = null;
            }
            this.aiIntervalId = setInterval(async () => {
                if (this.aiProcessing) return;
                if ((this.state === 'PLAY_REAR_AR') && this.objectModel && window.System?.video && window.System.video.readyState === 4) {
                    this.aiProcessing = true;
                    try {
                        const preds = await this.objectModel.detect(window.System.video);
                        this.detectedItems = preds || [];
                    } catch(e) {
                        this.detectedItems = [];
                    } finally {
                        this.aiProcessing = false;
                    }
                }
            }, this.aiIntervalMs);
        },
        
        stopAILoop: function() {
            if (this.aiIntervalId !== null) { 
                clearInterval(this.aiIntervalId); 
                this.aiIntervalId = null; 
            }
            this.aiProcessing = false;
        },

        update: function(ctx, w, h, pose) {
            const now = performance.now();
            let dt = (now - this.lastTime) / 1000;
            if (isNaN(dt) || dt > 0.1 || dt < 0) dt = 0.016; 
            this.lastTime = now;
            this.timeTotal += dt;

            // Smooth Interpolations
            if (isNaN(this.displayMoney)) this.displayMoney = 0;
            if (isNaN(this.displayFuel)) this.displayFuel = 100;
            this.displayMoney += (this.money - this.displayMoney) * 10 * dt;
            this.displayFuel += (this.fuel - this.displayFuel) * 5 * dt;

            let fps = 1 / dt;
            let newInterval = (fps < 25) ? 1000 : 500;
            if (this.aiIntervalMs !== newInterval) {
                this.aiIntervalMs = newInterval;
                if (this.state === 'PLAY_REAR_AR') {
                    this.startAILoop();
                }
            }

            if (!['FRONT_AR_OFFICE', 'ENTER_BASE_TRANSITION', 'EXIT_BASE_TRANSITION'].includes(this.state)) {
                ctx.save();
                
                // Micro Oscillation (Premium Suspension Feel)
                if (this.virtualSpeed > 0.1 && !this.isExtracting) {
                    let susY = Math.sin(this.timeTotal * this.virtualSpeed * 1.5) * (this.virtualSpeed / this.stats.baseSpeed) * 3;
                    ctx.translate(0, susY);
                }

                // Collect Zoom Effect
                if (this.collectZoom > 0) {
                    let z = 1 + (this.collectZoom * 0.03);
                    ctx.translate(w/2, h/2);
                    ctx.scale(z, z);
                    ctx.translate(-w/2, -h/2);
                    this.collectZoom -= dt * 2;
                }

                if (window.System?.video && window.System.video.readyState === 4) {
                    const vW = window.System.video.videoWidth || w;
                    const vH = window.System.video.videoHeight || h;
                    const videoRatio = vW / vH;
                    const canvasRatio = w / h;
                    let drawW = w, drawH = h, drawX = 0, drawY = 0;
                    if (videoRatio > canvasRatio) { drawW = h * videoRatio; drawX = (w - drawW) / 2; } 
                    else { drawH = w / videoRatio; drawY = (h - drawH) / 2; }
                    ctx.drawImage(window.System.video, drawX, drawY, drawW, drawH);
                } else {
                    ctx.fillStyle = '#050505'; ctx.fillRect(0, 0, w, h);
                }
                
                // Base Flash Overlay
                if (this.baseFlash > 0) {
                    ctx.fillStyle = `rgba(0, 255, 100, ${this.baseFlash * 0.5})`;
                    ctx.fillRect(0, 0, w, h);
                    this.baseFlash -= dt * 1.5;
                }

                ctx.fillStyle = `rgba(0, 50, 60, ${0.1 + Math.sin(this.timeTotal*2)*0.05})`;
                ctx.fillRect(0, 0, w, h);
                
                ctx.restore();
            }

            switch (this.state) {
                case 'BOOT':
                    this.drawOverlay(ctx, w, h, "INICIALIZANDO SISTEMAS", "Carregando Engine Premium...");
                    break;
                case 'CALIBRATION':
                    this.drawOverlay(ctx, w, h, "CALIBRAR PONTO ZERO", "Aponte o caminhão para a pista e TOQUE NA TELA");
                    break;
                case 'PLAY_REAR_AR':
                case 'TOW_MODE':
                    this.updatePhysics(dt);
                    this.updateEvents(dt);
                    this.spawnAnomalies(dt);
                    this.processAR(ctx, w, h, dt);
                    this.drawHUD(ctx, w, h);
                    break;
                case 'ENTER_BASE_TRANSITION':
                    this.processTransition(ctx, w, h, dt, 'startFrontCamera', 'FRONT_AR_OFFICE');
                    break;
                case 'FRONT_AR_OFFICE':
                    if (window.System?.video && window.System.video.readyState === 4) {
                        const vW = window.System.video.videoWidth || w;
                        const vH = window.System.video.videoHeight || h;
                        const vr = vW / vH;
                        const cr = w / h;
                        let dw = w, dh = h, dx = 0, dy = 0;
                        if (vr > cr) { dw = h * vr; dx = (w - dw) / 2; } else { dh = w / vr; dy = (h - dh) / 2; }
                        ctx.save();
                        ctx.translate(w, 0); ctx.scale(-1, 1);
                        ctx.drawImage(window.System.video, -dx, dy, dw, dh);
                        ctx.restore();
                    }
                    GestureOffice.update(ctx, w, h, dt, this);
                    break;
                case 'EXIT_BASE_TRANSITION':
                    this.processTransition(ctx, w, h, dt, 'startRearCamera', 'PLAY_REAR_AR');
                    break;
                case 'GAME_OVER':
                    this.drawOverlay(ctx, w, h, "FIM DE JOGO", "Calculando pontuação final...");
                    break;
            }

            this.updateParticles(ctx, dt, w, h);
            return this.score || 0; 
        },

        processTransition: function(ctx, w, h, dt, camFunc, nextState) {
            if (this.transitionPhase === 'FADE_OUT') {
                this.transitionAlpha += dt * 2.5;
                if (this.transitionAlpha >= 1) {
                    this.transitionAlpha = 1;
                    this.transitionPhase = 'SWITCH_CAM';
                    CameraManager[camFunc]().then(() => {
                        this.transitionPhase = 'FADE_IN';
                    }).catch(() => {
                        this.transitionPhase = 'FADE_IN';
                    });
                }
            } else if (this.transitionPhase === 'SWITCH_CAM') {
                ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = "#fff"; ctx.font = "bold 20px Arial"; ctx.textAlign="center";
                ctx.fillText("SISTEMAS REINICIANDO...", w/2, h/2);
            } else if (this.transitionPhase === 'FADE_IN') {
                this.transitionAlpha -= dt * 2.5;
                if (this.transitionAlpha <= 0) {
                    this.transitionAlpha = 0;
                    this.changeState(nextState);
                }
            }
            if (this.transitionPhase !== 'SWITCH_CAM') {
                ctx.fillStyle = `rgba(0,0,0,${this.transitionAlpha})`;
                ctx.fillRect(0, 0, w, h);
            }
        },

        updatePhysics: function(dt) {
            if (this.cooldown > 0) this.cooldown -= dt;

            // Premium Feel: Aceleração e Drag Quadrático
            let accelInput = (this.manualAccelerate || this.deviceForce > 0.5) ? (5.0 + this.upgrades.engine.lvl) : 0;
            let drag = 0.05 * this.virtualSpeed * this.virtualSpeed; 
            
            if (accelInput > 0) {
                let speedRatio = this.virtualSpeed / this.stats.baseSpeed;
                this.virtualSpeed += accelInput * (1 - speedRatio * speedRatio) * dt * 8;
            }
            this.virtualSpeed -= drag * dt;
            this.virtualSpeed = Math.max(0, Math.min(this.virtualSpeed, this.stats.baseSpeed));

            if (this.state === 'TOW_MODE') {
                this.virtualSpeed = Math.min(this.virtualSpeed, this.stats.baseSpeed * 0.4);
                let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
                if (distToBase < 30) {
                    this.changeState('ENTER_BASE_TRANSITION');
                    return;
                }
            }

            let isMoving = this.virtualSpeed > 0.15;

            if (isMoving) {
                let speedMod = 1.0;
                if (this.currentEvent === 'STORM') speedMod *= 0.5; 
                
                let currentSpeed = this.virtualSpeed * speedMod;
                let rad = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
                this.vPos.x += Math.sin(rad) * currentSpeed * dt;
                this.vPos.y -= Math.cos(rad) * currentSpeed * dt; 

                // Wear Rate Physics Application
                let wearMod = 1.0 - ((this.upgrades.truck?.lvl || 1) * 0.05);
                this.wear.motor = Math.min(100, this.wear.motor + (this.stats.wearRate * wearMod * dt));
                this.wear.wheels = Math.min(100, this.wear.wheels + (this.stats.wearRate * wearMod * 1.5 * dt));

                let isHeavyLoad = (this.currentMission && this.currentMission.active && this.currentMission.type === 'HEAVY LOAD');
                let heavyMod = isHeavyLoad ? 2.0 : 1.0;

                // Combustível - Zero consumo se parado strict
                let cargoWeight = this.cargo.length;
                let baseDrain = 0.8 / 60; 
                let speedDrain = this.virtualSpeed * 0.015;
                let cargoDrain = cargoWeight * 0.01 * heavyMod;
                
                let fuelLoss = (baseDrain + speedDrain + cargoDrain) * dt;
                this.fuel = Math.max(0, Math.min(this.fuel - fuelLoss, this.stats.maxFuel));
            } else {
                this.fuel = Math.max(0, Math.min(this.fuel, this.stats.maxFuel));
            }

            if (this.fuel <= 0 && this.state !== 'TOW_MODE') {
                this.fuel = 0; // Garantia redundante
                this.changeState('TOW_MODE');
            }

            // Mission Logic
            if (this.currentMission && this.currentMission.active && this.currentMission.type === 'TIMED' && this.state !== 'TOW_MODE') {
                this.currentMission.timer -= dt;
                if (this.currentMission.timer <= 0) {
                    this.currentMission.active = false;
                    window.System.msg("TEMPO DA MISSÃO ESGOTADO!");
                    if(window.Sfx && typeof window.Sfx.error === 'function') window.Sfx.error();
                }
            }
        },

        updateEvents: function(dt) {
            if (this.currentEvent) {
                this.eventTimer -= dt;
                if (this.eventTimer <= 0) this.currentEvent = null;
            } else if (Math.random() < (0.01 * dt)) { 
                this.currentEvent = Math.random() > 0.5 ? 'STORM' : 'GLITCH';
                this.eventTimer = 10;
                window.System.msg("EVENTO: " + this.currentEvent);
            }
        },

        spawnAnomalies: function(dt) {
            if (this.state === 'TOW_MODE') return;
            this.spawnTimer += dt;
            if (this.anomalies.length < 5 && this.spawnTimer > 2.0) {
                this.spawnTimer = 0;
                let isRare = Math.random() < 0.15;
                let dist = 40 + Math.random() * (100 + this.level * 20); 
                let ang = Math.random() * Math.PI * 2;
                
                this.anomalies.push({
                    id: Math.random().toString(36),
                    x: this.vPos.x + Math.cos(ang) * dist,
                    y: this.vPos.y + Math.sin(ang) * dist,
                    type: isRare ? 'RARE' : 'NORMAL',
                    val: isRare ? 5000 : (500 + Math.floor(Math.random()*500)), 
                    life: isRare ? 25 : 999 
                });
            }
            this.anomalies.forEach(a => { if (a.life < 999) a.life -= dt; });
            this.anomalies = this.anomalies.filter(a => a.life > 0);
        },

        getAverageColor: function(ctx, x, y, w, h) {
            try {
                const data = ctx.getImageData(x, y, w, h).data;
                let r=0, g=0, b=0;
                for (let i=0; i<data.length; i+=4) { r+=data[i]; g+=data[i+1]; b+=data[i+2]; }
                let c = data.length/4; return {r:r/c, g:g/c, b:b/c};
            } catch(e) { return {r:0,g:0,b:0}; }
        },

        processAR: function(ctx, w, h, dt) {
            if (this.state === 'TOW_MODE') {
                this.isExtracting = false;
                return; 
            }

            const cx = w / 2; const cy = h / 2;
            let nearestDist = 9999;
            this.activeAnomaly = null;
            
            this.anomalies.forEach(ano => {
                let d = Math.hypot(ano.x - this.vPos.x, ano.y - this.vPos.y);
                if (d < nearestDist) { nearestDist = d; this.activeAnomaly = ano; }
            });

            if (this.activeAnomaly && nearestDist < 20 && this.cargo.length < this.stats.maxCargo && this.cooldown <= 0) {
                
                this.floorColor = this.getAverageColor(ctx, cx - 50, h * 0.85, 100, 40);
                this.targetColor = this.getAverageColor(ctx, cx - 40, cy - 40, 80, 80);
                
                let diff = Math.abs(this.floorColor.r - this.targetColor.r) + Math.abs(this.floorColor.g - this.targetColor.g) + Math.abs(this.floorColor.b - this.targetColor.b);
                let visualFound = (diff > 60);

                const vW = window.System?.video?.videoWidth || w;
                const vH = window.System?.video?.videoHeight || h;
                const sX = w / vW;
                const sY = h / vH;
                
                this.detectedItems.forEach(item => {
                    if (['person', 'bed', 'sofa'].includes(item.class) || item.score < 0.2) return;
                    const bW = item.bbox[2]*sX; const bH = item.bbox[3]*sY;
                    if (bW > w * 0.8) return;
                    const cX = (item.bbox[0]*sX) + bW/2; const cY = (item.bbox[1]*sY) + bH/2;
                    if (Math.hypot(cX - cx, cY - cy) < 200) visualFound = true;
                });

                if (!this.isExtracting) {
                    ctx.strokeStyle = this.colors.warn; ctx.lineWidth = 4;
                    ctx.strokeRect(cx - 150, cy - 150, 300, 300);
                    ctx.fillStyle = this.colors.warn; ctx.font = "bold 20px 'Chakra Petch'"; ctx.textAlign = "center";
                    ctx.fillText(`ANOMALIA A ${Math.floor(nearestDist)}m`, cx, cy - 160);
                }

                if (visualFound && !this.isExtracting) {
                    this.isExtracting = true;
                    this.extractProgress = 0;
                }
            }

            if (this.isExtracting && this.activeAnomaly) {
                let actionForce = Math.max(this.virtualSpeed, this.manualAccelerate ? this.stats.baseSpeed : 0);
                
                if (actionForce > 1.0) {
                    this.extractProgress += (actionForce * this.stats.scanPower * dt * 5);
                    if(window.Gfx) window.Gfx.addShake(1);
                } else {
                    this.extractProgress = Math.max(0, this.extractProgress - (15 * dt));
                }

                ctx.fillStyle = `rgba(255, 0, 60, ${Math.abs(Math.sin(this.timeTotal*10))*0.3})`; ctx.fillRect(0, 0, w, h);
                ctx.fillStyle = this.colors.danger; ctx.textAlign = "center";
                ctx.font = "bold clamp(25px, 5vw, 50px) 'Russo One'";
                ctx.fillText("TRAVADO! ACELERE!", cx, cy - 130);

                ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(w*0.2, cy - 100, w*0.6, 20);
                ctx.fillStyle = this.colors.danger; ctx.fillRect(w*0.2, cy - 100, (this.extractProgress/100)*(w*0.6), 20);
                ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(w*0.2, cy - 100, w*0.6, 20);

                ctx.strokeStyle = `rgba(0, 255, 255, ${0.5 + Math.sin(this.timeTotal*20)*0.5})`; ctx.lineWidth = 20;
                ctx.beginPath(); ctx.moveTo(cx, h); ctx.lineTo(cx, cy); ctx.stroke();

                const ringSize = Math.max(50, 250 - this.extractProgress);
                ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.timeTotal * 5);
                ctx.strokeStyle = this.colors.danger; ctx.lineWidth = 8; ctx.setLineDash([20, 15]);
                ctx.beginPath(); ctx.arc(0, 0, ringSize, 0, Math.PI*2); ctx.stroke(); ctx.restore();

                if (this.extractProgress >= 100) {
                    this.cargo.push(this.activeAnomaly.val);
                    this.score += this.activeAnomaly.val / 10;
                    window.System.msg(this.activeAnomaly.type === 'RARE' ? "CARGA RARA COLETADA!" : "COLETADO!");
                    
                    if (this.currentMission && this.currentMission.active) {
                        this.currentMission.progress++;
                        if (this.currentMission.progress >= this.currentMission.goal) {
                            this.completeMission();
                        }
                    }

                    this.anomalies = this.anomalies.filter(a => a.id !== this.activeAnomaly.id);
                    this.isExtracting = false;
                    this.cooldown = 2.0; 
                    
                    if(window.Gfx) window.Gfx.shakeScreen(20);
                    if(navigator.vibrate) navigator.vibrate([50, 50, 50]);
                    this.collectGlow = 1.0;
                    this.collectZoom = 1.0;
                    this.spawnParticles(cx, cy, 40, this.colors.main);
                }

                if (this.activeAnomaly && nearestDist > 30) {
                    this.isExtracting = false;
                    window.System.msg("ALVO PERDIDO");
                }
            }
        },

        drawHUD: function(ctx, w, h) {
            let fuelPct = this.displayFuel / this.stats.maxFuel;
            
            // HUD Glow effects
            if (this.collectGlow > 0) {
                ctx.fillStyle = `rgba(0, 255, 255, ${this.collectGlow * 0.3})`;
                ctx.fillRect(0, 0, w, h);
                this.collectGlow -= 0.03;
            }

            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, 0, w, 60);
            ctx.strokeStyle = this.colors.main; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(w, 60); ctx.stroke();

            ctx.fillStyle = "#fff"; ctx.font = "bold 14px 'Chakra Petch'"; ctx.textAlign = "left";
            ctx.fillText(`LVL ${this.level} | VIDA: ${Math.floor(this.health)}%`, 20, 25);
            
            // Premium Fuel Pulse
            ctx.save();
            if (fuelPct < 0.2) {
                let pulse = 1 + Math.abs(Math.sin(this.timeTotal * 10)) * 0.05;
                ctx.translate(20 + 75, 35 + 7.5); ctx.scale(pulse, pulse); ctx.translate(-(20 + 75), -(35 + 7.5));
                ctx.fillStyle = "rgba(255, 0, 0, 0.2)"; ctx.fillRect(0,0,w,h);
            }
            ctx.fillStyle = "rgba(0,0,0,0.8)"; ctx.fillRect(20, 35, 150, 15);
            ctx.fillStyle = fuelPct > 0.2 ? this.colors.success : this.colors.danger;
            ctx.fillRect(20, 35, fuelPct * 150, 15);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(20, 35, 150, 15);
            ctx.fillStyle = "#fff"; ctx.fillText("COMBUSTÍVEL", 25, 47);
            ctx.restore();

            // Premium Radar
            const rCx = w - 80; const rCy = 160; const rR = 60;
            let radarGradient = ctx.createRadialGradient(rCx, rCy, 0, rCx, rCy, rR);
            radarGradient.addColorStop(0, "rgba(0, 50, 40, 0.9)");
            radarGradient.addColorStop(1, "rgba(0, 10, 20, 0.7)");
            ctx.fillStyle = radarGradient; ctx.beginPath(); ctx.arc(rCx, rCy, rR, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = this.currentEvent ? this.colors.danger : this.colors.main; 
            ctx.lineWidth = 2; ctx.stroke();

            let radHead = (this.currentHeading - this.baseHeading) * (Math.PI / 180);
            const drawBlip = (wX, wY, col, sz, isBlinking) => {
                let dx = wX - this.vPos.x; let dy = wY - this.vPos.y;
                let dist = Math.hypot(dx, dy);
                if (dist < this.stats.radarRange) {
                    if (isBlinking && Math.sin(this.timeTotal * 15) > 0) return;
                    let angle = Math.atan2(dy, dx) + radHead + (Math.PI/2); 
                    let sD = (dist / this.stats.radarRange) * rR;
                    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(rCx + Math.cos(angle)*sD, rCy + Math.sin(angle)*sD, sz, 0, Math.PI*2); ctx.fill();
                }
            };
            drawBlip(0, 0, this.colors.success, 6, false);
            this.anomalies.forEach(a => drawBlip(a.x, a.y, a.type==='RARE'?this.colors.rare:this.colors.warn, 4, a.type==='RARE'));
            ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(rCx, rCy - 8); ctx.lineTo(rCx+5, rCy+5); ctx.lineTo(rCx-5, rCy+5); ctx.fill();

            // Mission Display
            if (this.currentMission && this.currentMission.active && this.state !== 'TOW_MODE') {
                ctx.fillStyle = this.colors.warn; ctx.textAlign = "center";
                ctx.font = "bold 16px 'Chakra Petch'";
                ctx.fillText(`MISSÃO: ${this.currentMission.type} (${this.currentMission.progress}/${this.currentMission.goal})`, w/2, 35);
                if (this.currentMission.type === 'TIMED') {
                    ctx.fillText(`TEMPO: ${Math.floor(this.currentMission.timer)}s`, w/2, 55);
                }
            }

            let distToBase = Math.hypot(this.vPos.x, this.vPos.y);
            let atBase = distToBase < 30;
            ctx.fillStyle = atBase ? this.colors.success : "rgba(100,100,100,0.5)";
            ctx.fillRect(w - 70, 70, 50, 50);
            ctx.strokeStyle = "#fff"; ctx.strokeRect(w - 70, 70, 50, 50);
            ctx.fillStyle = "#000"; ctx.textAlign="center"; ctx.font = "24px Arial"; ctx.fillText("🔧", w - 45, 102);

            ctx.fillStyle = this.manualAccelerate ? "rgba(0,255,255,0.6)" : "rgba(0,255,255,0.2)";
            ctx.beginPath(); ctx.arc(70, h - 70, 50, 0, Math.PI*2); ctx.fill(); ctx.stroke();
            ctx.fillStyle = "#fff"; ctx.font = "bold 14px Arial"; ctx.fillText("ACELERAR", 70, h - 65);

            ctx.fillStyle = this.colors.panel; ctx.fillRect(0, h - 60, w, 60);
            ctx.strokeStyle = this.colors.main; ctx.beginPath(); ctx.moveTo(0, h - 60); ctx.lineTo(w, h - 60); ctx.stroke();
            
            ctx.textAlign = "left"; ctx.fillStyle = "#fff"; ctx.font = "bold 18px 'Chakra Petch'";
            ctx.fillText(`CAÇAMBA: ${this.cargo.length}/${this.stats.maxCargo}`, 140, h - 25);
            ctx.fillStyle = this.colors.success; ctx.font = "bold 24px 'Russo One'";
            ctx.fillText(`R$ ${Math.floor(this.displayMoney).toLocaleString()}`, 300, h - 22);

            ctx.textAlign = "right"; ctx.fillStyle = this.colors.main;
            ctx.fillText(`DIST. BASE: ${Math.floor(distToBase)}m`, w - 20, h - 25);
            
            if (this.state === 'TOW_MODE') {
                ctx.textAlign="center"; ctx.fillStyle = this.colors.danger; ctx.font = "bold 30px 'Russo One'";
                ctx.fillText("MODO REBOQUE: VOLTE À BASE!", w/2, h/2);
            }
        },

        deliverCargo: function() {
            if (this.cargo.length > 0) {
                let total = this.cargo.reduce((a, b) => a + b, 0);
                let effBonus = Math.floor(total * (this.fuel / this.stats.maxFuel) * 0.3); 
                total += effBonus;

                if (this.currentMission && this.currentMission.active && this.currentMission.type === 'HEAVY LOAD') {
                    total = Math.floor(total * 1.5);
                }

                this.money += total;
                this.score += total / 10;
                
                this.xp += this.cargo.length * 100;
                if (this.xp >= this.level * 600) {
                    this.xp = 0; this.level++;
                    window.System.msg("NÍVEL " + this.level + " ALCANÇADO!");
                } else {
                    window.System.msg(`ENTREGA: R$${total}`);
                }
                
                this.cargo = [];
            }
        },

        handleOfficeAction: function(actionId) {
            const buyObj = (cost, callback) => {
                if (this.money >= cost && cost > 0) { this.money -= cost; callback(); if(window.Sfx) window.Sfx.coin(); return true; }
                if(window.Sfx) window.Sfx.error(); return false;
            };

            let fuelCost = Math.floor((this.stats.maxFuel - this.fuel) * 2);
            let repCost = Math.floor((100 - this.health) * 5);

            if (actionId === 'REFUEL') buyObj(fuelCost, () => this.fuel = this.stats.maxFuel);
            if (actionId === 'REPAIR') buyObj(repCost, () => { this.health = 100; });
            
            if (actionId === 'UPG_ENGINE') {
                let u = this.upgrades.engine;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }
            if (actionId === 'UPG_TANK') {
                let u = this.upgrades.tank;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }
            if (actionId === 'UPG_RADAR') {
                let u = this.upgrades.radar;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }
            if (actionId === 'UPG_TRUCK') {
                let u = this.upgrades.truck;
                if (u.lvl < u.max) buyObj(u.cost, () => { u.lvl++; u.cost = Math.floor(u.cost*1.5); this.applyStats(); });
            }

            if (actionId === 'EXIT') {
                this.changeState('EXIT_BASE_TRANSITION');
            }
        },

        applyStats: function() {
            this.stats.baseSpeed = 20 + (this.upgrades.engine.lvl * 5);
            this.stats.maxFuel = 100 + (this.upgrades.tank.lvl * 50);
            this.stats.radarRange = 150 + (this.upgrades.radar.lvl * 50);
            this.stats.wearRate = Math.max(0.1, 0.3 - (this.upgrades.truck.lvl * 0.05));
            if (this.fuel > this.stats.maxFuel) this.fuel = this.stats.maxFuel;
        },

        drawOverlay: function(ctx, w, h, title, sub) {
            ctx.fillStyle = "rgba(0, 5, 10, 0.95)"; ctx.fillRect(0, 0, w, h);
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

        cleanup: function() {
            this.stopAILoop();
            if (this.state === 'FRONT_AR_OFFICE') GestureOffice.destroy();
            if (this._deviceOrientationHandler) window.removeEventListener('deviceorientation', this._deviceOrientationHandler);
            if (this._deviceMotionHandler) window.removeEventListener('devicemotion', this._deviceMotionHandler);
        }
    };

    const regLoop = setInterval(() => {
        if(window.System && window.System.registerGame) {
            window.System.registerGame('ar_truck_sim', 'AR Ops Premium', '🚀', Game, {
                camera: 'environment',
                phases: [
                    { id: 'f1', name: 'MISSÃO AR GLOBAL', desc: 'Gerencie a frota AR Híbrida via HUD Premium.', reqLvl: 1 }
                ]
            });
            clearInterval(regLoop);
        }
    }, 100);

})();
