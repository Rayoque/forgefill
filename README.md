# ForgeFill

**Autocomplete on steroids for creating new accounts.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

One (or two) taps instead of hunting every field.  
Personal profile + Work profile. Fresh **Apple-style strong passwords** every time (never stored).  
Works in Chromium browsers today. Safari / iOS path documented.

## Quick Test (30 seconds)

1. Clone or download this repo
2. Open Chrome → `chrome://extensions` → enable **Developer mode**
3. **Load unpacked** → select the `extension/dist` folder
4. Click the ForgeFill icon → fill your Personal profile (name + email) → Save
5. Open the included test form at `test/form.html` (or any real signup page)
6. Click the blue **FF** button (bottom-right) → Personal

That’s the entire pipeline.

## What it does

- Detects probable signup / registration forms
- Floating blue **FF** button → choose Personal or Work
- Intelligent field matching (autocomplete, labels, names, placeholders, heuristics)
- Generates Apple-format 20-character strong passwords (or pure high-entropy)
- Fills password **and** confirmation automatically
- Context-menu support (right-click any field)
- One automatic retry for SPAs / dynamic forms
- All data local. Passwords are ephemeral.

## Install (Chrome / Edge / Brave)

```bash
git clone https://github.com/Rayoque/forgefill.git
cd forgefill
```

Then:

1. `chrome://extensions` → Developer mode ON
2. Load unpacked → choose `extension/dist`
3. Pin it
4. Open the popup and save your profiles

## iOS / Safari

The content script and generator are already Safari Web Extension compatible (non-persistent background).

Full iOS distribution still needs a thin native host + App Store / TestFlight (or the 2026 Safari Web Extension Packager). See `ios-host/README.md`.

On iOS the system “Use Strong Password” prompt is still available; the extension currently generates a matching-format password so the full pipeline (including confirm field) stays automatic.

## Architecture

```
Signup page
  → content script detects form signals
  → FAB / context menu / popup
  → load profile + generate Apple-style password
  → score every visible field
  → set native values + events (React/Vue safe)
  → retry once if needed
  → toast
```

No servers. No analytics. No password storage.

## File layout

```
forgefill/
├── LICENSE                 # MIT
├── README.md
├── extension/
│   └── dist/               # ← load this folder in Chrome (ready)
│       ├── manifest.json
│       ├── content.js
│       ├── background.js
│       ├── popup.html / popup.js
│       └── options.html / options.js
├── test/
│   └── form.html           # simple local test page
└── ios-host/               # notes for Safari packaging
```

## Security

- `<all_urls>` host permission (signup forms live everywhere)
- No remote code, no network requests
- `crypto.getRandomValues` only for passwords

## License

MIT — do whatever you want.

Built by applying The Algorithm: Question requirements → Delete the unnecessary → Simplify → Accelerate → Automate.
