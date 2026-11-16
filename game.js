'use strict';

/* =========================================================
   크리스탈 가드 — 타워 디펜스
   단일 페이지 / 캔버스 2D / 외부 라이브러리 없음
   ========================================================= */

// ---------- helpers ----------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist2 = (ax, ay, bx, by) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
function fmt(n) {
  n = Math.round(n);
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(/\.0$/, '') + 'm';
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return n.toLocaleString('ko-KR');
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- board ----------
const CELL = 50;
const COLS = 20;
const ROWS = 12;
const W = COLS * CELL;
const H = ROWS * CELL;
const MAX_WAVE = 20;

// ---------- path ----------
const PATH = (() => {
  const wp = [[-1, 6], [5, 6], [5, 2], [10, 2], [10, 9], [15, 9], [15, 4], [19, 4]];
  const pts = wp.map(([c, r]) => ({ x: (c + 0.5) * CELL, y: (r + 0.5) * CELL }));
  const segs = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    segs.push({ a, b, len, start: total, angle: Math.atan2(b.y - a.y, b.x - a.x) });
    total += len;
  }
  const cells = new Set();
  for (let i = 0; i < wp.length - 1; i++) {
    let [c1, r1] = wp[i];
    const [c2, r2] = wp[i + 1];
    const sc = Math.sign(c2 - c1), sr = Math.sign(r2 - r1);
    let c = c1, r = r1;
    cells.add(`${c},${r}`);
    while (c !== c2 || r !== r2) { c += sc; r += sr; cells.add(`${c},${r}`); }
  }
  const chevrons = [];
  for (let d = 34; d < total; d += 96) {
    chevrons.push(posAtRaw(d, segs, total));
  }
  return { pts, segs, total, cells, chevrons, start: pts[0], end: pts[pts.length - 1] };
})();

function posAtRaw(d, segs, total) {
  d = clamp(d, 0, total);
  for (const s of segs) {
    if (d <= s.start + s.len + 1e-6) {
      const t = s.len ? (d - s.start) / s.len : 0;
      return { x: lerp(s.a.x, s.b.x, t), y: lerp(s.a.y, s.b.y, t), angle: s.angle };
    }
  }
  const s = segs[segs.length - 1];
  return { x: s.b.x, y: s.b.y, angle: s.angle };
}
function posAt(d) { return posAtRaw(clamp(d, 0, PATH.total), PATH.segs, PATH.total); }

// ---------- tower / enemy data ----------
const TOWERS = {
  arrow: {
    name: '화살탑', icon: '🏹', cost: 50, color: '#7ee787', desc: '빠른 단일 공격',
    base: { dmg: 9, rate: 1.9, range: 2.5 },
    growth: { dmg: 1.5, rate: 1.12, range: 1.04 }
  },
  cannon: {
    name: '대포', icon: '💥', cost: 90, color: '#ffb457', desc: '광역 폭발 피해',
    base: { dmg: 26, rate: 0.7, range: 2.4, splash: 1.1 },
    growth: { dmg: 1.5, rate: 1.1, range: 1.03, splash: 1.05 }
  },
  frost: {
    name: '빙결탑', icon: '❄️', cost: 70, color: '#7cd7ff', desc: '주변 적 감속',
    base: { dmg: 5, rate: 1.2, range: 2.3, slow: 0.45, slowDur: 1.6 },
    growth: { dmg: 1.35, rate: 1.1, range: 1.04 }
  },
  bolt: {
    name: '번개탑', icon: '⚡', cost: 130, color: '#c792ff', desc: '연쇄 번개 공격',
    base: { dmg: 16, rate: 1.4, range: 3.0, chain: 3 },
    growth: { dmg: 1.5, rate: 1.12, range: 1.03 }
  }
};
const TOWER_ORDER = ['arrow', 'cannon', 'frost', 'bolt'];

const ENEMIES = {
  slime:  { name: '슬라임', hp: 46, speed: 56, gold: 7, r: 13, color: '#4ade80', dark: '#166534' },
  bat:    { name: '박쥐', hp: 30, speed: 100, gold: 7, r: 11, color: '#c084fc', dark: '#6b21a8' },
  golem:  { name: '골렘', hp: 190, speed: 38, gold: 16, r: 17, color: '#94a3b8', dark: '#475569', armor: 3 },
  wraith: { name: '유령', hp: 80, speed: 70, gold: 12, r: 14, color: '#67e8f9', dark: '#0e7490', slowResist: 0.6 },
  boss:   { name: '보스', hp: 1100, speed: 32, gold: 160, r: 24, color: '#f87171', dark: '#7f1d1d', armor: 8, boss: true }
};

// ---------- state ----------
let G = null;
let best = 0;
try { best = parseInt(localStorage.getItem('crystalguard.best') || '0', 10) || 0; } catch (e) { best = 0; }
const OCC = new Map(); // "c,r" -> tower

function newGame(phase) {
  G = {
    phase: phase || 'build',
    gold: 260,
    lives: 20,
    wave: 0,
    time: 0,
    waveTime: 0,
    spawnQueue: [],
    towers: [],
    enemies: [],
    projectiles: [],
    particles: [],
    texts: [],
    effects: [],
    selectedType: null,
    selectedTower: null,
    hoverCell: null,
    pointer: { x: 0, y: 0 },
    speed: 1,
    paused: false,
    shake: 0,
    stats: { kills: 0, built: 0, leaked: 0 },
    totalGold: 0,
    totalUpgrades: 0
  };
  OCC.clear();
  closeTowerPanel();
  if (els.pauseOverlay) els.pauseOverlay.classList.add('hidden');
  if (els.pauseBtn) {
    els.pauseBtn.textContent = '⏸';
    els.pauseBtn.classList.remove('on');
  }
  if (els.speedBtn) els.speedBtn.textContent = '1×';
  if (els.toast) els.toast.classList.remove('show');
  syncUI(true);
}

// ---------- audio ----------
let audioCtx = null;
let muted = false;
let lastSfx = {};
function ac() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}
function tone(freq, dur, type, vol, slideTo) {
  if (muted) return;
  const c = ac();
  if (!c) return;
  try {
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* ignore */ }
}
function sfx(name) {
  const now = performance.now();
  const gap = name === 'arrow' ? 55 : name === 'cannon' ? 90 : 70;
  if (lastSfx[name] && now - lastSfx[name] < gap) return;
  lastSfx[name] = now;
  switch (name) {
    case 'arrow': tone(880, 0.06, 'triangle', 0.025, 1400); break;
    case 'cannon': tone(140, 0.16, 'sawtooth', 0.05, 60); break;
    case 'frost': tone(1200, 0.12, 'sine', 0.03, 700); break;
    case 'bolt': tone(420, 0.1, 'square', 0.028, 900); break;
    case 'kill': tone(300, 0.06, 'sine', 0.02, 180); break;
    case 'bossDead': tone(90, 0.5, 'sawtooth', 0.09, 35); break;
    case 'build': tone(520, 0.1, 'triangle', 0.05, 780); break;
    case 'upgrade': tone(660, 0.16, 'triangle', 0.05, 1200); break;
    case 'sell': tone(500, 0.12, 'sine', 0.04, 300); break;
    case 'wave': tone(330, 0.28, 'triangle', 0.055, 660); break;
    case 'leak': tone(180, 0.3, 'sawtooth', 0.06, 70); break;
    case 'error': tone(160, 0.1, 'square', 0.035, 120); break;
    case 'win': tone(523, 0.5, 'triangle', 0.07, 1046); break;
    case 'lose': tone(220, 0.7, 'sawtooth', 0.07, 55); break;
  }
}

// ---------- tower helpers ----------
function towerStats(t) {
  const b = t.def.base, g = t.def.growth, l = t.level - 1;
  const s = {
    dmg: b.dmg * Math.pow(g.dmg, l),
    rate: b.rate * Math.pow(g.rate, l),
    range: b.range * Math.pow(g.range, l) * CELL
  };
  if (b.splash) s.splash = b.splash * Math.pow(g.splash || 1, l) * CELL;
  if (b.slow) {
    s.slow = Math.min(0.72, b.slow + 0.055 * l);
    s.slowDur = b.slowDur + 0.16 * l;
  }
  if (b.chain) s.chain = b.chain + Math.floor(l / 2);
  return s;
}
function upgradeCost(t) { return Math.round(t.def.cost * (0.9 + 0.65 * (t.level - 1))); }
function sellValue(t) { return Math.floor(t.invested * 0.7); }
function cellKey(c, r) { return c + ',' + r; }
function canBuild(c, r) {
  return c >= 0 && c < COLS && r >= 0 && r < ROWS && !PATH.cells.has(cellKey(c, r)) && !OCC.has(cellKey(c, r));
}
function towerAt(c, r) { return OCC.get(cellKey(c, r)) || null; }

function findTarget(x, y, range) {
  let bestE = null, bestD = -1;
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (dist2(e.x, e.y, x, y) <= (range + e.r) * (range + e.r) && e.dist > bestD) {
      bestD = e.dist;
      bestE = e;
    }
  }
  return bestE;
}

// ---------- waves ----------
function waveGroups(w) {
  const g = [];
  g.push({ type: 'slime', count: Math.round(5 + w * 0.8), gap: 0.7, delay: 0 });
  if (w >= 3) g.push({ type: 'bat', count: Math.round(2 + w * 0.6), gap: 0.5, delay: 2 });
  if (w >= 5) g.push({ type: 'golem', count: Math.round(1 + w * 0.35), gap: 1.2, delay: 4 });
  if (w >= 7) g.push({ type: 'wraith', count: Math.round(1 + w * 0.3), gap: 0.9, delay: 6 });
  if (w % 10 === 0) g.push({ type: 'boss', count: Math.floor(w / 10), gap: 3, delay: 9 });
  return g;
}

function startWave() {
  if (!G || G.phase !== 'build') return;
  if (G.towers.length === 0) {
    showToast('먼저 타워를 건설하세요!');
    sfx('error');
    return;
  }
  G.wave++;
  const groups = waveGroups(G.wave);
  const q = [];
  for (const grp of groups) {
    for (let i = 0; i < grp.count; i++) {
      q.push({ t: grp.delay + i * grp.gap, type: grp.type });
    }
  }
  q.sort((a, b) => a.t - b.t);
  G.spawnQueue = q;
  G.waveTime = 0;
  G.phase = 'wave';
  G.selectedType = null;
  G.selectedTower = null;
  closeTowerPanel();
  showBanner(`웨이브 ${G.wave}`, G.wave % 10 === 0);
  sfx('wave');
  syncUI(true);
}

function spawnEnemy(type) {
  const def = ENEMIES[type];
  const mul = Math.pow(1.15, G.wave - 1);
  const hp = Math.round(def.hp * mul);
  const spdMul = Math.min(1.25, 1 + (G.wave - 1) * 0.008);
  const e = {
    type, def,
    hp, maxHp: hp,
    armor: def.armor || 0,
    baseSpeed: def.speed * spdMul,
    r: def.r,
    x: PATH.start.x, y: PATH.start.y,
    dist: 0,
    angle: 0,
    slowUntil: 0,
    slowAmt: 0,
    dead: false,
    bob: Math.random() * TAU,
    hitFlash: 0,
    reward: def.gold + Math.floor(G.wave / 5)
  };
  G.enemies.push(e);
  G.effects.push({ kind: 'ring', x: e.x, y: e.y, r: 4, r1: 26, color: def.color, life: 0.35, max: 0.35 });
}

function endWave() {
  if (G.phase !== 'wave') return;
  const bonus = 30 + G.wave * 5;
  G.gold += bonus;
  G.totalGold += bonus;
  spawnText(PATH.end.x, PATH.end.y - 52, `+${bonus}`, '#ffd166', 15);
  showToast(`웨이브 ${G.wave} 클리어 · 보너스 +${bonus}`);
  if (G.wave >= MAX_WAVE) {
    victory();
  } else {
    G.phase = 'build';
    if (G.wave > best) {
      best = G.wave;
      try { localStorage.setItem('crystalguard.best', String(best)); } catch (e) { /* ignore */ }
    }
    sfx('upgrade');
    syncUI(true);
  }
}

// ---------- combat ----------
function applySlow(e, amt, dur) {
  const resist = e.def.slowResist || 0;
  const a = amt * (1 - resist);
  if (a <= 0) return;
  e.slowAmt = Math.max(e.slowAmt, a);
  e.slowUntil = Math.max(e.slowUntil, G.time + dur);
}

function damageEnemy(e, amount, color) {
  if (!e || e.dead) return;
  const dmg = Math.max(1, amount - e.armor);
  e.hp -= dmg;
  e.hitFlash = 1;
  if (Math.random() < 0.55) spawnHit(e.x, e.y, color || '#fff');
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.gold += e.reward;
  G.totalGold += e.reward;
  G.stats.kills++;
  spawnText(e.x, e.y - e.r - 8, `+${e.reward}`, '#ffd166', 12);
  spawnBurst(e.x, e.y, e.def.color, e.def.boss ? 30 : 11, e.def.boss ? 280 : 150);
  G.effects.push({ kind: 'ring', x: e.x, y: e.y, r: e.r, r1: e.r * (e.def.boss ? 5 : 3), color: e.def.color, life: 0.45, max: 0.45 });
  if (e.def.boss) {
    G.shake = Math.min(22, G.shake + 14);
    sfx('bossDead');
    showToast(`보스 처치! +${e.reward}💰`);
  } else {
    sfx('kill');
  }
}

function leakEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  G.stats.leaked++;
  const dmg = e.def.boss ? 5 : 1;
  G.lives = Math.max(0, G.lives - dmg);
  G.shake = Math.min(18, G.shake + (e.def.boss ? 12 : 5));
  spawnText(PATH.end.x, PATH.end.y - 46, `-${dmg}`, '#f87171', 16);
  spawnBurst(PATH.end.x, PATH.end.y, '#f87171', 14, 180);
  G.effects.push({ kind: 'ring', x: PATH.end.x, y: PATH.end.y, r: 8, r1: 70, color: '#f87171', life: 0.5, max: 0.5 });
  sfx('leak');
  if (G.lives <= 0 && G.phase !== 'over') gameOver();
}

function updateEnemies(dt) {
  for (const e of G.enemies) {
    if (e.dead) continue;
    if (G.time >= e.slowUntil) e.slowAmt = 0;
    e.dist += e.baseSpeed * (1 - e.slowAmt) * dt;
    const p = posAt(e.dist);
    e.x = p.x; e.y = p.y; e.angle = p.angle;
    e.bob += dt * (e.type === 'bat' ? 11 : 5);
    e.hitFlash = Math.max(0, e.hitFlash - dt * 5);
    if (e.dist >= PATH.total) leakEnemy(e);
  }
  if (G.enemies.some(e => e.dead)) G.enemies = G.enemies.filter(e => !e.dead);
}

function updateTowers(dt) {
  for (const t of G.towers) {
    t.cooldown -= dt;
    t.spin = (t.spin || 0) + dt * 1.4;
    t.flash = Math.max(0, (t.flash || 0) - dt);
    const s = towerStats(t);
    const target = findTarget(t.x, t.y, s.range);
    if (target) t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    if (t.cooldown <= 0 && target) {
      t.cooldown = 1 / s.rate;
      t.flash = 0.1;
      fireTower(t, s, target);
    }
    if (t.cooldown < -1) t.cooldown = 0;
  }
}

function fireTower(t, s, target) {
  if (t.type === 'frost') {
    G.effects.push({ kind: 'ring', x: t.x, y: t.y, r: 8, r1: s.range, color: '#7cd7ff', life: 0.42, max: 0.42 });
    for (const e of G.enemies) {
      if (e.dead) continue;
      if (dist2(e.x, e.y, t.x, t.y) <= (s.range + e.r) * (s.range + e.r)) {
        damageEnemy(e, s.dmg, '#bae6fd');
        applySlow(e, s.slow, s.slowDur);
      }
    }
    sfx('frost');
    return;
  }
  if (t.type === 'bolt') {
    let cur = target;
    let dmg = s.dmg;
    const hit = [cur];
    const pts = [{ x: t.x, y: t.y }];
    for (let i = 0; i < s.chain; i++) {
      pts.push({ x: cur.x, y: cur.y });
      damageEnemy(cur, dmg, '#e9d5ff');
      dmg *= 0.85;
      let next = null, bd = Infinity;
      for (const e of G.enemies) {
        if (e.dead || hit.includes(e)) continue;
        const d = dist2(e.x, e.y, cur.x, cur.y);
        if (d < (2.4 * CELL) * (2.4 * CELL) && d < bd) { bd = d; next = e; }
      }
      if (!next) break;
      hit.push(next);
      cur = next;
    }
    G.effects.push({ kind: 'bolt', pts, color: '#c4b5fd', life: 0.2, max: 0.2 });
    sfx('bolt');
    return;
  }
  const cannon = t.type === 'cannon';
  G.projectiles.push({
    kind: t.type,
    x: t.x, y: t.y,
    target,
    tx: target.x, ty: target.y,
    speed: cannon ? 430 : 780,
    dmg: s.dmg,
    splash: cannon ? s.splash : 0,
    color: cannon ? '#ffb457' : '#c8ffd4',
    angle: t.angle,
    dead: false
  });
  sfx(cannon ? 'cannon' : 'arrow');
}

function updateProjectiles(dt) {
  for (const p of G.projectiles) {
    if (p.dead) continue;
    if (p.target && !p.target.dead) {
      p.tx = p.target.x;
      p.ty = p.target.y;
    }
    const dx = p.tx - p.x, dy = p.ty - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-3) { p.dead = true; continue; }
    const step = p.speed * dt;
    p.angle = Math.atan2(dy, dx);
    if (step >= d) {
      p.x = p.tx; p.y = p.ty;
      impact(p);
      p.dead = true;
    } else {
      p.x += dx / d * step;
      p.y += dy / d * step;
    }
  }
  if (G.projectiles.some(p => p.dead)) G.projectiles = G.projectiles.filter(p => !p.dead);
}

function impact(p) {
  if (p.splash > 0) {
    for (const e of G.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      if (d <= p.splash + e.r * 0.6) {
        const falloff = 1 - clamp((d - e.r * 0.4) / p.splash, 0, 1) * 0.45;
        damageEnemy(e, p.dmg * falloff, '#ffd08a');
      }
    }
    G.effects.push({ kind: 'ring', x: p.x, y: p.y, r: 6, r1: p.splash, color: '#ffb457', life: 0.3, max: 0.3 });
    spawnBurst(p.x, p.y, '#ffb457', 9, 170);
    G.shake = Math.min(6, G.shake + 1.5);
  } else if (p.target && !p.target.dead) {
    damageEnemy(p.target, p.dmg, p.color);
  }
}

function updateEffects(dt) {
  for (const e of G.effects) e.life -= dt;
  if (G.effects.some(e => e.life <= 0)) G.effects = G.effects.filter(e => e.life > 0);

  for (const p of G.particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.vy += p.gravity * dt;
  }
  if (G.particles.some(p => p.life <= 0)) G.particles = G.particles.filter(p => p.life > 0);

  for (const t of G.texts) {
    t.life -= dt;
    t.y -= 26 * dt;
  }
  if (G.texts.some(t => t.life <= 0)) G.texts = G.texts.filter(t => t.life > 0);
}

function update(dt) {
  G.time += dt;
  if (G.phase === 'wave') {
    G.waveTime += dt;
    while (G.spawnQueue.length && G.spawnQueue[0].t <= G.waveTime) {
      spawnEnemy(G.spawnQueue.shift().type);
    }
  }
  updateEnemies(dt);
  updateTowers(dt);
  updateProjectiles(dt);
  updateEffects(dt);
  if (G.phase === 'wave' && G.spawnQueue.length === 0 && G.enemies.length === 0) {
    endWave();
  }
  G.shake = Math.max(0, G.shake - dt * 26);
}

// ---------- fx helpers ----------
function spawnBurst(x, y, color, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU;
    const sp = rand(speed * 0.25, speed);
    G.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: rand(0.25, 0.65),
      max: 0.65,
      size: rand(1.4, 3.6),
      color,
      gravity: rand(20, 70)
    });
  }
}
function spawnHit(x, y, color) {
  for (let i = 0; i < 3; i++) {
    const a = Math.random() * TAU;
    G.particles.push({
      x, y,
      vx: Math.cos(a) * rand(20, 90),
      vy: Math.sin(a) * rand(20, 90),
      life: rand(0.12, 0.3),
      max: 0.3,
      size: rand(1, 2.4),
      color,
      gravity: 0
    });
  }
}
function spawnText(x, y, text, color, size) {
  G.texts.push({ x, y, text, color: color || '#fff', size: size || 13, life: 0.9, max: 0.9 });
}


/* =========================================================
   UI / DOM
   ========================================================= */
const $ = id => document.getElementById(id);
const els = {
  lives: $('lives'),
  gold: $('gold'),
  wave: $('wave'),
  best: $('best'),
  goldStat: $('goldStat'),
  livesStat: $('livesStat'),
  speedBtn: $('speedBtn'),
  pauseBtn: $('pauseBtn'),
  soundBtn: $('soundBtn'),
  restartBtn: $('restartBtn'),
  startBtn: $('startBtn'),
  waveInfo: $('waveInfo'),
  hint: $('hint'),
  waveBanner: $('waveBanner'),
  toast: $('toast'),
  towerPanel: $('towerPanel'),
  tpIcon: $('tpIcon'),
  tpName: $('tpName'),
  tpLevel: $('tpLevel'),
  tpStats: $('tpStats'),
  upgradeBtn: $('upgradeBtn'),
  sellBtn: $('sellBtn'),
  tpClose: $('tpClose'),
  pauseOverlay: $('pauseOverlay'),
  overlay: $('overlay'),
  ovIcon: $('ovIcon'),
  ovTitle: $('ovTitle'),
  ovText: $('ovText'),
  ovStats: $('ovStats'),
  ovBtn: $('ovBtn'),
  ovHint: $('ovHint')
};
const uiCache = {};
let overlayMode = 'start';

function syncUI(force) {
  if (!G) return;
  if (force || uiCache.lives !== G.lives) {
    els.lives.textContent = G.lives;
    uiCache.lives = G.lives;
  }
  if (force || uiCache.gold !== G.gold) {
    els.gold.textContent = fmt(G.gold);
    uiCache.gold = G.gold;
    updateShop();
    if (G.selectedTower) updateTowerPanel();
  }
  const waveTxt = `${G.wave}/${MAX_WAVE}`;
  if (force || uiCache.wave !== waveTxt) {
    els.wave.textContent = waveTxt;
    uiCache.wave = waveTxt;
  }
  if (force || uiCache.best !== best) {
    els.best.textContent = best;
    uiCache.best = best;
  }
  if (force || uiCache.phase !== G.phase || uiCache.sel !== G.selectedType) {
    uiCache.phase = G.phase;
    uiCache.sel = G.selectedType;
    updateShop();
  }
  if (force || uiCache.paused !== G.paused) {
    uiCache.paused = G.paused;
    els.pauseOverlay.classList.toggle('hidden', !G.paused);
    els.pauseBtn.textContent = G.paused ? '▶' : '⏸';
    els.pauseBtn.classList.toggle('on', G.paused);
  }
  if (force || uiCache.speed !== G.speed) {
    uiCache.speed = G.speed;
    els.speedBtn.textContent = G.speed + '×';
  }
  const hint = computeHint();
  if (force || uiCache.hint !== hint) {
    uiCache.hint = hint;
    els.hint.textContent = hint;
    els.hint.classList.toggle('hidden', !hint);
  }
  const info = computeWaveInfo();
  if (force || uiCache.info !== info) {
    uiCache.info = info;
    els.waveInfo.innerHTML = info;
  }
}

function updateShop() {
  document.querySelectorAll('.card').forEach(card => {
    const type = card.dataset.type;
    const def = TOWERS[type];
    card.classList.toggle('selected', G.selectedType === type);
    card.classList.toggle('disabled', G.gold < def.cost);
  });
  const labels = {
    build: `웨이브 ${G.wave + 1} 시작`,
    wave: '웨이브 진행 중',
    over: '게임 오버',
    victory: '방어 성공',
    menu: '웨이브 시작'
  };
  els.startBtn.textContent = labels[G.phase] || '웨이브 시작';
  els.startBtn.disabled = G.phase !== 'build';
}

function computeHint() {
  if (!G) return '';
  if (G.phase === 'menu' || G.phase === 'over' || G.phase === 'victory') return '';
  if (G.selectedTower) return '';
  if (G.selectedType) {
    const def = TOWERS[G.selectedType];
    return `${def.name} · ${def.desc} · 클릭해 건설 (우클릭 취소)`;
  }
  if (G.phase === 'wave') return '웨이브 진행 중 · P 일시정지';
  return '1–4 타워 선택 · Space 웨이브 시작';
}

function computeWaveInfo() {
  if (G.phase === 'wave') {
    const total = G.spawnQueue.length + G.enemies.length;
    return `<div class="wi-top">웨이브 <b>${G.wave}</b></div><div class="wi-list">남은 적 ${total}</div>`;
  }
  const next = G.wave + 1;
  if (next > MAX_WAVE) {
    return '<div class="wi-top">모든 웨이브 완료</div><div class="wi-list">방어 성공!</div>';
  }
  const groups = waveGroups(next);
  const counts = {};
  for (const g of groups) counts[g.type] = (counts[g.type] || 0) + g.count;
  const list = Object.entries(counts).map(([t, n]) => `${ENEMIES[t].name} ${n}`).join(' · ');
  return `<div class="wi-top">다음 웨이브 <b>${next}</b></div><div class="wi-list">${list}</div>`;
}

function showBanner(text, boss) {
  els.waveBanner.textContent = text;
  els.waveBanner.classList.toggle('boss', !!boss);
  els.waveBanner.classList.remove('show');
  void els.waveBanner.offsetWidth;
  els.waveBanner.classList.add('show');
}

let toastTimer = null;
function showToast(text) {
  if (!els.toast) return;
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

function flashGold() {
  els.goldStat.classList.remove('flash');
  void els.goldStat.offsetWidth;
  els.goldStat.classList.add('flash');
  setTimeout(() => els.goldStat.classList.remove('flash'), 650);
}

function selectType(type) {
  if (!G || G.phase === 'over' || G.phase === 'victory' || G.phase === 'menu') return;
  G.selectedTower = null;
  closeTowerPanel();
  if (G.selectedType === type) {
    G.selectedType = null;
  } else {
    G.selectedType = type;
    if (G.gold < TOWERS[type].cost) flashGold();
  }
  syncUI(true);
}

function selectTower(t) {
  if (!G) return;
  G.selectedType = null;
  G.selectedTower = t;
  updateTowerPanel();
  els.towerPanel.classList.remove('hidden');
  syncUI(true);
}

function closeTowerPanel() {
  els.towerPanel.classList.add('hidden');
  if (G) G.selectedTower = null;
}

function updateTowerPanel() {
  const t = G && G.selectedTower;
  if (!t) {
    els.towerPanel.classList.add('hidden');
    return;
  }
  const s = towerStats(t);
  els.tpIcon.textContent = t.def.icon;
  els.tpName.textContent = t.def.name;
  els.tpLevel.textContent = `Lv.${t.level} / 5`;
  let extraLabel = 'DPS', extraValue = Math.round(s.dmg * s.rate);
  if (t.type === 'cannon') { extraLabel = '폭발 범위'; extraValue = (s.splash / CELL).toFixed(1) + '칸'; }
  if (t.type === 'frost') { extraLabel = '감속'; extraValue = Math.round(s.slow * 100) + '%'; }
  if (t.type === 'bolt') { extraLabel = '연쇄'; extraValue = s.chain + '명'; }
  els.tpStats.innerHTML = `
    <div class="tp-stat"><span>공격력</span><b>${Math.round(s.dmg)}</b></div>
    <div class="tp-stat"><span>공격속도</span><b>${s.rate.toFixed(2)}/s</b></div>
    <div class="tp-stat"><span>사거리</span><b>${(s.range / CELL).toFixed(1)}칸</b></div>
    <div class="tp-stat"><span>${extraLabel}</span><b>${extraValue}</b></div>`;
  if (t.level >= 5) {
    els.upgradeBtn.innerHTML = '최대 레벨';
    els.upgradeBtn.disabled = true;
  } else {
    const cost = upgradeCost(t);
    els.upgradeBtn.innerHTML = `업그레이드 <span>${fmt(cost)}💰</span>`;
    els.upgradeBtn.disabled = G.gold < cost;
  }
  els.sellBtn.innerHTML = `판매 <span>+${fmt(sellValue(t))}💰</span>`;
}

function tryPlace(c, r) {
  if (!G || !G.selectedType) return;
  const def = TOWERS[G.selectedType];
  if (G.gold < def.cost) {
    flashGold();
    sfx('error');
    return;
  }
  if (!canBuild(c, r)) {
    spawnText((c + 0.5) * CELL, (r + 0.5) * CELL, '건설 불가', '#f87171', 12);
    sfx('error');
    return;
  }
  const t = {
    type: G.selectedType, def, c, r,
    x: (c + 0.5) * CELL, y: (r + 0.5) * CELL,
    level: 1, angle: -Math.PI / 2, cooldown: 0,
    invested: def.cost, flash: 0, spin: 0
  };
  G.towers.push(t);
  OCC.set(cellKey(c, r), t);
  G.gold -= def.cost;
  G.stats.built++;
  spawnBurst(t.x, t.y, def.color, 10, 110);
  G.effects.push({ kind: 'ring', x: t.x, y: t.y, r: 8, r1: 34, color: def.color, life: 0.4, max: 0.4 });
  sfx('build');
  syncUI(true);
}

function upgradeSelected() {
  const t = G && G.selectedTower;
  if (!t || t.level >= 5) return;
  const cost = upgradeCost(t);
  if (G.gold < cost) {
    flashGold();
    sfx('error');
    return;
  }
  G.gold -= cost;
  t.invested += cost;
  t.level++;
  G.totalUpgrades++;
  t.flash = 0.22;
  spawnBurst(t.x, t.y, t.def.color, 14, 130);
  G.effects.push({ kind: 'ring', x: t.x, y: t.y, r: 10, r1: 40, color: t.def.color, life: 0.5, max: 0.5 });
  spawnText(t.x, t.y - 26, 'LV.' + t.level, t.def.color, 13);
  sfx('upgrade');
  syncUI(true);
  updateTowerPanel();
}

function sellSelected() {
  const t = G && G.selectedTower;
  if (!t) return;
  const refund = sellValue(t);
  G.gold += refund;
  OCC.delete(cellKey(t.c, t.r));
  G.towers = G.towers.filter(x => x !== t);
  spawnBurst(t.x, t.y, '#ffd166', 12, 120);
  spawnText(t.x, t.y - 22, `+${refund}`, '#ffd166', 13);
  sfx('sell');
  closeTowerPanel();
  syncUI(true);
}

function togglePause() {
  if (!G || (G.phase !== 'build' && G.phase !== 'wave')) return;
  G.paused = !G.paused;
  syncUI(true);
}

function cycleSpeed() {
  if (!G) return;
  G.speed = G.speed === 1 ? 2 : G.speed === 2 ? 3 : 1;
  syncUI(true);
}

/* ---------- overlay ---------- */
function showOverlay(cfg) {
  overlayMode = cfg.mode || 'start';
  els.ovIcon.textContent = cfg.icon;
  els.ovTitle.textContent = cfg.title;
  els.ovText.innerHTML = cfg.text;
  els.ovStats.innerHTML = (cfg.stats || []).map(s => `<div><span>${s.label}</span><b>${s.value}</b></div>`).join('');
  els.ovBtn.textContent = cfg.btn;
  els.ovHint.textContent = cfg.hint || '';
  els.overlay.classList.remove('hidden');
}
function hideOverlay() {
  els.overlay.classList.add('hidden');
}

function showStartOverlay() {
  showOverlay({
    mode: 'start',
    icon: '🛡️',
    title: '크리스탈 가드',
    text: '길을 따라 몰려오는 적을 막고 크리스탈을 지켜내세요.<br>20개의 웨이브를 버티면 승리합니다.',
    stats: [
      { label: '타워 선택', value: '1 – 4' },
      { label: '웨이브 시작', value: 'Space' },
      { label: '일시정지', value: 'P' }
    ],
    btn: '게임 시작',
    hint: '타워를 업그레이드하고 크리스탈을 지키세요'
  });
}

function startGame() {
  ac();
  newGame('build');
  hideOverlay();
  showBanner('방어 시작', false);
  syncUI(true);
}

function restartGame() {
  ac();
  newGame('build');
  hideOverlay();
  syncUI(true);
}

function saveBest() {
  if (G.wave > best) {
    best = G.wave;
    try { localStorage.setItem('crystalguard.best', String(best)); } catch (e) { /* ignore */ }
  }
}

function gameOver() {
  if (G.phase === 'over') return;
  G.phase = 'over';
  G.paused = false;
  saveBest();
  sfx('lose');
  showOverlay({
    mode: 'restart',
    icon: '💀',
    title: '방어 실패',
    text: `웨이브 ${G.wave}에서 크리스탈이 파괴되었습니다.<br>타워 배치와 업그레이드를 다시 점검해 보세요.`,
    stats: [
      { label: '도달 웨이브', value: G.wave + ' / ' + MAX_WAVE },
      { label: '처치', value: fmt(G.stats.kills) },
      { label: '최고 기록', value: best }
    ],
    btn: '다시 도전',
    hint: '화면 상단의 ↻ 버튼으로도 재시작할 수 있습니다'
  });
  syncUI(true);
}

function victory() {
  if (G.phase === 'victory') return;
  G.phase = 'victory';
  G.paused = false;
  if (G.wave > best) best = G.wave;
  try { localStorage.setItem('crystalguard.best', String(best)); } catch (e) { /* ignore */ }
  sfx('win');
  for (let i = 0; i < 70; i++) {
    spawnBurst(PATH.end.x, PATH.end.y, ['#67e8f9', '#a78bfa', '#ffd166', '#f472b6'][i % 4], 1, 320);
  }
  showOverlay({
    mode: 'restart',
    icon: '🏆',
    title: '방어 성공!',
    text: `20개의 웨이브를 모두 막아냈습니다.<br>크리스탈은 당신의 손에 안전합니다.`,
    stats: [
      { label: '남은 생명', value: G.lives },
      { label: '처치', value: fmt(G.stats.kills) },
      { label: '최고 기록', value: best }
    ],
    btn: '한 번 더',
    hint: '더 적은 생명으로 클리어에 도전해 보세요'
  });
  syncUI(true);
}


/* =========================================================
   RENDERING
   ========================================================= */
const canvas = $('game');
const ctx = canvas.getContext('2d');
let gfxTime = 0;

const bgCanvas = document.createElement('canvas');
bgCanvas.width = W;
bgCanvas.height = H;

const vignette = ctx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, H * 0.92);
vignette.addColorStop(0, 'rgba(0,0,0,0)');
vignette.addColorStop(1, 'rgba(2,5,12,.62)');

function buildBackground() {
  const c = bgCanvas.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0a1224');
  g.addColorStop(0.55, '#0a1020');
  g.addColorStop(1, '#070c17');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  let r = c.createRadialGradient(W * 0.18, H * 0.05, 20, W * 0.18, H * 0.05, 520);
  r.addColorStop(0, 'rgba(56,189,248,.12)');
  r.addColorStop(1, 'rgba(56,189,248,0)');
  c.fillStyle = r;
  c.fillRect(0, 0, W, H);

  r = c.createRadialGradient(W * 0.94, H * 1.02, 20, W * 0.94, H * 1.02, 560);
  r.addColorStop(0, 'rgba(168,85,247,.12)');
  r.addColorStop(1, 'rgba(168,85,247,0)');
  c.fillStyle = r;
  c.fillRect(0, 0, W, H);

  // subtle grid
  c.strokeStyle = 'rgba(120,170,255,.045)';
  c.lineWidth = 1;
  for (let x = 0; x <= W; x += CELL) {
    c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke();
  }
  for (let y = 0; y <= H; y += CELL) {
    c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke();
  }
  // dots at intersections
  c.fillStyle = 'rgba(140,190,255,.10)';
  for (let x = 0; x <= W; x += CELL) {
    for (let y = 0; y <= H; y += CELL) {
      c.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  // corner ornaments
  c.strokeStyle = 'rgba(125,211,252,.10)';
  c.lineWidth = 2;
  const corners = [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]];
  for (const [x, y, sx, sy] of corners) {
    c.beginPath();
    c.moveTo(x + sx * 8, y + sy * 46);
    c.lineTo(x + sx * 8, y + sy * 8);
    c.lineTo(x + sx * 46, y + sy * 8);
    c.stroke();
  }
  // faint decorative rings
  c.strokeStyle = 'rgba(148,163,184,.05)';
  c.lineWidth = 1;
  for (const [x, y, rad] of [[140, 470, 120], [880, 90, 150], [520, 580, 190]]) {
    c.beginPath(); c.arc(x, y, rad, 0, TAU); c.stroke();
  }
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(rect.width * dpr));
  const h = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

function pathLine(width, color) {
  ctx.beginPath();
  const p0 = PATH.pts[0];
  ctx.moveTo(p0.x, p0.y);
  for (let i = 1; i < PATH.pts.length; i++) ctx.lineTo(PATH.pts[i].x, PATH.pts[i].y);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
}

function drawPath() {
  ctx.save();
  pathLine(56, 'rgba(3,7,15,.85)');
  pathLine(50, '#1c2b49');
  pathLine(40, '#101c33');
  ctx.shadowColor = 'rgba(56,189,248,.35)';
  ctx.shadowBlur = 16;
  pathLine(2, 'rgba(86,200,255,.35)');
  ctx.shadowBlur = 0;
  ctx.setLineDash([11, 17]);
  ctx.lineDashOffset = -gfxTime * 34;
  pathLine(3, 'rgba(125,223,255,.5)');
  ctx.setLineDash([]);
  ctx.restore();

  // direction chevrons
  ctx.save();
  for (const p of PATH.chevrons) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.strokeStyle = 'rgba(125,211,252,' + (0.12 + 0.06 * Math.sin(gfxTime * 3 + p.x * 0.01)) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-4, -5); ctx.lineTo(3, 0); ctx.lineTo(-4, 5);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawGate() {
  const y = PATH.start.y;
  const g = ctx.createRadialGradient(0, y, 2, 0, y, 88);
  g.addColorStop(0, 'rgba(125,211,252,.5)');
  g.addColorStop(0.5, 'rgba(99,102,241,.18)');
  g.addColorStop(1, 'rgba(99,102,241,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, y, 88, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(165,243,252,.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(2, y, 16, 40, 0, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(165,243,252,.2)';
  ctx.beginPath();
  ctx.ellipse(2, y, 10, 27, 0, 0, TAU);
  ctx.stroke();
}

function drawBase() {
  const b = PATH.end;
  const pulse = 1 + Math.sin(gfxTime * 2.2) * 0.06;
  const low = G.lives <= 5;
  const glow = low ? '#f87171' : '#67e8f9';

  ctx.save();
  ctx.translate(b.x, b.y);

  // ground glow
  const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 70 * pulse);
  g.addColorStop(0, hexA(glow, 0.42));
  g.addColorStop(0.55, hexA(glow, 0.12));
  g.addColorStop(1, hexA(glow, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 70 * pulse, 0, TAU);
  ctx.fill();

  // pedestal
  ctx.fillStyle = 'rgba(6,12,24,.85)';
  ctx.beginPath();
  ctx.ellipse(0, 16, 26, 9, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(glow, 0.55);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 15, 24, 8, 0, 0, TAU);
  ctx.stroke();

  // crystal
  const yy = -6 + Math.sin(gfxTime * 1.8) * 2;
  ctx.save();
  ctx.translate(0, yy);
  ctx.rotate(Math.sin(gfxTime * 0.8) * 0.06);
  ctx.shadowColor = glow;
  ctx.shadowBlur = 22;
  const cg = ctx.createLinearGradient(0, -26, 0, 18);
  cg.addColorStop(0, '#e0faff');
  cg.addColorStop(0.45, low ? '#fb7185' : '#67e8f9');
  cg.addColorStop(1, low ? '#7f1d1d' : '#2563eb');
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(0, -28);
  ctx.lineTo(15, -7);
  ctx.lineTo(8, 18);
  ctx.lineTo(-8, 18);
  ctx.lineTo(-15, -7);
  ctx.closePath();
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = 'rgba(255,255,255,.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -28); ctx.lineTo(0, 18);
  ctx.moveTo(-15, -7); ctx.lineTo(0, 2); ctx.lineTo(15, -7);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,.22)';
  ctx.beginPath();
  ctx.moveTo(0, -28); ctx.lineTo(0, 2); ctx.lineTo(-15, -7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // orbiting shards
  ctx.fillStyle = hexA(glow, 0.75);
  for (let i = 0; i < 3; i++) {
    const a = gfxTime * 0.9 + i * TAU / 3;
    const rx = Math.cos(a) * 30;
    const ry = Math.sin(a) * 10 - 4;
    ctx.beginPath();
    ctx.arc(rx, ry, 2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawRange(x, y, range, color, strong) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, range * 0.25, x, y, range);
  g.addColorStop(0, hexA(color, 0.015));
  g.addColorStop(1, hexA(color, strong ? 0.11 : 0.07));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(color, strong ? 0.75 : 0.42);
  ctx.lineWidth = 1.5;
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = -gfxTime * 18;
  ctx.beginPath();
  ctx.arc(x, y, range, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawPlacement() {
  if (G.phase === 'menu' || G.phase === 'over' || G.phase === 'victory') return;

  if (G.selectedTower) {
    const t = G.selectedTower;
    drawRange(t.x, t.y, towerStats(t).range, t.def.color, true);
    ctx.save();
    ctx.strokeStyle = hexA(t.def.color, 0.9);
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = gfxTime * 22;
    const x = t.c * CELL + 3, y = t.r * CELL + 3;
    roundRect(ctx, x, y, CELL - 6, CELL - 6, 8);
    ctx.stroke();
    ctx.restore();
  }

  if (!G.selectedType || !G.hoverCell) return;
  const { c, r } = G.hoverCell;
  const def = TOWERS[G.selectedType];
  const ok = canBuild(c, r) && G.gold >= def.cost;
  const color = ok ? def.color : '#f87171';
  const cx = (c + 0.5) * CELL, cy = (r + 0.5) * CELL;

  drawRange(cx, cy, def.base.range * CELL, color, true);

  ctx.save();
  roundRect(ctx, c * CELL + 3, r * CELL + 3, CELL - 6, CELL - 6, 8);
  ctx.fillStyle = hexA(color, ok ? 0.16 : 0.1);
  ctx.fill();
  ctx.strokeStyle = hexA(color, ok ? 0.9 : 0.55);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  if (ok) {
    drawTower({
      type: G.selectedType, def,
      x: cx, y: cy, level: 1,
      angle: -Math.PI / 2, spin: gfxTime * 1.4, flash: 0
    }, 0.42);
  }
}

function drawTower(t, alpha) {
  const a = alpha === undefined ? 1 : alpha;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(t.x, t.y);

  // ground glow
  const glow = ctx.createRadialGradient(0, 0, 2, 0, 0, 32);
  glow.addColorStop(0, hexA(t.def.color, 0.25));
  glow.addColorStop(1, hexA(t.def.color, 0));
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0, 0, 32, 0, TAU);
  ctx.fill();

  // base
  ctx.fillStyle = '#0d1729';
  ctx.beginPath();
  ctx.arc(0, 0, 19, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(t.def.color, 0.55);
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#091120';
  ctx.beginPath();
  ctx.arc(0, 0, 13.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = hexA(t.def.color, 0.22);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, 16.2, 0, TAU);
  ctx.stroke();

  // turret
  ctx.save();
  ctx.rotate(t.angle || 0);
  ctx.shadowColor = t.def.color;
  ctx.shadowBlur = 9;
  if (t.type === 'arrow') {
    ctx.strokeStyle = t.def.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(1, 0, 11, -1.15, 1.15);
    ctx.stroke();
    ctx.fillStyle = '#e7ffee';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(4, -4.2);
    ctx.lineTo(-7, -2.6);
    ctx.lineTo(-7, 2.6);
    ctx.lineTo(4, 4.2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = t.def.color;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(11, -3);
    ctx.lineTo(11, 3);
    ctx.closePath();
    ctx.fill();
  } else if (t.type === 'cannon') {
    ctx.fillStyle = '#2b2114';
    roundRect(ctx, -6, -7.5, 22, 15, 4);
    ctx.fill();
    ctx.strokeStyle = '#ffb457';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#ffb457';
    roundRect(ctx, 2, -7.5, 4, 15, 2);
    ctx.fill();
    ctx.fillStyle = '#0a0703';
    ctx.beginPath();
    ctx.arc(16.5, 0, 5.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#ffd08a';
    ctx.beginPath();
    ctx.arc(16.5, 0, 5.2, 0, TAU);
    ctx.stroke();
  } else if (t.type === 'frost') {
    ctx.rotate((t.spin || 0) * 0.7);
    ctx.strokeStyle = '#dff8ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      const a2 = i * Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(-Math.cos(a2) * 12, -Math.sin(a2) * 12);
      ctx.lineTo(Math.cos(a2) * 12, Math.sin(a2) * 12);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(Math.cos(a2) * 7, Math.sin(a2) * 7);
      ctx.lineTo(Math.cos(a2) * 9 - Math.sin(a2) * 3.5, Math.sin(a2) * 9 + Math.cos(a2) * 3.5);
      ctx.moveTo(Math.cos(a2) * 7, Math.sin(a2) * 7);
      ctx.lineTo(Math.cos(a2) * 9 + Math.sin(a2) * 3.5, Math.sin(a2) * 9 - Math.cos(a2) * 3.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#bae6fd';
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, TAU);
    ctx.fill();
  } else if (t.type === 'bolt') {
    ctx.fillStyle = '#f3e8ff';
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(1, -6);
    ctx.lineTo(6, -1.6);
    ctx.lineTo(-3, -6.5);
    ctx.lineTo(0, 0);
    ctx.lineTo(-3, 6.5);
    ctx.lineTo(6, 1.6);
    ctx.lineTo(1, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = t.def.color;
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // muzzle flash
  if (t.flash > 0) {
    const f = clamp(t.flash / 0.1, 0, 1);
    ctx.fillStyle = hexA(t.def.color, 0.75 * f);
    ctx.beginPath();
    ctx.arc(Math.cos(t.angle) * 19, Math.sin(t.angle) * 19, 6 * f + 2, 0, TAU);
    ctx.fill();
  }

  // level pips
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(-13 + i * 6.5, 15.5, 2.1, 0, TAU);
    ctx.fillStyle = i < (t.level || 1) ? '#ffd166' : 'rgba(255,255,255,.14)';
    ctx.fill();
  }

  ctx.restore();
}

function drawTowers() {
  for (const t of G.towers) drawTower(t);
}

function drawHpBar(e) {
  const w = e.def.boss ? 66 : Math.max(26, e.r * 2.1);
  const h = e.def.boss ? 6 : 4;
  const x = e.x - w / 2;
  const y = e.y - e.r - (e.def.boss ? 16 : 11);
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(3,7,15,.72)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  const ratio = clamp(e.hp / e.maxHp, 0, 1);
  if (ratio > 0) {
    const col = ratio > 0.5 ? '#4ade80' : ratio > 0.25 ? '#fbbf24' : '#f87171';
    roundRect(ctx, x + 1, y + 1, Math.max(1, (w - 2) * ratio), h - 2, (h - 2) / 2);
    ctx.fillStyle = col;
    ctx.fill();
  }
  ctx.restore();
}

function drawEnemy(e) {
  const def = e.def;
  const r = e.r;
  ctx.save();
  ctx.translate(e.x, e.y);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.38)';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.92, r * 0.95, r * 0.36, 0, 0, TAU);
  ctx.fill();

  // slow aura
  if (G.time < e.slowUntil) {
    ctx.save();
    ctx.strokeStyle = 'rgba(125,211,252,.65)';
    ctx.setLineDash([4, 4]);
    ctx.lineDashOffset = gfxTime * 26;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(0, 0, r + 4, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  ctx.translate(0, Math.sin(e.bob) * (def.boss ? 1.4 : 2));

  if (e.type === 'slime') {
    const sq = 1 + Math.sin(e.bob) * 0.07;
    ctx.save();
    ctx.scale(1 / sq, sq);
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.45, r * 0.1, 0, 0, r * 1.25);
    g.addColorStop(0, '#a7f3d0');
    g.addColorStop(0.5, def.color);
    g.addColorStop(1, def.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 1.05, r * 0.95, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.beginPath();
    ctx.ellipse(-r * 0.33, -r * 0.4, r * 0.2, r * 0.12, -0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#123122';
    ctx.beginPath();
    ctx.arc(-r * 0.32, -r * 0.05, r * 0.13, 0, TAU);
    ctx.arc(r * 0.32, -r * 0.05, r * 0.13, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#d1fae5';
    ctx.beginPath();
    ctx.arc(-r * 0.35, -r * 0.09, r * 0.045, 0, TAU);
    ctx.arc(r * 0.29, -r * 0.09, r * 0.045, 0, TAU);
    ctx.fill();
    ctx.restore();
  } else if (e.type === 'bat') {
    const flap = Math.sin(e.bob) * 0.5;
    ctx.fillStyle = def.dark;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, 0);
    ctx.lineTo(-r * 1.9, -r * (0.55 + flap * 0.5));
    ctx.lineTo(-r * 1.55, r * 0.15);
    ctx.lineTo(-r * 1.15, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(r * 0.4, 0);
    ctx.lineTo(r * 1.9, -r * (0.55 + flap * 0.5));
    ctx.lineTo(r * 1.55, r * 0.15);
    ctx.lineTo(r * 1.15, r * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = def.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.62, r * 0.8, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.6); ctx.lineTo(-r * 0.2, -r * 1.15); ctx.lineTo(0, -r * 0.65);
    ctx.moveTo(r * 0.45, -r * 0.6); ctx.lineTo(r * 0.2, -r * 1.15); ctx.lineTo(0, -r * 0.65);
    ctx.fill();
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.1, r * 0.12, 0, TAU);
    ctx.arc(r * 0.22, -r * 0.1, r * 0.12, 0, TAU);
    ctx.fill();
  } else if (e.type === 'golem') {
    ctx.fillStyle = def.dark;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + Math.PI / 6;
      const rr = r * 1.05;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    const g = ctx.createLinearGradient(0, -r, 0, r);
    g.addColorStop(0, '#cbd5e1');
    g.addColorStop(1, '#64748b');
    ctx.fillStyle = g;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * TAU / 6 + Math.PI / 6;
      const rr = r * 0.86;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // cracks
    ctx.strokeStyle = 'rgba(251,146,60,.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-r * 0.35, -r * 0.5);
    ctx.lineTo(-r * 0.1, -r * 0.1);
    ctx.lineTo(-r * 0.3, r * 0.25);
    ctx.moveTo(r * 0.3, -r * 0.35);
    ctx.lineTo(r * 0.15, r * 0.1);
    ctx.lineTo(r * 0.4, r * 0.45);
    ctx.stroke();
    ctx.fillStyle = '#fb923c';
    ctx.shadowColor = '#fb923c';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(-r * 0.3, -r * 0.25, r * 0.11, 0, TAU);
    ctx.arc(r * 0.3, -r * 0.25, r * 0.11, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  } else if (e.type === 'wraith') {
    ctx.globalAlpha = 0.9;
    const g = ctx.createLinearGradient(0, -r, 0, r * 1.2);
    g.addColorStop(0, '#cffafe');
    g.addColorStop(0.5, def.color);
    g.addColorStop(1, 'rgba(14,116,144,.15)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, -r * 0.15, r * 0.8, Math.PI, 0);
    ctx.lineTo(r * 0.8, r * 0.4);
    for (let i = 0; i < 4; i++) {
      const x1 = r * 0.8 - i * r * 0.4;
      ctx.quadraticCurveTo(x1 - r * 0.2, r * (0.95 + Math.sin(e.bob + i) * 0.12), x1 - r * 0.4, r * 0.65);
    }
    ctx.lineTo(-r * 0.8, r * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#052e33';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.25, r * 0.12, r * 0.18, 0, 0, TAU);
    ctx.ellipse(r * 0.28, -r * 0.25, r * 0.12, r * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(207,250,254,.9)';
    ctx.beginPath();
    ctx.arc(-r * 0.28, -r * 0.29, r * 0.04, 0, TAU);
    ctx.arc(r * 0.28, -r * 0.29, r * 0.04, 0, TAU);
    ctx.fill();
  } else if (e.type === 'boss') {
    const spin = gfxTime * 0.5;
    ctx.save();
    ctx.rotate(spin);
    ctx.fillStyle = 'rgba(248,113,113,.16)';
    ctx.beginPath();
    for (let i = 0; i < 20; i++) {
      const a = i * TAU / 20;
      const rr = i % 2 === 0 ? r * 1.55 : r * 1.18;
      if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.15);
    g.addColorStop(0, '#fecaca');
    g.addColorStop(0.45, def.color);
    g.addColorStop(1, def.dark);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // crown
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, -r * 0.72);
    ctx.lineTo(-r * 0.35, -r * 1.1);
    ctx.lineTo(-r * 0.1, -r * 0.82);
    ctx.lineTo(0, -r * 1.18);
    ctx.lineTo(r * 0.1, -r * 0.82);
    ctx.lineTo(r * 0.35, -r * 1.1);
    ctx.lineTo(r * 0.55, -r * 0.72);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde68a';
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(-r * 0.3, -r * 0.1, r * 0.14, r * 0.1, -0.2, 0, TAU);
    ctx.ellipse(r * 0.3, -r * 0.1, r * 0.14, r * 0.1, 0.2, 0, TAU);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  if (e.hitFlash > 0) {
    ctx.globalAlpha = e.hitFlash * 0.5;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(0, 0, r * (e.type === 'boss' ? 1.02 : 1), 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  drawHpBar(e);
}

function drawEnemies() {
  const list = G.enemies.slice().sort((a, b) => a.y - b.y);
  for (const e of list) drawEnemy(e);
}

function drawProjectiles() {
  for (const p of G.projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle || 0);
    if (p.kind === 'cannon') {
      ctx.shadowColor = '#ffb457';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#3b2a16';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = '#ffb457';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,180,87,.5)';
      ctx.beginPath();
      ctx.arc(-8, 0, 4, 0, TAU);
      ctx.fill();
    } else {
      ctx.shadowColor = '#b9ffd0';
      ctx.shadowBlur = 10;
      ctx.strokeStyle = 'rgba(200,255,212,.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(4, 0);
      ctx.stroke();
      ctx.fillStyle = '#eafff0';
      ctx.beginPath();
      ctx.moveTo(9, 0);
      ctx.lineTo(2, -3);
      ctx.lineTo(2, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
}

function drawEffects() {
  for (const e of G.effects) {
    const t = 1 - e.life / e.max;
    ctx.save();
    if (e.kind === 'ring') {
      const r = lerp(e.r, e.r1, 1 - Math.pow(1 - t, 2));
      ctx.globalAlpha = Math.max(0, 1 - t);
      ctx.strokeStyle = e.color;
      ctx.lineWidth = 2.5 * (1 - t) + 0.8;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = Math.max(0, 0.18 * (1 - t));
      ctx.fillStyle = e.color;
      ctx.beginPath();
      ctx.arc(e.x, e.y, r, 0, TAU);
      ctx.fill();
    } else if (e.kind === 'bolt') {
      if (e.pts.length > 1) {
        ctx.globalAlpha = Math.max(0, e.life / e.max);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 5;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i < e.pts.length; i++) {
          const p = e.pts[i];
          const jx = i === 0 || i === e.pts.length - 1 ? p.x : p.x + Math.sin(gfxTime * 70 + i * 9) * 5;
          const jy = i === 0 || i === e.pts.length - 1 ? p.y : p.y + Math.cos(gfxTime * 64 + i * 7) * 5;
          if (i === 0) ctx.moveTo(jx, jy);
          else ctx.lineTo(jx, jy);
        }
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.8;
        ctx.shadowBlur = 0;
        ctx.stroke();
      }
    }
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of G.particles) {
    const a = clamp(p.life / p.max, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.5), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const t of G.texts) {
    const a = clamp(t.life / t.max * 2, 0, 1);
    ctx.globalAlpha = a;
    ctx.font = `800 ${t.size}px "Segoe UI","Malgun Gothic",sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillText(t.text, t.x + 1, t.y + 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function render() {
  const sx = canvas.width / W;
  const sy = canvas.height / H;
  ctx.setTransform(sx, 0, 0, sy, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(bgCanvas, 0, 0, W, H);

  ctx.save();
  if (G.shake > 0.2) {
    ctx.translate(rand(-1, 1) * G.shake * 0.55, rand(-1, 1) * G.shake * 0.55);
  }
  drawPath();
  drawGate();
  drawBase();
  drawPlacement();
  drawTowers();
  drawEnemies();
  drawProjectiles();
  drawEffects();
  drawParticles();
  drawTexts();
  ctx.restore();

  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, W, H);
}


/* =========================================================
   INPUT / LOOP / INIT
   ========================================================= */

function pointerPos(ev) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (ev.clientX - r.left) * (W / r.width),
    y: (ev.clientY - r.top) * (H / r.height)
  };
}

function cellFromEvent(ev) {
  const p = pointerPos(ev);
  const c = Math.floor(p.x / CELL);
  const r = Math.floor(p.y / CELL);
  if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return null;
  return { c, r };
}

canvas.addEventListener('pointermove', ev => {
  if (!G) return;
  const cell = cellFromEvent(ev);
  G.hoverCell = cell;
  G.pointer = pointerPos(ev);
});
canvas.addEventListener('pointerleave', () => {
  if (G) G.hoverCell = null;
});
canvas.addEventListener('pointerdown', ev => {
  if (!G || ev.button !== 0) return;
  if (G.phase === 'menu' || G.phase === 'over' || G.phase === 'victory') return;
  const cell = cellFromEvent(ev);
  if (!cell) return;
  G.hoverCell = cell;
  const t = towerAt(cell.c, cell.r);
  if (t) {
    selectTower(t);
    return;
  }
  if (G.selectedType) {
    tryPlace(cell.c, cell.r);
    return;
  }
  closeTowerPanel();
  syncUI(true);
});
canvas.addEventListener('contextmenu', ev => {
  ev.preventDefault();
  if (!G) return;
  G.selectedType = null;
  closeTowerPanel();
  syncUI(true);
});
canvas.addEventListener('dblclick', ev => ev.preventDefault());

document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('click', () => selectType(card.dataset.type));
});

els.startBtn.addEventListener('click', () => {
  if (G.phase === 'build') startWave();
});
els.speedBtn.addEventListener('click', cycleSpeed);
els.pauseBtn.addEventListener('click', togglePause);
els.restartBtn.addEventListener('click', () => {
  if (!G) return;
  restartGame();
});
els.soundBtn.addEventListener('click', () => {
  muted = !muted;
  els.soundBtn.textContent = muted ? '🔇' : '🔊';
  els.soundBtn.classList.toggle('on', !muted);
  if (!muted) sfx('build');
});
els.tpClose.addEventListener('click', () => {
  closeTowerPanel();
  syncUI(true);
});
els.upgradeBtn.addEventListener('click', upgradeSelected);
els.sellBtn.addEventListener('click', sellSelected);
els.ovBtn.addEventListener('click', () => {
  if (overlayMode === 'start') startGame();
  else restartGame();
});

window.addEventListener('keydown', ev => {
  if (ev.repeat) return;
  const k = ev.key.toLowerCase();
  if (k === ' ') {
    ev.preventDefault();
    if (G.phase === 'build') startWave();
    else if (G.phase === 'menu') startGame();
    return;
  }
  if (k === 'enter') {
    if (!els.overlay.classList.contains('hidden')) {
      ev.preventDefault();
      if (overlayMode === 'start') startGame();
      else restartGame();
    }
    return;
  }
  if (k === 'escape') {
    G.selectedType = null;
    closeTowerPanel();
    syncUI(true);
    return;
  }
  if (k === 'p') { togglePause(); return; }
  if (k === 'f') { cycleSpeed(); return; }
  if (k === 'u') { upgradeSelected(); return; }
  if (k >= '1' && k <= '4') {
    const type = TOWER_ORDER[parseInt(k, 10) - 1];
    if (type) selectType(type);
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && G && G.phase === 'wave' && !G.paused) togglePause();
});

window.addEventListener('resize', resizeCanvas);
if (window.ResizeObserver) {
  new ResizeObserver(() => resizeCanvas()).observe(canvas);
}

/* ---------- game loop ---------- */
let lastTime = performance.now();
let uiTimer = 0;

function frame(now) {
  const raw = clamp((now - lastTime) / 1000, 0, 0.05);
  lastTime = now;
  gfxTime += raw;

  if (G && !G.paused && (G.phase === 'build' || G.phase === 'wave')) {
    let remaining = raw * G.speed;
    let guard = 0;
    while (remaining > 1e-4 && guard < 24) {
      const step = Math.min(remaining, 1 / 90);
      update(step);
      remaining -= step;
      guard++;
      if (G.phase !== 'build' && G.phase !== 'wave') break;
    }
  }

  render();

  uiTimer += raw;
  if (uiTimer >= 0.08) {
    uiTimer = 0;
    syncUI(false);
  }
  requestAnimationFrame(frame);
}

/* ---------- boot ---------- */
buildBackground();
resizeCanvas();
newGame('menu');
showStartOverlay();
syncUI(true);
requestAnimationFrame(frame);

// debug / tinkering hook
window.CG = {
  get state() { return G; },
  startGame, restartGame, startWave, selectType, selectTower, tryPlace,
  upgradeSelected, sellSelected, upgradeCost, towerStats, waveGroups,
  TOWERS, ENEMIES, PATH, update
};
