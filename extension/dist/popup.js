/**
 * ForgeFill popup (self-contained)
 */
(function () {
  "use strict";

  let currentTab = "personal";

  function $(id) {
    return document.getElementById(id);
  }

  async function getProfiles() {
    const result = await chrome.storage.local.get("ff_profiles");
    const stored = result.ff_profiles;
    if (!stored) {
      return {
        personal: { id: "personal", label: "Personal", firstName: "", lastName: "", email: "", custom: {}, updatedAt: Date.now() },
        work: { id: "work", label: "Work", firstName: "", lastName: "", email: "", company: "", custom: {}, updatedAt: Date.now() },
      };
    }
    return {
      personal: stored.personal || { id: "personal", label: "Personal", firstName: "", lastName: "", email: "", custom: {}, updatedAt: Date.now() },
      work: stored.work || { id: "work", label: "Work", firstName: "", lastName: "", email: "", company: "", custom: {}, updatedAt: Date.now() },
    };
  }

  async function saveProfile(profile) {
    const profiles = await getProfiles();
    profiles[profile.id] = Object.assign({}, profile, { updatedAt: Date.now() });
    await chrome.storage.local.set({ ff_profiles: profiles });
  }

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
    const profiles = await getProfiles();
    const settings = await getSettings();
    renderProfile(profiles[currentTab]);
    $("passwordStyle").value = settings.preferredPasswordStyle;
    updateWorkVisibility();
  }

  function renderProfile(p) {
    $("firstName").value = p.firstName || "";
    $("lastName").value = p.lastName || "";
    $("email").value = p.email || "";
    $("phone").value = p.phone || "";
    $("company").value = p.company || "";
    $("jobTitle").value = p.jobTitle || "";
  }

  function updateWorkVisibility() {
    $("work-fields").style.display = currentTab === "work" ? "block" : "none";
  }

  function collect() {
    return {
      id: currentTab,
      label: currentTab === "personal" ? "Personal" : "Work",
      firstName: $("firstName").value.trim(),
      lastName: $("lastName").value.trim(),
      email: $("email").value.trim(),
      phone: $("phone").value.trim() || undefined,
      company: $("company").value.trim() || undefined,
      jobTitle: $("jobTitle").value.trim() || undefined,
      custom: {},
      updatedAt: Date.now(),
    };
  }

  function setStatus(msg) {
    $("status").textContent = msg;
  }

  async function onSave() {
    const profile = collect();
    if (!profile.email) {
      setStatus("Email is required.");
      return;
    }
    await saveProfile(profile);
    await saveSettings({ preferredPasswordStyle: $("passwordStyle").value });
    setStatus("Saved.");
  }

  async function onFill() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab || !tab.id) {
      setStatus("No active tab.");
      return;
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "FILL", profileId: currentTab });
      setStatus("Fill command sent.");
      window.close();
    } catch (e) {
      setStatus("Could not reach page. Refresh the tab and try again.");
    }
  }

  document.querySelectorAll(".tabs button").forEach((btn) => {
    btn.addEventListener("click", async () => {
      document.querySelectorAll(".tabs button").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentTab = btn.dataset.tab;
      const profiles = await getProfiles();
      renderProfile(profiles[currentTab]);
      updateWorkVisibility();
    });
  });

  $("save").addEventListener("click", onSave);
  $("fill").addEventListener("click", onFill);

  load();
})();
