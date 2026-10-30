param (
    [string]$Target = "aarch64-pc-windows-msvc"
)

# Determine target architecture
$isArm64Target = $Target -like "*aarch64*"

# Strip Scoop shims from PATH so BusyBox link.exe does not shadow MSVC link.exe
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Ensure Rust cargo bin is in PATH
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
}

# Always enter DevShell in amd64 mode (host arch).
$devShell = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (Test-Path $devShell) {
    Import-Module $devShell
    Enter-VsDevShell -VsInstallPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" -Arch amd64 -SkipAutomaticLocation
}

# After DevShell activation, strip Scoop shims again
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Find latest MSVC toolset version
$msvcBase = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
$msvcVersion = Get-ChildItem -Path $msvcBase -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name

if ($msvcVersion -and $isArm64Target) {
    $arm64LinkerDir = Join-Path $msvcBase "$msvcVersion\bin\Hostx64\arm64"
    if (Test-Path $arm64LinkerDir) {
        $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = Join-Path $arm64LinkerDir "link.exe"
    }

    $msvcArm64Lib = Join-Path $msvcBase "$msvcVersion\lib\arm64"
    $winsdk = "C:\Program Files (x86)\Windows Kits\10\lib"
    $sdkVer = Get-ChildItem -Path $winsdk -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d' } | Sort-Object Name -Descending |
        Select-Object -First 1 -ExpandProperty Name

    $arm64LibPaths = @($msvcArm64Lib)
    if ($sdkVer) {
        $arm64LibPaths += "$winsdk\$sdkVer\um\arm64"
        $arm64LibPaths += "$winsdk\$sdkVer\ucrt\arm64"
    }

    $validArm64Libs = $arm64LibPaths | Where-Object { Test-Path $_ }
    if ($validArm64Libs) {
        $env:LIB = ($env:LIB + ";" + ($validArm64Libs -join ";")).TrimStart(';')
    }
}

# Ensure clang is in PATH — required by the 'ring' crate for ARM64 Windows builds.
$clangSearchPaths = @(
    "C:\Program Files\LLVM\bin",
    "C:\Program Files (x86)\LLVM\bin",
    "$env:USERPROFILE\scoop\apps\llvm\current\bin",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\Llvm\x64\bin",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\Llvm\ARM64\bin"
)

foreach ($clangDir in $clangSearchPaths) {
    if (Test-Path (Join-Path $clangDir "clang.exe")) {
        $env:PATH = "$clangDir;$env:PATH"
        break
    }
}

Write-Host "Starting Tauri dev server for target $Target..."
npm run tauri:dev
