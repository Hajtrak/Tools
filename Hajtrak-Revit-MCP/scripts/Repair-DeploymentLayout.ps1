[CmdletBinding()]
param([Parameter(Mandatory)][string]$InstalledPackagePath,[switch]$Apply)
$ErrorActionPreference = 'Stop'
$installed = [IO.Path]::GetFullPath($InstalledPackagePath)
$source = Join-Path $installed 'Addin\Runtime'
$target = Join-Path $env:APPDATA 'Autodesk\Revit\Addins\2026'
$manifestPath = Join-Path $target 'RevitMCPAddin.addin'
$backup = Join-Path $installed ('deployment-repair-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
$files = @('RevitMCPAddin.dll','RevitMCP.Core.dll','RevitMCPAddin.deps.json','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Wpf.dll')
foreach ($name in $files) {
    if (-not [IO.File]::Exists((Join-Path $source $name))) { throw ('Required runtime file missing: ' + $name) }
}
[xml]$manifest = Get-Content -LiteralPath $manifestPath -Raw
$manifest.RevitAddIns.AddIn.Assembly = Join-Path $target 'RevitMCPAddin.dll'
if (-not $Apply) { Write-Output 'Preview: co-locate custom DLLs in the existing Revit add-in folder; preserve current files and manifest.'; return }
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $manifestPath -Destination $backup
foreach ($name in $files) {
    $destination = Join-Path $target $name
    if (Test-Path -LiteralPath $destination) { Copy-Item -LiteralPath $destination -Destination $backup }
    Copy-Item -LiteralPath (Join-Path $source $name) -Destination $destination -Force
    if ((Get-FileHash -LiteralPath $destination).Hash -ne (Get-FileHash -LiteralPath (Join-Path $source $name)).Hash) { throw ('Hash verification failed: ' + $name) }
}
$loader = Join-Path $source 'runtimes\win-x64\native\WebView2Loader.dll'
if (Test-Path -LiteralPath (Join-Path $target 'WebView2Loader.dll')) { Copy-Item -LiteralPath (Join-Path $target 'WebView2Loader.dll') -Destination $backup }
Copy-Item -LiteralPath $loader -Destination (Join-Path $target 'WebView2Loader.dll') -Force
$manifest.Save($manifestPath)
[pscustomobject]@{AssemblyPath=$manifest.RevitAddIns.AddIn.Assembly;AssemblyExists=[IO.File]::Exists($manifest.RevitAddIns.AddIn.Assembly);Version=[Reflection.AssemblyName]::GetAssemblyName((Join-Path $target 'RevitMCPAddin.dll')).Version.ToString();Backup=$backup}
