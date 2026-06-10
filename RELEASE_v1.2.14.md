# Release v1.2.14 - Quick Instructions

## What Changed

- Update check interval: **2 hours → 30 minutes**

Users will get notified about updates much faster now!

## Build & Release

### 1. Build

```powershell
npm run build
```

### 2. Create GitHub Release

```powershell
gh release create v1.2.14 `
  --title "Aetherium Desktop v1.2.14" `
  --notes "## What's New`n- App now checks for updates every 30 minutes (changed from 2 hours)`n`n## Installation`nDownload and run Aetherium-Setup.exe below.`n`n## Auto-Update`nExisting installations will auto-update within 30 minutes." `
  dist\Aetherium-Setup.exe `
  dist\latest.yml
```

That's it! v1.2.13 users will get the update within 30 minutes.
