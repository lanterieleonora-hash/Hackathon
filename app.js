const canvas = document.getElementById('view');
const ctx = canvas.getContext('2d');
const viewContainer = document.getElementById('view-container');

// Stato
let currentView = 'USV'; 
let x = 0, y = 0, z = 0; 
let speed = 0, depth = 0, battery = 100, signal = -40;
let mode = 'NORMALE', link = 'OK', autonomous = false, emergencyLevel = 0;
let torchOn = false;
let frameCounter = 0;

// Variabili Joystick
let joyX = 0;
let joyY = 0;

// Entità (Pesci)
let entities = [];
function spawnEntities() {
    entities = [];
    for(let i=0; i<15; i++) {
        entities.push({
            x: Math.random() * 2000 - 1000,
            y: Math.random() * 400 + 100,
            z: Math.random() * 1000,
            type: 'pesce',
            speed: Math.random() * 1.5 + 0.5,
            offset: Math.random() * Math.PI * 2,
            size: Math.random() * 0.5 + 0.5
        });
    }
}
spawnEntities();

// --- CONTROLLI PC ---
const keys = {};
document.addEventListener('keydown', e => {
    keys[e.key] = true;
    if (e.code === 'Space') switchView();
    if (e.key.toLowerCase() === 'l') switchLight();
});
document.addEventListener('keyup', e => keys[e.key] = false);

// --- CONTROLLI MOBILE ---
function switchView() {
    currentView = (currentView === 'USV') ? 'ROV' : 'USV';
    document.getElementById('camera-label').textContent = `VISUALE: ${currentView}`;
    document.getElementById('target-name').textContent = currentView;
}

function switchLight() {
    torchOn = !torchOn;
}

document.getElementById('btn-view').addEventListener('click', switchView);
document.getElementById('btn-light').addEventListener('click', switchLight);

// Logica Joystick
const base = document.getElementById('joystick-base');
const stick = document.getElementById('joystick-stick');
let isDragging = false;
let baseRect;

if(base && stick) {
    base.addEventListener('touchstart', handleTouchStart, {passive: false});
    base.addEventListener('touchmove', handleTouchMove, {passive: false});
    base.addEventListener('touchend', handleTouchEnd);
    
    function handleTouchStart(e) {
        isDragging = true;
        baseRect = base.getBoundingClientRect();
        updateStick(e.touches[0]);
        e.preventDefault();
    }

    function handleTouchMove(e) {
        if(!isDragging) return;
        updateStick(e.touches[0]);
        e.preventDefault();
    }

    function handleTouchEnd() {
        isDragging = false;
        joyX = 0;
        joyY = 0;
        stick.style.transform = `translate(0px, 0px)`;
    }

    function updateStick(touch) {
        let touchX = touch.clientX - baseRect.left - (baseRect.width / 2);
        let touchY = touch.clientY - baseRect.top - (baseRect.height / 2);
        
        const maxDist = baseRect.width / 2 - 30; // 30 è raggio stick
        const distance = Math.sqrt(touchX*touchX + touchY*touchY);
        
        if(distance > maxDist) {
            touchX = (touchX / distance) * maxDist;
            touchY = (touchY / distance) * maxDist;
        }
        
        stick.style.transform = `translate(${touchX}px, ${touchY}px)`;
        
        // Normalizza tra -1.0 e 1.0
        joyX = touchX / maxDist;
        joyY = touchY / maxDist;
    }
}

// --- LOGICA EMERGENZE ---
document.getElementById('confirmEmergency').onclick = () => {
    emergencyLevel = parseInt(document.getElementById('emergencySelect').value);
    document.getElementById('emergencyPanel').classList.add('hidden');
    
    if (emergencyLevel === 0) {
        autonomous = false;
        mode = 'NORMALE';
        link = 'OK';
        viewContainer.classList.remove('emergency-vibe');
    } else if (emergencyLevel === 1) {
        autonomous = false; 
        mode = 'ATTENZIONE';
        link = 'INSTABILE';
    } else {
        autonomous = true;
        viewContainer.classList.add('emergency-vibe');
    }
};

document.getElementById('emergencyBtn').onclick = () => {
    document.getElementById('emergencyPanel').classList.toggle('hidden');
};

function handleEmergencyLogic() {
    switch (emergencyLevel) {
        case 2: mode = 'LOST LINK'; speed = 0; break;
        case 3: mode = 'RISALITA'; depth = Math.max(5, depth - 0.3); break;
        case 4: 
            mode = 'RIENTRO'; 
            x *= 0.98; z *= 0.98; 
            depth = Math.max(0, depth - 0.2); 
            break;
        case 5: mode = 'GRAVE'; link = 'SATELLITARE'; break;
    }
}

// --- LOOP PRINCIPALE ---
function update() {
    frameCounter++;

    if (!autonomous) {
        let moveX = 0;
        let moveZ = 0;
        let moveDepth = 0;

        // Input PC
        if (currentView === 'USV') {
            if (keys['ArrowUp']) moveZ += 5;
            if (keys['ArrowDown']) moveZ -= 5;
        } else {
            if (keys['ArrowDown']) moveDepth += 0.5;
            if (keys['ArrowUp']) moveDepth -= 0.5;
        }
        if (keys['ArrowLeft']) moveX -= 5;
        if (keys['ArrowRight']) moveX += 5;

        // Input Mobile (Si somma/sovrascrive all'input PC se attivo)
        if (Math.abs(joyX) > 0.05 || Math.abs(joyY) > 0.05) {
            moveX = joyX * 5;
            if (currentView === 'USV') {
                moveZ = -joyY * 5; // Su joystick (negativo) muove avanti
            } else {
                moveDepth = joyY * 0.5; // Giù joystick (positivo) aumenta profondità
            }
        }

        // Applica movimenti finali
        x += moveX;
        z += moveZ;
        if (currentView === 'ROV') {
            depth = Math.max(0, Math.min(100, depth + moveDepth));
        }

    } else {
        handleEmergencyLogic();
    }

    // Calcolo segnale e batteria
    signal = -40 - (Math.sqrt(x*x + z*z) / 50) - (emergencyLevel * 10);
    battery -= 0.002;
    
    if (emergencyLevel === 1) {
        if (frameCounter % 4 === 0) draw();
    } else {
        draw();
    }

    updateTelemetry();
    requestAnimationFrame(update);
}

// --- RENDERING ---
function drawFish(ex, ey, scale, s) {
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(scale * s, scale * s);
    ctx.beginPath();
    ctx.ellipse(0, 0, 20, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-15, 0); ctx.lineTo(-30, -10); ctx.lineTo(-30, 10);
    ctx.fill();
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (currentView === 'USV') drawSurface(); else drawUnderwater();

    if (emergencyLevel === 1) {
        ctx.fillStyle = "#ffaa00";
        ctx.font = "bold 14px Courier New";
        ctx.fillText("⚠️ VIDEO LINK DEGRADED", 20, 80);
    }
    if (emergencyLevel === 2) {
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.fillRect(0,0,canvas.width, canvas.height);
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.font = "20px Courier New";
        ctx.fillText("NO SIGNAL - RECONNECTING...", canvas.width/2, canvas.height/2);
        ctx.textAlign = "start";
    }
    if (emergencyLevel === 5) {
        let opacity = Math.abs(Math.sin(Date.now()/200)) * 0.2;
        ctx.fillStyle = `rgba(255, 0, 0, ${opacity})`;
        ctx.fillRect(0,0,canvas.width, canvas.height);
    }
}

function drawSurface() {
    ctx.fillStyle = '#87CEEB'; ctx.fillRect(0,0,canvas.width, 225);
    ctx.fillStyle = '#005c7a'; ctx.fillRect(0, 225, canvas.width, 225);
    ctx.fillStyle = '#444';
    for(let i=0; i<5; i++) {
        let sz = ((i * 400 - z) % 2000); if(sz < 0) sz += 2000;
        let scale = 400 / (sz + 400);
        let sx = (canvas.width/2) + (i*300 - 600 - x) * scale;
        ctx.beginPath(); ctx.moveTo(sx, 225); ctx.lineTo(sx+50*scale, 225-100*scale); ctx.lineTo(sx+100*scale, 225); ctx.fill();
    }
}

function drawUnderwater() {
    let blueVal = Math.max(0, 180 - depth * 1.8);
    let greenVal = Math.max(0, 100 - depth * 1);
    ctx.fillStyle = `rgb(0, ${greenVal/4}, ${blueVal/2})`;
    ctx.fillRect(0,0,canvas.width, canvas.height);

    if (depth > 80) {
        let sandY = canvas.height - (depth - 80) * 4;
        let sandAlpha = torchOn ? 1.0 : 0.15;
        ctx.fillStyle = `rgba(194, 178, 128, ${sandAlpha})`;
        ctx.fillRect(0, sandY, canvas.width, canvas.height - sandY);
    }

    if (torchOn) {
        let g = ctx.createRadialGradient(400,225,20,400,225,280);
        g.addColorStop(0,'rgba(255,255,220,0.3)'); g.addColorStop(1,'transparent');
        ctx.fillStyle = g; ctx.fillRect(0,0,canvas.width, canvas.height);
    }

    entities.forEach(e => {
        let ez = (e.z - z) % 2000; if(ez < 0) ez += 2000;
        let scale = 500 / (ez + 500);
        let ex = (canvas.width/2) + (e.x - x) * scale;
        let ey = (canvas.height/2) + Math.sin(Date.now()/1000 + e.offset)*50;
        let visibility = torchOn ? 1.0 : (1.0 - (depth/110));
        ctx.fillStyle = `rgba(255, 140, 0, ${Math.max(0.05, visibility)})`;
        drawFish(ex, ey, scale, e.size);
    });
}

function updateTelemetry() {
    const sVal = Math.round(signal);
    const signalLabel = document.getElementById('signal');
    const signalBox = signalLabel.parentElement;
    const viewCanvas = document.getElementById('view');

    if (sVal <= -100) {
        signalBox.classList.add('critical');
        
    } else {
        signalBox.classList.remove('critical');
        
    }

    document.getElementById('pos').textContent = `(${Math.round(x)}, ${Math.round(depth)}, ${Math.round(z)})`;
    signalLabel.textContent = sVal;
    document.getElementById('battery').textContent = Math.floor(battery) + '%';
    document.getElementById('depth').textContent = depth.toFixed(1);
    document.getElementById('link').textContent = link;
    document.getElementById('mode').textContent = mode;
}

update();
