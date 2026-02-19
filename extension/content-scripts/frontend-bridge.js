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

// Sync when localStorage changes (login/logout on the same tab dispatches StorageEvent)
window.addEventListener("storage", (e) => {
  if (STORAGE_KEYS.includes(e.key)) {
    syncAuth();
  }
});
