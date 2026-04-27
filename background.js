'use strict';

const DEFAULT_DOMAINS = ['x.com', 'instagram.com', 'tiktok.com', 'youtube.com', 'bsky.app', 'facebook.com'];

let settings = { usageLimit: 45, breakTime: 5, domains: [...DEFAULT_DOMAINS] };
let timeSpent = 0;
let isOnBreak = false;
let breakEndTime = null;
let tabVisible = true;
let breakTriggered = false;

function isSocialMedia(url) {
  if (!url) return false;
  try {
    const { hostname } = new URL(url);
    return settings.domains.some(d => hostname === d || hostname.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

function sendToTab(tabId, message) {
  chrome.tabs.sendMessage(tabId, message, () => { void chrome.runtime.lastError; });
}

function triggerBreak(tabId) {
  if (breakTriggered) return;
  breakTriggered = true;
  isOnBreak = true;
  breakEndTime = Date.now() + settings.breakTime * 60 * 1000;
  sendToTab(tabId, { type: 'SHOW_CAT', breakDuration: settings.breakTime * 60 });
}

function endBreak(tabId) {
  isOnBreak = false;
  breakEndTime = null;
  breakTriggered = false;
  timeSpent = 0;
  chrome.storage.local.set({ timeSpent: 0 });
  if (tabId != null) sendToTab(tabId, { type: 'HIDE_CAT' });
}

// Main tick: every second
setInterval(() => {
  // La fin de pause se vérifie toujours, peu importe la page
  if (isOnBreak && breakEndTime && Date.now() >= breakEndTime) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      endBreak(tabs[0]?.id ?? null);
    });
    return;
  }

  // L'incrément du timer lui ne tourne que sur les RS
  if (!tabVisible) return;
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs?.[0]?.url || !isSocialMedia(tabs[0].url)) return;
    timeSpent++;
    if (timeSpent >= settings.usageLimit * 60) triggerBreak(tabs[0].id);
  });
}, 1000);

// Persist time every 1s
setInterval(() => { chrome.storage.local.set({ timeSpent }); }, 1000);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.type === 'TAB_VISIBLE' || message.type === 'TAB_HIDDEN') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0] && tabs[0].id === sender.tab.id) {
        tabVisible = (message.type === 'TAB_VISIBLE');
      }
    });
    return;
  }

  // Content script loaded — send it the domain list + break state
  if (message.type === 'CONTENT_READY' && sender.tab) {
    const response = {
      domains: settings.domains,
      isOnBreak: false,
      breakDuration: 0
    };
    if (isOnBreak && isSocialMedia(sender.tab.url || '')) {
      const remaining = breakEndTime
        ? Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000))
        : 0;
      if (remaining > 0) {
        response.isOnBreak = true;
        response.breakDuration = remaining;
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
      timeSpent, isOnBreak, settings,
      limitSeconds: settings.usageLimit * 60,
      breakRemaining: breakEndTime
        ? Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000))
        : 0
    });
    return true;
  }

  if (message.type === 'UPDATE_SETTINGS') {
    settings = { ...settings, ...message.settings };
    // Normalize domains: lowercase, trim, strip www.
    if (settings.domains) {
      settings.domains = settings.domains
        .map(d => d.toLowerCase().trim().replace(/^www\./, ''))
        .filter(d => d.length > 0 && d.includes('.'));
    }
    chrome.storage.local.set({ settings });
    // timeSpent = 0;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'RESET_TIMER') {
    timeSpent = 0;
    chrome.storage.local.set({ timeSpent: 0 });
    sendResponse({ ok: true });
    return true;
  }

});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (!isOnBreak) return;
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab.url) return;
    if (!isSocialMedia(tab.url)) return;
    const remaining = breakEndTime
      ? Math.max(0, Math.floor((breakEndTime - Date.now()) / 1000))
      : 0;
    if (remaining > 0) sendToTab(tabId, { type: 'SHOW_CAT', breakDuration: remaining });
  });
});


// Init from storage
chrome.storage.local.get(['settings', 'timeSpent'], (data) => {
  if (data.settings) {
    settings = {
      usageLimit: data.settings.usageLimit ?? 60,
      breakTime:  data.settings.breakTime  ?? 5,
      domains:    data.settings.domains    ?? [...DEFAULT_DOMAINS]
    };
  }
  if (typeof data.timeSpent === 'number') timeSpent = data.timeSpent;
});
