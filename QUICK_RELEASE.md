# Quick Release Instructions for v1.2.12

## What You Need to Do

### 1. Build the App (Windows PowerShell)
```powershell
# Open Windows PowerShell (NOT WSL!)
cd C:\Users\WolfDrago12\Desktop\Aetherium\aetherium-desktop
.\build-windows.ps1
```

Wait for the build to complete (1-2 minutes). It will open the `dist` folder when done.

### 2. Create GitHub Release

Option A - Using GitHub CLI (easiest):
```powershell
gh release create v1.2.12 `
  --title "Aetherium Desktop v1.2.12" `
  --notes "## What's New`n- Fixed overlay positioning (now appears top-left)`n- Fixed overlay appearing behind main window`n- Overlay now stays above app with screen-saver z-index level`n`n## Installation`nDownload and run Aetherium-Setup.exe below.`n`n## Auto-Update`nExisting installations will auto-update on next launch." `
  dist\Aetherium-Setup.exe `
  dist\latest.yml
```

Option B - Using GitHub Website:
1. Go to https://github.com/TheEtherWolf/aetherium-desktop/releases/new
2. Tag: `v1.2.12`
3. Title: `Aetherium Desktop v1.2.12`
4. Description:
   ```
   ## What's New
   - Fixed overlay positioning (now appears top-left)
   - Fixed overlay appearing behind main window
   - Overlay now stays above app with screen-saver z-index level

   ## Installation
   Download and run Aetherium-Setup.exe below.

   ## Auto-Update
   Existing installations will auto-update on next launch.
   ```
5. Upload both files from `dist` folder:
   - `Aetherium-Setup.exe`
   - `latest.yml`
6. Click "Publish release"

### 3. Test Auto-Update
1. Install the previous version (v1.2.11 or older)
2. Launch the app
3. You should see an update notification
4. Click "Download Update" → restart → app updates to v1.2.12

---

## What's Already Done
✅ Version bumped to 1.2.12 in package.json  
✅ Changes committed and pushed to GitHub  
✅ Desktop app code is ready (overlay fixes)  
✅ Supabase version updated  

## What You Need to Do
☐ Build the app using PowerShell script  
☐ Create GitHub release v1.2.12  
☐ Upload Aetherium-Setup.exe and latest.yml  
☐ Publish the release  

That's it! The app will auto-update for all existing users.
