/**
 * Chat to Webpage background service worker.
 * Shows a green badge dot on supported chat pages (Claude, ChatGPT).
 */

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  const isSupported =
    tab.url.includes("claude.ai") ||
    tab.url.includes("chatgpt.com") ||
    tab.url.includes("chat.openai.com");

  chrome.action.setBadgeText({
    text: isSupported ? "+" : "",
    tabId,
  });

  chrome.action.setBadgeBackgroundColor({
    color: "#238636",
    tabId,
  });
});
