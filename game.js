/*
  FILE 3: game.js
  Core game engine - handling all game logic, rendering, and interactions
*/

(function() {
  // ========== DOM Elements ==========
  const canvas = document.getElementById('aimCanvas');
  const ctx = canvas.getContext('2d');
  
  // Stats displays
  const scoreSpan = document.getElementById('statScore');
  const accuracySpan = document.getElementById('statAccuracy');
  const hitsSpan = document.getElementById('statHits');
  const shotsSpan = document.getElementById('statShots');
  const highScoreSpan = document.getElementById('highscoreValue');
  const feedbackDiv = document.getElementById('feedbackMessage');
  const modeDescription = document.getElementById('modeDescription');
  
  // Controls
  const sensitivitySlider = document.getElementById('sensitivitySlider');
  const sensitivityValue = document.getElementById('sensitivityValue');
  const targetColorPicker = document.getElementById('targetColorPicker');
  const targetColorPreview = document.getElementById('targetColorPreview');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeValue = document.getElementById('volumeValue');
  const soundToggle = document.getElementById('soundToggle');
  const hitFlashToggle = document.getElementById('hitFlashToggle');
  
  // Buttons
  const resetSessionBtn = document.getElementById('resetSessionBtn');
  const resetAllBtn = document.getElementById('resetAllBtn');
  
  // ========== Game State ==========
  let currentMode = 'tracking';
  let difficulty = 'normal';
  let sensitivity = 1.0;
  let targetColor = '#ff3b6f';
  let crosshairType = 'dot';
  let soundEnabled = true;
  let hitFlashEnabled = true;
  let volume = 0.30;
  
  let score = 0, hits = 0, shots = 0, highScore = 0;
  let trackingTarget = { x: 300, y: 250, size: 52, vx: 2.0, vy: 1.7 };
  let flickTargets = [];
  let animationId = null;
  let canvasWidth = 1100, canvasHeight = 650;
  let mouseX = -100, mouseY = -100;
  let feedbackTimeout = null;
  
  // Audio context (soft gunshot)
  let audioCtx = null;
  
  // ========== Audio Initialization ==========
  function initAudio() {
    if (!audioCtx && soundEnabled) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  
  function playSoftGunshot() {
    if (!soundEnabled || !audioCtx) return;
    const now = audioCtx.currentTime;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(volume * 0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    gain.connect(audioCtx.destination);
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 320;
    osc.connect(gain);
    osc.start();
    osc.stop(now + 0.1);
  }
  
  function playMissSound() {
    if (!soundEnabled || !audioCtx) return;
    const gain = audioCtx.createGain();
    gain.gain.value = volume * 0.15;
    gain.connect(audioCtx.destination);
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 180;
    osc.connect(gain);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
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
  
  // ========== Difficulty Configuration ==========
  function getDifficultyConfig() {
    switch(difficulty) {
      case 'easy': return { speed: 0.6, size: 58, pointsMult: 0.8, respawnDelay: 0 };
      case 'normal': return { speed: 1.0, size: 52, pointsMult: 1.0, respawnDelay: 0 };
      case 'hard': return { speed: 1.55, size: 46, pointsMult: 1.35, respawnDelay: 0 };
      case 'expert': return { speed: 2.2, size: 40, pointsMult: 1.8, respawnDelay: 0 };
      default: return { speed: 1.0, size: 52, pointsMult: 1.0, respawnDelay: 0 };
    }
  }
  
  function applyDifficultyToTarget() {
    const config = getDifficultyConfig();
    if (currentMode === 'tracking' && trackingTarget) {
      const baseSpeed = 1.8;
      trackingTarget.vx = (trackingTarget.vx > 0 ? baseSpeed * config.speed : -baseSpeed * config.speed);
      trackingTarget.vy = (trackingTarget.vy > 0 ? baseSpeed * config.speed * 0.9 : -baseSpeed * config.speed * 0.9);
      trackingTarget.size = config.size;
    } else if (flickTargets.length) {
      flickTargets[0].size = config.size;
    }
  }
  
  // ========== Core Game Functions ==========
  function updateStatsUI() {
    scoreSpan.innerText = score;
    hitsSpan.innerText = hits;
    shotsSpan.innerText = shots;
    const accuracy = shots === 0 ? 0 : ((hits / shots) * 100).toFixed(0);
    accuracySpan.innerText = accuracy;
    
    if (score > highScore) {
      highScore = score;
      localStorage.setItem('btata_aim_highscore', highScore);
      highScoreSpan.innerText = highScore;
    }
  }
  
  function showFeedback(message, isHit = true) {
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    feedbackDiv.innerHTML = message;
    feedbackDiv.style.color = isHit ? '#a0ffb0' : '#ffa098';
    feedbackTimeout = setTimeout(() => { feedbackDiv.innerHTML = ''; }, 380);
  }
  
  function randomPosition(padding = 55, objSize = 52) {
    const maxX = canvasWidth - objSize - padding;
    const maxY = canvasHeight - objSize - padding;
    return {
      x: Math.max(padding, padding + Math.random() * (maxX - padding)),
      y: Math.max(padding, padding + Math.random() * (maxY - padding))
    };
  }
  
  function regenerateTarget() {
    if (currentMode === 'flick' || currentMode === 'reaction') {
      const pos = randomPosition(60, getDifficultyConfig().size);
      flickTargets = [{ id: Date.now(), x: pos.x, y: pos.y, size: getDifficultyConfig().size }];
    }
  }
  
  function registerHit() {
    const config = getDifficultyConfig();
    const basePoints = currentMode === 'tracking' ? 10 : (currentMode === 'flick' ? 15 : 25);
    const addPoints = Math.floor(basePoints * config.pointsMult);
    score += addPoints;
    hits++;
    shots++;
    updateStatsUI();
    showFeedback(`+${addPoints} ${currentMode.toUpperCase()}!`, true);
    
    if (soundEnabled) playSoftGunshot();
    
    if (currentMode === 'tracking') {
      trackingTarget.vx += trackingTarget.vx > 0 ? 0.2 : -0.2;
      trackingTarget.vy += trackingTarget.vy > 0 ? 0.15 : -0.15;
      const maxSpeed = 6.0;
      trackingTarget.vx = Math.min(maxSpeed, Math.max(-maxSpeed, trackingTarget.vx));
      trackingTarget.vy = Math.min(maxSpeed, Math.max(-maxSpeed, trackingTarget.vy));
    } else {
      regenerateTarget();
      applyDifficultyToTarget();
    }
    
    if (hitFlashEnabled) {
      canvas.style.transition = '0.04s';
      canvas.style.filter = 'brightness(1.2)';
      setTimeout(() => canvas.style.filter = '', 60);
    }
  }
  
  function registerMiss() {
    shots++;
    updateStatsUI();
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
    
    if (currentMode === 'tracking') {
      const t = trackingTarget;
      if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
        registerHit();
      } else {
        registerMiss();
      }
    } else if (flickTargets.length) {
      const t = flickTargets[0];
      if (clickX >= t.x && clickX <= t.x + t.size && clickY >= t.y && clickY <= t.y + t.size) {
        registerHit();
      } else {
        registerMiss();
      }
    }
  }
  
  // ========== Movement & Animation ==========
  function updateTrackingMovement() {
    const speedFactor = 0.65 + sensitivity * 0.45;
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
  
  // ========== Drawing ==========
  function drawBackground() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.strokeStyle = 'rgba(70, 120, 200, 0.12)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < canvasWidth; i += 50) {
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
    if (currentMode === 'tracking' && trackingTarget) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = targetColor;
      ctx.fillStyle = targetColor;
      ctx.beginPath();
      ctx.ellipse(
        trackingTarget.x + trackingTarget.size / 2,
        trackingTarget.y + trackingTarget.size / 2,
        trackingTarget.size / 2,
        trackingTarget.size / 2,
        0, 0, Math.PI * 2
      );
      ctx.fill();
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.floor(trackingTarget.size * 0.45)}px monospace`;
      ctx.fillText('◉', trackingTarget.x + trackingTarget.size / 2 - 10, trackingTarget.y + trackingTarget.size / 2 + 8);
      ctx.shadowBlur = 0;
    } else if (flickTargets.length) {
      const t = flickTargets[0];
      ctx.shadowBlur = 8;
      ctx.fillStyle = targetColor;
      ctx.beginPath();
      ctx.roundRect(t.x, t.y, t.size, t.size, 12);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.floor(t.size * 0.48)}px monospace`;
      ctx.fillText(currentMode === 'flick' ? '⚡' : '!', t.x + t.size * 0.32, t.y + t.size * 0.72);
      ctx.shadowBlur = 0;
    }
  }
  
  // Helper for rounded rect
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      if (w < 2 * r) r = w / 2;
      if (h < 2 * r) r = h / 2;
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y);
      this.quadraticCurveTo(x + w, y, x + w, y + r);
      this.lineTo(x + w, y + h - r);
      this.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      this.lineTo(x + r, y + h);
      this.quadraticCurveTo(x, y + h, x, y + h - r);
      this.lineTo(x, y + r);
      this.quadraticCurveTo(x, y, x + r, y);
      return this;
    };
  }
  
  function drawCrosshair() {
    if (mouseX < 0 || mouseX > canvasWidth || mouseY < 0 || mouseY > canvasHeight) return;
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = '#ffffffcc';
    ctx.lineWidth = 2;
    
    switch(crosshairType) {
      case 'dot':
        ctx.arc(mouseX, mouseY, 4, 0, 2 * Math.PI);
        ctx.fill();
        break;
      case 'cross':
        ctx.moveTo(mouseX - 12, mouseY);
        ctx.lineTo(mouseX - 4, mouseY);
        ctx.moveTo(mouseX + 4, mouseY);
        ctx.lineTo(mouseX + 12, mouseY);
        ctx.moveTo(mouseX, mouseY - 12);
        ctx.lineTo(mouseX, mouseY - 4);
        ctx.moveTo(mouseX, mouseY + 4);
        ctx.lineTo(mouseX, mouseY + 12);
        ctx.stroke();
        break;
      case 'circle':
        ctx.arc(mouseX, mouseY, 9, 0, 2 * Math.PI);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(mouseX, mouseY, 3, 0, 2 * Math.PI);
        ctx.fill();
        break;
      case 'plus':
        ctx.fillRect(mouseX - 2, mouseY - 8, 4, 16);
        ctx.fillRect(mouseX - 8, mouseY - 2, 16, 4);
        break;
      case 'none':
        break;
    }
  }
  
  function render() {
    drawBackground();
    drawTarget();
    drawCrosshair();
    if (currentMode === 'tracking') updateTrackingMovement();
    animationId = requestAnimationFrame(render);
  }
  
  // ========== Mode & Settings Handlers ==========
  function setMode(mode) {
    currentMode = mode;
    score = 0;
    hits = 0;
    shots = 0;
    updateStatsUI();
    
    if (mode === 'tracking') {
      trackingTarget = {
        x: canvasWidth / 2 - 26,
        y: canvasHeight / 2 - 26,
        size: 52,
        vx: 2.0,
        vy: 1.6
      };
      flickTargets = [];
      modeDescription.innerText = 'Seamless tracking - follow the moving target to build muscle memory';
    } else {
      regenerateTarget();
      modeDescription.innerText = mode === 'flick' 
        ? 'Rapid flick shots - click static targets as fast as possible'
        : 'Reaction training - destroy targets instantly on sight';
    }
    applyDifficultyToTarget();
    
    document.querySelectorAll('.mode-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-mode="${mode}"]`).classList.add('active');
    showFeedback(`${mode.toUpperCase()} MODE`, true);
  }
  
  function setDifficulty(diff) {
    difficulty = diff;
    applyDifficultyToTarget();
    document.querySelectorAll('.diff-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`[data-diff="${diff}"]`).classList.add('active');
  }
  
  function resetSession() {
    score = 0;
    hits = 0;
    shots = 0;
    updateStatsUI();
    showFeedback('Session reset', false);
  }
  
  function resetAllStats() {
    score = 0;
    hits = 0;
    shots = 0;
    highScore = 0;
    localStorage.removeItem('btata_aim_highscore');
    updateStatsUI();
    highScoreSpan.innerText = '0';
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
      regenerateTarget();
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
      sensitivityValue.innerText = sensitivity.toFixed(2);
    });
    
    targetColorPicker.addEventListener('input', (e) => {
      targetColor = e.target.value;
      targetColorPreview.style.background = targetColor;
    });
    targetColorPreview.addEventListener('click', () => targetColorPicker.click());
    
    volumeSlider.addEventListener('input', (e) => {
      volume = parseInt(e.target.value) / 100;
      volumeValue.innerText = e.target.value + '%';
    });
    
    soundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      soundToggle.classList.toggle('active');
      if (soundEnabled) initAudio();
    });
    
    hitFlashToggle.addEventListener('click', () => {
      hitFlashEnabled = !hitFlashEnabled;
      hitFlashToggle.classList.toggle('active');
    });
    
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode));
    });
    
    document.querySelectorAll('.diff-btn').forEach(btn => {
      btn.addEventListener('click', () => setDifficulty(btn.dataset.diff));
    });
    
    document.querySelectorAll('.cross-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        crosshairType = btn.dataset.cross;
        document.querySelectorAll('.cross-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    
    resetSessionBtn.addEventListener('click', resetSession);
    resetAllBtn.addEventListener('click', resetAllStats);
  }
  
  // ========== Initialize Toggles ==========
  function initToggles() {
    soundToggle.classList.add('active');
    hitFlashToggle.classList.add('active');
  }
  
  // ========== Initialization ==========
  function init() {
    initToggles();
    const savedHigh = localStorage.getItem('btata_aim_highscore');
    if (savedHigh) highScore = parseInt(savedHigh);
    highScoreSpan.innerText = highScore;
    
    handleResize();
    initEventListeners();
    setMode('tracking');
    setDifficulty('normal');
    render();
    initAudio();
  }
  
  init();
})();
