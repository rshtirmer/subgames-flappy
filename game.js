(() => {
  'use strict';

  // ═══════════════════════════════════════════
  // CONSTANTS
  // ═══════════════════════════════════════════
  const GW = 420, GH = 700;
  const GROUND_H = 70;
  const PIPE_W = 58;
  const BIRD_R = 15;
  const GRAVITY = 0.42;
  const FLAP_VEL = -7.2;
  const MAX_FALL = 11;
  const PIPE_SPAWN_DIST = 200;

  const LEVELS = [
    {
      name: 'Sunny Meadow',
      tier: 'none',
      gap: 152, speed: 2.2,
      sky: ['#87CEEB', '#B2EBF2', '#E8F5E9'],
      bird: { body: '#FFD54F', belly: '#FFF9C4', wing: '#FFA726', beak: '#FF7043', eye: '#333' },
      pipe: { fill: '#4CAF50', dark: '#388E3C', light: '#81C784', lip: '#43A047' },
      ground: { grass: '#66BB6A', dirt: '#795548', accent: '#8D6E63' },
    },
    {
      name: 'Enchanted Dusk',
      tier: 'free',
      gap: 140, speed: 2.7,
      sky: ['#0D0221', '#3D1C6C', '#7B2D8E', '#FF6B35'],
      bird: { body: '#26C6DA', belly: '#B2EBF2', wing: '#00ACC1', beak: '#FFAB91', eye: '#222', glow: '#00BCD4' },
      pipe: { fill: '#3E2723', dark: '#1B0E06', light: '#5D4037', lip: '#4E342E' },
      ground: { grass: '#2D1245', dirt: '#1A0533', accent: '#4A148C' },
    },
    {
      name: 'Neon Void',
      tier: 'supporter',
      gap: 126, speed: 3.3,
      sky: ['#0A0A1A', '#0D0D3D'],
      bird: { body: '#FF4081', belly: '#FF80AB', wing: '#F50057', beak: '#FFAB40', eye: '#222', glow: '#FF4081', neon: true },
      pipe: { fill: '#0E0E24', dark: '#06061A', light: '#1A1A44', lip: '#111133', neon: true, neonA: '#00FFFF', neonB: '#FF00FF' },
      ground: { grass: '#0E0E24', dirt: '#0A0A1A', accent: '#00FFFF', neon: true },
    },
  ];

  // ═══════════════════════════════════════════
  // STATE
  // ═══════════════════════════════════════════
  let canvas, ctx;
  let state = 'title';         // title | levelSelect | getReady | playing | dead | paused
  let lvl = 0;
  let score = 0;
  let bestScores = JSON.parse(localStorage.getItem('flappy_best') || '[0,0,0]');
  let bird = { x: 100, y: GH / 2, vy: 0, rot: 0, wingT: 0, squish: 0 };
  let pipes = [];
  let particles = [];
  let bgScroll = 0;
  let groundScroll = 0;
  let frameCount = 0;
  let deathTime = 0;
  let shake = 0;
  let flash = 0;
  let scorePops = [];
  let sdkInstance = null;
  let gamePaused = false;
  let clouds = [];
  let stars = [];
  let buildings = [];
  let trees = [];

  // ═══════════════════════════════════════════
  // CANVAS SETUP
  // ═══════════════════════════════════════════
  function initCanvas() {
    canvas = document.getElementById('game-canvas');
    const container = document.getElementById('game-container');
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.min(vw / GW, vh / GH, 1.5);
    const w = Math.floor(GW * scale);
    const h = Math.floor(GH * scale);
    container.style.width = w + 'px';
    container.style.height = h + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = GW * dpr;
    canvas.height = GH * dpr;
    ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
  }

  // ═══════════════════════════════════════════
  // AUDIO (procedural Web Audio)
  // ═══════════════════════════════════════════
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function playSound(type) {
    try {
      ensureAudio();
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g);
      g.connect(audioCtx.destination);
      if (type === 'flap') {
        o.type = 'sine';
        o.frequency.setValueAtTime(350, t);
        o.frequency.exponentialRampToValueAtTime(600, t + 0.07);
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        o.start(t); o.stop(t + 0.1);
      } else if (type === 'score') {
        o.type = 'sine';
        o.frequency.setValueAtTime(587, t);
        o.frequency.setValueAtTime(784, t + 0.08);
        g.gain.setValueAtTime(0.1, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
        o.start(t); o.stop(t + 0.22);
      } else if (type === 'die') {
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(220, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.35);
        g.gain.setValueAtTime(0.18, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
        o.start(t); o.stop(t + 0.4);
      } else if (type === 'click') {
        o.type = 'sine';
        o.frequency.setValueAtTime(900, t);
        g.gain.setValueAtTime(0.08, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        o.start(t); o.stop(t + 0.04);
      }
    } catch (_) {}
  }

  // ═══════════════════════════════════════════
  // PARTICLE SYSTEM
  // ═══════════════════════════════════════════
  function spawnParticles(x, y, count, cfg) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = cfg.speed * (0.4 + Math.random() * 0.6);
      particles.push({
        x, y,
        vx: Math.cos(a) * sp + (cfg.vx || 0),
        vy: Math.sin(a) * sp + (cfg.vy || 0),
        life: 1,
        decay: cfg.decay || 0.025,
        size: cfg.size * (0.5 + Math.random() * 0.5),
        color: cfg.colors[Math.floor(Math.random() * cfg.colors.length)],
        grav: cfg.grav || 0,
      });
    }
  }
  function tickParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.vy += p.grav; p.life -= p.decay;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }
  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ═══════════════════════════════════════════
  // ENVIRONMENT GENERATORS
  // ═══════════════════════════════════════════
  function genClouds() {
    clouds = [];
    for (let i = 0; i < 10; i++) {
      clouds.push({
        x: Math.random() * GW * 3,
        y: 25 + Math.random() * 220,
        w: 40 + Math.random() * 60,
        speed: 0.08 + Math.random() * 0.15,
        alpha: 0.5 + Math.random() * 0.4,
      });
    }
  }
  function genStars() {
    stars = [];
    for (let i = 0; i < 80; i++) {
      stars.push({
        x: Math.random() * GW,
        y: Math.random() * (GH * 0.55),
        r: 0.5 + Math.random() * 1.5,
        twinkle: Math.random() * Math.PI * 2,
        speed: 1 + Math.random() * 2,
      });
    }
  }
  function genBuildings() {
    buildings = [];
    let bx = 0;
    while (bx < GW * 3) {
      const w = 28 + Math.random() * 50;
      const h = 60 + Math.random() * 200;
      const windows = [];
      for (let wy = 10; wy < h - 15; wy += 14) {
        for (let wx = 6; wx < w - 6; wx += 10) {
          if (Math.random() > 0.4) {
            windows.push({ x: wx, y: wy, color: Math.random() > 0.5 ? '#00FFFF' : (Math.random() > 0.5 ? '#FF00FF' : '#FFFF00') });
          }
        }
      }
      buildings.push({ x: bx, w, h, windows });
      bx += w + 2 + Math.random() * 8;
    }
  }
  function genTrees() {
    trees = [];
    for (let i = 0; i < 30; i++) {
      trees.push({
        x: Math.random() * GW * 3,
        h: 40 + Math.random() * 100,
        w: 18 + Math.random() * 25,
        layer: Math.random() > 0.5 ? 0 : 1,
      });
    }
  }

  // ═══════════════════════════════════════════
  // BACKGROUND RENDERING
  // ═══════════════════════════════════════════

  // --- Level 0: Sunny Meadow ---
  function drawBg0() {
    const c = LEVELS[0];
    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, GH - GROUND_H);
    grad.addColorStop(0, c.sky[0]);
    grad.addColorStop(0.55, c.sky[1]);
    grad.addColorStop(1, c.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GW, GH - GROUND_H);

    // Sun
    ctx.save();
    ctx.shadowColor = '#FFE082';
    ctx.shadowBlur = 40;
    ctx.fillStyle = '#FFF176';
    ctx.beginPath();
    ctx.arc(340, 85, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#FFEE58';
    ctx.beginPath();
    ctx.arc(340, 85, 32, 0, Math.PI * 2);
    ctx.fill();

    // Clouds
    for (const cl of clouds) {
      const cx = ((cl.x - bgScroll * cl.speed) % (GW + cl.w * 2)) - cl.w;
      ctx.globalAlpha = cl.alpha * 0.7;
      drawCloud(cx, cl.y, cl.w);
    }
    ctx.globalAlpha = 1;

    // Far hills
    drawHills(bgScroll * 0.15, GH - GROUND_H - 60, 45, '#81C784');
    // Near hills
    drawHills(bgScroll * 0.3, GH - GROUND_H - 25, 35, '#66BB6A');
  }

  function drawCloud(x, y, w) {
    ctx.fillStyle = '#fff';
    const r = w * 0.28;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.9, y + r * 0.15, r * 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.9, y + r * 0.1, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + r * 0.3, y - r * 0.45, r * 0.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill();
  }

  function drawHills(scroll, baseY, amplitude, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GH);
    for (let x = 0; x <= GW; x += 3) {
      const h = Math.sin((x + scroll) * 0.012) * amplitude
              + Math.sin((x + scroll) * 0.007 + 2) * amplitude * 0.6
              + Math.sin((x + scroll) * 0.02 + 5) * amplitude * 0.25;
      ctx.lineTo(x, baseY + h);
    }
    ctx.lineTo(GW, GH);
    ctx.closePath();
    ctx.fill();
  }

  // --- Level 1: Enchanted Dusk ---
  function drawBg1() {
    const c = LEVELS[1];
    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, GH - GROUND_H);
    grad.addColorStop(0, c.sky[0]);
    grad.addColorStop(0.35, c.sky[1]);
    grad.addColorStop(0.65, c.sky[2]);
    grad.addColorStop(1, c.sky[3]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GW, GH - GROUND_H);

    // Stars
    for (const s of stars) {
      const a = 0.3 + Math.sin(s.twinkle + frameCount * 0.02 * s.speed) * 0.5;
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = '#FFF8E1';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Moon
    ctx.save();
    ctx.shadowColor = '#FFF9C4';
    ctx.shadowBlur = 30;
    ctx.fillStyle = '#FFF9C4';
    ctx.beginPath();
    ctx.arc(70, 80, 28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = LEVELS[1].sky[0];
    ctx.beginPath();
    ctx.arc(58, 72, 25, 0, Math.PI * 2);
    ctx.fill();

    // Trees
    const groundY = GH - GROUND_H;
    for (const t of trees) {
      if (t.layer !== 0) continue;
      const tx = ((t.x - bgScroll * 0.12) % (GW + 100)) - 50;
      drawPineTree(tx, groundY, t.h, t.w, '#12001F');
    }
    for (const t of trees) {
      if (t.layer !== 1) continue;
      const tx = ((t.x - bgScroll * 0.25) % (GW + 100)) - 50;
      drawPineTree(tx, groundY, t.h * 1.2, t.w * 1.1, '#0D0221');
    }

    // Firefly particles
    if (frameCount % 8 === 0 && state !== 'title') {
      spawnParticles(
        Math.random() * GW, 150 + Math.random() * 350, 1,
        { speed: 0.3, decay: 0.008, size: 3, colors: ['#C6FF00', '#EEFF41', '#F4FF81'], grav: -0.01 }
      );
    }
  }

  function drawPineTree(x, baseY, h, w, color) {
    ctx.fillStyle = color;
    const layers = 3;
    for (let i = 0; i < layers; i++) {
      const ly = baseY - h * 0.3 * i;
      const lw = w * (1.1 - i * 0.2);
      const lh = h * 0.45;
      ctx.beginPath();
      ctx.moveTo(x, ly - lh);
      ctx.lineTo(x - lw, ly);
      ctx.lineTo(x + lw, ly);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillRect(x - w * 0.12, baseY, w * 0.24, 5);
  }

  // --- Level 2: Neon Void ---
  function drawBg2() {
    const c = LEVELS[2];
    // Sky
    const grad = ctx.createLinearGradient(0, 0, 0, GH);
    grad.addColorStop(0, c.sky[0]);
    grad.addColorStop(1, c.sky[1]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, GW, GH);

    // Sparse stars
    ctx.globalAlpha = 0.4;
    for (let i = 0; i < 25; i++) {
      const sx = (stars[i] || {}).x || i * 17;
      const sy = (stars[i] || {}).y || i * 9;
      ctx.fillStyle = '#fff';
      ctx.fillRect(sx, sy, 1, 1);
    }
    ctx.globalAlpha = 1;

    // City silhouette
    const groundY = GH - GROUND_H;
    for (const b of buildings) {
      const bx = ((b.x - bgScroll * 0.08) % (GW * 3)) - 50;
      if (bx > GW + 60 || bx + b.w < -60) continue;
      ctx.fillStyle = '#080818';
      ctx.fillRect(bx, groundY - b.h, b.w, b.h);
      // Windows
      for (const win of b.windows) {
        const brightness = 0.15 + Math.sin(frameCount * 0.01 + win.x + win.y) * 0.1;
        ctx.globalAlpha = brightness;
        ctx.fillStyle = win.color;
        ctx.fillRect(bx + win.x, groundY - b.h + win.y, 5, 7);
      }
      ctx.globalAlpha = 1;
    }

    // Neon ambient particles
    if (frameCount % 12 === 0) {
      spawnParticles(
        Math.random() * GW, Math.random() * (GH - GROUND_H), 1,
        { speed: 0.2, decay: 0.006, size: 2.5, colors: ['#00FFFF', '#FF00FF', '#FF4081'], grav: -0.005 }
      );
    }
  }

  const bgRenderers = [drawBg0, drawBg1, drawBg2];

  // ═══════════════════════════════════════════
  // GROUND RENDERING
  // ═══════════════════════════════════════════
  function drawGround() {
    const c = LEVELS[lvl];
    const y = GH - GROUND_H;

    if (c.ground.neon) {
      // Neon grid ground
      ctx.fillStyle = c.ground.dirt;
      ctx.fillRect(0, y, GW, GROUND_H);

      // Grid lines
      ctx.strokeStyle = c.ground.accent;
      ctx.lineWidth = 1;
      // Edge glow
      ctx.save();
      ctx.shadowColor = c.ground.accent;
      ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(GW, y); ctx.stroke();
      ctx.restore();

      ctx.globalAlpha = 0.2;
      for (let gy = y + 12; gy < GH; gy += 12) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(GW, gy); ctx.stroke();
      }
      const gOff = groundScroll % 18;
      for (let gx = -gOff; gx < GW; gx += 18) {
        ctx.beginPath(); ctx.moveTo(gx, y); ctx.lineTo(gx, GH); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else {
      // Organic ground
      ctx.fillStyle = c.ground.dirt;
      ctx.fillRect(0, y, GW, GROUND_H);
      ctx.fillStyle = c.ground.grass;
      ctx.fillRect(0, y, GW, 12);

      // Grass blades
      ctx.fillStyle = c.ground.grass;
      const off = groundScroll % 14;
      for (let gx = -off; gx < GW + 14; gx += 14) {
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx + 4, y - 6);
        ctx.lineTo(gx + 8, y);
        ctx.fill();
      }

      // Dirt line
      ctx.fillStyle = c.ground.accent;
      ctx.fillRect(0, y + 12, GW, 3);
    }
  }

  // ═══════════════════════════════════════════
  // PIPE RENDERING
  // ═══════════════════════════════════════════
  function drawPipe(px, topH) {
    const c = LEVELS[lvl].pipe;
    const gap = LEVELS[lvl].gap;
    const botY = topH + gap;
    const groundY = GH - GROUND_H;
    const lipH = 24;
    const lipX = 6;

    if (c.neon) {
      ctx.lineWidth = 2;
      // Top pipe
      ctx.fillStyle = c.fill;
      ctx.fillRect(px, 0, PIPE_W, topH);
      ctx.fillRect(px - lipX, topH - lipH, PIPE_W + lipX * 2, lipH);
      // Neon outline
      ctx.save();
      ctx.shadowColor = c.neonA;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = c.neonA;
      ctx.strokeRect(px + 0.5, 0.5, PIPE_W - 1, topH - 1);
      ctx.strokeRect(px - lipX + 0.5, topH - lipH + 0.5, PIPE_W + lipX * 2 - 1, lipH - 1);
      ctx.restore();

      // Bottom pipe
      ctx.fillRect(px, botY, PIPE_W, groundY - botY);
      ctx.fillRect(px - lipX, botY, PIPE_W + lipX * 2, lipH);
      ctx.save();
      ctx.shadowColor = c.neonB;
      ctx.shadowBlur = 12;
      ctx.strokeStyle = c.neonB;
      ctx.strokeRect(px + 0.5, botY + 0.5, PIPE_W - 1, groundY - botY - 1);
      ctx.strokeRect(px - lipX + 0.5, botY + 0.5, PIPE_W + lipX * 2 - 1, lipH - 1);
      ctx.restore();

      // Scanlines
      ctx.globalAlpha = 0.06;
      ctx.fillStyle = '#fff';
      for (let sy = 0; sy < topH; sy += 4) ctx.fillRect(px, sy, PIPE_W, 1);
      for (let sy = botY; sy < groundY; sy += 4) ctx.fillRect(px, sy, PIPE_W, 1);
      ctx.globalAlpha = 1;
    } else {
      // Gradient pipe
      const bodyGrad = ctx.createLinearGradient(px, 0, px + PIPE_W, 0);
      bodyGrad.addColorStop(0, c.dark);
      bodyGrad.addColorStop(0.25, c.light);
      bodyGrad.addColorStop(0.5, c.fill);
      bodyGrad.addColorStop(1, c.dark);

      // Top pipe body
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(px, 0, PIPE_W, topH - lipH);
      // Top lip
      const lipGrad = ctx.createLinearGradient(px - lipX, 0, px + PIPE_W + lipX, 0);
      lipGrad.addColorStop(0, c.dark);
      lipGrad.addColorStop(0.25, c.light);
      lipGrad.addColorStop(0.5, c.lip);
      lipGrad.addColorStop(1, c.dark);
      ctx.fillStyle = lipGrad;
      roundRect(px - lipX, topH - lipH, PIPE_W + lipX * 2, lipH, 4);
      // Highlight stripe
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + 8, 0, 6, topH - lipH);

      // Bottom pipe
      ctx.fillStyle = bodyGrad;
      ctx.fillRect(px, botY + lipH, PIPE_W, groundY - botY - lipH);
      ctx.fillStyle = lipGrad;
      roundRect(px - lipX, botY, PIPE_W + lipX * 2, lipH, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(px + 8, botY + lipH, 6, groundY - botY - lipH);

      // Border
      ctx.strokeStyle = c.dark;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(px, 0, PIPE_W, topH - lipH);
      ctx.strokeRect(px, botY + lipH, PIPE_W, groundY - botY - lipH);
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
  }

  // ═══════════════════════════════════════════
  // BIRD RENDERING
  // ═══════════════════════════════════════════
  function drawBird() {
    const c = LEVELS[lvl].bird;
    const { x, y, rot, wingT, squish } = bird;
    const wingAngle = Math.sin(wingT * 0.4) * 0.6;
    const sx = 1 + squish * 0.15;
    const sy = 1 - squish * 0.12;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.scale(sx, sy);

    // Trail for glowing birds
    if (c.glow && (state === 'playing' || state === 'getReady')) {
      spawnParticles(x - 12, y + 2, 1, {
        speed: 0.5, decay: 0.035, size: c.neon ? 5 : 3.5,
        colors: [c.glow, c.body, c.belly],
        vx: -1.5, vy: 0, grav: 0,
      });
    }

    // Glow aura
    if (c.glow) {
      ctx.save();
      ctx.shadowColor = c.glow;
      ctx.shadowBlur = c.neon ? 22 : 14;
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.beginPath();
      ctx.arc(0, 0, BIRD_R + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Body
    ctx.fillStyle = c.body;
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R, BIRD_R * 0.88, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly
    ctx.fillStyle = c.belly;
    ctx.beginPath();
    ctx.ellipse(2, 4, BIRD_R * 0.55, BIRD_R * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wing
    ctx.save();
    ctx.translate(-4, 1);
    ctx.rotate(wingAngle);
    ctx.fillStyle = c.wing;
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R * 0.58, BIRD_R * 0.3, -0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Eye white
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(7, -5, 6, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = c.eye;
    ctx.beginPath();
    ctx.arc(9, -5, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(10, -6.5, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = c.beak;
    ctx.beginPath();
    ctx.moveTo(12, -2);
    ctx.lineTo(21, 2);
    ctx.lineTo(12, 5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  // ═══════════════════════════════════════════
  // SCORE RENDERING (on canvas)
  // ═══════════════════════════════════════════
  function drawScore() {
    if (state !== 'playing' && state !== 'dead') return;
    const text = '' + score;
    ctx.save();
    ctx.font = '700 48px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.strokeText(text, GW / 2, 65);
    ctx.fillStyle = '#fff';
    ctx.fillText(text, GW / 2, 65);
    ctx.restore();

    // Score pop animations
    for (let i = scorePops.length - 1; i >= 0; i--) {
      const p = scorePops[i];
      p.t += 0.04;
      if (p.t >= 1) { scorePops.splice(i, 1); continue; }
      ctx.save();
      ctx.globalAlpha = 1 - p.t;
      ctx.font = '700 24px Fredoka, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#FFD54F';
      ctx.fillText('+1', p.x, p.y - p.t * 40);
      ctx.restore();
    }
  }

  // ═══════════════════════════════════════════
  // GET READY overlay (on canvas)
  // ═══════════════════════════════════════════
  function drawGetReady() {
    if (state !== 'getReady') return;
    ctx.save();
    ctx.font = '700 36px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.strokeText('GET READY', GW / 2, GH / 2 - 60);
    ctx.fillStyle = '#fff';
    ctx.fillText('GET READY', GW / 2, GH / 2 - 60);

    const pulse = 0.6 + Math.sin(frameCount * 0.06) * 0.4;
    ctx.globalAlpha = pulse;
    ctx.font = '600 20px Fredoka, sans-serif';
    ctx.fillText('Tap to fly!', GW / 2, GH / 2 - 20);
    ctx.restore();
  }

  // ═══════════════════════════════════════════
  // GAME LOGIC
  // ═══════════════════════════════════════════
  function resetBird() {
    bird = { x: 100, y: GH / 2 - 30, vy: 0, rot: 0, wingT: 0, squish: 0 };
  }

  function resetGame() {
    score = 0;
    pipes = [];
    particles = [];
    scorePops = [];
    shake = 0;
    flash = 0;
    deathTime = 0;
    resetBird();
  }

  function flap() {
    if (state === 'getReady') {
      state = 'playing';
      hideScreen('ready-screen');
    }
    if (state !== 'playing') return;
    bird.vy = FLAP_VEL;
    bird.squish = 1;
    bird.wingT = 0;
    playSound('flap');
    spawnParticles(bird.x - 8, bird.y + 10, 3, {
      speed: 1.5, decay: 0.05, size: 3,
      colors: ['rgba(255,255,255,0.6)', 'rgba(255,255,255,0.3)'],
      vx: -0.5, vy: 1, grav: 0,
    });
  }

  function spawnPipe() {
    const gap = LEVELS[lvl].gap;
    const minTop = 70;
    const maxTop = GH - GROUND_H - gap - 70;
    const topH = minTop + Math.random() * (maxTop - minTop);
    const lastX = pipes.length > 0 ? pipes[pipes.length - 1].x : GW;
    pipes.push({ x: Math.max(lastX + PIPE_SPAWN_DIST, GW + 20), topH, scored: false });
  }

  function updateGame() {
    const spd = LEVELS[lvl].speed;

    // Bird physics
    bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);
    bird.y += bird.vy;
    bird.rot = Math.max(-0.5, Math.min(bird.vy * 0.08, 1.4));
    bird.wingT += bird.vy < 0 ? 3 : 1.2;
    bird.squish *= 0.85;

    // Pipe movement + spawning
    for (let i = pipes.length - 1; i >= 0; i--) {
      pipes[i].x -= spd;
      if (pipes[i].x + PIPE_W < -10) pipes.splice(i, 1);
    }
    if (pipes.length === 0 || pipes[pipes.length - 1].x < GW - PIPE_SPAWN_DIST) {
      spawnPipe();
    }

    // Scoring
    for (const p of pipes) {
      if (!p.scored && p.x + PIPE_W / 2 < bird.x) {
        p.scored = true;
        score++;
        scorePops.push({ x: bird.x, y: bird.y - 20, t: 0 });
        playSound('score');
        spawnParticles(bird.x, bird.y, 6, {
          speed: 2, decay: 0.03, size: 4,
          colors: ['#FFD54F', '#FFF176', '#FFEE58'],
          grav: 0.05,
        });
      }
    }

    // Scroll
    bgScroll += spd;
    groundScroll += spd;

    // Collision
    const groundY = GH - GROUND_H;
    const bx = bird.x, by = bird.y, br = BIRD_R - 3; // slightly forgiving hitbox

    // Ground / ceiling
    if (by + br > groundY || by - br < 0) return die();

    // Pipes (use body width, not lip — more forgiving)
    for (const p of pipes) {
      const gap = LEVELS[lvl].gap;
      if (bx + br > p.x && bx - br < p.x + PIPE_W) {
        if (by - br < p.topH) return die();
        if (by + br > p.topH + gap) return die();
      }
    }
  }

  function die() {
    if (state === 'dead') return;
    state = 'dead';
    deathTime = 0;
    shake = 12;
    flash = 1;
    playSound('die');

    // Feather burst
    const lc = LEVELS[lvl].bird;
    spawnParticles(bird.x, bird.y, 15, {
      speed: 4, decay: 0.02, size: 5,
      colors: [lc.body, lc.belly, lc.wing, '#fff'],
      grav: 0.12,
    });

    // Update best
    if (score > bestScores[lvl]) {
      bestScores[lvl] = score;
      localStorage.setItem('flappy_best', JSON.stringify(bestScores));
    }

    // Show death screen after a short delay
    setTimeout(() => {
      document.getElementById('final-score').textContent = score;
      document.getElementById('best-score').textContent = bestScores[lvl];
      if (score >= bestScores[lvl] && score > 0) {
        document.getElementById('best-score').classList.add('new-best');
      } else {
        document.getElementById('best-score').classList.remove('new-best');
      }
      showScreen('death-screen');
    }, 600);
  }

  // ═══════════════════════════════════════════
  // SCREEN MANAGEMENT
  // ═══════════════════════════════════════════
  function showScreen(id) {
    document.getElementById(id).classList.remove('hidden');
  }
  function hideScreen(id) {
    document.getElementById(id).classList.add('hidden');
  }

  function updateLevelCards() {
    for (let i = 0; i < 3; i++) {
      const el = document.querySelector(`.best-${i}`);
      if (el) el.textContent = bestScores[i];
    }
    // Update lock states based on SDK tier
    updateLockStates();
  }

  async function updateLockStates() {
    for (let i = 1; i < 3; i++) {
      const btn = document.querySelector(`.btn-play[data-level="${i}"]`);
      if (!btn) continue;
      const tier = LEVELS[i].tier;
      let unlocked = false;
      if (sdkInstance) {
        try {
          const currentTier = await sdkInstance.getPlayerTier();
          const ranks = { none: 0, free: 1, supporter: 2, founder: 3 };
          unlocked = (ranks[currentTier] || 0) >= (ranks[tier] || 0);
        } catch (_) {}
      } else {
        // Dev mode: all unlocked
        unlocked = true;
      }
      if (unlocked) {
        btn.classList.remove('btn-locked');
        btn.classList.add('unlocked');
        btn.innerHTML = 'PLAY';
      }
    }
  }

  async function selectLevel(levelIdx) {
    playSound('click');
    const tier = LEVELS[levelIdx].tier;

    // Tier gating via SDK
    if (sdkInstance && tier !== 'none') {
      const labels = { free: 'Enchanted Dusk level', supporter: 'Neon Void level' };
      const allowed = await sdkInstance.requireTier(tier, labels[tier]);
      if (!allowed) {
        updateLockStates();
        return;
      }
    }

    lvl = levelIdx;
    resetGame();
    hideScreen('level-screen');
    showScreen('ready-screen');
    state = 'getReady';
    bird.y = GH / 2 - 30;
    initLevelEnv();
  }

  function initLevelEnv() {
    genClouds();
    genStars();
    genBuildings();
    genTrees();
  }

  // ═══════════════════════════════════════════
  // INPUT
  // ═══════════════════════════════════════════
  function onInput(e) {
    if (e) e.preventDefault();
    if (gamePaused) return;
    if (state === 'getReady' || state === 'playing') flap();
  }

  canvas = document.getElementById('game-canvas');
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') onInput(e);
  });
  document.getElementById('game-canvas').addEventListener('pointerdown', onInput);
  document.getElementById('ready-screen').addEventListener('pointerdown', onInput);

  // Buttons
  document.getElementById('play-btn').addEventListener('click', () => {
    playSound('click');
    hideScreen('title-screen');
    showScreen('level-screen');
    state = 'levelSelect';
    updateLevelCards();
  });

  document.getElementById('back-btn').addEventListener('click', () => {
    playSound('click');
    hideScreen('level-screen');
    showScreen('title-screen');
    state = 'title';
    lvl = 0;
    initLevelEnv();
  });

  document.querySelectorAll('.btn-play').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectLevel(parseInt(btn.dataset.level));
    });
  });

  document.getElementById('retry-btn').addEventListener('click', () => {
    playSound('click');
    hideScreen('death-screen');
    resetGame();
    showScreen('ready-screen');
    state = 'getReady';
  });

  document.getElementById('levels-btn').addEventListener('click', () => {
    playSound('click');
    hideScreen('death-screen');
    showScreen('level-screen');
    state = 'levelSelect';
    updateLevelCards();
  });

  // ═══════════════════════════════════════════
  // SDK INTEGRATION
  // ═══════════════════════════════════════════
  function initSDK() {
    const SDKClass = typeof SubGames !== 'undefined' && SubGames.SubGamesSDK;
    if (SDKClass) {
      try {
        sdkInstance = SDKClass.init({ gameKey: 'flappy-tiers' });
        sdkInstance.on('pause', () => { gamePaused = true; });
        sdkInstance.on('unpause', () => { gamePaused = false; });
        sdkInstance.on('tierChange', () => { updateLockStates(); });
        console.log('[FlappyTiers] sub.games SDK connected');
      } catch (e) {
        console.warn('[FlappyTiers] SDK init error:', e);
      }
    } else {
      console.log('[FlappyTiers] No SDK detected — dev mode, all levels unlocked');
    }
  }

  // ═══════════════════════════════════════════
  // MAIN LOOP
  // ═══════════════════════════════════════════
  function render() {
    ctx.save();

    // Screen shake
    if (shake > 0) {
      const sx = (Math.random() - 0.5) * shake;
      const sy = (Math.random() - 0.5) * shake;
      ctx.translate(sx, sy);
      shake *= 0.85;
      if (shake < 0.5) shake = 0;
    }

    // Background
    bgRenderers[lvl]();

    // Pipes
    if (state === 'playing' || state === 'dead') {
      for (const p of pipes) drawPipe(p.x, p.topH);
    }

    // Behind-bird particles
    drawParticles();

    // Bird (show on title too for visual appeal)
    if (state === 'title' || state === 'levelSelect') {
      // Animated demo bird
      const saveBird = { ...bird };
      bird.x = GW / 2;
      bird.y = GH / 2 - 20 + Math.sin(frameCount * 0.04) * 18;
      bird.rot = Math.sin(frameCount * 0.04) * 0.15;
      bird.wingT = frameCount * 1.2;
      bird.squish = 0;
      drawBird();
      Object.assign(bird, saveBird);
    } else {
      drawBird();
    }

    // Ground
    drawGround();

    // Score + Get Ready text
    drawScore();
    drawGetReady();

    // Death flash
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.5;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, GW, GH);
      ctx.globalAlpha = 1;
      flash *= 0.85;
      if (flash < 0.01) flash = 0;
    }

    ctx.restore();
  }

  function update() {
    frameCount++;
    if (gamePaused) return;

    if (state === 'getReady') {
      bird.y = GH / 2 - 30 + Math.sin(frameCount * 0.05) * 12;
      bird.wingT += 1.5;
      bgScroll += 0.5;
      groundScroll += 0.5;
    } else if (state === 'playing') {
      updateGame();
    } else if (state === 'dead') {
      deathTime++;
      // Bird falls after death
      if (bird.y < GH - GROUND_H - BIRD_R) {
        bird.vy = Math.min(bird.vy + GRAVITY, MAX_FALL);
        bird.y += bird.vy;
        bird.rot = Math.min(bird.rot + 0.1, 1.5);
      }
    } else {
      // Menu/title background animation
      bgScroll += 0.5;
      groundScroll += 0.5;
    }

    tickParticles();
  }

  function loop() {
    update();
    render();
    requestAnimationFrame(loop);
  }

  // ═══════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════
  function init() {
    initCanvas();
    initLevelEnv();
    initSDK();
    window.addEventListener('resize', initCanvas);
    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
