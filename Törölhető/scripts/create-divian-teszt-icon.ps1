# Divian Teszt (Számlázz sandbox) — asztali parancsikon
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot "divian-teszt.ico"
$launcherBat = Join-Path $projectRoot "inditas-teszt.bat"
$shortcutLabel = "Divian Teszt (Szamlazz)"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) ($shortcutLabel + ".lnk")
$projectShortcut = Join-Path $projectRoot ($shortcutLabel + ".lnk")

if (-not (Test-Path -LiteralPath $launcherBat)) {
    Write-Error "Nem talalhato: $launcherBat"
}

$mainIcon = Join-Path $projectRoot "divian-inditas.ico"
if (-not (Test-Path -LiteralPath $iconPath) -and (Test-Path -LiteralPath $mainIcon)) {
    Copy-Item -LiteralPath $mainIcon -Destination $iconPath -Force
}

if (-not (Test-Path -LiteralPath $iconPath)) {
    & (Join-Path $PSScriptRoot "create-divian-launcher-icon.ps1") | Out-Null
    if (Test-Path -LiteralPath $mainIcon) {
        Copy-Item -LiteralPath $mainIcon -Destination $iconPath -Force
    }
}

function New-DivianTesztShortcut {
    param(
        [string]$LinkPath,
        [string]$TargetPath,
        [string]$WorkingDirectory,
        [string]$IconLocation
    )

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($LinkPath)
    $shortcut.TargetPath = $TargetPath
    $shortcut.Arguments = ""
    $shortcut.WorkingDirectory = $WorkingDirectory
    $shortcut.WindowStyle = 1
    $shortcut.Description = "Divian teszt: sajat Szamlazz tesztfiók + tervezo + arajanlat"
    if (Test-Path -LiteralPath $IconLocation) {
        $shortcut.IconLocation = "$IconLocation,0"
    }
    $shortcut.Save()
}

Write-Host ""
Write-Host " Divian TESZT parancsikon keszitese..."
Write-Host " Mappa: $projectRoot"
Write-Host ""

New-DivianTesztShortcut -LinkPath $desktopShortcut -TargetPath $launcherBat -WorkingDirectory $projectRoot -IconLocation $iconPath
Write-Host " Asztal: $desktopShortcut"

New-DivianTesztShortcut -LinkPath $projectShortcut -TargetPath $launcherBat -WorkingDirectory $projectRoot -IconLocation $iconPath
Write-Host " Mappa:  $projectShortcut"

Write-Host ""
Write-Host " Kesz. Dupla kattintassal: Cyncly tervezo + arajanlat (localhost:17321)."
Write-Host ""
