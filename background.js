// Background Service Worker

// Enable side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setOptions({
    path: 'sidepanel.html',
    enabled: true
  });
});

// Handle messages from content script or side panel
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'download_media') {
    // Download media using chrome.downloads API
    chrome.downloads.download({
      url: request.url,
      filename: request.filename || `grok_media_${Date.now()}.png`
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId: downloadId });
      }
    });
    return true; // Keep message channel open for async response
  }
});
