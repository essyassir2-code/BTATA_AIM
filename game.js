/*
  FILE 3: game.js
  Complete aim trainer with 9 training modes and extensive features
*/

(function() {
  // ========== DOM Elements ==========
  const canvas = document.getElementById('aimCanvas');
  const ctx = canvas.getContext('2d');
  
  // Stats displays
  const headerScore = document.getElementById('headerScore');
  const headerAccuracy = document.getElementById('headerAccuracy');
  const headerHigh = document.getElementById('headerHigh');
  const statScore = document.getElementById('statScore');
  const statHits = document.getElementById('statHits');
  const statShots = document.getElementById('statShots');
  const statAccuracy = document.getElementById('statAccuracy');
  const streakCountSpan = document.getElementById('streakCount');
  const feedbackDiv = document.getElementById('feedbackMsg');
  
  // Settings
  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityVal = document.getElementById('sensitivityVal');
  const targetColorPicker = document.getElementById('targetColorPicker');
  const targetSwatch = document.getElementById('targetSwatch');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeVal = document.getElementById('volumeVal');
  const soundToggle = document.getElementById('soundToggle');
  const flashToggle = document.getElementById('flashToggle');
  
  // Buttons
  const resetSessionBtn = document.getElementById('resetSessionBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');
  
  // ========== Game State ==========
  let currentMode = 'tracking';
  let difficulty = 'normal';
  let sensitivity = 1.0;
  let targetColor = '#ff3366';
  let crosshairType = 'dot';
  let soundEnabled = true;
  let hitFlashEnabled = true;
  let volume = 0.28;
  
  let score = 0, hits = 0, shots = 0, streak = 0, highScore = 0;
  let trackingTarget = { x: 300, y: 250, size: 48, vx: 2.0, vy: 1.7 };
  let flickTargets = [];
  let customTargets = [];
  let survivalHealth = 100;
  let survivalWave = 1;
  let movingTargets = [];
  let precisionTarget = null;
  let speedTargets = [];
  let headshotActive = false;
  
  let animationId = null;
  let canvasWidth = 1100, canvasHeight = 600;
  let mouseX = -100, mouseY = -100;
  let feedbackTimeout = null;
  
  // Audio context
  let audioCtx = null;
  
  // ========== Audio Functions ==========
  function initAudio() {
    if (!audioCtx && soundEnabled) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  
  function playSoftGunshot() {
    if (!soundEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume * 0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
    gain.connect(audioCtx.destination);
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 340;
    osc.connect(gain);
    osc.start();
    osc.stop(now + 0.09);
  }
  
  function playMissSound() {
    if (!soundEnabled || !audioCtx) return;
    const gain = audioCtx.createGain();
    gain.gain.value = volume * 0.12;
    gain.connect(audioCtx.destination);
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 160;
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.07);
  }
  
  function unlockAudio() {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    } else if (!audioCtx && soundEnabled) {
      initAudio();
      if (audioCtx) audioCtx.resume();
    }
  }
  
  canvas.addEventListener('click', unlockAudio);
  
  // ========== Difficulty Config ==========
  function getDifficultyConfig() {
    const diffs = {
      beginner: { speed: 0.55, size: 56, pointsMult: 0.7, spawnDelay: 500 },
      normal: { speed: 1.0, size: 48, pointsMult: 1.0, spawnDelay: 400 },
      veteran: { speed: 1.5, size: 42, pointsMult: 1.4, spawnDelay: 300 },
      elite: { speed: 2.0, size: 36, pointsMult: 1.8, spawnDelay: 200 },
      legend: { speed: 2.6, size: 30, pointsMult: 2.3, spawnDelay: 150 }
    };
    return diffs[difficulty] || diffs.normal;
  }
  
  function applyDifficulty() {
    const config = getDifficultyConfig();
    if (currentMode === 'tracking' && trackingTarget) {
      const baseSpeed = 1.8;
      trackingTarget.vx = (trackingTarget.vx > 0 ? baseSpeed * config.speed : -baseSpeed * config.speed);
      trackingTarget.vy = (trackingTarget.vy > 0 ? baseSpeed * config.speed * 0.9 : -baseSpeed * config.speed * 0.9);
      trackingTarget.size = config.size;
    }
  }
  
  // ========== UI Updates ==========
  function updateUI() {
    const accuracy = shots === 0 ? 0 : ((hits / shots) * 100).toFixed(0);
    headerScore.innerText = score;
    headerAccuracy.innerText = accuracy + '%';
    statScore.innerText = score;
    statHits.innerText = hits;
    statShots.innerText = shots;
    statAccuracy.innerText = accuracy + '%';
    streakCountSpan.innerText = streak;
    
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('btata_aim_highscore', highScore);
      headerHigh.innerText = highScore;
    }
  }
  
  function showFeedback(message, isHit = true) {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackDiv.innerHTML = message;
    feedbackDiv.style.color = isHit ? '#a0ffb0' : '#ffa098';
    feedbackTimeout = setTimeout(() => { feedbackDiv.innerHTML = ''; }, 350);
  }
  
  // ========== Target Generation ==========
  function randomPosition(padding = 55, objSize = 48) {
    const maxX = canvasWidth - objSize - padding;
    const maxY = canvasHeight - objSize - padding;
    return {
      x: Math.max(padding, padding + Math.random() * (maxX - padding)),
      y: Math.max(padding, padding + Math.random() * (maxY - padding))
    };
  }
  
  function generateTargetForMode() {
    const config = getDifficultyConfig();
    const size = config.size;
    
    switch(currentMode) {
      case 'flick':
      case 'reaction':
      case 'precision':
        flickTargets = [{ id: Date.now(), x: randomPosition(60, size).x, y: randomPosition(60, size).y, size: size }];
        break;
      case 'speed':
        speedTargets = [{ id: Date.now(), x: randomPosition(50, size).x, y: randomPosition(50, size).y, size: size, timeToLive: 60 }];
        break;
      case 'moving':
        movingTargets = [{ id: Date.now(), x: randomPosition(50, size).x, y: randomPosition(50, size).y, size: size, vx: (Math.random() - 0.5) * 3, vy: (Math.random() - 0.5) * 3 }];
        break;
      case 'headshot':
        flickTargets = [{ id: Date.now(), x: randomPosition(60, size).x, y: randomPosition(60, size).y, size: size, headshotZone: true }];
        break;
      default:
        if (currentMode !== 'tracking') {
          flickTargets = [{ id: Date.now(), x: randomPosition(60, size).x, y: randomPosition(60, size).y, size: size }];
        }
    }
  }
  
  // ========== Hit Registration ==========
  function registerHit(isHeadshot = false) {
    const config = getDifficultyConfig();
    let basePoints = 10;
    switch(currentMode) {
      case 'tracking': basePoints = 8; break;
      case 'flick': basePoints = 12; break;
      case 'reaction': basePoints = 20; break;
      case 'precision': basePoints = 25; break;
      case 'speed': basePoints = 15; break;
      case 'moving': basePoints = 18; break;
      case 'custom': basePoints = 10; break;
      case 'headshot': basePoints = isHeadshot ? 30 : 10; break;
      case 'survival': basePoints = 15; break;
    }
    
    const addPoints = Math.floor(basePoints * config.pointsMult);
    score += addPoints;
    hits++;
    shots++;
    streak++;
    updateUI();
    
    const hitMsg = isHeadshot ? `HEADSHOT! +${addPoints}` : `+${addPoints}`;
    showFeedback(hitMsg, true);
    
    if (soundEnabled) playSoftGunshot();
    if (hitFlashEnabled) {
      canvas.style.transition = '0.04s';
      canvas.style.filter = 'brightness(1.2)';
      setTimeout(() => canvas.style.filter = '', 60);
    }
    
    if (currentMode === 'tracking') {
      trackingTarget.vx += trackingTarget.vx > 0 ? 0.2 : -0.2;
      trackingTarget.vy += trackingTarget.vy > 0 ? 0.15 : -0.15;
      const maxSpeed = 6.0;
      trackingTarget.vx = Math.min(maxSpeed, Math.max(-maxSpeed, trackingTarget.vx));
      trackingTarget.vy = Math.min(maxSpeed, Math.max(-maxSpeed, trackingTarget.vy));
    } else {
      generateTargetForMode();
      applyDifficulty();
    }
  }
  
  function registerMiss() {
    shots++;
    streak = 0;
    updateUI();
    
    if (currentMode === 'survival') {
      survivalHealth -= 10;
      if (survivalHealth <= 0) {
        showFeedback('💀 GAME OVER - RESETTING', false);
        resetSession();
        survivalHealth = 100;
      }
    }
    
    showFeedback('miss', false);
    if (soundEnabled) playMissSound();
  }
  
  // ========== Hit Detection ==========
  function handleCanvasClick(e) {
    unlockAudio();
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clickX = (e.clientX - rect.left) * scaleX;
    const clickY = (e.clientY - rect.top) * scaleY;
    
    if (currentMode === 'tracking' && trackingTarget) {
      const t = trackingTarget;
      if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
        registerHit();
      } else {
        registerMiss();
      }
    } 
    else if (currentMode === 'headshot' && flickTargets.length) {
      const t = flickTargets[0];
      if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
        const boxSize = t.size;
        const headY = t.y + boxSize * 0.15;
        const isHead = clickY >= headY && clickY <= headY + boxSize * 0.35;
        registerHit(isHead);
      } else {
        registerMiss();
      }
    }
    else if (flickTargets.length && (currentMode === 'flick' || currentMode === 'reaction' || currentMode === 'precision')) {
      const t = flickTargets[0];
      if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
        registerHit();
      } else {
        registerMiss();
      }
    }
    else if (currentMode === 'speed' && speedTargets.length) {
      let hitIdx = -1;
      for (let i = 0; i < speedTargets.length; i++) {
        const t = speedTargets[i];
        if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
          hitIdx = i;
          break;
        }
      }
      if (hitIdx !== -1) {
        speedTargets.splice(hitIdx, 1);
        registerHit();
      } else {
        registerMiss();
      }
    }
    else if (currentMode === 'moving' && movingTargets.length) {
      let hitIdx = -1;
      for (let i = 0; i < movingTargets.length; i++) {
        const t = movingTargets[i];
        if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
          hitIdx = i;
          break;
        }
      }
      if (hitIdx !== -1) {
        movingTargets.splice(hitIdx, 1);
        if (movingTargets.length === 0) generateTargetForMode();
        registerHit();
      } else {
        registerMiss();
      }
    }
    else {
      registerMiss();
    }
  }
  
  // ========== Movement Updates ==========
  function updateTrackingMovement() {
    const speedFactor = 0.7 + sensitivity * 0.4;
    let newX = trackingTarget.x + trackingTarget.vx * speedFactor;
    let newY = trackingTarget.y + trackingTarget.vy * speedFactor;
    
    if (newX <= 15 || newX + trackingTarget.size >= canvasWidth - 15) {
      trackingTarget.vx *= -1;
      newX = trackingTarget.x + trackingTarget.vx * speedFactor;
    }
    if (newY <= 15 || newY + trackingTarget.size >= canvasHeight - 25) {
      trackingTarget.vy *= -1;
      newY = trackingTarget.y + trackingTarget.vy * speedFactor;
    }
    
    trackingTarget.x = Math.min(Math.max(newX, 15), canvasWidth - trackingTarget.size - 15);
    trackingTarget.y = Math.min(Math.max(newY, 15), canvasHeight - trackingTarget.size - 20);
  }
  
  function updateMovingTargets() {
    for (let t of movingTargets) {
      t.x += t.vx;
      t.y += t.vy;
      if (t.x <= 10 || t.x + t.size >= canvasWidth - 10) t.vx *= -1;
      if (t.y <= 10 || t.y + t.size >= canvasHeight - 20) t.vy *= -1;
      t.x = Math.min(Math.max(t.x, 10), canvasWidth - t.size - 10);
      t.y = Math.min(Math.max(t.y, 10), canvasHeight - t.size - 20);
    }
  }
  
  function updateSpeedTargets() {
    for (let i = speedTargets.length - 1; i >= 0; i--) {
      speedTargets[i].timeToLive--;
      if (speedTargets[i].timeToLive <= 0) {
        speedTargets.splice(i, 1);
        registerMiss();
      }
    }
    if (speedTargets.length === 0) generateTargetForMode();
  }
  
  // ========== Drawing ==========
  function drawBackground() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = 'rgba(70, 120, 200, 0.08)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvasWidth; i += 45) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvasHeight);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(canvasWidth, i);
      ctx.stroke();
    }
  }
  
  function drawTarget() {
    ctx.shadowBlur = 10;
    ctx.shadowColor = targetColor;
    
    if (currentMode === 'tracking' && trackingTarget) {
      ctx.fillStyle = targetColor;
      ctx.beginPath();
      ctx.ellipse(trackingTarget.x + trackingTarget.size/2, trackingTarget.y + trackingTarget.size/2, trackingTarget.size/2, trackingTarget.size/2, 0, 0, 2*Math.PI);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.floor(trackingTarget.size * 0.4)}px monospace`;
      ctx.fillText('◉', trackingTarget.x + trackingTarget.size/2 - 8, trackingTarget.y + trackingTarget.size/2 + 6);
    }
    
    if (flickTargets.length && (currentMode === 'flick' || currentMode === 'reaction' || currentMode === 'precision' || currentMode === 'headshot')) {
      const t = flickTargets[0];
      ctx.fillStyle = targetColor;
      ctx.beginPath();
      ctx.roundRect(t.x, t.y, t.size, t.size, 10);
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.floor(t.size * 0.4)}px monospace`;
      if (currentMode === 'headshot') {
        ctx.fillText('🎯', t.x + t.size * 0.3, t.y + t.size * 0.7);
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillRect(t.x + t.size * 0.25, t.y + t.size * 0.15, t.size * 0.5, t.size * 0.3);
      } else {
        ctx.fillText(currentMode === 'flick' ? '⚡' : (currentMode === 'reaction' ? '!' : '●'), t.x + t.size * 0.32, t.y + t.size * 0.72);
      }
    }
    
    if (currentMode === 'speed' && speedTargets.length) {
      for (let t of speedTargets) {
        ctx.fillStyle = targetColor;
        ctx.beginPath();
        ctx.rect(t.x, t.y, t.size, t.size);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.font = `bold ${Math.floor(t.size * 0.35)}px monospace`;
        ctx.fillText('⚡', t.x + t.size * 0.3, t.y + t.size * 0.7);
      }
    }
    
    if (currentMode === 'moving' && movingTargets.length) {
      for (let t of movingTargets) {
        ctx.fillStyle = targetColor;
        ctx.beginPath();
        ctx.ellipse(t.x + t.size/2, t.y + t.size/2, t.size/2, t.size/2, 0, 0, 2*Math.PI);
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.fillText('↻', t.x + t.size * 0.35, t.y + t.size * 0.7);
      }
    }
    
    ctx.shadowBlur = 0;
  }
  
  function drawCrosshair() {
    if (mouseX < 0 || mouseX > canvasWidth || mouseY < 0 || mouseY > canvasHeight) return;
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffffcc';
    ctx.lineWidth = 2;
    
    switch(crosshairType) {
      case 'dot':
        ctx.arc(mouseX, mouseY, 4, 0, 2*Math.PI);
        ctx.fill();
        break;
      case 'cross':
        ctx.moveTo(mouseX-12, mouseY); ctx.lineTo(mouseX-4, mouseY);
        ctx.moveTo(mouseX+4, mouseY); ctx.lineTo(mouseX+12, mouseY);
        ctx.moveTo(mouseX, mouseY-12); ctx.lineTo(mouseX, mouseY-4);
        ctx.moveTo(mouseX, mouseY+4); ctx.lineTo(mouseX, mouseY+12);
        ctx.stroke();
        break;
      case 'circle':
        ctx.arc(mouseX, mouseY, 9, 0, 2*Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 3, 0, 2*Math.PI);
        ctx.fill();
        break;
      case 'plus':
        ctx.fillRect(mouseX-2, mouseY-8, 4, 16);
        ctx.fillRect(mouseX-8, mouseY-2, 16, 4);
        break;
    }
  }
  
  function drawHealthBar() {
    if (currentMode === 'survival') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(20, 20, 200, 12);
      ctx.fillStyle = survivalHealth > 50 ? '#4ade80' : '#fbbf24';
      ctx.fillRect(20, 20, 200 * (survivalHealth / 100), 12);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`SURVIVAL ${survivalHealth}%`, 20, 18);
    }
  }
  
  // ========== Render Loop ==========
  function render() {
    drawBackground();
    drawTarget();
    drawCrosshair();
    drawHealthBar();
    
    if (currentMode === 'tracking') updateTrackingMovement();
    if (currentMode === 'moving') updateMovingTargets();
    if (currentMode === 'speed') updateSpeedTargets();
    
    animationId = requestAnimationFrame(render);
  }
  
  // ========== Mode & Settings ==========
  function setMode(mode) {
    currentMode = mode;
    score = 0;
    hits = 0;
    shots = 0;
    streak = 0;
    survivalHealth = 100;
    updateUI();
    
    if (mode === 'tracking') {
      trackingTarget = { x: canvasWidth/2 - 24, y: canvasHeight/2 - 24, size: 48, vx: 2.0, vy: 1.6 };
      flickTargets = [];
    } else {
      trackingTarget = null;
      generateTargetForMode();
      applyDifficulty();
    }
    
    document.querySelectorAll('.mode-tab').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    showFeedback(`${mode.toUpperCase()} MODE`, true);
  }
  
  function setDifficulty(diff) {
    difficulty = diff;
    applyDifficulty();
    document.querySelectorAll('.diff-option').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-diff="${diff}"]`).classList.add('active');
  }
  
  function resetSession() {
    score = 0;
    hits = 0;
    shots = 0;
    streak = 0;
    survivalHealth = 100;
    updateUI();
    if (currentMode === 'tracking') {
      trackingTarget = { x: canvasWidth/2 - 24, y: canvasHeight/2 - 24, size: 48, vx: 2.0, vy: 1.6 };
    } else {
      generateTargetForMode();
    }
    showFeedback('Session reset', false);
  }
  
  function resetAllStats() {
    score = 0;
    hits = 0;
    shots = 0;
    streak = 0;
    highScore = 0;
    localStorage.removeItem('btata_aim_highscore');
    updateUI();
    headerHigh.innerText = '0';
    showFeedback('All stats wiped', false);
  }
  
  // ========== Resize Handler ==========
  function handleResize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvasWidth = rect.width;
    canvasHeight = rect.height;
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    if (currentMode === 'tracking') {
      trackingTarget.x = Math.min(Math.max(trackingTarget.x, 20), canvasWidth - trackingTarget.size);
      trackingTarget.y = Math.min(Math.max(trackingTarget.y, 20), canvasHeight - trackingTarget.size);
    } else {
      generateTargetForMode();
    }
  }
  
  // ========== Event Listeners ==========
  function initEventListeners() {
    canvas.addEventListener('click', handleCanvasClick);
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseX = (e.clientX - rect.left) * (canvasWidth / rect.width);
      mouseY = (e.clientY - rect.top) * (canvasHeight / rect.height);
    });
    canvas.addEventListener('mouseleave', () => { mouseX = -100; });
    window.addEventListener('resize', handleResize);
    
    sensitivitySlider.addEventListener('input', (e) => {
      sensitivity = parseFloat(e.target.value);
      sensitivityVal.innerText = sensitivity.toFixed(2);
    });
    
    targetColorPicker.addEventListener('input', (e) => {
      targetColor = e.target.value;
      targetSwatch.style.background = targetColor;
    });
    targetSwatch.addEventListener('click', () => targetColorPicker.click());
    
    volumeSlider.addEventListener('input', (e) => {
      volume = parseInt(e.target.value) / 100;
      volumeVal.innerText = e.target.value + '%';
    });
    
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggle.classList.toggle('active');
      if (soundEnabled) initAudio();
    });
    
    flashToggle.addEventListener('click', () => {
      hitFlashEnabled = !hitFlashEnabled;
      flashToggle.classList.toggle('active');
    });
    
    document.querySelectorAll('.mode-tab').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    
    document.querySelectorAll('.diff-option').forEach(btn => {
      btn.addEventListener('click', () => setDifficulty(btn.dataset.diff));
    });
    
    document.querySelectorAll('.cross-option').forEach(btn => {
      btn.addEventListener('click', () => {
        crosshairType = btn.dataset.cross;
        document.querySelectorAll('.cross-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    resetSessionBtn.addEventListener('click', resetSession);
    resetAllBtn.addEventListener('click', resetAllStats);
  }
  
  // ========== Initialization ==========
  function init() {
    soundToggle.classList.add('active');
    flashToggle.classList.add('active');
    
    const savedHigh = localStorage.getItem('btata_aim_highscore');
    if (savedHigh) highScore = parseInt(savedHigh);
    headerHigh.innerText = highScore;
    
    handleResize();
    initEventListeners();
    setMode('tracking');
    setDifficulty('normal');
    render();
    initAudio();
  }
  
  init();
})();
