@echo off
cd /d "%~dp0"
set "TARGET=%~dp0start-label-helper.bat"
set "WDIR=%~dp0"
set "LINK=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Label printer helper.lnk"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:LINK); $s.TargetPath=$env:TARGET; $s.WorkingDirectory=$env:WDIR; $s.WindowStyle=7; $s.Save()"
if exist "%LINK%" (
  echo.
  echo Done. The label helper will now start by itself every time you sign in to Windows.
) else (
  echo.
  echo Could not create the startup shortcut.
)
pause