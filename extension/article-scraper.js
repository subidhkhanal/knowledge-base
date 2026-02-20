/**
 * Web Article Scraper — uses Mozilla Readability.js to extract article content
 * from any webpage. Injected as a content script on all URLs.
 *
 * Listens for "scrapeArticle" messages from the popup and returns
 * the parsed article content.
 */

(function () {
  // Readability is loaded as a separate content script before this file
  // It attaches to the global scope

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action !== "scrapeArticle") return false;

    try {
      // Clone the document to avoid modifying the live DOM
      const documentClone = document.cloneNode(true);

      // Check if Readability is available
      if (typeof Readability === "undefined") {
        sendResponse({
          success: false,
          error: "Readability library not loaded",
        });
        return true;
      }

      const reader = new Readability(documentClone);
      const article = reader.parse();

      if (!article || !article.textContent || article.textContent.trim().length < 100) {
        sendResponse({
          success: false,
          error: "Could not extract article content from this page",
        });
        return true;
      }

      sendResponse({
        success: true,
        title: article.title || document.title,
        content: article.textContent,
        excerpt: article.excerpt || "",
        url: window.location.href,
        source: "web",
        siteName: article.siteName || "",
        byline: article.byline || "",
        length: article.length || 0,
      });
    } catch (err) {
      sendResponse({
        success: false,
        error: "Failed to extract article: " + err.message,
      });
    }

    return true; // Keep channel open for async response
  });
})();
