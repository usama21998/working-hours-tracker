# Adds (or with -Uninstall removes) a shortcut in your Windows Startup folder that runs
# scripts/start-widget.ps1 at login, so the tracker window opens every time you sign in.
param([switch]$Uninstall)

$shortcut = Join-Path ([Environment]::GetFolderPath('Startup')) 'Hours Tracker Widget.lnk'

if ($Uninstall) {
  if (Test-Path $shortcut) { Remove-Item $shortcut; "Removed $shortcut" } else { 'Not installed.' }
  return
}

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($shortcut)
$lnk.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
$lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$(Join-Path $PSScriptRoot 'start-widget.ps1')`""
$lnk.WorkingDirectory = Split-Path $PSScriptRoot -Parent
$lnk.WindowStyle = 7 # minimized, so no console flashes up
$lnk.Description = 'Hours Tracker desktop window'
$lnk.Save()
"Installed $shortcut"
