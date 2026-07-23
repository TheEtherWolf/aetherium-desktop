; Aetherium — custom NSIS installer chrome.
; electron-builder injects these macros into its NSIS template at the right points.
; Branding sits on top of the header/sidebar bitmaps (resources/installer-header.bmp,
; resources/installer-sidebar.bmp) and the custom installer icon.
;
; NOTE: NSIS is only compiled during `electron-builder --win` on Windows. If a future
; edit here breaks the build, deleting this file (and the `nsis.include` key in
; package.json) restores the stock electron-builder installer.

; Keep the welcome/finish sidebar bitmap crisp instead of stretched, and give the
; welcome/finish pages a styled, on-brand first impression.
!macro customHeader
  !define MUI_WELCOMEFINISHPAGE_BITMAP_NOSTRETCH
  !define MUI_UNWELCOMEFINISHPAGE_BITMAP_NOSTRETCH
  !define MUI_WELCOMEPAGE_TITLE_3LINES
  !define MUI_FINISHPAGE_TITLE_3LINES
!macroend

; Branded welcome page. The stock assisted installer opens straight on the license /
; destination step; this adds a proper on-brand first screen.
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Aetherium"
  !define MUI_WELCOMEPAGE_TEXT "Aetherium is your all-in-one space for chat, voice, and community.$\r$\n$\r$\nThis wizard will install Aetherium on your computer. Click Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend
