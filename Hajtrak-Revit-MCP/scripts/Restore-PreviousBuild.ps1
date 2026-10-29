[CmdletBinding()]
param([Parameter(Mandatory)][string]$BackupPath,[switch]$Apply)
$ErrorActionPreference = 'Stop'
$state = Get-Content -LiteralPath (Join-Path $BackupPath 'restore.json') -Raw | ConvertFrom-Json
if (-not $state.installedConfigHash -or -not $state.installedManifestHash) { throw 'Backup has no post-install hashes; inspect before restoring.' }
if ((Get-FileHash -LiteralPath $state.codexConfig).Hash -ne $state.installedConfigHash) { throw 'Codex configuration changed after install. Merge the old Revit entry deliberately; do not overwrite newer settings.' }
if ((Get-FileHash -LiteralPath $state.activeManifest).Hash -ne $state.installedManifestHash) { throw 'Active add-in manifest changed after install; inspect before restoring.' }
Write-Output 'Prepared restoration of the previous Revit manifest and Codex configuration. Installed files and backups will be preserved.'
if (-not $Apply) { Write-Output 'Preview only.'; return }
if (Get-Process -Name Revit -ErrorAction SilentlyContinue) { throw 'Close Revit before restoring.' }
if ($state.runtimeBackup) {
    Get-ChildItem -LiteralPath $state.runtimeBackup -File | Where-Object { $_.Extension -ne '.addin' } |
        ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path (Split-Path -Parent $state.activeManifest) $_.Name) -Force }
}
Copy-Item -LiteralPath (Join-Path $BackupPath 'RevitMCPAddin.addin') -Destination $state.activeManifest -Force
Copy-Item -LiteralPath (Join-Path $BackupPath 'config.toml') -Destination $state.codexConfig -Force
if (Test-Path -LiteralPath (Join-Path $BackupPath 'load-setting.json')) {
    Add-Type -Path 'C:\Program Files\Autodesk\Revit 2026\RevitAddInUtility.dll'
    $loadState = Get-Content -LiteralPath (Join-Path $BackupPath 'load-setting.json') -Raw | ConvertFrom-Json
    $settings = [Autodesk.RevitAddInsManager.AddInsManagerSettings]::Get()
    $item = $settings.GetAddInItemSettings([guid]$loadState.guid)
    if ($item) { $item.Disabled = [bool]$loadState.previousDisabled; $settings.Save() }
}
Write-Output 'Previous integration restored. Restart Revit and the MCP connection.'
