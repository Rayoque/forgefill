/**
 * ForgeFill background service worker
 */
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "forgefill-personal",
    title: "ForgeFill – Personal profile",
    contexts: ["editable"],
  });
  chrome.contextMenus.create({
    id: "forgefill-work",
    title: "ForgeFill – Work profile",
    contexts: ["editable"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab || !tab.id) return;
  const profileId = info.menuItemId === "forgefill-work" ? "work" : "personal";
  try {
    await chrome.tabs.sendMessage(tab.id, { type: "FILL", profileId });
  } catch (e) {
    console.warn("[ForgeFill] message failed", e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "OPEN_OPTIONS") {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
  }
});
