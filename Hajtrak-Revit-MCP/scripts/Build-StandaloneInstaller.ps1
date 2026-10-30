<# Builds an offline, per-user Windows x64 installer. No deployment to this machine. #>
param(
    [string]$DotNetPath = 'dotnet',
    [Parameter(Mandatory)][string]$NodeRuntimeDirectory,
    [Parameter(Mandatory)][string]$NodeProvenanceFile
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$version = (Get-Content "$root/src/McpServer/package.json" -Raw | ConvertFrom-Json).version
$build = Join-Path $root ('release/standalone-' + $version + '-' + [guid]::NewGuid().ToString('N'))
$payload = Join-Path $build 'payload'
New-Item -ItemType Directory -Path $payload -Force | Out-Null
function Run([scriptblock]$Command) { & $Command; if ($LASTEXITCODE -ne 0) { throw 'Build command failed.' } }
function CopyFile([string]$From, [string]$To) {
    New-Item -ItemType Directory -Path (Split-Path $To -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $From -Destination $To
}
Run { node "$root/scripts/check-version.mjs" }
Run { node --test "$root/installer/engine/install.test.mjs" }
Run { npm run build --prefix "$root/src/McpServer" }
Run { npm test --prefix "$root/src/McpServer" }
Run { node "$root/src/McpServer/scripts/check-tools.mjs" }
Run { & $DotNetPath build "$root/src/RevitAddin/RevitMCPAddin.csproj" -c Release -p:RevitVersion=2026 -p:DeployToRevit=false "-p:PathMap=$root=/_/Hajtrak-Revit-MCP" -p:DebugType=None -p:DebugSymbols=false --disable-build-servers -m:1 -p:UseSharedCompilation=false }
$addin = "$root/src/RevitAddin/bin/Release"
foreach ($name in @('RevitMCPAddin.dll','RevitMCP.Core.dll','RevitMCPAddin.deps.json','Microsoft.Web.WebView2.Core.dll','Microsoft.Web.WebView2.Wpf.dll')) {
    CopyFile "$addin/$name" "$payload/Addin/$name"
}
CopyFile "$addin/runtimes/win-x64/native/WebView2Loader.dll" "$payload/Addin/WebView2Loader.dll"
Get-ChildItem "$root/src/McpServer/dist" -Filter '*.js' -File | ForEach-Object { CopyFile $_.FullName "$payload/McpServer/dist/$($_.Name)" }
foreach ($name in @('package.json','package-lock.json','baseline-tools.json')) { CopyFile "$root/src/McpServer/$name" "$payload/McpServer/$name" }
Run { npm ci --prefix "$payload/McpServer" --omit=dev --ignore-scripts --no-audit --no-fund }
CopyFile "$root/installer/engine/install.mjs" "$payload/installer/engine/install.mjs"
CopyFile "$root/installer/verify-package.mjs" "$payload/McpServer/scripts/verify-package.mjs"
CopyFile "$NodeRuntimeDirectory/node.exe" "$payload/Node/node.exe"
CopyFile "$NodeRuntimeDirectory/LICENSE" "$payload/Node/LICENSE"
CopyFile $NodeProvenanceFile "$payload/Node/provenance.json"
foreach ($name in @('LICENSE','THIRD_PARTY_NOTICES.md')) { CopyFile "$root/$name" "$payload/$name" }
CopyFile "$root/docs/STANDALONE_INSTALLER.md" "$payload/docs/STANDALONE_INSTALLER.md"
$cache = if ($env:NUGET_PACKAGES) { $env:NUGET_PACKAGES } else { Join-Path $env:USERPROFILE '.nuget/packages' }
foreach ($name in @('LICENSE.txt','NOTICE.txt')) { CopyFile "$cache/microsoft.web.webview2/1.0.2903.40/$name" "$payload/Licenses/WebView2/$name" }
# Restore the self-contained runtime first so its notices are available for packaging.
Run { & $DotNetPath restore "$root/installer/Setup/Hajtrak.RevitMCP.Setup.csproj" -r win-x64 }
foreach ($package in @('microsoft.netcore.app.runtime.win-x64','microsoft.windowsdesktop.app.runtime.win-x64')) {
    $runtime = Get-ChildItem "$cache/$package" -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $notices = @(Get-ChildItem $runtime.FullName -File | Where-Object Name -Match '^(LICENSE(?:\.TXT)?|THIRD-PARTY-NOTICES\.TXT)$')
    if (!$notices.Count) { throw "Runtime licence missing: $package" }
    foreach ($file in $notices) { CopyFile $file.FullName "$payload/Licenses/$package/$($file.Name)" }
}
$files = @(Get-ChildItem $payload -File -Recurse | Sort-Object FullName | ForEach-Object {
    @{ path = [IO.Path]::GetRelativePath($payload, $_.FullName).Replace('\','/'); sha256 = (Get-FileHash $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() }
})
# Inspect generated files separately from the Git source scan; never print matched data.
$privateRoots = @($env:USERPROFILE, $env:USERPROFILE.Replace('\','/'))
foreach ($file in Get-ChildItem $payload -File -Recurse) {
    $bytes = [IO.File]::ReadAllBytes($file.FullName)
    foreach ($encoding in @([Text.Encoding]::UTF8, [Text.Encoding]::Unicode)) {
        $text = $encoding.GetString($bytes)
        foreach ($privateRoot in $privateRoots) {
            if ($text.IndexOf($privateRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) { throw 'Private home path detected in generated payload.' }
        }
    }
}
$manifest = @{ product='Hajtrak Revit MCP'; version=$version; revit='2026'; toolCount=98; files=$files } | ConvertTo-Json -Depth 5
[IO.File]::WriteAllText("$payload/payload-manifest.json", $manifest, [Text.UTF8Encoding]::new($false))
Run { & "$payload/Node/node.exe" "$payload/McpServer/scripts/verify-package.mjs" }
Run { node "$root/installer/verify-installation.mjs" $payload }
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = Join-Path $build 'payload.zip'
[IO.Compression.ZipFile]::CreateFromDirectory($payload, $zip)
Run { & $DotNetPath publish "$root/installer/Setup/Hajtrak.RevitMCP.Setup.csproj" -c Release -r win-x64 --self-contained true "-p:PayloadZip=$zip" "-p:PathMap=$root=/_/Hajtrak-Revit-MCP" -p:DebugType=None -o "$build/publish" --disable-build-servers -m:1 -p:UseSharedCompilation=false }
$name = "Hajtrak-Revit-MCP-$version-Revit2026-Windows-x64-Setup.exe"
CopyFile "$build/publish/Hajtrak-Revit-MCP-Setup.exe" "$build/$name"
$hash = (Get-FileHash "$build/$name" -Algorithm SHA256).Hash.ToLowerInvariant()
"$hash  $name" | Set-Content "$build/$name.sha256.txt" -Encoding ascii
Write-Host "Standalone installer: $build/$name"
