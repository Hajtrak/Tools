[CmdletBinding()]
param(
    [ValidateSet('menu','status','install','test','repair','rollback','uninstall')]
    [string]$Action = 'menu',
    [string]$PackagePath = ''
)
$ErrorActionPreference = 'Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
if (!$node) { throw 'Node.js 22 or newer is required. Install Node.js, then open setup again.' }
$runner = Join-Path $PSScriptRoot 'scripts\setup-cli.mjs'
if ($Action -ne 'menu') {
    & $node.Source $runner $Action $PackagePath
    exit $LASTEXITCODE
}
while ($true) {
    Write-Host ''
    Write-Host 'Hajtrak Revit MCP Setup' -ForegroundColor Cyan
    Write-Host 'Revit 2026 / Codex'
    Write-Host '1  Status'
    Write-Host '2  Install or update'
    Write-Host '3  Test connection (keep Revit open)'
    Write-Host '4  Repair'
    Write-Host '5  Roll back the last setup operation'
    Write-Host '6  Uninstall'
    Write-Host '0  Exit'
    $choice = Read-Host 'Choose an option'
    if ($choice -eq '0') { break }
    $actions = @{ '1'='status'; '2'='install'; '3'='test'; '4'='repair'; '5'='rollback'; '6'='uninstall' }
    if (!$actions.ContainsKey($choice)) { Write-Host 'Choose a number from 0 to 6.'; continue }
    $selected = $actions[$choice]
    if ($selected -in @('install','repair','rollback','uninstall')) {
        Write-Host 'Save your models and close Revit before continuing.'
        if ($selected -eq 'uninstall') {
            Write-Host 'Removes the registered add-in and its Codex entry. Recovery packages and user settings are retained.'
        }
        if ((Read-Host "Continue with $selected? Type Y") -ne 'Y') { continue }
    }
    & $node.Source $runner $selected $PackagePath
    if ($LASTEXITCODE -ne 0) { Write-Host 'The operation needs attention. Review the message above.' -ForegroundColor Yellow }
    [void](Read-Host 'Press Enter to return to setup')
}
