Add-Type -AssemblyName System.Drawing

function New-IconPng {
    param([int]$Size, [string]$Out)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    # 圆角矩形背景
    $rect = New-Object System.Drawing.Rectangle 0, 0, $Size, $Size
    $radius = [int]($Size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc($rect.X, $rect.Y, $radius, $radius, 180, 90)
    $path.AddArc($rect.Right - $radius, $rect.Y, $radius, $radius, 270, 90)
    $path.AddArc($rect.Right - $radius, $rect.Bottom - $radius, $radius, $radius, 0, 90)
    $path.AddArc($rect.X, $rect.Bottom - $radius, $radius, $radius, 90, 90)
    $path.CloseFigure()

    # 渐变
    $rectBrush = New-Object System.Drawing.RectangleF 0, 0, $Size, $Size
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rectBrush, [System.Drawing.Color]::FromArgb(255, 30, 215, 96), [System.Drawing.Color]::FromArgb(255, 15, 168, 71), 90)
    $g.FillPath($brush, $path)

    # 圆环
    $ringWidth = [int]($Size * 0.04)
    $ringSize = [int]($Size * 0.58)
    $ringRect = New-Object System.Drawing.Rectangle ([int](($Size - $ringSize) / 2)), ([int](($Size - $ringSize) / 2)), $ringSize, $ringSize
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::White), $ringWidth
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($pen, $ringRect, -90, 300)

    # 中心数字 0
    $fontSize = [int]($Size * 0.42)
    $font = New-Object System.Drawing.Font "Segoe UI", $fontSize, ([System.Drawing.FontStyle]::Bold)
    $textBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $sf = New-Object System.Drawing.StringFormat
    $sf.Alignment = [System.Drawing.StringAlignment]::Center
    $sf.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF 0, 0, $Size, ($Size * 0.78)
    $g.DrawString("0", $font, $textBrush, $textRect, $sf)

    # 顶部小字 QUIT
    $topFontSize = [int]($Size * 0.07)
    $topFont = New-Object System.Drawing.Font "Segoe UI", $topFontSize, ([System.Drawing.FontStyle]::Bold)
    $topRect = New-Object System.Drawing.RectangleF 0, ($Size * 0.18), $Size, ($Size * 0.1)
    $topBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
    $g.DrawString("QUIT", $topFont, $topBrush, $topRect, $sf)

    $g.Dispose()
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $Out"
}

# 产物直落 assets/icons/（manifest 与 SW 引用的位置；此前落在 scripts/ 需手工挪）
$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "assets/icons"
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir | Out-Null }
New-IconPng -Size 192 -Out (Join-Path $iconsDir "icon-192.png")
New-IconPng -Size 512 -Out (Join-Path $iconsDir "icon-512.png")
