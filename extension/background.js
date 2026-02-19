/**
 * Chat to Webpage background service worker.
 * Shows a green badge on chatbot pages (Claude, ChatGPT)
 * and a blue badge on all other web pages (article scraping available).
 */

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  const isChatbot =
    tab.url.includes("claude.ai") ||
    tab.url.includes("chatgpt.com") ||
    tab.url.includes("chat.openai.com");

  const isWebPage =
    tab.url.startsWith("https://") || tab.url.startsWith("http://");

  // Skip extension pages, chrome:// pages, etc.
  const isSpecial =
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://") ||
    tab.url.startsWith("about:");

  if (isChatbot) {
    chrome.action.setBadgeText({ text: "+", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#238636", tabId });
  } else if (isWebPage && !isSpecial) {
    chrome.action.setBadgeText({ text: "+", tabId });
    chrome.action.setBadgeBackgroundColor({ color: "#2563eb", tabId });
  } else {
    chrome.action.setBadgeText({ text: "", tabId });
  }
});
