'use strict';

const DEFAULT_DOMAINS = ['x.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'bsky.app', 'facebook.com'];

const DEFAULT_SETTINGS = {
  mode: 1,
  mode1: { usageLimit: 45, breakTime: 5 },
  mode2: {
    days: [1, 2, 3, 4, 5],
    startHour: 9,  startMin: 0,
    endHour: 18,   endMin: 0,
    maxMinPerHour: 15
  },
  domains: [...DEFAULT_DOMAINS]
};

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

// Mode 1 state
let timeSpent = 0;

// Mode 2 state
let slotKey       = '';
let slotTimeSpent = 0;

// Break state
let isOnBreak      = false;
let breakEndTime   = null;
let tabVisible     = true;
let breakTriggered = false;

/* ── Helpers ────────────────────────────────────────────────── */

function isSocialMedia(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return settings.domains.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch { return false; }
}

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => { void chrome.runtime.lastError; });
}

function getCurrentSlotKey() {
  const n = new Date();
  return `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}-${n.getHours()}`;
}

function isWorkTime() {
  const m2  = settings.mode2;
  const now = new Date();
  const day = now.getDay();
  if (!m2.days.includes(day)) return false;
  const cur   = now.getHours() * 60 + now.getMinutes();
  const start = m2.startHour * 60 + m2.startMin;
  const end   = m2.endHour   * 60 + m2.endMin;
  return cur >= start && cur < end;
}

function getEndOfCurrentHour() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate(), n.getHours() + 1, 0, 0, 0).getTime();
}

/* ── Break management ───────────────────────────────────────── */

function triggerBreak(tabId, blockMode) {
  if (breakTriggered) return;
  breakTriggered = true;
  isOnBreak      = true;

  breakEndTime = (blockMode === 'work')
    ? getEndOfCurrentHour()
    : Date.now() + settings.mode1.breakTime * 60 * 1000;

  const remaining = Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000));
  sendToTab(tabId, { type: 'SHOW_CAT', breakDuration: remaining, blockMode });
}

function endBreak(tabId) {
  isOnBreak      = false;
  breakEndTime   = null;
  breakTriggered = false;
  if (settings.mode === 1) {
    timeSpent = 0;
    chrome.storage.local.set({ timeSpent: 0 });
  }
  if (tabId != null) sendToTab(tabId, { type: 'HIDE_CAT' });
}

/* ── Main tick ──────────────────────────────────────────────── */

setInterval(() => {
  if (settings.mode === 3) return;

  if (isOnBreak && breakEndTime && Date.now() >= breakEndTime) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      endBreak(tabs[0]?.id ?? null);
    });
    return;
  }

  if (!tabVisible) return;

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs?.[0]?.url || !isSocialMedia(tabs[0].url)) return;

    if (settings.mode === 1) {
      timeSpent++;
      if (timeSpent >= settings.mode1.usageLimit * 60) triggerBreak(tabs[0].id, 'free');

    } else if (settings.mode === 2) {
      if (!isWorkTime()) return;
      const key = getCurrentSlotKey();
      if (key !== slotKey) {
        slotKey = key; slotTimeSpent = 0;
        chrome.storage.local.set({ slotKey, slotTimeSpent: 0 });
      }
      slotTimeSpent++;
      chrome.storage.local.set({ slotTimeSpent });
      if (slotTimeSpent >= settings.mode2.maxMinPerHour * 60) triggerBreak(tabs[0].id, 'work');
    }
  });
}, 1000);

setInterval(() => {
  if (settings.mode === 1) chrome.storage.local.set({ timeSpent });
}, 1000);

/* ── Message listener ───────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'TAB_VISIBLE' || message.type === 'TAB_HIDDEN') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === sender.tab.id)
        tabVisible = (message.type === 'TAB_VISIBLE');
    });
    return;
  }

  if (message.type === 'CONTENT_READY' && sender.tab) {
    const response = { domains: settings.domains, isOnBreak: false, breakDuration: 0, blockMode: 'free' };
    if (isOnBreak && isSocialMedia(sender.tab.url || '')) {
      const remaining = breakEndTime ? Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000)) : 0;
      if (remaining > 0) {
        response.isOnBreak     = true;
        response.breakDuration = remaining;
        response.blockMode     = settings.mode === 2 ? 'work' : 'free';
      } else {
        endBreak(sender.tab.id);
      }
    }
    sendResponse(response);
    return true;
  }

  if (message.type === 'BREAK_ENDED') { endBreak(null); return; }

  if (message.type === 'GET_STATUS') {
    sendResponse({
      mode:             settings.mode,
      timeSpent,        isOnBreak,        settings,
      limitSeconds:     settings.mode1.usageLimit * 60,
      breakRemaining:   breakEndTime ? Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000)) : 0,
      slotTimeSpent,    slotLimitSeconds: settings.mode2.maxMinPerHour * 60,
      isWorkTime:       isWorkTime()
    });
    return true;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    const inc = message.settings;
    settings.mode = inc.mode ?? settings.mode;
    if (inc.mode1)   settings.mode1   = { ...settings.mode1,   ...inc.mode1   };
    if (inc.mode2)   settings.mode2   = { ...settings.mode2,   ...inc.mode2   };
    if (inc.domains) settings.domains = inc.domains
      .map(d => d.toLowerCase().trim().replace(/^www\./, ''))
      .filter(d => d.length > 0 && d.includes('.'));
    chrome.storage.local.set({ settings });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RESET_TIMER') {
    timeSpent = 0; slotTimeSpent = 0; slotKey = '';
    chrome.storage.local.set({ timeSpent: 0, slotTimeSpent: 0, slotKey: '' });
    sendResponse({ ok: true });
    return true;
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!isOnBreak) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url || !isSocialMedia(tab.url)) return;
    const remaining = breakEndTime ? Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000)) : 0;
    if (remaining > 0) sendToTab(tabId, {
      type: 'SHOW_CAT', breakDuration: remaining,
      blockMode: settings.mode === 2 ? 'work' : 'free'
    });
  });
});

/* ── Init ───────────────────────────────────────────────────── */

chrome.storage.local.get(['settings', 'timeSpent', 'slotKey', 'slotTimeSpent'], (data) => {
  if (data.settings) {
    const s = data.settings;
    settings = {
      mode:  s.mode  ?? 1,
      mode1: { usageLimit: s.mode1?.usageLimit ?? 45, breakTime: s.mode1?.breakTime ?? 5 },
      mode2: {
        days:          s.mode2?.days          ?? [1, 2, 3, 4, 5],
        startHour:     s.mode2?.startHour     ?? 9,  startMin:  s.mode2?.startMin  ?? 0,
        endHour:       s.mode2?.endHour       ?? 18, endMin:    s.mode2?.endMin    ?? 0,
        maxMinPerHour: s.mode2?.maxMinPerHour ?? 15
      },
      domains: s.domains ?? [...DEFAULT_DOMAINS]
    };
  }
  if (typeof data.timeSpent     === 'number') timeSpent     = data.timeSpent;
  if (typeof data.slotTimeSpent === 'number') slotTimeSpent = data.slotTimeSpent;
  if (data.slotKey) slotKey = data.slotKey;
});
