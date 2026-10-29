[CmdletBinding()]
param(
    [string]$PackagePath = '',
    [switch]$Apply,
    [string]$CodexConfig = (Join-Path $env:USERPROFILE '.codex\config.toml')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $PackagePath) { $PackagePath = Join-Path $root 'release\custom-0.9.0' }
$PackagePath = [IO.Path]::GetFullPath($PackagePath)
$manifestPath = Join-Path $PackagePath 'package-manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
if ($manifest.version -ne '0.9.0' -or $manifest.toolCount -ne 98) { throw 'Unexpected package identity.' }
foreach ($file in $manifest.files) {
    $path = [IO.Path]::GetFullPath((Join-Path $PackagePath $file.path))
    if (-not $path.StartsWith($PackagePath + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Package path escapes its root.' }
    if ((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash -ne $file.sha256) { throw ('Package hash mismatch: ' + $file.path) }
}
$addinFolder = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2026'
$activeManifest = Join-Path $addinFolder 'RevitMCPAddin.addin'
if (-not (Test-Path -LiteralPath $activeManifest)) { throw 'Expected existing Revit MCP manifest not found. Inspect installation before proceeding.' }
$configText = Get-Content -LiteralPath $CodexConfig -Raw
$sectionPattern = '(?ms)^\[mcp_servers\.revit-2026\][^\r\n]*\r?\n(?<body>.*?)(?=^\[|\z)'
$sections = [regex]::Matches($configText,$sectionPattern)
if ($sections.Count -ne 1) { throw 'Expected exactly one existing revit-2026 MCP table.' }
$otherRevit = [regex]::Matches($configText, '(?m)^\[mcp_servers\.([^\].]+)\]\s*$') |
    Where-Object { $_.Groups[1].Value -match '(?i)revit' -and $_.Groups[1].Value -ne 'revit-2026' }
if ($otherRevit.Count -gt 0) { throw 'Other Revit MCP registrations found. Reconcile before single-integration cutover.' }
$section = $sections[0]
if ([regex]::Matches($section.Groups['body'].Value,'(?m)^args\s*=').Count -ne 1) { throw 'Expected exactly one args line.' }
$installRoot = Join-Path $env:LOCALAPPDATA 'RevitMCP.Custom'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $installRoot ('0.9.0-' + $stamp)
$backup = Join-Path $installRoot ('backups\' + $stamp)
$bridgePath = (Join-Path $destination 'McpServer\dist\index.js').Replace('\','/')
$argsLine = 'args = [' + (ConvertTo-Json -InputObject $bridgePath -Compress) + ']'
$newSection = [regex]::Replace($section.Value, '(?m)^args\s*=.*$', [System.Text.RegularExpressions.MatchEvaluator]{ param($match) $argsLine })
$newConfig = $configText.Substring(0,$section.Index) + $newSection + $configText.Substring($section.Index + $section.Length)
[xml]$newManifest = Get-Content -LiteralPath $activeManifest -Raw
$newManifest.RevitAddIns.AddIn.Assembly = Join-Path $addinFolder 'RevitMCPAddin.dll'
$newManifest.RevitAddIns.AddIn.Name = 'Hajtrak Revit MCP'
$newManifest.RevitAddIns.AddIn.VendorId = 'Hajtrak'
$newManifest.RevitAddIns.AddIn.VendorDescription = 'Hajtrak - Revit model review and modelling integration'
Write-Output 'Prepared replacement of the existing revit-2026 entry and add-in manifest; original binaries remain untouched.'
Write-Output ('Package: ' + $PackagePath)
Write-Output ('Backup: ' + $backup)
if (-not $Apply) { Write-Output 'Preview only. No installation/configuration changes made.'; return }
if (Get-Process -Name Revit -ErrorAction SilentlyContinue) { throw 'Close Revit before applying this replacement.' }
if (Test-Path -LiteralPath $destination) { throw 'Installation destination exists; refusing to overwrite it.' }
New-Item -ItemType Directory -Path $backup -Force | Out-Null
Copy-Item -LiteralPath $activeManifest -Destination (Join-Path $backup 'RevitMCPAddin.addin')
Copy-Item -LiteralPath $CodexConfig -Destination (Join-Path $backup 'config.toml')
$runtimeBackup = Join-Path $backup 'runtime'
New-Item -ItemType Directory -Path $runtimeBackup | Out-Null
$runtimeFiles = @('RevitMCPAddin.dll','RevitMCP.Core.dll','RevitMCPAddin.deps.json','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Wpf.dll','WebView2Loader.dll')
foreach ($name in $runtimeFiles) {
    $existing = Join-Path $addinFolder $name
    if (Test-Path -LiteralPath $existing) { Copy-Item -LiteralPath $existing -Destination $runtimeBackup }
}
@{ codexConfig=$CodexConfig; activeManifest=$activeManifest; installedPackage=$destination; packageVersion='0.9.0' } |
    ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'restore.json') -Encoding utf8
try {
    Copy-Item -LiteralPath $PackagePath -Destination $destination -Recurse
    foreach ($name in $runtimeFiles) {
        $relative = if ($name -eq 'WebView2Loader.dll') { 'runtimes\win-x64\native\WebView2Loader.dll' } else { $name }
        $sourceFile = Join-Path $destination ('Addin\Runtime\' + $relative)
        $targetFile = Join-Path $addinFolder $name
        Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
        if ((Get-FileHash -LiteralPath $sourceFile).Hash -ne (Get-FileHash -LiteralPath $targetFile).Hash) { throw ('Installed runtime verification failed: ' + $name) }
    }
    $newManifest.Save($activeManifest)
    [IO.File]::WriteAllText($CodexConfig,$newConfig,[Text.UTF8Encoding]::new($false))
    @{ codexConfig=$CodexConfig; activeManifest=$activeManifest; installedPackage=$destination; packageVersion='0.9.0';
        runtimeBackup=$runtimeBackup; installedConfigHash=(Get-FileHash -LiteralPath $CodexConfig).Hash; installedManifestHash=(Get-FileHash -LiteralPath $activeManifest).Hash } |
        ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backup 'restore.json') -Encoding utf8
} catch {
    Get-ChildItem -LiteralPath $runtimeBackup -File | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $addinFolder $_.Name) -Force }
    Copy-Item -LiteralPath (Join-Path $backup 'RevitMCPAddin.addin') -Destination $activeManifest -Force
    Copy-Item -LiteralPath (Join-Path $backup 'config.toml') -Destination $CodexConfig -Force
    throw
}
Write-Output 'Installed development build. Restart Revit and refresh/restart the Codex MCP connection. Live acceptance tests remain pending.'
