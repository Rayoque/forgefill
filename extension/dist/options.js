(function () {
  "use strict";

  async function getSettings() {
    const result = await chrome.storage.local.get("ff_settings");
    return Object.assign(
      { preferredPasswordStyle: "apple", autoDetectSignup: true, showFloatingButton: true, defaultProfile: "personal", autoSubmit: false },
      result.ff_settings || {}
    );
  }

  async function saveSettings(partial) {
    const current = await getSettings();
    await chrome.storage.local.set({ ff_settings: Object.assign({}, current, partial) });
  }

  async function load() {
    const s = await getSettings();
    document.getElementById("showFloatingButton").checked = s.showFloatingButton;
    document.getElementById("autoDetectSignup").checked = s.autoDetectSignup;
    document.getElementById("autoSubmit").checked = s.autoSubmit;
  }

  ["showFloatingButton", "autoDetectSignup", "autoSubmit"].forEach((id) => {
    document.getElementById(id).addEventListener("change", async () => {
      await saveSettings({
        showFloatingButton: document.getElementById("showFloatingButton").checked,
        autoDetectSignup: document.getElementById("autoDetectSignup").checked,
        autoSubmit: document.getElementById("autoSubmit").checked,
      });
    });
  });

  load();
})();
