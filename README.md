# Sentinel Helper Extension

Sentinel Helper is a Chromium extension that provides a hover-activated "Copy KQL" control for analytic rule query boxes in Microsoft Sentinel (portal.azure.com). The project is actively being extended with additional Sentinel-focused helpers — this README documents the current functionality, installation/usage, troubleshooting, and planned features.

**Current Functionality**
- **Hover copy UI:** A small "Copy KQL" button appears when you hover a detected query box and copies the rule's KQL to clipboard.
- **Anchored in-container UI:** The button is inserted inside the detected KQL container and anchored to the top-right so it doesn't overlap portal sidebars.
- **Monaco & tokenized KQL support:** Detects KQL rendered in Monaco editors (`.view-lines`) and tokenized DOM (many small spans) and extracts the full query text.
- **Shadow DOM aware:** The detector searches into shadow roots to find KQL viewers.
- **ReactBlade / iframe support:** Content scripts run in frames (manifest `host_permissions` and `all_frames`) so the extension can attach inside portal subframes such as `*.reactblade.portal.azure.net`.
- **Multiple detection heuristics:** Uses an ordered detection pipeline: exact selector (if provided), `.uc-kql-viewer`/inner `pre`, tokenized span heuristics (common classes), Monaco fallback, then full-`pre` scan heuristics.
- **Manual injector:** A toolbar action (background service worker) runs a one-shot scan across all frames to attach copy controls when automatic attach fails.
- **Auto-inject retries:** The background service worker schedules staggered execute attempts after navigation to improve reliability in the SPA environment.
- **Duplicate prevention:** Controls are owner-tagged and proximity-checked to avoid creating duplicate copy buttons.
- **Orphan cleanup & lifecycle handling:** MutationObservers and periodic cleanup remove buttons whose owner elements are removed or zero-sized.
- **Pointer-based show/hide:** The UI follows the KQL box and uses pointer coordinate detection in addition to hover events to be robust against tokenized DOM where CSS `:hover` can be unreliable.
- **Clipboard fallback:** Uses `navigator.clipboard.writeText()` with a textarea `execCommand('copy')` fallback for compatibility.
- **Developer helpers:** Exposes debugging helpers in frames (for example `window.__sentinelKqlScan` and `window.__sentinelKqlCopyHelper`) to assist testing.

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
- Keyboard shortcuts for quick copy.
- Copy with optional context (rule name, timeframe) or export options.
- Support for Security.Microsoft.com (Unified/Defender Portal)

**Reload steps after changing permissions**
1. On the extensions page (`edge://extensions` or `chrome://extensions`) click the extension's "Reload" button.
2. Reload the portal page (`F5`) so iframe content reloads and the content script can run inside it.


_Last updated: November 24, 2025_

