# Release Instructions for v1.2.13

## What's New in This Version

- ✅ App now checks for updates every 2 hours (not just on launch)
- ✅ "Restart Now" button actually works now (closes app and runs installer)

## Build & Release Steps

### 1. Build the App (Windows PowerShell)

```powershell
# Open Windows PowerShell (NOT WSL!)
cd C:\Users\WolfDrago12\Desktop\Aetherium\aetherium-desktop
.\build-windows.ps1
```

Wait for build to complete (~1-2 minutes). Files will be in `dist/` folder.

### 2. Create GitHub Release

**Using GitHub CLI:**

```powershell
gh release create v1.2.13 `
  --title "Aetherium Desktop v1.2.13" `
  --notes "## What's New`n- App now checks for updates every 2 hours automatically`n- Fixed 'Restart Now' button not working - now properly closes app and runs installer`n`n## Installation`nDownload and run Aetherium-Setup.exe below.`n`n## Auto-Update`nExisting v1.2.12 installations will auto-update on next launch (or within 2 hours)." `
  dist\Aetherium-Setup.exe `
  dist\latest.yml
```

**OR using GitHub website:**

1. Go to: https://github.com/TheEtherWolf/aetherium-desktop/releases/new
2. Tag: `v1.2.13`
3. Title: `Aetherium Desktop v1.2.13`
4. Description:

```
## What's New
- App now checks for updates every 2 hours automatically
- Fixed "Restart Now" button not working - now properly closes app and runs installer

## Installation
Download and run Aetherium-Setup.exe below.

## Auto-Update
Existing v1.2.12 installations will auto-update on next launch (or within 2 hours).
```

5. Upload both files from `dist/`:
   - `Aetherium-Setup.exe`
   - `latest.yml`
6. Click "Publish release"

## Testing the Update

1. Keep v1.2.12 installed (or reinstall from previous release)
2. Wait up to 2 hours OR restart the app to trigger immediate check
3. Update notification should appear
4. Click "Download Update" → wait for download
5. Click "Restart Now" → app should close and installer should run
6. Installer runs → app reopens with v1.2.13

## What Was Fixed

### Periodic Update Checks

**Before:** App only checked for updates on launch - users could go days/weeks without knowing about updates

**After:** App checks every 2 hours, even while running

### Restart Now Button

**Before:** Clicking "Restart Now" did nothing - app stayed open, installer never ran

**After:**

- Closes all windows (main, overlay, update notification)
- Calls `quitAndInstall()` to run the installer
- Force quits after 1 second if quitAndInstall doesn't work
- User sees installer run and app reopens with new version

---

**Already Done:**
✅ Version bumped to 1.2.13 in package.json  
✅ Changes committed and pushed to GitHub  
✅ Supabase version updated

**You Need to Do:**
☐ Build the app in PowerShell  
☐ Create GitHub release v1.2.13  
☐ Upload files and publish
