/**
 * Chat to Webpage extension popup logic.
 * Auth is handled on the website (localhost:3000/login).
 * The frontend-bridge content script syncs tokens to chrome.storage.local.
 *
 * Content input:
 * - Chatbot pages: user pastes conversation text (Ctrl+A → Ctrl+C → paste)
 * - Web pages: auto-extracted via Readability.js
 */

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:3000";

let webArticleData = null;
let authToken = null;
let username = null;
let groqApiKey = null;

// ─── Initialization ───

document.addEventListener("DOMContentLoaded", async () => {
  // Pre-wake backend (fire-and-forget)
  fetch(`${BACKEND_URL}/health`).catch(() => {});

  // Load stored credentials (synced from website via frontend-bridge)
  const stored = await chrome.storage.local.get([
    "authToken",
    "username",
    "groqApiKey",
  ]);
  authToken = stored.authToken || null;
  username = stored.username || null;
  groqApiKey = stored.groqApiKey || null;

  // Check auth state
  if (authToken) {
    const valid = await validateToken();
    if (valid) {
      showMainView();
      await loadProjects();
      tryAutoExtractWebArticle();
    } else {
      authToken = null;
      await chrome.storage.local.remove("authToken");
      showAuthView("Session expired — please login on the website");
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

function openLoginPage() {
  chrome.tabs.create({ url: `${FRONTEND_URL}/login` });
}

function logout() {
  authToken = null;
  username = null;
  chrome.storage.local.remove(["authToken", "username"]);
  showAuthView();
}

// ─── Projects ───

async function loadProjects() {
  const select = document.getElementById("project-select");
  select.innerHTML = '<option value="">Loading projects...</option>';

  try {
    const resp = await fetch(`${BACKEND_URL}/api/projects`, {
      headers: getHeaders(),
    });
    const data = await resp.json();

    if (data.projects && data.projects.length > 0) {
      select.innerHTML = data.projects
        .map(
          (p) => `<option value="${p.slug}">${p.title}</option>`
        )
        .join("");
      const uncategorized = data.projects.find((p) => p.slug === "uncategorized");
      if (uncategorized) {
        select.value = uncategorized.slug;
      }
    } else {
      select.innerHTML = '<option value="">(No projects — create one)</option>';
    }
  } catch {
    select.innerHTML = '<option value="">Failed to load projects</option>';
  }
}

async function createNewProject() {
  const titleInput = document.getElementById("new-project-title");
  const title = titleInput.value.trim();
  if (!title) return;

  const btn = document.getElementById("create-project-btn");
  btn.disabled = true;
  btn.textContent = "Creating...";

  try {
    const resp = await fetch(`${BACKEND_URL}/api/projects`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ title, description: "" }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "Failed to create project");
    }

    const project = await resp.json();

    await loadProjects();
    document.getElementById("project-select").value = project.slug;

    titleInput.value = "";
    document.getElementById("new-project-form").classList.add("hidden");
  } catch (e) {
    alert(e.message);
  }

  btn.disabled = false;
  btn.textContent = "Create";
}

// ─── Web Article Auto-Extract ───

function isChatbotPage(url) {
  return (
    url.includes("claude.ai") ||
    url.includes("chatgpt.com") ||
    url.includes("chat.openai.com")
  );
}

async function tryAutoExtractWebArticle() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !tab.url) return;

    // Only auto-extract on regular web pages, not chatbot pages
    if (isChatbotPage(tab.url)) return;
    if (!tab.url.startsWith("https://") && !tab.url.startsWith("http://")) return;

    const statusEl = document.getElementById("web-article-status");

    chrome.tabs.sendMessage(
      tab.id,
      { action: "scrapeArticle" },
      (response) => {
        if (chrome.runtime.lastError) return;

        if (response?.success) {
          webArticleData = response;
          const titleInput = document.getElementById("title");
          if (!titleInput.value) {
            titleInput.value = response.title || "";
          }
          const truncated = (response.title || "").substring(0, 50);
          const suffix = (response.title || "").length > 50 ? "..." : "";
          showStatus(statusEl, `Article detected: "${truncated}${suffix}"`, "success");
          updatePublishButton();
        }
      }
    );
  } catch {
    // Silently ignore — web article extraction is optional
  }
}

// ─── Paste Handling ───

function onPasteInput() {
  const textarea = document.getElementById("conversation-paste");
  const statusEl = document.getElementById("paste-status");
  const text = textarea.value.trim();

  if (text) {
    const charCount = text.length;
    const sizeLabel = charCount > 10000
      ? `${Math.round(charCount / 1000)}K chars`
      : `${charCount} chars`;
    showStatus(statusEl, `${sizeLabel} pasted`, "success");
  } else {
    statusEl.style.display = "none";
  }

  updatePublishButton();
}

function updatePublishButton() {
  const textarea = document.getElementById("conversation-paste");
  const btn = document.getElementById("publish-btn");
  const hasPaste = textarea.value.trim().length > 0;
  const hasWebArticle = webArticleData !== null;
  btn.disabled = !(hasPaste || hasWebArticle);
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
  btn.textContent = "Saving...";
  resultEl.style.display = "none";
  errorEl.style.display = "none";

  if (!authToken) {
    showError(errorEl, "Not authenticated. Please login on the website.");
    resetPublishBtn(btn);
    return;
  }

  if (!groqApiKey) {
    showError(errorEl, "No Groq API key. Set one in website Settings.");
    resetPublishBtn(btn);
    return;
  }

  const title = document.getElementById("title").value.trim();
  if (!title) {
    showError(errorEl, "Please enter a title");
    resetPublishBtn(btn);
    return;
  }

  const projectSlug =
    document.getElementById("project-select").value || null;
  const tags = document
    .getElementById("tags")
    .value.split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const pastedText = document.getElementById("conversation-paste").value.trim();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    let endpoint;
    let payload;

    if (pastedText) {
      // Pasted conversation text → publish as chatbot conversation
      endpoint = "/api/publish";
      payload = {
        title,
        tags,
        source: "paste",
        conversation: [{ role: "assistant", content: pastedText }],
        project_slug: projectSlug,
      };

      const mode = document.getElementById("mode").value;
      if (mode === "update") {
        payload.update_slug =
          document.getElementById("existing-slug").value;
      }
    } else if (webArticleData) {
      // Auto-extracted web article
      endpoint = "/api/publish/web-article";
      payload = {
        title,
        content: webArticleData.content,
        url: webArticleData.url,
        tags,
        project_slug: projectSlug,
      };
    } else {
      showError(errorEl, "No content available to publish");
      resetPublishBtn(btn);
      return;
    }

    const resp = await fetch(`${BACKEND_URL}${endpoint}`, {
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

    let articleUrl;
    if (projectSlug) {
      articleUrl = `${FRONTEND_URL}/projects/${projectSlug}/articles/${result.slug}`;
    } else {
      articleUrl = `${FRONTEND_URL}/projects/${result.slug}`;
    }

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
  btn.textContent = "Save Article";
}

// ─── Event Binding ───

function bindEvents() {
  document
    .getElementById("open-login-btn")
    .addEventListener("click", openLoginPage);

  document.getElementById("logout-btn").addEventListener("click", logout);

  // Paste textarea
  const textarea = document.getElementById("conversation-paste");
  textarea.addEventListener("input", onPasteInput);

  // Project selector: new project button
  document
    .getElementById("new-project-btn")
    .addEventListener("click", () => {
      const form = document.getElementById("new-project-form");
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden")) {
        document.getElementById("new-project-title").focus();
      }
    });

  document
    .getElementById("create-project-btn")
    .addEventListener("click", createNewProject);

  document
    .getElementById("cancel-project-btn")
    .addEventListener("click", () => {
      document.getElementById("new-project-form").classList.add("hidden");
      document.getElementById("new-project-title").value = "";
    });

  document
    .getElementById("new-project-title")
    .addEventListener("keydown", (e) => {
      if (e.key === "Enter") createNewProject();
    });

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

  document
    .getElementById("publish-btn")
    .addEventListener("click", publishArticle);
}
