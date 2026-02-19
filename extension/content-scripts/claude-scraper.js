/**
 * Claude.ai conversation scraper.
 * Injected on claude.ai pages via manifest content_scripts.
 * Listens for "scrapeConversation" message from the popup.
 */

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action !== "scrapeConversation") return true;

  try {
    const messages = scrapeClaudeConversation();

    sendResponse({
      success: true,
      messages: messages.filter((m) => m.content.length > 0),
      source: "claude",
      messageCount: messages.length,
    });
  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }

  return true; // Keep message channel open for async response
});

/**
 * Attempt multiple DOM strategies to extract conversation messages.
 * Claude's DOM structure changes between updates, so we try several approaches.
 */
function scrapeClaudeConversation() {
  // Strategy 1: data-testid attributes (most reliable when available)
  let messages = scrapeByTestId();
  if (messages.length > 0) return messages;

  // Strategy 2: role-based class name patterns
  messages = scrapeByClassNames();
  if (messages.length > 0) return messages;

  // Strategy 3: conversation container with alternating structure
  messages = scrapeByConversationContainer();
  if (messages.length > 0) return messages;

  // Strategy 4: fallback — grab all main content as a single assistant message
  return scrapeFallback();
}

/** Strategy 1: Look for data-testid attributes on message elements. */
function scrapeByTestId() {
  const messages = [];
  const elements = document.querySelectorAll(
    '[data-testid*="user-message"], [data-testid*="assistant-message"], ' +
      '[data-testid*="human-turn"], [data-testid*="ai-turn"]'
  );

  elements.forEach((el) => {
    const testId = el.getAttribute("data-testid") || "";
    const isUser =
      testId.includes("user") || testId.includes("human");
    messages.push({
      role: isUser ? "user" : "assistant",
      content: el.innerText.trim(),
    });
  });

  return messages;
}

/** Strategy 2: Look for class names containing User/Assistant/Human patterns. */
function scrapeByClassNames() {
  const messages = [];
  const elements = document.querySelectorAll(
    '[class*="UserMessage"], [class*="AssistantMessage"], ' +
      '[class*="human-turn"], [class*="ai-turn"], ' +
      '[class*="user-message"], [class*="assistant-message"]'
  );

  elements.forEach((el) => {
    const className = el.className || "";
    const isUser =
      className.includes("User") ||
      className.includes("human") ||
      className.includes("user-message");
    messages.push({
      role: isUser ? "user" : "assistant",
      content: el.innerText.trim(),
    });
  });

  return messages;
}

/** Strategy 3: Find conversation container and parse alternating message blocks. */
function scrapeByConversationContainer() {
  const messages = [];

  // Look for the main conversation area
  const container = document.querySelector(
    '[class*="conversation"], [class*="chat-messages"], ' +
      '[class*="thread"], main [role="presentation"]'
  );
  if (!container) return messages;

  // Get direct child message blocks
  const blocks = container.querySelectorAll(
    ':scope > div > div, [class*="message"], [class*="turn"]'
  );

  let lastRole = "assistant"; // First real message is usually from the user
  blocks.forEach((block) => {
    const text = block.innerText?.trim();
    if (text && text.length > 5) {
      const role = lastRole === "user" ? "assistant" : "user";
      messages.push({ role, content: text });
      lastRole = role;
    }
  });

  return messages;
}

/** Strategy 4: Nuclear fallback — grab the full main content area. */
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
