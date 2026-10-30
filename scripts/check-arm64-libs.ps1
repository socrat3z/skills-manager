$msvcBase = 'C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC'
$msvcVer = Get-ChildItem -Path $msvcBase -Directory | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name

Write-Host "=== MSVC version: $msvcVer ==="
Write-Host ""
Write-Host "=== MSVC lib dirs ==="
Get-ChildItem -Path (Join-Path $msvcBase "$msvcVer\lib") -Directory | Select-Object -ExpandProperty Name

Write-Host ""
Write-Host "=== MSVC bin dirs (Hostx64) ==="
Get-ChildItem -Path (Join-Path $msvcBase "$msvcVer\bin\Hostx64") -Directory | Select-Object -ExpandProperty Name

Write-Host ""
Write-Host "=== Windows SDK lib dirs (um) ==="
$winsdk = 'C:\Program Files (x86)\Windows Kits\10\lib'
$sdkVer = Get-ChildItem -Path $winsdk -Directory | Where-Object { $_.Name -match '^\d' } | Sort-Object Name -Descending | Select-Object -First 1 -ExpandProperty Name
Write-Host "SDK version: $sdkVer"
if ($sdkVer) {
    Get-ChildItem -Path (Join-Path $winsdk "$sdkVer\um") -Directory | Select-Object -ExpandProperty Name
    Write-Host ""
    Write-Host "=== Windows SDK lib dirs (ucrt) ==="
    Get-ChildItem -Path (Join-Path $winsdk "$sdkVer\ucrt") -Directory -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name
}
