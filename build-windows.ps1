# Aetherium Desktop - Windows Build Script
# Run this from Windows PowerShell (not WSL!)

Write-Host "Building Aetherium Desktop for Windows..." -ForegroundColor Cyan

# Navigate to desktop app directory
Set-Location "C:\Users\WolfDrago12\Desktop\Aetherium\aetherium-desktop"

# Ensure dependencies are installed
Write-Host "`nInstalling dependencies..." -ForegroundColor Yellow
npm install

# Build Windows executable (electron-builder auto-publishes the GitHub release
# when a gh/GH_TOKEN credential is present and package.json build.publish is set)
Write-Host "`nBuilding Windows installer..." -ForegroundColor Yellow
npm run build:win

# Check if build succeeded
if (Test-Path "dist\Aetherium-Setup.exe") {
    Write-Host "`n[OK] Build successful!" -ForegroundColor Green
    Write-Host "Installer created at: dist\Aetherium-Setup.exe" -ForegroundColor Green
    Write-Host "Auto-update file: dist\latest.yml" -ForegroundColor Green

    # Show file sizes
    $setupSize = (Get-Item "dist\Aetherium-Setup.exe").Length / 1MB
    Write-Host "`nInstaller size: $([math]::Round($setupSize, 2)) MB" -ForegroundColor Cyan

    # Open dist folder
    Write-Host "`nOpening dist folder..." -ForegroundColor Yellow
    Invoke-Item "dist"

    Write-Host "`nNext steps (only if electron-builder did NOT auto-publish):" -ForegroundColor Magenta
    Write-Host "1. Bump the version in package.json above the installed version" -ForegroundColor White
    Write-Host "2. gh release create vX.Y.Z --title 'Aetherium Desktop vX.Y.Z' --notes '...' dist\Aetherium-Setup.exe dist\latest.yml" -ForegroundColor White
    Write-Host "`nSee RELEASE_GUIDE.md for detailed instructions" -ForegroundColor Cyan
} else {
    Write-Host "`n[FAIL] Build failed!" -ForegroundColor Red
    Write-Host "Check the error messages above for details" -ForegroundColor Red
    exit 1
}
