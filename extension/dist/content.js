/**
 * ForgeFill content script (self-contained for zero-build launch)
 * Detects signup forms, injects FAB, fills from profiles + Apple-style password.
 */

(function () {
  "use strict";

  // ========== Password Generator (Apple-style) ==========
  const CONSONANTS = "bcdfghjklmnpqrstvwxz";
  const VOWELS = "aeiouy";

  function randomInt(max) {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return array[0] % max;
  }
  function randomChar(str) {
    return str[randomInt(str.length)];
  }
  function generateGroup() {
    let g = "";
    for (let i = 0; i < 6; i++) {
      g += i % 2 === 0 ? randomChar(CONSONANTS) : randomChar(VOWELS + CONSONANTS);
    }
    return g;
  }
  function generateAppleStylePassword() {
    const groups = [generateGroup(), generateGroup(), generateGroup()];
    let password = groups[0] + "-" + groups[1] + "-" + groups[2];
    const letterPositions = [];
    for (let i = 0; i < password.length; i++) {
      if (password[i] !== "-") letterPositions.push(i);
    }
    const chars = password.split("");
    const upperPos = letterPositions[randomInt(letterPositions.length)];
    chars[upperPos] = chars[upperPos].toUpperCase();
    const digitCandidates = letterPositions.filter((p) => p !== upperPos);
    const digitPos = digitCandidates[randomInt(digitCandidates.length)];
    chars[digitPos] = String(randomInt(10));
    return chars.join("");
  }
  function generateHighEntropyPassword(length = 24) {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}";
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    let result = "";
    for (let i = 0; i < length; i++) result += charset[array[i] % charset.length];
    return result;
  }

  // ========== Storage helpers ==========
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
  async function getSettings() {
    const result = await chrome.storage.local.get("ff_settings");
    return Object.assign(
      { preferredPasswordStyle: "apple", autoDetectSignup: true, showFloatingButton: true, defaultProfile: "personal", autoSubmit: false },
      result.ff_settings || {}
    );
  }
  async function getProfile(id) {
    const profiles = await getProfiles();
    return profiles[id];
  }

  // ========== Field Matcher ==========
  function getLabelText(el) {
    const id = el.getAttribute("id");
    if (id) {
      const label = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (label) return (label.textContent || "").trim();
    }
    const parentLabel = el.closest("label");
    if (parentLabel) return (parentLabel.textContent || "").trim();
    return el.getAttribute("aria-label") || "";
  }

  function scoreElement(el) {
    const type = (el.getAttribute("type") || "text").toLowerCase();
    const name = (el.getAttribute("name") || "").toLowerCase();
    const idAttr = (el.getAttribute("id") || "").toLowerCase();
    const placeholder = (el.getAttribute("placeholder") || "").toLowerCase();
    const autocomplete = (el.getAttribute("autocomplete") || "").toLowerCase();
    const label = getLabelText(el).toLowerCase();
    const combined = name + " " + idAttr + " " + placeholder + " " + label + " " + autocomplete;

    if (autocomplete.includes("email") || autocomplete === "username") {
      return { element: el, role: autocomplete.includes("email") ? "email" : "username", score: 100 };
    }
    if (autocomplete === "new-password" || autocomplete === "current-password") {
      return { element: el, role: "password", score: 100 };
    }
    if (autocomplete.startsWith("given-name")) return { element: el, role: "firstName", score: 95 };
    if (autocomplete.startsWith("family-name")) return { element: el, role: "lastName", score: 95 };
    if (autocomplete === "name") return { element: el, role: "fullName", score: 90 };
    if (autocomplete === "tel" || autocomplete.startsWith("tel")) return { element: el, role: "phone", score: 95 };
    if (autocomplete === "organization") return { element: el, role: "company", score: 90 };
    if (type === "email") return { element: el, role: "email", score: 90 };
    if (type === "password") {
      if (/confirm|retype|reenter|verify|repeat/i.test(combined)) return { element: el, role: "passwordConfirm", score: 85 };
      return { element: el, role: "password", score: 80 };
    }
    if (type === "tel") return { element: el, role: "phone", score: 85 };

    const patterns = {
      email: [/e-?mail/i, /mail/i],
      username: [/user.?name/i, /login/i, /handle/i],
      passwordConfirm: [/confirm|re-?type|re-?enter|repeat|verify.?pass/i],
      firstName: [/first.?name/i, /given.?name/i, /fname/i],
      lastName: [/last.?name/i, /family.?name/i, /surname/i, /lname/i],
      fullName: [/full.?name/i, /^name$/i, /your.?name/i],
      phone: [/phone/i, /mobile/i, /tel/i],
      company: [/company/i, /organization/i, /org/i],
      jobTitle: [/job.?title/i, /title/i, /position/i],
      addressLine1: [/address.?1|street|addr1|line1/i],
      city: [/city/i],
      state: [/state/i, /province/i],
      postalCode: [/zip|postal|post.?code/i],
      country: [/country/i],
      dob: [/birth|dob|date.?of.?birth/i],
      website: [/website|url|homepage/i],
    };

    let bestRole = "unknown";
    let bestScore = 0;
    for (const [role, regs] of Object.entries(patterns)) {
      for (const re of regs) {
        if (re.test(combined)) {
          const score = 60 + (re.test(name) || re.test(idAttr) ? 15 : 0) + (re.test(label) ? 10 : 0);
          if (score > bestScore) {
            bestScore = score;
            bestRole = role;
          }
        }
      }
    }
    return { element: el, role: bestRole, score: bestScore };
  }

  function discoverFields() {
    const candidates = document.querySelectorAll(
      "input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])"
    );
    const scored = [];
    for (const el of candidates) {
      if (el.offsetParent === null && getComputedStyle(el).visibility === "hidden") continue;
      const s = scoreElement(el);
      if (s.score >= 40) scored.push(s);
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  function profileToValues(profile, password) {
    const fullName = profile.fullName || (profile.firstName + " " + profile.lastName).trim();
    return {
      email: profile.email || "",
      username: profile.email || "",
      password: password,
      passwordConfirm: password,
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      fullName: fullName,
      phone: profile.phone || "",
      company: profile.company || "",
      jobTitle: profile.jobTitle || "",
      addressLine1: (profile.address && profile.address.line1) || "",
      addressLine2: (profile.address && profile.address.line2) || "",
      city: (profile.address && profile.address.city) || "",
      state: (profile.address && profile.address.state) || "",
      postalCode: (profile.address && profile.address.postalCode) || "",
      country: (profile.address && profile.address.country) || "",
      dob: profile.dateOfBirth || "",
      website: profile.website || "",
      unknown: "",
    };
  }

  function setNativeValue(el, value) {
    const proto = Object.getPrototypeOf(el);
    const descriptor = Object.getOwnPropertyDescriptor(proto, "value");
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fillFields(fields, values) {
    const usedRoles = new Set();
    let filled = 0;
    let passwordUsed = null;
    for (const { element, role } of fields) {
      if (role === "unknown" || usedRoles.has(role)) continue;
      const value = values[role];
      if (!value) continue;
      try {
        setNativeValue(element, value);
        usedRoles.add(role);
        filled++;
        if (role === "password" || role === "passwordConfirm") passwordUsed = value;
      } catch (e) {
        console.warn("[ForgeFill] set failed", role, e);
      }
    }
    return { filled, passwordUsed };
  }

  // ========== UI ==========
  const BUTTON_ID = "forgefill-fab";
  const TOAST_ID = "forgefill-toast";
  let isProcessing = false;
  let lastFilledPassword = null;

  function isLikelySignupPage() {
    const text = (document.body && document.body.innerText || "").toLowerCase().slice(0, 5000);
    const title = (document.title || "").toLowerCase();
    const url = location.href.toLowerCase();
    const signals = [
      /sign\s?up|create\s?(an?\s)?account|register|join\s?now|get\s?started/i.test(text),
      /sign\s?up|register|create.?account|join/i.test(title),
      /signup|sign-up|register|create-account|join/i.test(url),
      document.querySelector('input[type="password"]') !== null &&
        (document.querySelector('input[type="email"]') !== null || document.querySelector('input[name*="email" i]') !== null),
    ];
    return signals.filter(Boolean).length >= 2;
  }

  function createFloatingButton() {
    if (document.getElementById(BUTTON_ID)) return;
    const btn = document.createElement("div");
    btn.id = BUTTON_ID;
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "ForgeFill – auto fill new account");
    btn.innerHTML = '<div class="ff-main">FF</div><div class="ff-menu" hidden><button data-profile="personal">Personal</button><button data-profile="work">Work</button></div>';

    if (!document.getElementById("forgefill-styles")) {
      const style = document.createElement("style");
      style.id = "forgefill-styles";
      style.textContent = `
        #forgefill-fab{position:fixed;bottom:24px;right:24px;z-index:2147483646;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;user-select:none}
        #forgefill-fab .ff-main{width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,#0a84ff,#5e5ce6);color:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer;transition:transform .15s}
        #forgefill-fab .ff-main:hover{transform:scale(1.08)}
        #forgefill-fab .ff-menu{position:absolute;bottom:60px;right:0;background:#1c1c1e;border-radius:12px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:4px;min-width:140px}
        #forgefill-fab .ff-menu button{background:transparent;border:none;color:#f5f5f7;padding:10px 14px;border-radius:8px;text-align:left;font-size:14px;cursor:pointer}
        #forgefill-fab .ff-menu button:hover{background:#2c2c2e}
        #forgefill-toast{position:fixed;bottom:90px;right:24px;z-index:2147483647;background:#1c1c1e;color:#f5f5f7;padding:12px 16px;border-radius:10px;font-size:13px;max-width:280px;box-shadow:0 6px 20px rgba(0,0,0,.3);opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s;pointer-events:none}
        #forgefill-toast.visible{opacity:1;transform:translateY(0)}
      `;
      document.head.appendChild(style);
    }
    document.body.appendChild(btn);

    const main = btn.querySelector(".ff-main");
    const menu = btn.querySelector(".ff-menu");
    main.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });
    menu.querySelectorAll("button").forEach((b) => {
      b.addEventListener("click", async (e) => {
        e.stopPropagation();
        menu.hidden = true;
        await runFill(b.dataset.profile);
      });
    });
    document.addEventListener("click", () => { menu.hidden = true; });
  }

  function showToast(message, duration = 3200) {
    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add("visible");
    setTimeout(() => toast.classList.remove("visible"), duration);
  }

  async function runFill(profileId) {
    if (isProcessing) return;
    isProcessing = true;
    try {
      const settings = await getSettings();
      const profile = await getProfile(profileId);
      if (!profile.email || !profile.firstName) {
        showToast("Profile incomplete. Open the ForgeFill popup to add your details.");
        return;
      }
      const password = settings.preferredPasswordStyle === "apple" ? generateAppleStylePassword() : generateHighEntropyPassword();
      lastFilledPassword = password;

      let fields = discoverFields();
      let values = profileToValues(profile, password);
      let result = fillFields(fields, values);

      if (result.filled < 2) {
        await new Promise((r) => setTimeout(r, 450));
        fields = discoverFields();
        result = fillFields(fields, values);
      }

      if (result.filled === 0) {
        showToast("No matching fields found. Focus a form field and try again.");
      } else {
        showToast(`Filled ${result.filled} field${result.filled === 1 ? "" : "s"} (${profile.label} + strong password).`);
        if (settings.autoSubmit) {
          const submit = document.querySelector('button[type="submit"], input[type="submit"]');
          if (submit && /sign|create|register|join|continue|next/i.test(submit.textContent || submit.value || "")) {
            setTimeout(() => submit.click(), 350);
          }
        }
      }
    } catch (err) {
      console.error("[ForgeFill]", err);
      showToast("Something went wrong. Check the console.");
    } finally {
      isProcessing = false;
    }
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "FILL") {
      runFill(msg.profileId || "personal").then(() => sendResponse({ ok: true }));
      return true;
    }
    if (msg.type === "GET_LAST_PASSWORD") {
      sendResponse({ password: lastFilledPassword });
    }
    if (msg.type === "PING") {
      sendResponse({ ok: true, isSignup: isLikelySignupPage() });
    }
  });

  async function init() {
    const settings = await getSettings();
    if (!settings.showFloatingButton) return;
    if (settings.autoDetectSignup && !isLikelySignupPage()) {
      const observer = new MutationObserver(() => {
        if (isLikelySignupPage() && !document.getElementById(BUTTON_ID)) createFloatingButton();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      setTimeout(() => observer.disconnect(), 15000);
      return;
    }
    if (document.body) createFloatingButton();
    else document.addEventListener("DOMContentLoaded", createFloatingButton);
  }
  init();
})();
