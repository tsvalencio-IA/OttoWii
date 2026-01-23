// =====================================================
// KART DO OTTO – HYBRID FUSION GOLD MASTER
// STATUS: PHYSICS (NEW) + RENDER (OLD)
// ENGINEER: CODE 177
// =====================================================


(function() {


// =========================
// MINI MAPA (SCOPED SAFE)
// =========================
let minimapPoints = [];

function buildMiniMap(segments) {
    minimapPoints = [];
    let x = 0;
    let y = 0;
    let dir = -Math.PI / 2;

    segments.forEach(seg => {
        dir += seg.curve * 0.002;
        x += Math.cos(dir) * 4;
        y += Math.sin(dir) * 4;
        minimapPoints.push({ x, y });
    });
}



    // -----------------------------------------------------------------
    // 1. CONFIGURAÇÃO DE ENGENHARIA (TUNING FINAL - FEEL ADJUSTED)
    // -----------------------------------------------------------------
    const CONF = {
        // Física de Velocidade
        MAX_SPEED: 235,         // Velocidade base (controlável)
        TURBO_MAX_SPEED: 420,   // Velocidade turbo (adrenalina)
        ACCEL: 1.5,
        FRICTION: 0.985,
OFFROAD_DECEL: 0.93,
        
        // Física de Curva (Ajuste Fino de Feel)
        CENTRIFUGAL_FORCE: 0.19, // Reduzido (era 0.38) - Permite correção mas pune inatividade
        STEER_AUTHORITY: 0.18,   // Aumentado (era 0.12) - Resposta rápida
        GRIP_CARVING: 1.25,      // Bônus de tração ao fazer a curva certa
        GRIP_DRIFT: 0.94,        // Tração durante drift
        
        // Colisão & Gameplay
        HITBOX_WIDTH: 0.4,       // Largura de colisão justa
        CRASH_PENALTY: 0.55,     // Perda de velocidade ao bater
        
        // Input & UX
        DEADZONE: 0.05,
        INPUT_SMOOTHING: 0.22,   // Aumentado (era 0.12) - Menos lag, mais snap
        TURBO_ZONE_Y: 0.35,      // Área superior da tela para gesto
        
        // Render (Adaptado para suportar o visual antigo)
        DRAW_DISTANCE: 60,       // Distância de renderização (Old Value)
        FOV: 100
    };

    // -----------------------------------------------------------------
    // 2. VARIÁVEIS DE ESTADO (MEMORY SAFE)
    // -----------------------------------------------------------------
    let particles = [];
    let nitroBtn = null;
    let lapPopupTimer = 0;
let lapPopupText = "";

    // Dados da Pista
    const SEGMENT_LENGTH = 200; 
    const RUMBLE_LENGTH = 3;    
    let segments = [];
    let trackLength = 0;

    const Logic = {
        // Estado Físico (NEW)
        speed: 0, 
        pos: 0,            
        playerX: 0,        
        steer: 0,          
        targetSteer: 0,      
        
        // Mecânicas (NEW)
        nitro: 100,
        turboLock: false,
        driftState: 0, driftDir: 0, driftCharge: 0, mtStage: 0, boostTimer: 0,    
        
        // Corrida (NEW)
        state: 'race', 
        finishTimer: 0,
        lap: 1, totalLaps: 3,
        time: 0, rank: 1, score: 0,
        
        // Visuais (NEW properties, compatible with OLD render)
        visualTilt: 0,    
        bounce: 0,
        skyColor: 0, 
        stats: { drifts: 0, overtakes: 0, crashes: 0 },
        
        // Input (NEW)
        inputState: 0, 
        gestureTimer: 0,
        virtualWheel: { x:0, y:0, r:0, opacity:0 },
        
        rivals: [],

        // -------------------------------------------------------------
// CONSTRUÇÃO DE PISTA (OLD FILE - OTTO CIRCUIT LAYOUT)
// -------------------------------------------------------------
buildTrack: function() {
    segments = [];

    const addRoad = (enter, curve, y) => {
        const startIdx = segments.length;
        for(let i = 0; i < enter; i++) {
            const isDark = Math.floor(segments.length / RUMBLE_LENGTH) % 2;
            segments.push({
                curve: curve,
                y: y,
                color: isDark ? 'dark' : 'light',
                obs: []
            });
        }
        return startIdx;
    };

    const addProp = (index, type, offset) => {
        if (segments[index]) {
            segments[index].obs.push({ type: type, x: offset });
        }
    };

    // TRAÇADO "OTTO CIRCUIT" (Layout Rico do Arquivo Antigo)
    addRoad(50, 0, 0); 

    let sHook = addRoad(20, 0.5, 0);
    addProp(sHook, 'sign', -1.5);

    addRoad(20, 1.5, 0);             

    let sApex1 = addRoad(30, 3.5, 0);
    addProp(sApex1 + 5, 'cone', 0.9);

    addRoad(20, 1.0, 0);             

    addRoad(40, 0, 0);

    let sChicane = addRoad(20, 0, 0);
    addProp(sChicane, 'sign', 1.5); 

    addRoad(15, -2.5, 0);
    addProp(segments.length - 5, 'cone', -0.9);

    addRoad(10, 0, 0);      

    addRoad(15, 2.5, 0);
    addProp(segments.length - 5, 'cone', 0.9);

    addRoad(20, 0, 0);    

    let sLoop = addRoad(30, 0, 0);
    addProp(sLoop, 'sign', 1.5);
    addProp(sLoop + 5, 'sign', 1.5);

    addRoad(20, -1.0, 0); 
    addRoad(60, -3.5, 0); 
    addRoad(20, -1.0, 0); 

    let sHazards = addRoad(70, 0, 0);
    addProp(sHazards + 15, 'cone', 0);
    addProp(sHazards + 35, 'cone', -0.6);
    addProp(sHazards + 55, 'cone', 0.6);

    addRoad(40, 1.2, 0);

    // comprimento total da pista
    trackLength = segments.length * SEGMENT_LENGTH;

    // >>> PASSO 5: gerar mini mapa real da pista <<<
    buildMiniMap(segments);
},
        // -------------------------------------------------------------
        // SETUP DE UI (NEW FILE - INPUT SOVEREIGNTY)
        // -------------------------------------------------------------
        setupUI: function() {
            // Remove instâncias antigas para evitar vazamento
            const oldBtn = document.getElementById('nitro-btn-kart');
            if(oldBtn) oldBtn.remove();

            nitroBtn = document.createElement('div');
            nitroBtn.id = 'nitro-btn-kart';
            nitroBtn.innerHTML = "NITRO";
            Object.assign(nitroBtn.style, {
                position: 'absolute', top: '35%', right: '20px', width: '85px', height: '85px',
                borderRadius: '50%', background: 'radial-gradient(#ffaa00, #cc5500)', border: '4px solid #fff',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: "sans-serif", fontWeight: "bold", fontSize: '16px', zIndex: '100',
                boxShadow: '0 0 20px rgba(255, 100, 0, 0.5)', cursor: 'pointer', transition: 'transform 0.1s, filter 0.1s',
                userSelect: 'none', touchAction: 'manipulation'
            });

            // Lógica Touch/Click Robusta (New File Logic)
            const toggleTurbo = (e) => {
                if(e) { e.preventDefault(); e.stopPropagation(); }
                if(this.nitro > 5) {
                    this.turboLock = !this.turboLock;
                    nitroBtn.style.transform = this.turboLock ? 'scale(0.95)' : 'scale(1)';
                    nitroBtn.style.filter = this.turboLock ? 'brightness(1.5)' : 'brightness(1)';
                    if(this.turboLock) window.Sfx.play(600, 'square', 0.1, 0.1);
                }
            };
            nitroBtn.addEventListener('touchstart', toggleTurbo, {passive:false});
            nitroBtn.addEventListener('mousedown', toggleTurbo);
            
            document.getElementById('game-ui').appendChild(nitroBtn);
        },

        // -------------------------------------------------------------
        // INIT (NEW FILE LOGIC PRESERVED)
        // -------------------------------------------------------------
        init: function() { 
            this.buildTrack(); // Uses Old Scenario
            this.setupUI();    // Uses New Input Logic
            
            this.speed = 0; this.pos = 0; this.playerX = 0; this.steer = 0;
            this.state = 'race'; this.lap = 1; this.score = 0;
            this.driftState = 0; this.nitro = 100;
            
            // Rivais com IA Humanizada (New Logic Params)
            this.rivals = [
                { pos: 1000, x: -0.4, speed: 0, color: '#2ecc71', name: 'Luigi', aggro: 0.03, mistakeProb: 0.01 },
                { pos: 800,  x: 0.4,  speed: 0, color: '#3498db', name: 'Toad',  aggro: 0.025, mistakeProb: 0.005 },
                { pos: 1200, x: 0,    speed: 0, color: '#e74c3c', name: 'Bowser', aggro: 0.04, mistakeProb: 0.02 }
            ];

            window.System.msg("LARGADA!"); 
        },

        // =============================================================
        // GAME LOOP PRINCIPAL
        // =============================================================
        update: function(ctx, w, h, pose) {
            
            // 1. UPDATE DETERMINÍSTICO (Física e Lógica - NEW)
            this.updatePhysics(w, h, pose);
            
            // 2. RENDER VISUAL (Cenário e Efeitos - OLD)
            this.renderWorld(ctx, w, h);
            
            // 3. RENDER UI (HUD - OLD VISUALS, NEW DATA)
            this.renderUI(ctx, w, h);

            return Math.floor(this.score);
        },

        // -------------------------------------------------------------
        // ENGINE DE FÍSICA (NEW FILE - SOVEREIGN LOGIC)
        // -------------------------------------------------------------
        updatePhysics: function(w, h, pose) {
            const d = Logic;
            
            // --- A. INPUT SYSTEM ---
            let detected = 0;
            let pLeft = null, pRight = null;

            // Leitura de Pose (Vision)
            if (d.state === 'race' && pose && pose.keypoints) {
                const lw = pose.keypoints.find(k => k.name === 'left_wrist');
                const rw = pose.keypoints.find(k => k.name === 'right_wrist');
                
                if (lw && lw.score > 0.3) { pLeft = window.Gfx.map(lw, w, h); detected++; }
                if (rw && rw.score > 0.3) { pRight = window.Gfx.map(rw, w, h); detected++; }

                // Gesto Turbo (Mãos para cima)
                let avgY = h;
                if (detected === 2) avgY = (pLeft.y + pRight.y) / 2;
                else if (detected === 1) avgY = (pLeft ? pLeft.y : pRight.y);

                if (avgY < h * CONF.TURBO_ZONE_Y) {
                    d.gestureTimer++;
                    if (d.gestureTimer === 12 && d.nitro > 5) { 
                        d.turboLock = !d.turboLock; 
                        window.System.msg(d.turboLock ? "TURBO ON" : "TURBO OFF");
                    }
                } else {
                    d.gestureTimer = 0;
                }
            }

            // Cálculo do Volante
            if (detected === 2) {
                d.inputState = 2;
                const dx = pRight.x - pLeft.x;
                const dy = pRight.y - pLeft.y;
                const rawAngle = Math.atan2(dy, dx);
                d.targetSteer = (Math.abs(rawAngle) > CONF.DEADZONE) ? rawAngle * 2.3 : 0;
                
                // Feedback UI
                d.virtualWheel.x = (pLeft.x + pRight.x) / 2;
                d.virtualWheel.y = (pLeft.y + pRight.y) / 2;
                d.virtualWheel.r = Math.hypot(dx, dy) / 2;
                d.virtualWheel.opacity = 1;
            } else {
                d.inputState = 0;
                d.targetSteer = 0;
                d.virtualWheel.opacity *= 0.9;
            }
            
            // Suavização Input
            d.steer += (d.targetSteer - d.steer) * CONF.INPUT_SMOOTHING;
            d.steer = Math.max(-1.2, Math.min(1.2, d.steer));

            if(nitroBtn) nitroBtn.style.opacity = (detected > 0) ? 0.3 : 1.0;

            // --- B. FÍSICA DE VEÍCULO ---
            let currentMax = CONF.MAX_SPEED;
            
            // Gestão de Turbo
            if (d.turboLock && d.nitro > 0) {
                currentMax = CONF.TURBO_MAX_SPEED;
                d.nitro -= 0.6;
                if(d.nitro <= 0) { d.nitro = 0; d.turboLock = false; }
            } else {
                d.turboLock = false;
                d.nitro = Math.min(100, d.nitro + 0.15); // Recarga passiva
            }
            if(d.boostTimer > 0) { currentMax += 80; d.boostTimer--; }

            // Aceleração
            const hasGas = (d.inputState > 0 || d.turboLock);
            if (hasGas && d.state === 'race') {
               d.speed += (currentMax - d.speed) * 0.075;
            } else {
                d.speed *= CONF.FRICTION; // Desaceleração natural
            }

            // Punição Offroad
            const isOffRoad = Math.abs(d.playerX) > 2.2;
            if (isOffRoad) d.speed *= CONF.OFFROAD_DECEL;

            // --- C. DINÂMICA DE CURVA (CORE) ---
            const segIdx = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const seg = segments[segIdx] || segments[0];
            const speedRatio = d.speed / CONF.MAX_SPEED;

            // 1. Inércia (Centrífuga): Sempre ativa, empurra para fora
            // [MODIFIED] Added playerX scaling to punish bad driving
            // --- CURVAS AJUSTADAS REALISTICAMENTE ---
// Centrífuga suavizada com scaling por posição
const centrifugal = -seg.curve * (speedRatio * speedRatio) * (CONF.CENTRIFUGAL_FORCE * 0.5); 
// 0.5 reduz efeito geral

let dynamicGrip = CONF.GRIP_CARVING * 0.65; 
if(Math.abs(d.steer) < 0.05) dynamicGrip = 0;
if(d.driftState === 1) dynamicGrip = CONF.GRIP_DRIFT * 0.75; 

// Scaling por posição para suavizar puxão se perto da borda
const edgeFactor = 1 - Math.min(Math.abs(d.playerX) / 4.5, 0.8); 

const playerForce =
    d.steer *
    CONF.STEER_AUTHORITY *
    dynamicGrip *
    speedRatio *
    0.9 *
    edgeFactor;

// Cancela parte da centrífuga quando o jogador está corrigindo a curva
const counterSteerFactor = 1 - Math.min(Math.abs(d.steer), 0.9);
const correctedCentrifugal = centrifugal * counterSteerFactor;

d.playerX += playerForce + correctedCentrifugal * edgeFactor;




            // Limites da Pista
            if(d.playerX < -4.5) { d.playerX = -4.5; d.speed *= 0.95; }
            if(d.playerX > 4.5)  { d.playerX = 4.5;  d.speed *= 0.95; }

            // Mecânica de Drift
            if (d.driftState === 0) {
                // Entrada no Drift (Hard Turn + Speed)
                if (Math.abs(d.steer) > 0.9 && speedRatio > 0.6 && !isOffRoad) {
                    d.driftState = 1; d.driftDir = Math.sign(d.steer);
                    d.driftCharge = 0; d.bounce = -8; window.Sfx.skid();
                }
            } else {
                // Manutenção do Drift
                if (Math.abs(d.steer) < 0.2 || speedRatio < 0.3 || isOffRoad) {
                    // Saída (Boost se carregado)
                    if (d.mtStage > 0) {
                        d.boostTimer = d.mtStage * 35;
                        window.System.msg("BOOST!");
                        window.Sfx.play(800, 'square', 0.2, 0.2);
                        d.stats.drifts++;
                    }
                    d.driftState = 0; d.mtStage = 0;
                } else {
                    // Carregamento
                    d.driftCharge++;
                    if(d.driftCharge > 80) d.mtStage = 2; else if(d.driftCharge > 35) d.mtStage = 1;
                }
            }

            // --- D. COLISÃO DETERMINÍSTICA ---
            // Verifica obstáculos no segmento atual e no próximo (Lookahead curto)
            const hitbox = 0.22; // hitbox realista, alinhada ao sprite
for(let i=0; i<1; i++) { // apenas segmento atual

    const checkIdx = (segIdx + i) % segments.length;
    const checkSeg = segments[checkIdx];
    checkSeg.obs.forEach(o => {
        if(o.x > 10) return; // ignorar obstáculos removidos
        // colisão só se jogador estiver dentro da faixa visível da estrada
        if(Math.abs(d.playerX - o.x) < hitbox && Math.abs(d.playerX) < 4.5) {
            d.speed *= CONF.CRASH_PENALTY;
            d.stats.crashes++;
            o.x = 999;
            d.bounce = -15;
            window.Sfx.crash();
            window.Gfx.shake(15);
        }
    });
}


            // --- E. LOOP & RIVAIS ---
            d.pos += d.speed;
            while (d.pos >= trackLength) {
    d.pos -= trackLength;
    d.lap++;

    // POPUP DE VOLTA
    if (d.lap <= d.totalLaps) {
        lapPopupText = `VOLTA ${d.lap}/${d.totalLaps}`;
        lapPopupTimer = 120; // duração do aviso
        window.System.msg(lapPopupText);
    }

    if(d.lap > d.totalLaps && d.state === 'race') {
        d.state = 'finished';
        window.System.msg(d.rank === 1 ? "VITÓRIA!" : "FIM!");
        if(d.rank===1) window.Sfx.play(1000,'square',0.5,1);
    }
}

            while(d.pos < 0) d.pos += trackLength;

            // Atualiza Rivais
            let pAhead = 0;
            d.rivals.forEach(r => {
                let dist = r.pos - d.pos;
                if(dist > trackLength/2) dist -= trackLength;
                if(dist < -trackLength/2) dist += trackLength;

                let targetS = CONF.MAX_SPEED * 0.45;
                // Rubber Banding
                if(dist > 1200) targetS *= 0.82;
                if(dist < -1200) targetS *= 0.95;
                
                r.speed += (targetS - r.speed) * r.aggro;
                r.pos += r.speed;
                if(r.pos >= trackLength) r.pos -= trackLength;

                const rSeg = segments[Math.floor(r.pos/SEGMENT_LENGTH)%segments.length];
                let idealLine = -(rSeg.curve * 0.6);
                if (Math.random() < r.mistakeProb) idealLine = -(rSeg.curve * -0.5); // Erro humano
                r.x += (idealLine - r.x) * 0.05;

                let playerTotal = d.pos + (d.lap * trackLength);
let rivalTotal = r.pos + ((d.lap - 1) * trackLength);


if (rivalTotal > playerTotal) pAhead++;

            });
            d.rank = 1 + pAhead;

            // Timers & Score
            d.time++;
            d.score += d.speed * 0.01;
            d.bounce *= 0.8;
            if(isOffRoad) { d.bounce = Math.sin(d.time)*5; window.Gfx.shake(2); }
            d.visualTilt += (d.steer * 15 - d.visualTilt) * 0.1;
            
            if (d.state === 'finished') {
                d.speed *= 0.95;
                if(d.speed < 2 && d.finishTimer === 0) {
                    d.finishTimer = 1;
                    setTimeout(()=> window.System.gameOver(Math.floor(d.score)), 2000);
                }
            }
        },

        // -------------------------------------------------------------
        // RENDER: VISUAL PURO (OLD FILE - SCENERY & 3D PROJECTION)
        // -------------------------------------------------------------
        renderWorld: function(ctx, w, h) {
            const d = Logic;
            const cx = w / 2;
            const horizon = h * 0.40;

            // 1. CÉU E PARALLAX (Old)
            const currentSegIndex = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
            const currentSeg = segments[currentSegIndex] || segments[0];
            const isOffRoad = Math.abs(d.playerX) > 2.2;

            let topSky = d.skyColor === 0 ? "#3388ff" : "#663399";
            let botSky = d.skyColor === 0 ? "#88ccff" : "#ffaa00";
            const gradSky = ctx.createLinearGradient(0, 0, 0, horizon);
            gradSky.addColorStop(0, topSky); gradSky.addColorStop(1, botSky);
            ctx.fillStyle = gradSky; ctx.fillRect(0, 0, w, horizon);

            // Montanhas Parallax (Old)
            const bgOffset = (currentSeg.curve * 30) + (d.steer * 20);
            ctx.fillStyle = d.skyColor === 0 ? '#44aa44' : '#331133';
            ctx.beginPath(); ctx.moveTo(0, horizon);
            for(let i=0; i<=12; i++) {
                const mx = (w/12 * i) - (bgOffset * 0.5);
                const my = horizon - 50 - Math.abs(Math.sin(i + d.pos*0.0001))*40;
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(w, horizon); ctx.fill();

            // Chão (Old)
            ctx.fillStyle = isOffRoad ? '#336622' : '#448833';
            ctx.fillRect(0, horizon, w, h-horizon);

            // 2. ESTRADA PSEUDO-3D (Old Algorithm)
            let drawDistance = 100; // Mais longe para ver curvas
            let dx = 0;
            let camX = d.playerX * (w * 0.4);
            let segmentCoords = [];

            for(let n = 0; n < drawDistance; n++) {
                const segIdx = (currentSegIndex + n) % segments.length;
                const seg = segments[segIdx];
                dx += (seg.curve * 0.8);
                
                const z = n * 20; 
                const scale = 1 / (1 + (z * 0.05));
                const scaleNext = 1 / (1 + ((z+20) * 0.05));
                const screenY = horizon + ((h - horizon) * scale);
                const screenYNext = horizon + ((h - horizon) * scaleNext);
                const screenX = cx - (camX * scale) - (dx * z * scale * 2);
                const screenXNext = cx - (camX * scaleNext) - ((dx + seg.curve*0.8) * (z+20) * scaleNext * 2);
                const roadWidth = (w * 3) * scale;
                const roadWidthNext = (w * 3) * scaleNext;
                
                segmentCoords.push({ x: screenX, y: screenY, scale: scale, index: segIdx, z: z });

                // Desenha Trapézios
                const grassColor = (seg.color === 'dark') ? (isOffRoad?'#336622':'#448833') : (isOffRoad?'#3a7528':'#55aa44');
                const roadColor = (seg.color === 'dark') ? '#666' : '#636363';
                const rumbleColor = (seg.color === 'dark') ? '#c00' : '#fff';

                ctx.fillStyle = grassColor; ctx.fillRect(0, screenYNext, w, screenY - screenYNext);
                
                // Rumble
                ctx.fillStyle = rumbleColor;
                ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2 - roadWidth*0.1, screenY); ctx.lineTo(screenX + roadWidth/2 + roadWidth*0.1, screenY); ctx.lineTo(screenXNext + roadWidthNext/2 + roadWidthNext*0.1, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2 - roadWidthNext*0.1, screenYNext); ctx.fill();
                
                // Road
                ctx.fillStyle = roadColor;
                ctx.beginPath(); ctx.moveTo(screenX - roadWidth/2, screenY); ctx.lineTo(screenX + roadWidth/2, screenY); ctx.lineTo(screenXNext + roadWidthNext/2, screenYNext); ctx.lineTo(screenXNext - roadWidthNext/2, screenYNext); ctx.fill();
            }

            // 3. SPRITES (Painter's Algorithm - Old)
            for(let n = drawDistance-1; n >= 0; n--) {
                const coord = segmentCoords[n];
                const seg = segments[coord.index];
                
                // Rivais (Mapped to New Logic properties)
                d.rivals.forEach(r => {
                    let rRelPos = r.pos - d.pos;
                    if(rRelPos < -trackLength/2) rRelPos += trackLength;
                    if(rRelPos > trackLength/2) rRelPos -= trackLength;
                    
                    let distInSegs = Math.floor(rRelPos / SEGMENT_LENGTH);
                    if (Math.abs(distInSegs - n) < 1.5 && n > 1) {
                        const rScale = coord.scale;
                        const rX = coord.x + (r.x * (w * 3) * rScale / 2);
                        const rY = coord.y;
                        
                        ctx.save(); ctx.translate(rX, rY); ctx.scale(rScale * 12, rScale * 12);
                        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 3, 0, 0, Math.PI*2); ctx.fill();
                        ctx.fillStyle = r.color; ctx.fillRect(-6, -8, 12, 6);
                        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -12, 4, 0, Math.PI*2); ctx.fill();
                        ctx.restore();
                    }
                });

                // Obstáculos (Mapped to Old Types)
                if(seg.obs.length > 0) {
                    seg.obs.forEach(o => {
                        // Skip if "removed" by New Physics (o.x = 999)
                        if (o.x > 500) return;

                        const sScale = coord.scale;
                        const sX = coord.x + (o.x * (w * 3) * sScale / 2);
                        const sY = coord.y;
                        const size = (w * 0.22) * sScale;

                        if (o.type === 'cone') {
                            ctx.fillStyle = '#ff5500'; ctx.beginPath(); ctx.moveTo(sX, sY - size); ctx.lineTo(sX - size*0.3, sY); ctx.lineTo(sX + size*0.3, sY); ctx.fill();
                        } else {
                            ctx.fillStyle = '#f1c40f'; ctx.fillRect(sX - size/2, sY - size, size, size*0.6);
                            ctx.fillStyle = '#000'; ctx.textAlign='center'; ctx.font = `bold ${size*0.4}px Arial`;
                            ctx.fillText(seg.curve > 0 ? ">>>" : "<<<", sX, sY - size*0.2);
                        }
                    });
                }
            }

            // 4. JOGADOR (Old High-Fidelity Sprite)
            const carScale = w * 0.0055;
            this.drawKartSprite(ctx, cx, h*0.85 + d.bounce, carScale, d.steer, d.visualTilt, d);

            // Gerador de Partículas Visual (Injecting Visual FX omitted by New Logic)
            if (d.driftState === 1 && d.time % 4 === 0) {
                 const pX = cx + (d.playerX * w * 0.4) + (d.driftDir * 50);
                 const color = d.mtStage === 2 ? '#ff5500' : (d.mtStage === 1 ? '#00ffff' : '#ffffaa');
                 particles.push({ x: pX, y: h * 0.9, vx: -d.driftDir * (2+Math.random()*4), vy: -2-Math.random()*3, c: color, l: 20 });
            }

            // Render Partículas
            particles.forEach((p, i) => { 
                p.x += p.vx; p.y += p.vy; p.l--; 
                if(p.l<=0) {
                    particles.splice(i,1); 
                } else { 
                    ctx.fillStyle=p.c; ctx.globalAlpha = p.l / 50; 
                    ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill(); 
                    ctx.globalAlpha = 1.0; 
                } 
            });
        },

        // HELPER: Desenha Sprite do Kart (From OLD - Richer Details)
        drawKartSprite: function(ctx, cx, y, carScale, steer, tilt, d) {
            ctx.save(); ctx.translate(cx, y); ctx.scale(carScale, carScale);
            
            let visualRotation = tilt * 0.02; 
            if (d.driftState === 1) visualRotation += (d.driftDir * 0.3);
            
            ctx.rotate(visualRotation);

            // Sombra
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.ellipse(0, 35, 60, 15, 0, 0, Math.PI*2); ctx.fill();

            // Chassi
            const gradBody = ctx.createLinearGradient(-30, 0, 30, 0);
            gradBody.addColorStop(0, '#cc0000'); gradBody.addColorStop(0.5, '#ff4444'); gradBody.addColorStop(1, '#cc0000');
            ctx.fillStyle = gradBody;
            ctx.beginPath(); ctx.moveTo(-25, -30); ctx.lineTo(25, -30); ctx.lineTo(40, 10); ctx.lineTo(10, 35); ctx.lineTo(-10, 35); ctx.lineTo(-40, 10); ctx.fill();

            // Turbo Flame (Checked against New Logic State)
            if (d.turboLock || d.boostTimer > 0) {
                const fireSize = 10 + Math.random() * 15;
                ctx.fillStyle = (d.mtStage === 2 || d.turboLock) ? '#00ffff' : '#ffaa00';
                ctx.beginPath(); ctx.arc(-20, -30, fireSize, 0, Math.PI*2); ctx.fill();
                ctx.beginPath(); ctx.arc(20, -30, fireSize, 0, Math.PI*2); ctx.fill();
            }

            // Rodas
            const wheelAngle = steer * 0.8;
            ctx.fillStyle = '#111';
            const drawWheel = (wx, wy) => {
                ctx.save(); ctx.translate(wx, wy); ctx.rotate(wheelAngle); ctx.fillRect(-12, -15, 24, 30); ctx.fillStyle = '#666'; ctx.fillRect(-5, -5, 10, 10); ctx.fillStyle = '#111'; ctx.restore();
            };
            drawWheel(-45, 15); drawWheel(45, 15); ctx.fillRect(-50, -25, 20, 30); ctx.fillRect(30, -25, 20, 30);

            // Piloto
            ctx.save(); ctx.translate(0, -10); ctx.rotate(steer * 0.3);
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -20, 18, 0, Math.PI*2); ctx.fill();
            ctx.fillStyle = '#333'; ctx.fillRect(-15, -25, 30, 8);
            ctx.fillStyle = 'red'; ctx.font='bold 12px Arial'; ctx.textAlign='center'; ctx.fillText('M', 0, -32);
            ctx.restore(); ctx.restore(); 
        },

        // -------------------------------------------------------------
        // UI VISUAL (OLD FILE - BETTER AESTHETICS)
        // -------------------------------------------------------------
        renderUI: function(ctx, w, h) {
    const d = Logic;

    if (d.state === 'race') {

        // =========================
        // POPUP CENTRAL DE VOLTA
        // =========================
        if (lapPopupTimer > 0) {
            ctx.save();
            ctx.globalAlpha = Math.min(1, lapPopupTimer / 30);
            ctx.fillStyle = '#00ffff';
            ctx.font = "bold 48px 'Russo One'";
            ctx.textAlign = 'center';
            ctx.fillText(lapPopupText, w / 2, h * 0.45);
            ctx.restore();
            lapPopupTimer--;
        }

        // =========================
        // VOLTAS (EMBAIXO)
        // =========================
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(20, h - 50, 120, 30);
        ctx.fillStyle = '#fff';
        ctx.font = "bold 14px Arial";
        ctx.fillText(`VOLTA ${d.lap}/${d.totalLaps}`, 30, h - 30);

        // =========================
        // VELOCÍMETRO
        // =========================
        const hudX = w - 80;
        const hudY = h - 60;

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.beginPath();
        ctx.arc(hudX, hudY, 55, 0, Math.PI * 2);
        ctx.fill();

        const rpm = Math.min(1, d.speed / CONF.TURBO_MAX_SPEED);
        ctx.beginPath();
        ctx.arc(hudX, hudY, 50, Math.PI, Math.PI + Math.PI * rpm);
        ctx.lineWidth = 6;
        ctx.strokeStyle = (d.turboLock || d.boostTimer > 0) ? '#00ffff' : '#ff3300';
        ctx.stroke();

        ctx.fillStyle = '#fff';
        ctx.textAlign = 'center';
        ctx.font = "bold 36px 'Russo One'";
        ctx.fillText(Math.floor(d.speed), hudX, hudY + 10);
        ctx.font = "10px Arial";
        const totalRacers = d.rivals.length + 1;
ctx.font = "bold 14px Arial";
ctx.fillText(`POSIÇÃO`, hudX, hudY + 22);
ctx.font = "bold 18px 'Russo One'";
ctx.fillText(`${d.rank} / ${totalRacers}`, hudX, hudY + 42);
        // =========================
        // BARRA NITRO
        // =========================
        const nW = 220;
        ctx.fillStyle = '#111';
        ctx.fillRect(w / 2 - nW / 2, 20, nW, 20);
        ctx.fillStyle = d.turboLock ? '#00ffff' : (d.nitro > 20 ? '#00aa00' : '#ff3300');
        ctx.fillRect(w / 2 - nW / 2 + 2, 22, (nW - 4) * (d.nitro / 100), 16);

        if (!minimapPoints || minimapPoints.length < 2) return;

        // =========================
// MINI MAPA REAL DA PISTA
// =========================
// =========================
// MINI MAPA REAL (COMPACTO E FIXO)
// =========================
const mapSize = 120;
// canto superior esquerdo (não conflita com nada)
const mapX = 20;
const mapY = 90;
// fundo
ctx.save();
ctx.globalAlpha = 0.6;
ctx.fillStyle = '#000';
ctx.fillRect(mapX - 6, mapY - 6, mapSize + 12, mapSize + 12);
ctx.globalAlpha = 1;

// viewport
ctx.beginPath();
ctx.rect(mapX, mapY, mapSize, mapSize);
ctx.clip();

// normalização
const bounds = minimapPoints.reduce((b, p) => ({
    minX: Math.min(b.minX, p.x),
    maxX: Math.max(b.maxX, p.x),
    minY: Math.min(b.minY, p.y),
    maxY: Math.max(b.maxY, p.y),
}), {
    minX: Infinity, maxX: -Infinity,
    minY: Infinity, maxY: -Infinity
});

const scale = Math.min(
    mapSize / (bounds.maxX - bounds.minX),
    mapSize / (bounds.maxY - bounds.minY)
) * 0.85;

ctx.translate(
    mapX + mapSize / 2,
    mapY + mapSize / 2
);
ctx.scale(scale, scale);
// rotação do mapa conforme a curva atual da pista
const segIdxMap = Math.floor(d.pos / SEGMENT_LENGTH) % segments.length;
const segMap = segments[segIdxMap];
ctx.rotate(-segMap.curve * 0.8);
ctx.translate(
    -(bounds.minX + bounds.maxX) / 2,
    -(bounds.minY + bounds.maxY) / 2
);

// pista
ctx.strokeStyle = '#aaa';
ctx.lineWidth = 2;
ctx.beginPath();
minimapPoints.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
});
ctx.stroke();

// jogador
const pi = Math.floor((d.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
ctx.fillStyle = '#00ffff';
ctx.beginPath();
ctx.arc(minimapPoints[pi].x, minimapPoints[pi].y, 5, 0, Math.PI * 2);
ctx.fill();

// rivais
d.rivals.forEach(r => {
    const ri = Math.floor((r.pos / trackLength) * minimapPoints.length) % minimapPoints.length;
    ctx.fillStyle = r.color;
    ctx.beginPath();
    ctx.arc(minimapPoints[ri].x, minimapPoints[ri].y, 4, 0, Math.PI * 2);
    ctx.fill();
});

ctx.restore();

        // =========================
        // VOLANTE VIRTUAL ESPORTIVO
        // =========================
        if (d.virtualWheel.opacity > 0.01) {
            const vw = d.virtualWheel;

            ctx.save();
            ctx.globalAlpha = vw.opacity;
            ctx.translate(vw.x, vw.y);

            ctx.lineWidth = 8;
            ctx.strokeStyle = '#222';
            ctx.beginPath();
            ctx.arc(0, 0, vw.r, 0, Math.PI * 2);
            ctx.stroke();

            ctx.lineWidth = 4;
            ctx.strokeStyle = '#00ffff';
            ctx.beginPath();
            ctx.arc(0, 0, vw.r - 8, 0, Math.PI * 2);
            ctx.stroke();

            ctx.rotate(d.steer * 1.4);
            ctx.fillStyle = '#ff3300';
            ctx.fillRect(-4, -vw.r + 10, 8, 22);

            ctx.fillStyle = '#111';
            ctx.beginPath();
            ctx.arc(0, 0, 10, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            ctx.globalAlpha = 1;
        }

    } else {

        // =========================
        // TELA FINAL
        // =========================
        ctx.fillStyle = "rgba(0,0,0,0.85)";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#fff";
        ctx.textAlign = "center";

        const title = d.rank === 1 ? "VITÓRIA!" : `${d.rank}º LUGAR`;
        ctx.font = "bold 60px 'Russo One'";
        ctx.fillText(title, w / 2, h * 0.3);
    }
}

    };

    if(window.System) {
        window.System.registerGame('drive', 'Otto Kart GP', '🏎️', Logic, {
            camOpacity: 0.4, 
            showWheel: false
        });
    }
})()
