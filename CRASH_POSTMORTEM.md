# Post-mortem: desktop renderer crash on opening a chat (fixed in v1.2.35)

**Status:** Resolved in desktop **v1.2.35** (2026-07-23).
**Root cause:** A Chromium **120** renderer bug in **Electron 28**, fixed by upgrading to **Electron 32 (Chromium 128)**.

---

## Symptom

- The desktop app crashed and reloaded a short time (≈18 s – 4 min, variable) after opening a
  conversation (DM **or** server/group), then crashed again after the reload — an unusable loop.
- Reported as happening on **every** desktop user's app, not one machine.
- Errors that were **red herrings** (looked related, weren't): a message send/receive seeming to
  trigger it, sounds seeming to trigger it.

## The crash signature

Captured via the diagnostics added during the investigation (`crashes.log`):

```
render-process-gone reason=crashed exitCode=-1073741819 mainRssMB=~110 url=.../dm/<id>|/group/<id>
```

- `exitCode -1073741819` = **0xC0000005**, a native **access violation** in the renderer.
- Crashing module (from the minidump) = **`Aetherium.exe`** — i.e. inside Chromium itself, not a
  GPU driver, not audio, not a third-party DLL.
- `mainRssMB` logged the **main** process's memory, not the crashed renderer's — so "low memory"
  was **not** a reliable signal (an early mis-read that sent the investigation sideways).

## The one diagnostic that actually mattered

> **Open the exact same production site in a normal browser (Chrome/Edge). Does it crash there too?**

It **did not** crash in a normal browser — only in the desktop app, for everyone. Same web
content, same account, same conversation. The only variable left was the **rendering engine**:

| Surface | Engine | Result |
|---|---|---|
| Chrome / Edge | recent Chromium | no crash |
| Desktop app (≤ v1.2.34) | **Electron 28 = Chromium 120** (late 2023) | **crash** |

That is the definition of a **Chromium version bug**: fixed in newer Chromium, still present in
the old one the desktop was built on. Nothing in the web app could fix it.

## The fix

Upgraded the desktop's engine:

- `electron` **28.3.3 → 32.3.3** (Chromium 120 → 128; 8 majors of upstream fixes)
- `electron-builder` 24 → **25.1.8**
- `electron-updater` 6.1 → **6.8.9**

Compatibility checked before shipping (no code changes were needed):
- No `File.path` usage (removed in Chromium 126 / Electron 32) — uploads read file content, not paths.
- No `BrowserView` / `new-window` (removed/deprecated) usage.
- `desktopCapturer.getSources` already runs in the main process (required since Electron 17).
- The `webContents 'console-message'` legacy signature still works in Electron 32.

Smoke-tested the packaged build: launches, clears the old cache, `Page loaded successfully`,
renders — no startup crash.

## Why it took so long (wrong turns, and why each was wrong)

Every wrong turn was an attempt to explain a **native** crash that could not be reproduced
off the user's machine. In order:

1. **Audio service** (`AudioServiceOutOfProcess`) — plausible for a "sound triggers it" report;
   crash persisted.
2. **GPU hardware acceleration** — auto-disabled it on crash detection. Crash happens with accel
   **on and off**, so this was wrong *and* it made rendering laggy (CPU compositing). Reverted.
3. **`createImageBitmap` on decoration APNGs** — a real memory concern, but not this crash;
   the fix (and a later `static_url` variant) also **broke decoration animation**. Reverted.
4. **`ProfileEffect` cache-bust leak** — a genuine leak (bounded it), but the crash continued
   after the fix was confirmed loaded.
5. **Windhawk mod injection** — the crashed renderer's module list contained Windhawk mod DLLs
   (`dark-menus`, `eradicate-immersive-menus`, …). Excluding the app in Windhawk removed the
   mods — and it **still crashed**. Red herring.
6. **Supabase `navigator.locks`** — the only recurring console line before each crash. Switched
   auth to an in-process lock; crash continued.

The signal that ended it was structural, not another hypothesis: **browser fine, app crashes = engine version.**

## Diagnostic infrastructure added along the way (kept)

These made the eventual diagnosis possible and are worth keeping:

- **`src/logger.js`** — a persistent, append-only `crashes.log` (survives reloads; not truncated on start).
- **`src/window-manager.js`** — `render-process-gone` logs reason, exit code, URL, and the newest
  crash-minidump path; and buffers the renderer's last ~25 **console messages**, dumped on crash.
- **`main.js`** — `crashReporter.start({ uploadToServer: false })` writes native **minidumps** to
  `%APPDATA%/aetherium-desktop/Crashpad/reports`; plus an `app.on('child-process-gone')` handler
  for GPU/utility (incl. audio) crashes that `render-process-gone` doesn't cover.
- **Cache/SW clear on version update** (`window-manager.js`) — clears HTTP cache + service worker
  once per new app version before loading, so the desktop reliably picks up the latest **web**
  build instead of a stale cached one (this had been masking whether web fixes were even running).
- A minidump parser (`scratchpad/mdmp.py` during the investigation) that reads the exception code,
  fault address, crashing module, and full module list from a `.dmp`.

## How to diagnose a native desktop crash next time (checklist)

1. **Reproduce the same content in a normal browser first.** If it doesn't crash there, it's the
   **engine (Electron/Chromium) version**, not the web app — stop debugging web code.
2. Read `crashes.log`: `exitCode -1073741819` (0xC0000005) = native access violation (not JS, not OOM
   of the main process — that memory number is the *main* process).
3. Parse the minidump for the **crashing module** and the **full module list** (rules in/out GPU
   drivers, audio, and third-party injected DLLs like Windhawk).
4. Check the **console ring buffer** in `crashes.log` for the last renderer activity.
5. Confirm the desktop is actually running the **latest web build** (cache/SW can serve stale
   assets) before concluding a web fix "didn't work."
6. If it's an engine-version bug: **upgrade Electron** to a newer Chromium (verify `File.path`,
   `BrowserView`, `new-window`, `desktopCapturer` compatibility first).

## Related web-side changes shipped during the investigation

Not the cause of this crash, but kept where they were genuine improvements:
- Reverted the avatar-decoration "freeze" → decorations animate again (web 2.8.2183/2184).
- Supabase auth uses an in-process lock instead of `navigator.locks`.
- Service-worker `no-store` navigation + `updateViaCache:'none'` (fixes "blank / not found" on web update).
