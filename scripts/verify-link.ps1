# Strip scoop shims
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Load DevShell (arm64 target)
Import-Module 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\Microsoft.VisualStudio.DevShell.dll'
Enter-VsDevShell -VsInstallPath 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools' -Arch arm64 -SkipAutomaticLocation

# Strip scoop again (DevShell can re-inherit parent PATH)
$env:PATH = ($env:PATH -split ';' | Where-Object { $_ -notlike '*scoop\shims*' }) -join ';'

# Prepend MSVC cross-linker (Hostx64\arm for arm64 target on x64 host)
$msvcBase = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC'
$msvcVersion = Get-ChildItem -Path $msvcBase -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name
$msvcLinkerDir = Join-Path $msvcBase "$msvcVersion\bin\Hostx64\arm"
Write-Host "MSVC linker dir: $msvcLinkerDir"

if (Test-Path $msvcLinkerDir) {
    $env:PATH = "$msvcLinkerDir;$env:PATH"
    Write-Host "Prepended successfully."
} else {
    Write-Warning "MSVC linker directory not found: $msvcLinkerDir"
}

# Verify all link.exe on PATH
Write-Host "`nAll link.exe found on PATH:"
Get-Command link.exe -All | Select-Object -ExpandProperty Source
