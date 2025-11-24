# Sentinel Helper Extension

Sentinel Helper is a Chromium extension that provides QOL changes to Microsoft Sentinel. The project is actively being extended with additional Sentinel-focused helpers — this README documents the current functionality, installation/usage, troubleshooting, and planned features.

**Current Functionality**
- **Copy KQL**: A small copy KQL button appears when you hover over a rule query box on either the Analytics or Content Hub pages. Supports Sentinel in either portal.azure.com or security.microsoft.com as well as Content Hub in either portal.


**Installation (Chrome / Edge - developer mode)**
1. Open `edge://extensions` or `chrome://extensions`.
2. Enable "Developer mode".
3. Click "Load unpacked" and select the extension folder: `d:/Work/Code & Scripts/Sentinel Extension`.
4. Navigate to `https://portal.azure.com` → Microsoft Sentinel → Analytics.
5. Open an analytic rule and hover the query box; the "Copy KQL" button should appear in the top-right of the query container.

**Manual inject**
- Click the extension action button in the toolbar to run a one-shot scan in all frames. This forces the detector to attach buttons when the portal's dynamic UI prevents automatic attachment.

**Troubleshooting & Tips**
- If you don't see the button: reload the extension page (`edge://extensions`/`chrome://extensions` → Reload) and then reload the portal page (`F5`).
- If the KQL displays inside an iframe whose origin isn't covered by the manifest's `host_permissions`, the content script cannot run there — check iframe `src` in DevTools and add the host to `manifest.json` if needed.
- If copying fails in a particular browser, check DevTools Console for clipboard errors. The extension attempts a fallback copy method when the Clipboard API is unavailable.
- For advanced debugging, open DevTools inside the frame containing the KQL and call `window.__sentinelKqlScan && window.__sentinelKqlScan()` to force a rescan.

**Developer Notes**
- Primary files: `content-script.js` (detection, UI, copy logic), `background.js` (manual injector and auto-inject scheduler), `manifest.json` (metadata, hosts, permissions).
- Heuristics are intentionally layered and conservative to avoid false positives; you can tweak selectors and timing in `content-script.js` while testing locally.

**Planned / Future Features**
- Add a small options UI to configure behavior (enable/disable auto-inject, toggle heuristics, custom selectors).
- Keyboard shortcuts for quick copy.
- Copy with optional context (rule name, timeframe) or export options.
- Package and publish builds (CRX) with signing instructions.

**Reload steps after changing permissions**
1. On the extensions page (`edge://extensions` or `chrome://extensions`) click the extension's "Reload" button.
2. Reload the portal page (`F5`) so iframe content reloads and the content script can run inside it.

---
_Last updated: November 24, 2025_
