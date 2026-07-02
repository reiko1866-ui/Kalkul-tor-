# Divian Arajanlat - asztali parancsikon + egyedi ikon
$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $projectRoot "divian-inditas.ico"
$launcherBat = Join-Path $projectRoot "start-playwright-forwarder.bat"
$shortcutLabel = "Divian Arajanlat"
$desktopShortcut = Join-Path ([Environment]::GetFolderPath("Desktop")) ($shortcutLabel + ".lnk")
$projectShortcut = Join-Path $projectRoot ($shortcutLabel + ".lnk")

if (-not (Test-Path -LiteralPath $launcherBat)) {
    Write-Error "Nem talalhato: $launcherBat"
}

Add-Type -AssemblyName System.Drawing

function New-DivianIcon {
    param([string]$OutPath)

    $size = 256
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear([System.Drawing.Color]::Transparent)

    $green = [System.Drawing.Color]::FromArgb(255, 156, 158, 0)
    $burgundy = [System.Drawing.Color]::FromArgb(255, 128, 0, 64)
    $white = [System.Drawing.Color]::White
    $mustard = [System.Drawing.Color]::FromArgb(255, 243, 191, 53)

    $rect = New-Object System.Drawing.Rectangle 18, 18, 220, 220
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $radius = 44
    $path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
    $path.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
    $path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()

    $g.FillPath((New-Object System.Drawing.SolidBrush $green), $path)
    $g.DrawPath((New-Object System.Drawing.Pen $burgundy, 6), $path)

    $font = New-Object System.Drawing.Font("Segoe UI", 118, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF 0, 8, $size, $size
    $g.DrawString("D", $font, (New-Object System.Drawing.SolidBrush $white), $textRect, $format)

    $accentRect = New-Object System.Drawing.RectangleF 176, 176, 52, 14
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $mustard), $accentRect)

    $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
    $stream = [System.IO.File]::Create($OutPath)
    try {
        $icon.Save($stream)
    } finally {
        $stream.Close()
        $icon.Dispose()
        $font.Dispose()
        $path.Dispose()
        $g.Dispose()
        $bmp.Dispose()
    }
}

function New-DivianShortcut {
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
    $shortcut.Description = "Divian Arajanlat - Cyncly tervezo + helyi szerver (17321)"
    $shortcut.IconLocation = "$IconLocation,0"
    $shortcut.Save()
}

Write-Host ""
Write-Host " Divian parancsikon keszitese..."
Write-Host " Mappa: $projectRoot"
Write-Host ""

New-DivianIcon -OutPath $iconPath
Write-Host " Ikon: $iconPath"

New-DivianShortcut -LinkPath $desktopShortcut -TargetPath $launcherBat -WorkingDirectory $projectRoot -IconLocation $iconPath
Write-Host " Asztal: $desktopShortcut"

New-DivianShortcut -LinkPath $projectShortcut -TargetPath $launcherBat -WorkingDirectory $projectRoot -IconLocation $iconPath
Write-Host " Mappa:  $projectShortcut"

Write-Host ""
Write-Host " Kesz. Dupla kattintassal indul a Divian (forwarder + bongeszo)."
Write-Host ""
