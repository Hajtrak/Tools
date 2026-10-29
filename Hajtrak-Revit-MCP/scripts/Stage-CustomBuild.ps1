[CmdletBinding()]
param([string]$OutputDirectory = '',[switch]$Offline)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $root 'release\custom-0.9.0' }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
$releaseRoot = [IO.Path]::GetFullPath((Join-Path $root 'release'))
if (-not $OutputDirectory.StartsWith($releaseRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Staging output must be inside this checkout release directory.'
}
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Output exists. Select a new versioned staging directory; no existing files will be removed.' }
$dotnet = Join-Path $root '.tooling\dotnet\dotnet.exe'
if (-not (Test-Path -LiteralPath $dotnet)) { $dotnet = (Get-Command dotnet -ErrorAction Stop).Source }
$env:DOTNET_CLI_HOME = Join-Path $root '.tooling\cli'
$env:NUGET_PACKAGES = Join-Path $root '.tooling\nuget'
$env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
Push-Location $root
try {
    & $dotnet build src/RevitAddin/RevitMCPAddin.csproj -c Release -p:DeployToRevit=false --no-restore --nologo --disable-build-servers -m:1 -p:UseSharedCompilation=false
    if ($LASTEXITCODE -ne 0) { throw 'Release add-in build failed.' }
    Push-Location (Join-Path $root 'src\McpServer')
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw 'Bridge build failed.' }
        & node scripts/check-tools.mjs
        if ($LASTEXITCODE -ne 0) { throw 'MCP compatibility check failed.' }
    } finally { Pop-Location }
    & node scripts/check-version.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Version/inventory check failed.' }
    $addin = Join-Path $OutputDirectory 'Addin'
    $bridge = Join-Path $OutputDirectory 'McpServer'
    New-Item -ItemType Directory -Path $addin,$bridge -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $root 'src\RevitAddin\bin\Release') -Destination (Join-Path $addin 'Runtime') -Recurse
    Copy-Item -LiteralPath (Join-Path $root 'src\RevitAddin\RevitMCPAddin.addin') -Destination $addin
    Copy-Item -LiteralPath (Join-Path $root 'src\McpServer\dist') -Destination $bridge -Recurse
    foreach ($name in @('package.json','package-lock.json','custom-tool-manifest.json','baseline-tools.json')) {
        Copy-Item -LiteralPath (Join-Path $root ('src\McpServer\' + $name)) -Destination $bridge
    }
    Push-Location $bridge
    try {
        $npmArguments = @('ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund')
        if ($Offline) { $npmArguments += '--offline' }
        & npm.cmd @npmArguments
        if ($LASTEXITCODE -ne 0) { throw 'Runtime dependency staging failed. No deployment was attempted.' }
    } finally { Pop-Location }
    Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $OutputDirectory
    Copy-Item -LiteralPath (Join-Path $root 'THIRD_PARTY_NOTICES.md') -Destination $OutputDirectory
    Copy-Item -LiteralPath (Join-Path $root 'docs\CUSTOM_BUILD.md') -Destination $OutputDirectory
    $hashes = Get-ChildItem -LiteralPath $OutputDirectory -Recurse -File | ForEach-Object {
        @{ path=[IO.Path]::GetRelativePath($OutputDirectory,$_.FullName); sha256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash; bytes=$_.Length }
    }
    @{ version='0.9.0'; upstream='v0.8.40'; status='development-awaiting-live-acceptance'; toolCount=98; files=@($hashes) } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'package-manifest.json') -Encoding utf8
    Write-Output ('Staged development build: ' + $OutputDirectory)
} finally { Pop-Location }
