/**
 * Chat to Webpage extension popup logic.
 * Auth is handled on the website (localhost:3000/login).
 * The frontend-bridge content script syncs tokens to chrome.storage.local.
 * Handles: scrape (chatbot + web articles),
 * project selection, and publish.
 */

const BACKEND_URL = "http://localhost:8000";
const FRONTEND_URL = "http://localhost:3000";

let scrapedData = null; // Chatbot conversation data
let webArticleData = null; // Web article data (Readability.js)
let pageType = null; // "chatbot" | "web" | null
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
      await triggerScrape();
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
      select.innerHTML =
        '<option value="">(No project)</option>' +
        data.projects
          .map(
            (p) => `<option value="${p.slug}">${p.title}</option>`
          )
          .join("");
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

    // Reload projects and select the new one
    await loadProjects();
    document.getElementById("project-select").value = project.slug;

    // Hide the form
    titleInput.value = "";
    document.getElementById("new-project-form").classList.add("hidden");
  } catch (e) {
    alert(e.message);
  }

  btn.disabled = false;
  btn.textContent = "Create";
}

// ─── Scraping ───

function isChatbotPage(url) {
  return (
    url.includes("claude.ai") ||
    url.includes("chatgpt.com") ||
    url.includes("chat.openai.com")
  );
}

async function triggerScrape() {
  const statusEl = document.getElementById("scrape-status");
  const publishBtn = document.getElementById("publish-btn");

  scrapedData = null;
  webArticleData = null;
  pageType = null;

  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });

    if (!tab?.id || !tab.url) {
      showStatus(statusEl, "No active tab found", "error");
      return;
    }

    if (isChatbotPage(tab.url)) {
      // Chatbot page — use existing conversation scrapers
      pageType = "chatbot";
      chrome.tabs.sendMessage(
        tab.id,
        { action: "scrapeConversation" },
        (response) => {
          if (chrome.runtime.lastError) {
            showStatus(statusEl, "Could not scrape conversation", "error");
            return;
          }

          if (response?.success && response.messages?.length > 0) {
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
    } else if (
      tab.url.startsWith("https://") ||
      tab.url.startsWith("http://")
    ) {
      // Regular web page — use Readability.js article scraper
      pageType = "web";
      chrome.tabs.sendMessage(
        tab.id,
        { action: "scrapeArticle" },
        (response) => {
          if (chrome.runtime.lastError) {
            showStatus(
              statusEl,
              "Could not extract article from this page",
              "error"
            );
            return;
          }

          if (response?.success) {
            webArticleData = response;
            // Pre-fill title from article
            const titleInput = document.getElementById("title");
            if (!titleInput.value) {
              titleInput.value = response.title || "";
            }
            showStatus(
              statusEl,
              `Article detected: "${(response.title || "").substring(0, 50)}${(response.title || "").length > 50 ? "..." : ""}"`,
              "success"
            );
            publishBtn.disabled = false;
          } else {
            showStatus(
              statusEl,
              response?.error || "Could not extract article",
              "error"
            );
          }
        }
      );
    } else {
      showStatus(statusEl, "Not on a web page", "error");
    }
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

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    let endpoint;
    let payload;

    if (pageType === "chatbot" && scrapedData) {
      // Chatbot conversation publish
      endpoint = "/api/publish";
      payload = {
        title,
        tags,
        source: scrapedData.source,
        conversation: scrapedData.messages,
        project_slug: projectSlug,
      };

      const mode = document.getElementById("mode").value;
      if (mode === "update") {
        payload.update_slug =
          document.getElementById("existing-slug").value;
      }
    } else if (pageType === "web" && webArticleData) {
      // Web article publish
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

    // Build link to the article
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
  btn.textContent = "Publish";
}

// ─── Event Binding ───

function bindEvents() {
  // Open Login Page button
  document
    .getElementById("open-login-btn")
    .addEventListener("click", openLoginPage);

  // Logout
  document.getElementById("logout-btn").addEventListener("click", logout);

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

  // Create project
  document
    .getElementById("create-project-btn")
    .addEventListener("click", createNewProject);

  // Cancel new project
  document
    .getElementById("cancel-project-btn")
    .addEventListener("click", () => {
      document.getElementById("new-project-form").classList.add("hidden");
      document.getElementById("new-project-title").value = "";
    });

  // Enter on new project title
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

  // Publish
  document
    .getElementById("publish-btn")
    .addEventListener("click", publishArticle);

}
