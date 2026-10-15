# Publish dsh-transparent-ui using the same package identity as GitHub.
# Staging preserves the manifest and ships the pre-built lib/ bundle.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1          # publish
#   powershell -ExecutionPolicy Bypass -File .\publish.ps1 -DryRun  # inspect only

param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$stage = Join-Path $root '.npm-stage'

# ---------- 1. stage ----------
if (Test-Path $stage) { Remove-Item $stage -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stage | Out-Null

Copy-Item (Join-Path $root 'lib') -Destination $stage -Recurse
Copy-Item (Join-Path $root 'cordis.patch.yml') -Destination $stage
Copy-Item (Join-Path $root 'icon.svg') -Destination $stage
foreach ($name in 'README.md', 'README.zh.md', 'LICENSE') {
    $src = Join-Path $root $name
    if (Test-Path $src) { Copy-Item $src -Destination $stage }
}

# ---------- 2. manifest ----------
$json = Get-Content (Join-Path $root 'package.json') -Raw
# package.json is authoritative for npm and GitHub; do not rewrite its identity.
if (($json | ConvertFrom-Json).name -ne 'dsh-transparent-ui') {
    throw 'Expected package name dsh-transparent-ui'
}
[System.IO.File]::WriteAllText((Join-Path $stage 'package.json'), $json, [System.Text.UTF8Encoding]::new($false))

$name = ([regex]::Match($json, '"name":\s*"([^"]+)"')).Groups[1].Value
$version = ([regex]::Match($json, '"version":\s*"([^"]+)"')).Groups[1].Value
Write-Host "staged: $stage"
Write-Host "name: $name @ $version"

# ---------- 3. publish ----------
if ($DryRun) {
    Push-Location $stage
    try { npm publish --dry-run } finally { Pop-Location }
    return
}
Push-Location $stage
try {
    npm publish
    if ($LASTEXITCODE -ne 0) { throw 'npm publish failed' }
} finally {
    Pop-Location
}
Write-Host ''
Write-Host 'Done. Install anywhere with:' -ForegroundColor Green
Write-Host "  dsh plugin --profile desktop add dsh-transparent-ui" -ForegroundColor Cyan
