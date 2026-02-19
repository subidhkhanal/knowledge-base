/**
 * Frontend Bridge — reads auth tokens from the website's localStorage
 * and syncs them to the extension via chrome.runtime.sendMessage.
 *
 * Runs on http://localhost:3000/* pages.
 */

const STORAGE_KEYS = ["kb_auth_token", "kb_username", "kb_groq_key"];

function syncAuth() {
  const data = {};
  for (const key of STORAGE_KEYS) {
    data[key] = localStorage.getItem(key) || null;
  }

  chrome.runtime.sendMessage({
    type: "frontendAuthSync",
    authToken: data.kb_auth_token,
    username: data.kb_username,
    groqApiKey: data.kb_groq_key,
  });
}

// Sync on page load
syncAuth();

// Poll localStorage for changes every 2s.
// (StorageEvent from page context doesn't reliably reach content scripts in Chrome's isolated world)
let lastSynced = JSON.stringify(STORAGE_KEYS.map(k => localStorage.getItem(k)));
setInterval(() => {
  const current = JSON.stringify(STORAGE_KEYS.map(k => localStorage.getItem(k)));
  if (current !== lastSynced) {
    lastSynced = current;
    syncAuth();
  }
}, 2000);
