'use strict';

const DEFAULT_DOMAINS = ['x.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'bsky.app', 'facebook.com'];

let currentDomains = [];

/* ── Helpers ──────────────────────────────────────────────────── */
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

/* ── Domain list rendering ────────────────────────────────────── */
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

    const isDefault = DEFAULT_DOMAINS.includes(domain);
    chip.innerHTML = `
      <span class="name">${domain}${isDefault ? '<span class="default-tag">défaut</span>' : ''}</span>
      <button class="btn-remove" data-idx="${idx}" title="Supprimer">×</button>
    `;
    list.appendChild(chip);
  });

  list.querySelectorAll('.btn-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx, 10);
      currentDomains.splice(idx, 1);
      renderDomains();
    });
  });
}



/* ── Add domain ───────────────────────────────────────────────── */
function addDomain() {
  const input = document.getElementById('new-domain');
  const errEl = document.getElementById('add-error');
  const raw = input.value;
  const domain = normalizeDomain(raw);

  errEl.textContent = '';

  if (!domain) return;

  if (!isValidDomain(domain)) {
    errEl.textContent = 'Domaine invalide (ex: reddit.com)';
    return;
  }
  if (currentDomains.includes(domain)) {
    errEl.textContent = 'Ce domaine est déjà dans la liste.';
    return;
  }

  currentDomains.push(domain);
  input.value = '';
  renderDomains();
}

document.getElementById('btn-add').addEventListener('click', addDomain);
document.getElementById('new-domain').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addDomain();
});

/* ── Status polling ───────────────────────────────────────────── */
function updateStatus() {
  chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
    if (chrome.runtime.lastError || !resp) return;

    const { timeSpent, isOnBreak, limitSeconds, breakRemaining } = resp;
    const valEl = document.getElementById('status-value');
    const barEl = document.getElementById('bar-fill');
    const pct   = Math.min(100, (timeSpent / limitSeconds) * 100);

    if (isOnBreak) {
      valEl.textContent = `😺 Pause en cours — ${fmt(breakRemaining)} restant`;
      valEl.className = 'status-value status-break';
      barEl.style.width = '100%';
      barEl.style.background = '#ff7eb6';
    } else {
      valEl.textContent = `${fmt(timeSpent)} / ${fmt(limitSeconds)}`;
      valEl.className = 'status-value';
      barEl.style.width = pct + '%';
      barEl.style.background = pct > 80 ? '#ff9800' : '#F4A340';
    }
  });
}

/* ── Save ─────────────────────────────────────────────────────── */
document.getElementById('btn-save').addEventListener('click', () => {
  const usageLimit = Math.max(1, parseInt(document.getElementById('usageLimit').value, 10) || 60);
  const breakTime  = Math.max(1, parseInt(document.getElementById('breakTime').value, 10)  || 5);

  chrome.runtime.sendMessage(
    { type: 'UPDATE_SETTINGS', settings: { usageLimit, breakTime, domains: currentDomains } },
    () => {
      const btn = document.getElementById('btn-save');
      btn.classList.add('saved');
      btn.textContent = '✓ Enregistré !';
      setTimeout(() => {
        btn.classList.remove('saved');
        btn.textContent = 'Enregistrer les modifications';
      }, 2000);
      updateStatus();
    }
  );
});

/* ── Reset timer ──────────────────────────────────────────────── */
document.getElementById('btn-reset').addEventListener('click', () => {
  chrome.runtime.sendMessage({ type: 'RESET_TIMER' }, () => updateStatus());
});

/* ── Init ─────────────────────────────────────────────────────── */
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (resp) => {
  if (chrome.runtime.lastError || !resp) return;

  const s = resp.settings || {};
  document.getElementById('usageLimit').value = s.usageLimit ?? 60;
  document.getElementById('breakTime').value  = s.breakTime  ?? 5;
  currentDomains = Array.isArray(s.domains) ? [...s.domains] : [...DEFAULT_DOMAINS];
  renderDomains();
});

updateStatus();
setInterval(updateStatus, 1000);
