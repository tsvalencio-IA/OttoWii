/* =================================================================
   CORE DO SISTEMA (CÉREBRO) - REMASTERED
   ================================================================= */

// 1. AUDIO GLOBAL (COM VARIAÇÃO DE PITCH PARA REALISMO)
window.Sfx = {
    ctx: null,
    init: () => { window.AudioContext = window.AudioContext || window.webkitAudioContext; window.Sfx.ctx = new AudioContext(); },
    play: (f, t, d, v=0.1) => {
        if(!window.Sfx.ctx) return;
        const o = window.Sfx.ctx.createOscillator(); 
        const g = window.Sfx.ctx.createGain();
        
        // Variação orgânica (pitch wobble)
        const detune = (Math.random() - 0.5) * 100; // +/- 50 cents
        o.detune.value = detune;

        o.type=t; o.frequency.value=f; 
        g.gain.setValueAtTime(v, window.Sfx.ctx.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, window.Sfx.ctx.currentTime+d);
        
        o.connect(g); g.connect(window.Sfx.ctx.destination); 
        o.start(); o.stop(window.Sfx.ctx.currentTime+d);
    },
    hover: () => window.Sfx.play(600 + Math.random()*50, 'sine', 0.1, 0.05),
    click: () => window.Sfx.play(1200, 'sine', 0.15, 0.1),
    coin: () => { window.Sfx.play(1500,'square',0.1, 0.05); setTimeout(()=>window.Sfx.play(2000,'square',0.1, 0.05), 80); },
    hit: () => {
        // Som de impacto mais grave e sujo
        window.Sfx.play(150 - Math.random()*30,'sawtooth',0.15, 0.3);
        window.Sfx.play(100,'square',0.1,0.3);
    },
    crash: () => {
        window.Sfx.play(80,'sawtooth',0.5, 0.5);
        window.Sfx.play(50,'square',0.6, 0.5);
    },
    skid: () => window.Sfx.play(60 + Math.random()*20,'sawtooth',0.1,0.1)
};

// 2. GRÁFICOS GLOBAIS (VISUAL CYBER & FEEDBACK)
window.Gfx = {
    shakeIntensity: 0,
    trails: [], // Histórico de posições para rastro

    map: (p,w,h) => ({x:w-(p.x/640*w), y:p.y/480*h}),
    
    // Efeito de Tremor de Tela
    shake: (amount) => { window.Gfx.shakeIntensity = amount; },

    updateShake: (ctx) => {
        if(window.Gfx.shakeIntensity > 0) {
            const dx = (Math.random() - 0.5) * window.Gfx.shakeIntensity;
            const dy = (Math.random() - 0.5) * window.Gfx.shakeIntensity;
            ctx.translate(dx, dy);
            window.Gfx.shakeIntensity *= 0.9; // Decaimento
            if(window.Gfx.shakeIntensity < 0.5) window.Gfx.shakeIntensity = 0;
        }
    },

    // --- LUVAS DE PILOTO (KART) - ESTILO "PRO" ---
    drawSteeringHands: (ctx, pose, w, h) => {
        if(!pose) return;
        const kp=pose.keypoints, lw=kp.find(k=>k.name==='left_wrist'), rw=kp.find(k=>k.name==='right_wrist');
        
        if(lw&&rw&&lw.score>0.3&&rw.score>0.3){
            const p1=window.Gfx.map(lw,w,h), p2=window.Gfx.map(rw,w,h);
            
            // Eixo do Volante (Holográfico)
            ctx.beginPath(); ctx.moveTo(p1.x,p1.y); ctx.lineTo(p2.x,p2.y);
            ctx.strokeStyle='rgba(0,255,255,0.3)'; ctx.lineWidth=6; ctx.setLineDash([5,5]); ctx.stroke(); ctx.setLineDash([]);
            
            const r=w*0.065; 
            
            // Renderização da Luva (Gradiente)
            const drawGlove = (x, y, label) => {
                const grad = ctx.createRadialGradient(x, y, r*0.2, x, y, r);
                grad.addColorStop(0, '#ff4444');
                grad.addColorStop(1, '#990000');
                
                // Sombra da luva
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.beginPath(); ctx.arc(x+5, y+5, r, 0, Math.PI*2); ctx.fill();

                ctx.fillStyle = grad; 
                ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
                
                // Brilho especular
                ctx.fillStyle = 'rgba(255,255,255,0.4)';
                ctx.beginPath(); ctx.arc(x - r*0.3, y - r*0.3, r*0.25, 0, Math.PI*2); ctx.fill();

                ctx.lineWidth=3; ctx.strokeStyle='#fff'; ctx.stroke();
                
                // Texto
                ctx.fillStyle="#fff"; ctx.font="bold 20px 'Chakra Petch'"; ctx.textAlign="center"; ctx.textBaseline="middle";
                ctx.fillText(label,x,y);
            };

            drawGlove(p1.x, p1.y, "L");
            drawGlove(p2.x, p2.y, "R");
        }
    },

    // --- ESQUELETO "NEON CYBER" ---
    drawSkeleton: (ctx, pose, w, h) => {
        if(!pose) return;
        
        // Efeito "Glow"
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#00ffff';
        ctx.lineCap='round'; 
        ctx.strokeStyle='rgba(0, 255, 255, 0.8)'; 
        ctx.lineWidth=w*0.008;
        
        const kp=pose.keypoints; const get=n=>kp.find(k=>k.name===n);
        
        const bone=(n1,n2)=>{
            const p1=get(n1), p2=get(n2);
            if(p1&&p2&&p1.score>0.3&&p2.score>0.3){
                const m1=window.Gfx.map(p1,w,h), m2=window.Gfx.map(p2,w,h);
                ctx.beginPath(); ctx.moveTo(m1.x,m1.y); ctx.lineTo(m2.x,m2.y); ctx.stroke();
            }
        };
        
        // Desenha ossos
        bone('left_shoulder','left_elbow'); bone('left_elbow','left_wrist');
        bone('right_shoulder','right_elbow'); bone('right_elbow','right_wrist');
        bone('left_shoulder','right_shoulder');

        // Reset Glow
        ctx.shadowBlur = 0;

        // Juntas (Joints) como esferas de energia
        [get('left_wrist'), get('right_wrist'), get('nose')].forEach(p => {
            if(p && p.score > 0.3) {
                const m = window.Gfx.map(p, w, h);
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(m.x, m.y, 6, 0, Math.PI*2); ctx.fill();
                ctx.fillStyle = 'rgba(0,255,255,0.5)';
                ctx.beginPath(); ctx.arc(m.x, m.y, 10, 0, Math.PI*2); ctx.fill();
            }
        });

        // --- LUVAS DE BOXE (Melhoradas) ---
        const lw=get('left_wrist'), rw=get('right_wrist'), s=w*0.08;
        
        const drawBoxGlove = (p) => {
            const m = window.Gfx.map(p, w, h);
            const grad = ctx.createRadialGradient(m.x-10, m.y-10, 5, m.x, m.y, s);
            grad.addColorStop(0, '#ff5555'); grad.addColorStop(1, '#aa0000');
            
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(m.x, m.y, s, 0, Math.PI*2); ctx.fill();
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
            
            // Detalhe (Dedão)
            ctx.fillStyle = '#880000';
            ctx.beginPath(); ctx.arc(m.x + s*0.6, m.y + s*0.2, s*0.3, 0, Math.PI*2); ctx.fill();
        };

        if(lw&&lw.score>0.3) drawBoxGlove(lw);
        if(rw&&rw.score>0.3) drawBoxGlove(rw);
    }
};

// 3. SISTEMA OPERACIONAL
window.System = {
    video:null, canvas:null, ctx:null, detector:null,
    activeGame:null, loopId:null, sens:1.0, games:{},

    registerGame: (id, name, icon, logicObj, settings={camOpacity:0.3, showWheel:false}) => {
        window.System.games[id] = { name:name, icon:icon, logic:logicObj, sets:settings };
        console.log("Jogo Registrado:", name);
    },

    boot: async () => {
        document.getElementById('boot-log').innerText="Iniciando Câmera e IA..."; window.Sfx.init(); window.Sfx.click();
        try {
            const stream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:640},height:{ideal:480}},audio:false});
            window.System.video=document.getElementById('video-source'); window.System.video.srcObject=stream;
            document.getElementById('webcam').srcObject=stream;
            await new Promise(r=>window.System.video.onloadedmetadata=r); window.System.video.play(); document.getElementById('webcam').play();
            
            document.getElementById('screen-safety').classList.add('hidden');
            document.getElementById('screen-load').classList.remove('hidden');

            await tf.setBackend('webgl');
            window.System.detector = await poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {modelType:poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING});

            window.System.canvas=document.getElementById('game-canvas'); window.System.ctx=window.System.canvas.getContext('2d');
            window.System.resize(); window.addEventListener('resize',window.System.resize);

            document.getElementById('screen-load').classList.add('hidden');
            window.System.renderMenu();
            window.System.menu();
        } catch(e){ alert("Erro Câmera: " + e.message); }
    },

    renderMenu: () => {
        const grid = document.getElementById('channel-grid'); grid.innerHTML='';
        const keys = Object.keys(window.System.games);
        for(const id of keys){
            const g = window.System.games[id];
            const d=document.createElement('div'); d.className='channel'; d.onclick=()=>window.System.launch(id);
            d.innerHTML=`<div class="channel-icon">${g.icon}</div><div class="channel-name">${g.name}</div>`;
            grid.appendChild(d);
        }
        for(let i=0; i < (4 - keys.length); i++) grid.innerHTML+=`<div class="channel channel-empty"></div>`;
    },

    menu: () => {
        window.System.stopGame();
        document.getElementById('screen-menu').classList.remove('hidden');
        document.getElementById('screen-over').classList.add('hidden');
        document.getElementById('game-ui').classList.add('hidden');
        document.getElementById('webcam').style.opacity='0';
    },

    launch: (id) => {
        window.Sfx.click(); const g = window.System.games[id]; if(!g) return;
        window.System.activeGame = g;
        document.getElementById('screen-menu').classList.add('hidden');
        document.getElementById('game-ui').classList.remove('hidden');
        document.getElementById('webcam').style.opacity = g.sets.camOpacity;
        document.getElementById('ui-wheel').style.opacity = g.sets.showWheel ? '1':'0';
        g.logic.init(); window.System.loop();
    },

    loop: async () => {
        if(!window.System.activeGame) return;
        const ctx=window.System.ctx, w=window.System.canvas.width, h=window.System.canvas.height;
        let pose=null; try{ const p=await window.System.detector.estimatePoses(window.System.video,{flipHorizontal:false}); if(p.length>0) pose=p[0]; }catch(e){}
        
        ctx.save();
        window.Gfx.updateShake(ctx); // Aplica shake global
        
        const s = window.System.activeGame.logic.update(ctx, w, h, pose);
        ctx.restore();

        document.getElementById('hud-score').innerText=s;
        window.System.loopId = requestAnimationFrame(window.System.loop);
    },

    stopGame: () => { window.System.activeGame=null; if(window.System.loopId) cancelAnimationFrame(window.System.loopId); },
    home: () => { window.Sfx.click(); window.System.menu(); },
    gameOver: (s) => { window.System.stopGame(); window.Sfx.crash(); document.getElementById('final-score').innerText=s; document.getElementById('game-ui').classList.add('hidden'); document.getElementById('screen-over').classList.remove('hidden'); },
    resize: () => { if(window.System.canvas){window.System.canvas.width=window.innerWidth; window.System.canvas.height=window.innerHeight;} },
    setSens: (v) => window.System.sens=parseFloat(v),
    
    // Msg System: Agora usa classe CSS para animação pop
    msg: (t) => { 
        const el=document.getElementById('game-msg'); 
        el.innerText=t; 
        el.classList.add('pop');
        setTimeout(()=> {
            el.classList.remove('pop');
            setTimeout(()=>el.innerText='', 200);
        }, 1500); 
    }
};
