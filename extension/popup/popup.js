/**
 * BrainForge extension popup logic.
 * Handles: scrape trigger, form interaction, and publish API call.
 */

const DEFAULT_BACKEND = "https://pkb-backend.onrender.com";
const DEFAULT_FRONTEND = "https://personal-assistant-olive.vercel.app";

let scrapedData = null;

// ─── Initialization ───

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await loadSettings();
  applySettings(settings);
  await triggerScrape();
  bindEvents(settings.backendUrl);
});

/** Load saved settings from chrome.storage.local. */
async function loadSettings() {
  const stored = await chrome.storage.local.get([
    "backendUrl",
    "frontendUrl",
  ]);
  return {
    backendUrl: stored.backendUrl || DEFAULT_BACKEND,
    frontendUrl: stored.frontendUrl || DEFAULT_FRONTEND,
  };
}

/** Apply settings to the UI. */
function applySettings(settings) {
  document.getElementById("backend-url").value = settings.backendUrl;
  document.getElementById("frontend-url").value = settings.frontendUrl;
  document.getElementById("view-kb-link").href =
    settings.frontendUrl + "/articles";
}

// ─── Scraping ───

/** Send scrapeConversation message to the active tab's content script. */
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
          showStatus(
            statusEl,
            "No conversation found on this page",
            "error"
          );
        }
      }
    );
  } catch (e) {
    showStatus(statusEl, "Could not access page content", "error");
  }
}

/** Update the status indicator element. */
function showStatus(el, text, type) {
  el.textContent = text;
  el.classList.remove("success", "error");
  if (type) el.classList.add(type);
}

// ─── Event Binding ───

function bindEvents(backendUrl) {
  // Mode toggle: show/hide the update slug selector
  document.getElementById("mode").addEventListener("change", async (e) => {
    const slugGroup = document.getElementById("slug-group");
    if (e.target.value === "update") {
      slugGroup.style.display = "block";
      await loadExistingArticles(backendUrl);
    } else {
      slugGroup.style.display = "none";
    }
  });

  // Publish button
  document
    .getElementById("publish-btn")
    .addEventListener("click", () => publishArticle(backendUrl));

  // Save settings button
  document
    .getElementById("save-settings")
    .addEventListener("click", saveSettings);
}

// ─── Publish ───

async function publishArticle(backendUrl) {
  const btn = document.getElementById("publish-btn");
  const resultEl = document.getElementById("result");
  const errorEl = document.getElementById("error");

  // Reset UI
  btn.disabled = true;
  btn.textContent = "Publishing...";
  resultEl.style.display = "none";
  errorEl.style.display = "none";

  // Validate title
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

  // Build payload
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

  // Send to backend
  try {
    const resp = await fetch(`${backendUrl}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({}));
      throw new Error(errBody.detail || `HTTP ${resp.status}`);
    }

    const result = await resp.json();
    const settings = await chrome.storage.local.get(["frontendUrl"]);
    const frontendUrl = settings.frontendUrl || DEFAULT_FRONTEND;
    const articleUrl = `${frontendUrl}/articles/${result.slug}`;

    resultEl.innerHTML =
      `Published! ${result.chunks_created} chunks indexed.<br>` +
      `<a href="${articleUrl}" target="_blank">View Article</a>`;
    resultEl.style.display = "block";
  } catch (e) {
    showError(errorEl, e.message);
  }

  resetPublishBtn(btn);
}

function showError(el, message) {
  el.textContent = message;
  el.style.display = "block";
}

function resetPublishBtn(btn) {
  btn.disabled = false;
  btn.textContent = "Publish";
}

// ─── Load existing articles for update mode ───

async function loadExistingArticles(backendUrl) {
  const select = document.getElementById("existing-slug");
  select.innerHTML = '<option value="">Loading...</option>';

  try {
    const resp = await fetch(`${backendUrl}/api/articles`);
    const data = await resp.json();

    if (data.articles && data.articles.length > 0) {
      select.innerHTML = data.articles
        .map((a) => `<option value="${a.slug}">${a.title}</option>`)
        .join("");
    } else {
      select.innerHTML = '<option value="">No articles found</option>';
    }
  } catch (e) {
    select.innerHTML = '<option value="">Failed to load articles</option>';
  }
}

// ─── Settings persistence ───

async function saveSettings() {
  const backendUrl = document.getElementById("backend-url").value.trim();
  const frontendUrl = document.getElementById("frontend-url").value.trim();

  await chrome.storage.local.set({ backendUrl, frontendUrl });

  document.getElementById("view-kb-link").href = frontendUrl + "/articles";

  // Brief visual feedback
  const btn = document.getElementById("save-settings");
  btn.textContent = "Saved!";
  setTimeout(() => {
    btn.textContent = "Save Settings";
  }, 1500);
}
