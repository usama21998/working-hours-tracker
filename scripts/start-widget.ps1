# Starts the tracker server in the background (if it isn't running) and opens the small
# "sticky note" window at http://127.0.0.1:21999/widget. Run at login by the Startup shortcut
# that scripts/install-widget-startup.ps1 creates. Server output goes to data\server.log.

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$port = 21999
$url = "http://127.0.0.1:$port"
$width = 400
$height = 720

Set-Location $root
New-Item -ItemType Directory -Force (Join-Path $root 'data') | Out-Null

function Test-TrackerUp {
  try { (Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200 } catch { $false }
}

# 1. Server: start it hidden unless something is already listening on the port.
if (-not (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)) {
  if (-not (Test-Path (Join-Path $root '.next\BUILD_ID'))) {
    & npm.cmd run build *> (Join-Path $root 'data\widget-build.log')
  }
  Start-Process cmd.exe -ArgumentList '/c', 'npm start > data\server.log 2>&1' -WorkingDirectory $root -WindowStyle Hidden
}

$deadline = (Get-Date).AddSeconds(90)
while (-not (Test-TrackerUp) -and (Get-Date) -lt $deadline) { Start-Sleep -Seconds 1 }

# 2. Window: a borderless Edge app window in your normal Edge profile. (A separate profile gets
#    signed in to the work account by policy and opens extension welcome tabs, so it isn't used.)
$edge = @(
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $edge) { throw 'Microsoft Edge not found' }

# Top-right corner of the main screen.
Add-Type -AssemblyName System.Windows.Forms
$area = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$h = [Math]::Min($height, $area.Height - 32)
$x = $area.Right - $width - 16
$y = $area.Top + 16

Start-Process $edge -ArgumentList @(
  "--app=$url/widget",
  "--window-size=$width,$h",
  "--window-position=$x,$y"
)
