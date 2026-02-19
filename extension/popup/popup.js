/**
 * Chat to Webpage extension popup logic.
 * Handles: auth (login/register), BYOK Groq key, scrape, publish.
 */

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:3000";

let scrapedData = null;
let authToken = null;
let username = null;
let groqApiKey = null;

// ─── Initialization ───

document.addEventListener("DOMContentLoaded", async () => {
  // Pre-wake backend (fire-and-forget)
  fetch(`${BACKEND_URL}/health`).catch(() => {});

  // Load stored credentials
  const stored = await chrome.storage.local.get([
    "authToken",
    "username",
    "groqApiKey",
  ]);
  authToken = stored.authToken || null;
  username = stored.username || null;
  groqApiKey = stored.groqApiKey || null;

  // Pre-fill Groq key if stored
  if (groqApiKey) {
    document.getElementById("auth-groq-key").value = groqApiKey;
    document.getElementById("settings-groq-key").value = groqApiKey;
  }

  // Check auth state
  if (authToken) {
    const valid = await validateToken();
    if (valid) {
      showMainView();
      await triggerScrape();
    } else {
      authToken = null;
      await chrome.storage.local.remove("authToken");
      showAuthView("Session expired — please login again");
    }
  } else {
    showAuthView();
  }

  bindEvents();
});

// ─── View Switching ───

function showAuthView(message) {
  document.getElementById("auth-view").classList.remove("hidden");
  document.getElementById("main-view").classList.add("hidden");
  if (message) {
    showStatus(document.getElementById("auth-status"), message, "error");
  }
}

function showMainView() {
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("main-view").classList.remove("hidden");
  document.getElementById("display-username").textContent = username || "";
  document.getElementById("view-kb-link").href = `${FRONTEND_URL}/projects`;
  // Sync Groq key to settings
  if (groqApiKey) {
    document.getElementById("settings-groq-key").value = groqApiKey;
  }
}

// ─── Token Validation ───

async function validateToken() {
  try {
    const resp = await fetch(`${BACKEND_URL}/api/conversations`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return resp.ok;
  } catch {
    return false;
  }
}

// ─── Authentication ───

let authMode = "login"; // "login" or "register"

async function handleAuth() {
  const btn = document.getElementById("auth-submit-btn");
  const statusEl = document.getElementById("auth-status");
  const usernameVal = document.getElementById("auth-username").value.trim();
  const password = document.getElementById("auth-password").value.trim();
  const groqKey = document.getElementById("auth-groq-key").value.trim();

  // Validate
  if (!usernameVal || !password) {
    showStatus(statusEl, "Enter username and password", "error");
    return;
  }

  if (!groqKey) {
    showStatus(statusEl, "Enter your Groq API key", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = authMode === "login" ? "Logging in..." : "Registering...";

  const endpoint =
    authMode === "login" ? "/api/auth/login" : "/api/auth/register";

  try {
    const resp = await fetch(`${BACKEND_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: usernameVal, password }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    authToken = data.access_token;
    username = data.username || usernameVal;
    groqApiKey = groqKey;

    await chrome.storage.local.set({ authToken, username, groqApiKey });

    // Clear password
    document.getElementById("auth-password").value = "";

    showMainView();
    await triggerScrape();
  } catch (e) {
    showStatus(statusEl, `${authMode === "login" ? "Login" : "Registration"} failed: ${e.message}`, "error");
  }

  btn.disabled = false;
  btn.textContent = authMode === "login" ? "Login" : "Register";
}

function logout() {
  authToken = null;
  username = null;
  // Keep groqApiKey on logout
  chrome.storage.local.remove(["authToken", "username"]);
  showAuthView();
}

// ─── Groq Key Validation ───

async function validateGroqKey(key) {
  try {
    const resp = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{ role: "user", content: "hi" }],
          max_tokens: 1,
        }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

async function saveGroqKey() {
  const btn = document.getElementById("save-groq-key-btn");
  const input = document.getElementById("settings-groq-key");
  const key = input.value.trim();

  if (!key) return;

  btn.disabled = true;
  btn.textContent = "Validating...";

  const valid = await validateGroqKey(key);

  if (valid) {
    groqApiKey = key;
    await chrome.storage.local.set({ groqApiKey });
    btn.textContent = "Saved!";
    setTimeout(() => {
      btn.textContent = "Save Key";
      btn.disabled = false;
    }, 1500);
  } else {
    btn.textContent = "Invalid key";
    setTimeout(() => {
      btn.textContent = "Save Key";
      btn.disabled = false;
    }, 2000);
  }
}

// ─── Scraping ───

async function triggerScrape() {
  const statusEl = document.getElementById("scrape-status");
  const publishBtn = document.getElementById("publish-btn");

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id) {
      showStatus(statusEl, "No active tab found", "error");
      return;
    }

    chrome.tabs.sendMessage(
      tab.id,
      { action: "scrapeConversation" },
      (response) => {
        if (chrome.runtime.lastError) {
          showStatus(
            statusEl,
            "Not on a supported chat page (Claude or ChatGPT)",
            "error"
          );
          return;
        }

        if (response?.success && response.messages.length > 0) {
          scrapedData = response;
          showStatus(
            statusEl,
            `${response.messages.length} messages detected (${response.source})`,
            "success"
          );
          publishBtn.disabled = false;
        } else {
          showStatus(statusEl, "No conversation found on this page", "error");
        }
      }
    );
  } catch {
    showStatus(statusEl, "Could not access page content", "error");
  }
}

// ─── Publish ───

function getHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
  if (groqApiKey) headers["X-Groq-API-Key"] = groqApiKey;
  return headers;
}

async function publishArticle() {
  const btn = document.getElementById("publish-btn");
  const resultEl = document.getElementById("result");
  const errorEl = document.getElementById("error");

  btn.disabled = true;
  btn.textContent = "Publishing...";
  resultEl.style.display = "none";
  errorEl.style.display = "none";

  if (!authToken) {
    showError(errorEl, "Not authenticated. Please login.");
    resetPublishBtn(btn);
    return;
  }

  if (!groqApiKey) {
    showError(errorEl, "No Groq API key. Add one in Settings.");
    resetPublishBtn(btn);
    return;
  }

  const title = document.getElementById("title").value.trim();
  if (!title) {
    showError(errorEl, "Please enter a title");
    resetPublishBtn(btn);
    return;
  }

  if (!scrapedData) {
    showError(errorEl, "No conversation data available");
    resetPublishBtn(btn);
    return;
  }

  const payload = {
    title,
    tags: document
      .getElementById("tags")
      .value.split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    source: scrapedData.source,
    conversation: scrapedData.messages,
  };

  const mode = document.getElementById("mode").value;
  if (mode === "update") {
    payload.update_slug = document.getElementById("existing-slug").value;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const resp = await fetch(`${BACKEND_URL}/api/publish`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.detail || `HTTP ${resp.status}`);
    }

    const result = await resp.json();
    const articleUrl = `${FRONTEND_URL}/projects/${result.slug}`;

    resultEl.innerHTML =
      `Published! ${result.chunks_created} chunks indexed.<br>` +
      `<a href="${articleUrl}" target="_blank">View Article</a>`;
    resultEl.style.display = "block";
  } catch (e) {
    if (e.name === "AbortError") {
      showError(
        errorEl,
        "Request timed out — backend may be starting up. Try again."
      );
    } else {
      showError(errorEl, e.message);
    }
  }

  resetPublishBtn(btn);
}

// ─── Load existing articles ───

async function loadExistingArticles() {
  const select = document.getElementById("existing-slug");
  select.innerHTML = '<option value="">Loading...</option>';

  try {
    const resp = await fetch(`${BACKEND_URL}/api/articles`, {
      headers: getHeaders(),
    });
    const data = await resp.json();

    if (data.articles && data.articles.length > 0) {
      select.innerHTML = data.articles
        .map((a) => `<option value="${a.slug}">${a.title}</option>`)
        .join("");
    } else {
      select.innerHTML = '<option value="">No articles found</option>';
    }
  } catch {
    select.innerHTML = '<option value="">Failed to load articles</option>';
  }
}

// ─── Helpers ───

function showStatus(el, text, type) {
  el.textContent = text;
  el.style.display = "block";
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
}

function showError(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

function resetPublishBtn(btn) {
  btn.disabled = false;
  btn.textContent = "Publish";
}

// ─── Event Binding ───

function bindEvents() {
  // Auth tabs
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document
        .querySelectorAll(".auth-tab")
        .forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      authMode = tab.dataset.tab;
      document.getElementById("auth-submit-btn").textContent =
        authMode === "login" ? "Login" : "Register";
      // Clear status on tab switch
      document.getElementById("auth-status").style.display = "none";
    });
  });

  // Auth submit
  document
    .getElementById("auth-submit-btn")
    .addEventListener("click", handleAuth);

  // Enter key on auth form
  ["auth-username", "auth-password", "auth-groq-key"].forEach((id) => {
    document.getElementById(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAuth();
    });
  });

  // Logout
  document.getElementById("logout-btn").addEventListener("click", logout);

  // Mode toggle
  document.getElementById("mode").addEventListener("change", async (e) => {
    const slugGroup = document.getElementById("slug-group");
    if (e.target.value === "update") {
      slugGroup.style.display = "block";
      await loadExistingArticles();
    } else {
      slugGroup.style.display = "none";
    }
  });

  // Publish
  document
    .getElementById("publish-btn")
    .addEventListener("click", publishArticle);

  // Save Groq key
  document
    .getElementById("save-groq-key-btn")
    .addEventListener("click", saveGroqKey);
}
