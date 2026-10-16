# =============================================================================
# shots.ps1 - headless render of preset views for visual verification
# Usage:  .\shots.ps1                 render all views
#         .\shots.ps1 overview night  render selected views only
# =============================================================================
param([string[]]$Views = @())

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) { $chrome = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" }

$index = Join-Path $root "index.html"
$shotDir = Join-Path $root "shots"
New-Item -ItemType Directory -Force -Path $shotDir | Out-Null
$profile = Join-Path $env:TEMP "wanda-shot-profile"

# name -> preset|width|height|hour(optional)
$all = [ordered]@{
  "overview" = "overview|1600|900"
  "entrance" = "entrance|1600|900"
  "aerial"   = "aerial|1600|900"
  "street"   = "street|1600|900"
  "night"    = "night|1600|900"
  "atrium"   = "atrium|1600|900"
  "day-noon" = "overview|1600|900|11.0"
  "dusk"     = "overview|1600|900|18.4"
}

$targets = if ($Views.Count -gt 0) { $Views } else { $all.Keys }

foreach ($v in $targets) {
  $spec = $all[$v]
  if (-not $spec) { Write-Host "skip unknown view: $v"; continue }
  $parts = $spec.Split("|")
  $preset = $parts[0]; $w = $parts[1]; $h = $parts[2]
  $hourQ = if ($parts.Count -gt 3) { "&hour=" + $parts[3] } else { "" }
  $out = Join-Path $shotDir "$v.png"
  if (Test-Path $out) { Remove-Item $out -Force }

  $url = "file:///" + ($index -replace '\\', '/') + "?shot=$preset$hourQ"
  $cargs = @(
    "--headless=new", "--disable-gpu", "--no-sandbox", "--mute-audio",
    "--enable-unsafe-swiftshader", "--use-angle=swiftshader",
    "--user-data-dir=$profile",
    "--no-first-run", "--no-default-browser-check",
    "--allow-file-access-from-files", "--hide-scrollbars",
    "--window-size=$w,$h",
    "--virtual-time-budget=1200",
    "--screenshot=$out",
    $url
  )
  Write-Host ("render {0} ..." -f $v) -NoNewline
  $sw = [Diagnostics.Stopwatch]::StartNew()
  $p = Start-Process -FilePath $chrome -ArgumentList $cargs -Wait -PassThru -NoNewWindow
  $sw.Stop()
  if (Test-Path $out) {
    $kb = [math]::Round((Get-Item $out).Length / 1KB, 1)
    Write-Host (" OK {0}KB {1}s" -f $kb, [math]::Round($sw.Elapsed.TotalSeconds, 1))
  } else {
    Write-Host (" FAILED exit={0}" -f $p.ExitCode)
  }
}
Write-Host ""
Write-Host ("output dir: {0}" -f $shotDir)
