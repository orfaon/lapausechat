'use strict';

const DEFAULT_DOMAINS = ['x.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'bsky.app', 'facebook.com'];

let currentDomains = [];
let selectedMode   = 1;
let selectedDays   = new Set([1, 2, 3, 4, 5]);

/* ── Helpers ──────────────────────────────────────────────── */

function normalizeDomain(raw) {
  return raw.toLowerCase().trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '');
}

function isValidDomain(d) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d);
}

function fmt(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/* ── Mode selector ────────────────────────────────────────── */

document.querySelectorAll('.mode-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedMode = parseInt(btn.dataset.mode, 10);
    applyModeUI();
  });
});

function applyModeUI() {
  document.querySelectorAll('.mode-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.mode, 10) === selectedMode);
  });
  document.getElementById('section-mode1').classList.toggle('hidden', selectedMode !== 1);
  document.getElementById('section-mode2').classList.toggle('hidden', selectedMode !== 2);
  document.getElementById('section-mode3').classList.toggle('hidden', selectedMode !== 3);
  updateStatus();
}

/* ── Days buttons (mode 2) ────────────────────────────────── */

document.querySelectorAll('.day-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const day = parseInt(btn.dataset.day, 10);
    if (selectedDays.has(day)) { selectedDays.delete(day); btn.classList.remove('active'); }
    else                        { selectedDays.add(day);    btn.classList.add('active');    }
  });
});

function applyDaysUI(days) {
  selectedDays = new Set(days);
  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.toggle('active', selectedDays.has(parseInt(btn.dataset.day, 10)));
  });
}

/* ── Domain list ──────────────────────────────────────────── */

function renderDomains() {
  const list = document.getElementById('domain-list');
  list.innerHTML = '';
  if (currentDomains.length === 0) {
    list.innerHTML = '<div class="empty-state">Aucun site surveillé — le chat dort 😴</div>';
    return;
  }
  currentDomains.forEach((domain, idx) => {
    const chip = document.createElement('div');
    chip.className = 'domain-chip';
    chip.innerHTML = `
      <span class="name">${domain}${DEFAULT_DOMAINS.includes(domain) ? '<span class="default-tag">défaut</span>' : ''}</span>
      <button class="btn-remove" data-idx="${idx}" title="Supprimer">×</button>
    `;
    list.appendChild(chip);
  });
  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      currentDomains.splice(parseInt(btn.dataset.idx, 10), 1);
      renderDomains();
    });
  });
}

function addDomain() {
  const input  = document.getElementById('new-domain');
  const errEl  = document.getElementById('add-error');
  const domain = normalizeDomain(input.value);
  errEl.textContent = '';
  if (!domain) return;
  if (!isValidDomain(domain))         { errEl.textContent = 'Domaine invalide (ex: reddit.com)';   return; }
  if (currentDomains.includes(domain)) { errEl.textContent = 'Ce domaine est déjà dans la liste.'; return; }
  currentDomains.push(domain);
  input.value = '';
  renderDomains();
}

document.getElementById('btn-add').addEventListener('click', addDomain);
document.getElementById('new-domain').addEventListener('keydown', (e) => { if (e.key === 'Enter') addDomain(); });

/* ── Status polling ───────────────────────────────────────── */

function updateStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;

    const { mode, timeSpent, isOnBreak, limitSeconds, breakRemaining,
            slotTimeSpent, slotLimitSeconds, isWorkTime } = resp;

    const valEl = document.getElementById('status-value');
    const barEl = document.getElementById('bar-fill');
    const lblEl = document.getElementById('status-label');

    if (selectedMode === 3) {
      lblEl.textContent = 'Statut';
      valEl.textContent = '⏸ Extension désactivée';
      valEl.className   = 'status-value status-disabled';
      barEl.style.width = '0%';
      return;
    }

    if (selectedMode === 2) {
      lblEl.textContent = 'Quota réseaux — heure en cours';
      if (isOnBreak && mode === 2) {
        valEl.textContent = `🔒 Bloqué — ${fmt(breakRemaining)} restant`;
        valEl.className   = 'status-value status-break';
        barEl.style.width = '100%'; barEl.style.background = '#ff7eb6';
      } else if (!isWorkTime) {
        valEl.textContent = '🟢 Hors des heures de travail';
        valEl.className   = 'status-value';
        barEl.style.width = '0%'; barEl.style.background = '#F4A340';
      } else {
        const pct = Math.min(100, (slotTimeSpent / slotLimitSeconds) * 100);
        valEl.textContent = `${fmt(slotTimeSpent)} / ${fmt(slotLimitSeconds)}`;
        valEl.className   = 'status-value';
        barEl.style.width = pct + '%';
        barEl.style.background = pct > 80 ? '#ff9800' : '#F4A340';
      }
      return;
    }

    // Mode 1
    lblEl.textContent = 'Temps sur les réseaux surveillés';
    if (isOnBreak && mode === 1) {
      valEl.textContent = `😺 Pause en cours — ${fmt(breakRemaining)} restant`;
      valEl.className   = 'status-value status-break';
      barEl.style.width = '100%'; barEl.style.background = '#ff7eb6';
    } else {
      const pct = Math.min(100, (timeSpent / limitSeconds) * 100);
      valEl.textContent = `${fmt(timeSpent)} / ${fmt(limitSeconds)}`;
      valEl.className   = 'status-value';
      barEl.style.width = pct + '%';
      barEl.style.background = pct > 80 ? '#ff9800' : '#F4A340';
    }
  });
}

/* ── Save ─────────────────────────────────────────────────── */

document.getElementById('btn-save').addEventListener('click', () => {
  const usageLimit    = Math.max(1,  parseInt(document.getElementById('usageLimit').value,    10) || 45);
  const breakTime     = Math.max(1,  parseInt(document.getElementById('breakTime').value,     10) || 5);
  const startHour     = Math.min(23, Math.max(0, parseInt(document.getElementById('startHour').value,    10) || 9));
  const startMin      = Math.min(59, Math.max(0, parseInt(document.getElementById('startMin').value,     10) || 0));
  const endHour       = Math.min(23, Math.max(0, parseInt(document.getElementById('endHour').value,      10) || 18));
  const endMin        = Math.min(59, Math.max(0, parseInt(document.getElementById('endMin').value,       10) || 0));
  const maxMinPerHour = Math.min(59, Math.max(1, parseInt(document.getElementById('maxMinPerHour').value, 10) || 15));

  chrome.runtime.sendMessage({
    type: 'UPDATE_SETTINGS',
    settings: {
      mode: selectedMode,
      mode1: { usageLimit, breakTime },
      mode2: { days: [...selectedDays], startHour, startMin, endHour, endMin, maxMinPerHour },
      domains: currentDomains
    }
  }, () => {
    const btn = document.getElementById('btn-save');
    btn.classList.add('saved'); btn.textContent = '✓ Enregistré !';
    setTimeout(() => { btn.classList.remove('saved'); btn.textContent = 'Enregistrer les modifications'; }, 2000);
    updateStatus();
  });
});

/* ── Reset ────────────────────────────────────────────────── */

document.getElementById('btn-reset').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_TIMER' }, () => updateStatus());
});

/* ── Init ─────────────────────────────────────────────────── */

chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
  if (chrome.runtime.lastError || !resp) return;
  const s  = resp.settings || {};
  const m2 = s.mode2 || {};

  selectedMode = s.mode ?? 1;

  document.getElementById('usageLimit').value    = s.mode1?.usageLimit ?? 45;
  document.getElementById('breakTime').value     = s.mode1?.breakTime  ?? 5;
  document.getElementById('startHour').value     = m2.startHour     ?? 9;
  document.getElementById('startMin').value      = m2.startMin      ?? 0;
  document.getElementById('endHour').value       = m2.endHour       ?? 18;
  document.getElementById('endMin').value        = m2.endMin        ?? 0;
  document.getElementById('maxMinPerHour').value = m2.maxMinPerHour ?? 15;

  applyDaysUI(m2.days ?? [1, 2, 3, 4, 5]);
  currentDomains = Array.isArray(s.domains) ? [...s.domains] : [...DEFAULT_DOMAINS];
  renderDomains();
  applyModeUI();
});

updateStatus();
setInterval(updateStatus, 1000);
