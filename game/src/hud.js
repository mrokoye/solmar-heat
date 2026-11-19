// The HUD: health, cash, wanted stars, ammo, speed, clock, objective line,
// toast messages, the minimap, and every menu screen.

import { CITY, MISSIONS } from './config.js';

function $(id) {
  return document.getElementById(id);
}

export function createHUD() {
  const minimap = $('minimap');
  const mctx = minimap ? minimap.getContext('2d') : null;
  let toastTimer = null;

  function setStars(wanted) {
    const el = $('stars');
    if (!el) return;
    let html = '';
    for (let i = 0; i < 5; i++) {
      html += `<span class="${i < wanted ? 'star on' : 'star'}">★</span>`;
    }
    el.innerHTML = html;
    el.classList.toggle('hot', wanted >= 3);
  }

  function formatClock(seconds) {
    const total = Math.floor(seconds) % 86400;
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  return {
    setObjective(text) {
      const el = $('objective-text');
      if (el) el.textContent = text || '';
    },
    setTimer(seconds) {
      const el = $('timer');
      if (!el) return;
      if (seconds > 0) {
        el.style.display = 'block';
        el.textContent = `⏱ ${Math.ceil(seconds)}s`;
        el.classList.toggle('urgent', seconds < 15);
      } else {
        el.style.display = 'none';
      }
    },
    toast(message, ms) {
      const el = $('toast');
      if (!el) return;
      el.textContent = message;
      el.style.opacity = '1';
      if (toastTimer) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        el.style.opacity = '0';
      }, ms || 3200);
    },
    flashDamage() {
      const el = $('damage');
      if (!el) return;
      el.style.opacity = '0.55';
      setTimeout(() => {
        el.style.opacity = '0';
      }, 180);
    },
    showScreen(name) {
      this._screen = name;
      for (const id of ['screen-title', 'screen-pause', 'screen-busted', 'screen-wasted', 'screen-complete', 'screen-intro']) {
        const el = $(id);
        if (el) el.style.display = id === `screen-${name}` ? 'flex' : 'none';
      }
      const hud = $('hud');
      if (hud) hud.style.display = (name === 'play' || name === 'intro') ? 'block' : 'none';
      const crosshair = $('crosshair');
      if (crosshair) crosshair.style.display = name === 'play' ? 'block' : 'none';
    },
    showIntro(mission) {
      const title = $('intro-title');
      const text = $('intro-text');
      if (title) title.textContent = mission.title;
      if (text) text.textContent = mission.intro;
      this.showScreen('intro');
    },
    showComplete(mission, isLast) {
      const title = $('complete-title');
      const reward = $('complete-reward');
      if (title) title.textContent = isLast ? 'SOLMAR HEAT — STORY COMPLETE' : `Mission complete: ${mission.title}`;
      if (reward) reward.textContent = isLast ? 'You pulled off the Solmar Heist. The city is yours, Rae.' : `+$${mission.reward} — next job unlocked`;
      this.showScreen('complete');
    },
    showBusted() {
      this.showScreen('busted');
    },
    showWasted() {
      this.showScreen('wasted');
    },
    fillMissionList(missionIndex, completed) {
      const list = $('mission-list');
      if (!list) return;
      list.innerHTML = '';
      MISSIONS.forEach((mission, i) => {
        const row = document.createElement('div');
        row.className = 'mission-row' + (i === missionIndex ? ' current' : '') + (completed.includes(i) ? ' done' : '');
        row.textContent = `${completed.includes(i) ? '✓ ' : ''}${i + 1}. ${mission.title} — $${mission.reward}`;
        list.appendChild(row);
      });
    },
    update(state) {
      const healthFill = $('health-fill');
      if (healthFill) {
        healthFill.style.width = `${Math.max(0, state.health)}%`;
        healthFill.className = state.health < 30 ? 'low' : '';
      }
      const cash = $('cash');
      if (cash) cash.textContent = `$${state.cash.toLocaleString('en-US')}`;
      setStars(state.wanted);
      const ammo = $('ammo');
      if (ammo) ammo.textContent = state.inCar ? '—' : `${state.ammo} / ${state.reserve}`;
      const speed = $('speed');
      if (speed) speed.textContent = state.inCar ? `${Math.round(Math.abs(state.speed) * 2.4)} mph` : '';
      const clock = $('clock');
      if (clock) clock.textContent = formatClock(state.clock);
      const missionLabel = $('mission-label');
      if (missionLabel) {
        missionLabel.textContent = state.mission ? `JOB ${state.missionIndex + 1}/${MISSIONS.length}: ${state.mission.title}` : 'FREE ROAM';
      }
      this.setTimer(state.timer || 0);
      // No crosshair while driving: it only means anything on foot.
      const crosshair = $('crosshair');
      if (crosshair && this._screen === 'play') {
        crosshair.style.display = state.inCar ? 'none' : 'block';
      }
      if (mctx) this.drawMinimap(state, mctx);
    },
    drawMinimap(state, ctx) {
      const S = 200;
      const scale = S / (CITY.half * 2 + 80);
      const toMap = (x, z) => [(x + CITY.half + 40) * scale, (z + CITY.half + 40) * scale];
      ctx.fillStyle = '#1a2230';
      ctx.fillRect(0, 0, S, S);
      // Sea and sand on the east edge.
      const [bx] = toMap(CITY.beachX, 0);
      ctx.fillStyle = '#e8c98f';
      ctx.fillRect(bx, 0, S - bx, S);
      const [sx] = toMap(CITY.seaX, 0);
      ctx.fillStyle = '#1e6f8e';
      ctx.fillRect(sx, 0, S - sx, S);
      // Streets.
      ctx.strokeStyle = '#6b7688';
      ctx.lineWidth = 2;
      for (const c of state.streets) {
        const [x1, y1] = toMap(c, -CITY.half);
        const [x2, y2] = toMap(c, CITY.half);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        const [x3, y3] = toMap(-CITY.half, c);
        const [x4, y4] = toMap(CITY.half, c);
        ctx.beginPath(); ctx.moveTo(x3, y3); ctx.lineTo(x4, y4); ctx.stroke();
      }
      // Mission target.
      if (state.target) {
        const [tx, ty] = toMap(state.target[0], state.target[1]);
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.moveTo(tx, ty - 7); ctx.lineTo(tx + 6, ty); ctx.lineTo(tx, ty + 7); ctx.lineTo(tx - 6, ty);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#ffd23f';
        ctx.beginPath(); ctx.arc(tx, ty, 10 + Math.sin(performance.now() / 300) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      // Traffic dots.
      ctx.fillStyle = '#f1c40f';
      for (const car of state.traffic || []) {
        const [cx, cy] = toMap(car.group.position.x, car.group.position.z);
        ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
      }
      // Police dots.
      ctx.fillStyle = '#3b82f6';
      for (const cop of state.cops || []) {
        const [cx, cy] = toMap(cop.group.position.x, cop.group.position.z);
        ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();
      }
      // Enemies.
      ctx.fillStyle = '#ef4444';
      for (const enemy of state.enemies || []) {
        if (!enemy.alive) continue;
        const [ex, ey] = toMap(enemy.mesh.position.x, enemy.mesh.position.z);
        ctx.beginPath(); ctx.arc(ex, ey, 2.5, 0, Math.PI * 2); ctx.fill();
      }
      // Player arrow.
      const [px, py] = toMap(state.playerX, state.playerZ);
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(Math.atan2(Math.sin(state.heading), Math.cos(state.heading)));
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -7); ctx.lineTo(5, 6); ctx.lineTo(0, 3); ctx.lineTo(-5, 6);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // North marker.
      ctx.fillStyle = '#e5e7eb';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.fillText('N', S - 16, 14);
    },
  };
}
