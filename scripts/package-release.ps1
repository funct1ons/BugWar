$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot)
npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
$target = Join-Path (Get-Location) 'release\BugWar-VerdantCrown'
if (Test-Path $target) { Remove-Item $target -Recurse -Force }
New-Item -ItemType Directory -Force $target | Out-Null
Copy-Item dist $target -Recurse -Force
Copy-Item Start-Game.ps1,Start-Game.cmd,README.md,ASSET-LICENSES.md $target -Force
New-Item -ItemType Directory -Force (Join-Path $target 'docs') | Out-Null
Copy-Item docs\*.md (Join-Path $target 'docs') -Force
Copy-Item docs\verification,docs\screenshots (Join-Path $target 'docs') -Recurse -Force
# Third-party research screenshots are intentionally not distributed in the game package.
if (Test-Path (Join-Path $target 'docs\reference')) { Remove-Item (Join-Path $target 'docs\reference') -Recurse -Force }
Compress-Archive -Path "$target\*" -DestinationPath 'release\BugWar-VerdantCrown-Windows.zip' -Force
Write-Host 'Offline package: release\BugWar-VerdantCrown-Windows.zip' -ForegroundColor Green
