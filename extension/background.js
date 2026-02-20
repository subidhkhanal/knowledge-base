/**
 * Chat to Webpage background service worker.
 * Shows a green badge on chatbot pages (Claude, ChatGPT)
 * and a blue badge on all other web pages (article scraping available).
 */

// Listen for auth sync messages from the frontend bridge content script.
// When a user logs in/out on localhost:3000, the bridge reads localStorage
// and sends the credentials here for storage in chrome.storage.local.
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "frontendAuthSync") {
    const data = {};
    if (message.authToken) {
      data.authToken = message.authToken;
      data.username = message.username || null;
    }
    if (message.groqApiKey) {
      data.groqApiKey = message.groqApiKey;
    }

    if (Object.keys(data).length > 0) {
      chrome.storage.local.set(data);
    } else {
      // User logged out — clear auth
      chrome.storage.local.remove(["authToken", "username"]);
    }
  }
});

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
