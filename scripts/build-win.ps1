param (
    [string]$Target = "aarch64-pc-windows-msvc"
)

# Determine target architecture
$isArm64Target = $Target -like "*aarch64*"
$isArm32Target = $Target -like "*arm-pc*" -or $Target -like "*thumbv7*"

# Strip Scoop shims from PATH so BusyBox link.exe does not shadow MSVC link.exe
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Ensure Rust cargo bin is in PATH
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
}

# Always enter DevShell in amd64 mode (host arch).
# This ensures build scripts (which run on the HOST x64) correctly find x64 MSVC libs.
# For arm64 targets, we set the linker separately via CARGO_TARGET_* env var below.
$devShell = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (Test-Path $devShell) {
    Import-Module $devShell
    Enter-VsDevShell -VsInstallPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" -Arch amd64 -SkipAutomaticLocation
}

# After DevShell activation, strip Scoop shims again (DevShell can re-inherit the parent PATH)
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Find latest MSVC toolset version
$msvcBase = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC"
$msvcVersion = Get-ChildItem -Path $msvcBase -Directory -ErrorAction SilentlyContinue |
    Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name

if (-not $msvcVersion) {
    Write-Error "No MSVC toolset found under $msvcBase"
    exit 1
}

Write-Host "MSVC toolset: $msvcVersion"

if ($isArm64Target) {
    # Cross-compile aarch64 from x64 host:
    #   Linker:  Hostx64\arm64\link.exe  (64-bit ARM cross-linker)
    #   Libs:    lib\arm64\              (MSVC ARM64 runtime libs)
    #            Windows Kits\...\um\arm64 + ucrt\arm64 (SDK libs)
    # Requires component: "MSVC v143 - VS 2022 C++ ARM64 build tools"

    $arm64LinkerDir = Join-Path $msvcBase "$msvcVersion\bin\Hostx64\arm64"
    if (-not (Test-Path $arm64LinkerDir)) {
        Write-Error @"
ARM64 cross-linker not found at: $arm64LinkerDir

The MSVC ARM64 build tools are not installed. Install them via:
  Visual Studio Installer -> Modify -> Individual components ->
  "MSVC v143 - VS 2022 C++ ARM64/ARM64EC build tools (Latest)"

Or from an elevated PowerShell:
  & 'C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe' modify ``
    --installPath 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools' ``
    --add Microsoft.VisualStudio.Component.VC.Tools.ARM64 ``
    --quiet --norestart
"@
        exit 1
    }

    # Tell Rust to use the ARM64 cross-linker for the aarch64 target specifically
    # (host build scripts will still use the x64 linker from DevShell amd64)
    $env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER = Join-Path $arm64LinkerDir "link.exe"
    Write-Host "ARM64 linker: $($env:CARGO_TARGET_AARCH64_PC_WINDOWS_MSVC_LINKER)"

    # Add ARM64 MSVC and SDK libs so the ARM64 linker finds msvcrt.lib, kernel32.lib, etc.
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
        # Append ARM64 libs AFTER x64 libs so host build scripts still resolve x64 libs first
        $env:LIB = ($env:LIB + ";" + ($validArm64Libs -join ";")).TrimStart(';')
        Write-Host "Added ARM64 lib paths:"
        $validArm64Libs | ForEach-Object { Write-Host "  $_" }
    } else {
        Write-Warning "No ARM64 lib paths found - linker may fail to locate msvcrt.lib etc."
    }
}

# Ensure clang is in PATH — required by the 'ring' crate for ARM64 Windows builds.
# Check common install locations in priority order.
$clangSearchPaths = @(
    # LLVM official installer default (64-bit)
    "C:\Program Files\LLVM\bin",
    # LLVM official installer (ARM64 native)
    "C:\Program Files (x86)\LLVM\bin",
    # Scoop (strips shims above but the real binaries are here)
    "$env:USERPROFILE\scoop\apps\llvm\current\bin",
    # VS Build Tools bundled LLVM (requires 'C++ Clang tools for Windows' component)
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\Llvm\x64\bin",
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\Llvm\ARM64\bin"
)

$clangFound = $false
foreach ($clangDir in $clangSearchPaths) {
    if (Test-Path (Join-Path $clangDir "clang.exe")) {
        $env:PATH = "$clangDir;$env:PATH"
        Write-Host "clang: $clangDir\clang.exe"
        $clangFound = $true
        break
    }
}

if (-not $clangFound) {
    # Fall back to whatever is already in PATH
    $clangInPath = Get-Command clang.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
    if ($clangInPath) {
        Write-Host "clang (from PATH): $clangInPath"
        $clangFound = $true
    }
}

if (-not $clangFound) {
    Write-Error @"
clang not found. The 'ring' crate requires clang for ARM64 Windows builds.

Install LLVM via Scoop:
  scoop install llvm

Or download from: https://github.com/llvm/llvm-project/releases/latest
  - Choose the Windows ARM64 or x64 installer and add its bin directory to PATH.

Or install the 'C++ Clang tools for Windows' component from VS Installer.
"@
    exit 1
}

# Verify which link.exe will be used for host (build scripts)
$resolvedLink = Get-Command link.exe -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Source
Write-Host "Host link.exe: $resolvedLink"

Write-Host "Building Tauri app for target: $Target..."
npx tauri build --target $Target
