/**
 * ChatGPT conversation scraper.
 * Injected on chatgpt.com and chat.openai.com pages via manifest content_scripts.
 * Listens for "scrapeConversation" message from the popup.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "scrapeConversation") return true;

  try {
    const messages = scrapeChatGPTConversation();

    sendResponse({
      success: true,
      messages: messages.filter((m) => m.content.length > 0),
      source: "chatgpt",
      messageCount: messages.length,
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }

  return true; // Keep message channel open for async response
});

/**
 * Attempt multiple DOM strategies to extract ChatGPT conversation messages.
 */
function scrapeChatGPTConversation() {
  // Strategy 1: data-message-author-role attribute (ChatGPT's standard)
  let messages = scrapeByAuthorRole();
  if (messages.length > 0) return messages;

  // Strategy 2: article-based structure
  messages = scrapeByArticles();
  if (messages.length > 0) return messages;

  // Strategy 3: fallback — grab main content
  return scrapeFallback();
}

/** Strategy 1: Use ChatGPT's data-message-author-role attribute. */
function scrapeByAuthorRole() {
  const messages = [];
  const elements = document.querySelectorAll("[data-message-author-role]");

  elements.forEach((el) => {
    const role = el.getAttribute("data-message-author-role");
    if (role !== "user" && role !== "assistant") return;

    // Prefer .markdown container for assistant responses (better formatting)
    const markdownContent = el.querySelector(".markdown");
    const content =
      markdownContent?.innerText?.trim() || el.innerText?.trim();

    if (content) {
      messages.push({ role, content });
    }
  });

  return messages;
}

/** Strategy 2: Look for article elements that ChatGPT sometimes uses. */
function scrapeByArticles() {
  const messages = [];
  const articles = document.querySelectorAll(
    'article, [data-testid*="conversation-turn"]'
  );

  articles.forEach((article) => {
    const text = article.innerText?.trim();
    if (!text || text.length < 5) return;

    // Try to detect role from structure
    const hasUserIcon = article.querySelector(
      '[data-testid*="user"], img[alt*="User"]'
    );
    const role = hasUserIcon ? "user" : "assistant";
    messages.push({ role, content: text });
  });

  return messages;
}

/** Strategy 3: Nuclear fallback — grab the full main content area. */
function scrapeFallback() {
  const mainContent = document.querySelector("main")?.innerText || "";
  if (!mainContent.trim()) return [];

  return [
    {
      role: "assistant",
      content: mainContent.trim(),
    },
  ];
}
