param (
    [string]$Target = "",
    [string]$TestFilter = ""
)

# Strip Scoop shims from PATH so BusyBox link.exe does not shadow MSVC link.exe
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Ensure Rust cargo bin is in PATH
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) {
    $env:PATH = "$cargoBin;$env:PATH"
}

# Enter DevShell in amd64 mode
$devShell = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll"
if (Test-Path $devShell) {
    Import-Module $devShell
    Enter-VsDevShell -VsInstallPath "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools" -Arch amd64 -SkipAutomaticLocation
}

# After DevShell activation, strip Scoop shims again
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Ensure clang is in PATH
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

Write-Host "Running Rust tests..."
$cmdArgs = @("--manifest-path", "src-tauri/Cargo.toml")
if ($Target) {
    $cmdArgs += @("--target", $Target)
}
if ($TestFilter) {
    $cmdArgs += $TestFilter
}

cargo test @cmdArgs
