(function () {
  'use strict';

  if (window.__catGatekeeperLoaded) return;
  window.__catGatekeeperLoaded = true;

  const EL_CLASS = '__cgk-el__';

  let countdownInterval = null;
  let remainingSeconds  = 0;
  let breakEndsAt       = null;
  let initialized       = false;

  /* ── Handshake avec le background ───────────────────────────── */

  try {
    chrome.runtime.sendMessage({ type: 'CONTENT_READY' }, (response) => {
      if (chrome.runtime.lastError || !response) return;

      const { hostname } = location;
      const domains   = response.domains || [];
      const isTracked = domains.some(d => hostname === d || hostname.endsWith('.' + d));
      if (!isTracked) return;

      initialized = true;
      setupListeners();

      if (response.isOnBreak && response.breakDuration > 0) {
        createOverlay(response.breakDuration, response.blockMode || 'free');
      }

      chrome.runtime.sendMessage({ type: document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE' });
    });
  } catch (e) {}

  function setupListeners() {
    document.addEventListener('visibilitychange', () => {
      if (!initialized) return;
      try { chrome.runtime.sendMessage({ type: document.hidden ? 'TAB_HIDDEN' : 'TAB_VISIBLE' }); } catch (e) {}
    });

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'SHOW_CAT') createOverlay(msg.breakDuration, msg.blockMode || 'free');
      if (msg.type === 'HIDE_CAT') removeOverlay();
    });
  }

  /* ── Messages ────────────────────────────────────────────────── */

  const MESSAGES_FREE = [
    "Ton chat ordonne une pause !",
    "Miaou ! Pose ce téléphone !",
    "Même les chats se reposent. Toi aussi !",
    "Internet sera encore là après ta pause…",
    "Purrfait moment pour souffler !",
    "Le chat a pris le contrôle. Résiste pas."
  ];

  const MESSAGES_WORK = [
    "Concentration mode ON !",
    "Quota réseaux atteint pour cette heure.",
    "Allez, c'est l'heure de travailler !",
    "Les RS t'attendent à la prochaine heure.",
    "Le chat surveille ta productivité.",
    "Pause réseaux ! Le boulot t'attend."
  ];

  /* ── Overlay ─────────────────────────────────────────────────── */

  function removeOverlay() {
    stopCountdown();
    document.querySelectorAll('.' + EL_CLASS).forEach(el => el.remove());
    document.documentElement.style.overflow = '';
  }

  function createOverlay(seconds, blockMode) {
    // Si un overlay tourne déjà, repositionner le timer uniquement
    if (document.getElementById('__cgk-blocker__')) {
      breakEndsAt = Date.now() + seconds * 1000;
      return;
    }

    breakEndsAt = Date.now() + seconds * 1000;
    document.documentElement.style.overflow = 'hidden';

    const isWork = blockMode === 'work';
    const msgs   = isWork ? MESSAGES_WORK : MESSAGES_FREE;
    const msg    = msgs[Math.floor(Math.random() * msgs.length)];
    const sub    = isWork
      ? "Tu as atteint ton quota de réseaux pour cette heure. Libéré(e) dans&nbsp;:"
      : "Prends une vraie pause. Le minuteur te libère dans&nbsp;:";

    // ── Bloqueur (stoppe toute interaction avec la page) ─────────
    const blocker = document.createElement('div');
    blocker.id        = '__cgk-blocker__';
    blocker.className = EL_CLASS;
    Object.assign(blocker.style, {
      position: 'fixed', inset: '0',
      zIndex:   '2147483640',
      cursor:   'not-allowed'
    });
    document.documentElement.appendChild(blocker);

    // ── Fond sombre plein écran ───────────────────────────────────
    const backdrop = document.createElement('div');
    backdrop.className = EL_CLASS;
    Object.assign(backdrop.style, {
      position:       'fixed',
      inset:          '0',
      zIndex:         '2147483641',
      background:     'rgba(30, 18, 58, 0.6)',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      pointerEvents:  'none',
      fontFamily:     '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif'
    });
    document.documentElement.appendChild(backdrop);

    // ── Scène : chat + carte ──────────────────────────────────────
    // Le chat (160px de large) a un ratio viewBox 180:210 → hauteur ≈ 187px
    // La carte remonte de 28px sous le chat (margin-top négatif)
    // pour que les pattes du chat "passent derrière" la carte.

    const scene = document.createElement('div');
    Object.assign(scene.style, {
      display:       'flex',
      flexDirection: 'column',
      alignItems:    'center',
      pointerEvents: 'auto'
    });

    const catImg = document.createElement('img');
    catImg.src = chrome.runtime.getURL('images/cat.svg');
    Object.assign(catImg.style, {
      display:     'block',
      width:       '160px',
      height:      'auto',
      position:    'relative',
      zIndex:      '1',
      filter:      'drop-shadow(0 6px 24px rgba(244,163,64,0.25))',
      animation:   'cgkCatDrop 0.6s cubic-bezier(.175,.885,.32,1.275) both'
    });

    const card = document.createElement('div');
    Object.assign(card.style, {
      position:              'relative',
      zIndex:                '2',
      marginTop:             '-28px',       // recouvre les pattes du chat
      background:            'rgba(20,14,42,0.82)',
      backdropFilter:        'blur(16px)',
      webkitBackdropFilter:  'blur(16px)',
      border:                '1px solid rgba(244,163,64,0.18)',
      borderRadius:          '20px',
      padding:               '38px 44px 28px',
      textAlign:             'center',
      width:                 'min(380px, 90vw)',
      boxShadow:             '0 12px 56px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.03)',
      animation:             'cgkCardUp 0.55s cubic-bezier(.175,.885,.32,1.275) 0.08s both'
    });

    card.innerHTML = `
      <h2 style="
        margin: 0 0 10px;
        font-size: 1.5em;
        font-weight: 800;
        color: #F4A340;
        text-shadow: 0 0 20px rgba(244,163,64,0.5);
        font-family: inherit;
        line-height: 1.25;
      ">${msg}</h2>

      <p style="
        margin: 0 0 24px;
        font-size: 0.86em;
        color: #7a7090;
        line-height: 1.55;
        font-family: inherit;
      ">${sub}</p>

      <div id="__cgk-countdown__" style="
        font-size: 4em;
        font-weight: 900;
        color: #F4A340;
        letter-spacing: 4px;
        font-variant-numeric: tabular-nums;
        font-family: inherit;
        animation: cgkPulse 1.2s ease-in-out infinite;
      "></div>

      <p style="
        margin-top: 18px;
        font-size: 0.72em;
        color: #2e2840;
        font-family: inherit;
      ">Le chat partira quand le timer sera terminé</p>

      <style>
        @keyframes cgkCatDrop {
          0%   { transform: translateY(-30px) scale(0.85); opacity: 0; }
          100% { transform: translateY(0)     scale(1);    opacity: 1; }
        }
        @keyframes cgkCardUp {
          0%   { transform: translateY(20px); opacity: 0; }
          100% { transform: translateY(0);    opacity: 1; }
        }
        @keyframes cgkPulse {
          0%,100% { text-shadow: 0 0 28px rgba(244,163,64,0.6); color: #F4A340; }
          50%     { text-shadow: 0 0 50px rgba(244,163,64,1);   color: #ffdc73; }
        }
      </style>
    `;

    scene.appendChild(catImg);
    scene.appendChild(card);
    backdrop.appendChild(scene);

    // Démarrage du countdown
    remainingSeconds = seconds;
    renderCountdown();
    countdownInterval = setInterval(() => {
      remainingSeconds = Math.max(0, Math.floor((breakEndsAt - Date.now()) / 1000));
      renderCountdown();
      if (remainingSeconds <= 0) {
        stopCountdown();
        removeOverlay();
        try { chrome.runtime.sendMessage({ type: 'BREAK_ENDED' }); } catch (e) {}
      }
    }, 1000);
  }

  /* ── Helpers ─────────────────────────────────────────────────── */

  function renderCountdown() {
    const el = document.getElementById('__cgk-countdown__');
    if (!el) return;
    const m = Math.floor(remainingSeconds / 60);
    const s = remainingSeconds % 60;
    el.textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  function stopCountdown() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  }

})();
