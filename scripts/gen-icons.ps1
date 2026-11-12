Add-Type -AssemblyName System.Drawing

function New-IconPng {
    param([int]$Size, [string]$Out)
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.PageUnit = [System.Drawing.GraphicsUnit]::Pixel
    $g.PageScale = 1
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $dark = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 18, 18, 18))
    $white = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $green = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 29, 185, 84))

    # 底：满幅方形（系统自行裁圆角；maskable 也要求满幅底）。圆角只保留在 icon.svg。
    $g.FillRectangle($dark, 0, 0, $Size, $Size)

    # 断环 = 外圆白 − 内圆深；扇形擦掉 9 点→12 点缺口；补两个圆帽（round cap）。
    $c = [float]($Size / 2)
    $outerR = [float]($Size * 176 / 512)
    $innerR = [float]($Size * 124 / 512)
    $g.FillEllipse($white, [float]($c - $outerR), [float]($c - $outerR), [float]($outerR * 2), [float]($outerR * 2))
    $g.FillEllipse($dark,  [float]($c - $innerR), [float]($c - $innerR), [float]($innerR * 2), [float]($innerR * 2))
    $g.FillPie($dark, 0, 0, $Size, $Size, 180, 90)

    $capR = [float]($Size * 26 / 512)
    $topX = $c
    $topY = [float]($Size * 106 / 512)
    $g.FillEllipse($white, [float]($topX - $capR), [float]($topY - $capR), [float]($capR * 2), [float]($capR * 2))
    $g.FillEllipse($white, [float]($topY - $capR), [float]($topX - $capR), [float]($capR * 2), [float]($capR * 2))

    # 起点圆点（品牌绿 #1db954），盖住顶部圆帽
    $dotR = [float]($Size * 40 / 512)
    $g.FillEllipse($green, [float]($topX - $dotR), [float]($topY - $dotR), [float]($dotR * 2), [float]($dotR * 2))

    $g.Dispose()
    $bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Generated: $Out"
}

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "assets/icons"
if (-not (Test-Path $iconsDir)) { New-Item -ItemType Directory -Path $iconsDir | Out-Null }
New-IconPng -Size 192 -Out (Join-Path $iconsDir "icon-192.png")
New-IconPng -Size 512 -Out (Join-Path $iconsDir "icon-512.png")
