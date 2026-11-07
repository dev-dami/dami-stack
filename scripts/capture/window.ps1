# Captures one window's own pixels with PrintWindow, so whatever covers it is never captured.
# shot:   -Action shot -ProcessId <pid> -Out <file.png>
# record: -Action record -ProcessId <pid> -Out <folder> -Frames <n> -IntervalMs <ms>
param([string]$Action, [int]$ProcessId, [string]$Out, [int]$Frames = 0, [int]$IntervalMs = 500)
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class W {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr h, out RECT r);
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
}
"@
[W]::SetProcessDPIAware() | Out-Null
$h = (Get-Process -Id $ProcessId).MainWindowHandle
if ($h -eq [IntPtr]::Zero) { throw "no window for process $ProcessId" }

function Grab([string]$file) {
  $r = New-Object W+RECT
  [W]::GetClientRect($h, [ref]$r) | Out-Null
  $w = $r.Right - $r.Left; $hh = $r.Bottom - $r.Top
  $w -= $w % 2; $hh -= $hh % 2
  $bmp = New-Object System.Drawing.Bitmap($w, $hh)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $dc = $g.GetHdc()
  # 1 = client area only, 2 = render full content, which works for GPU-drawn windows.
  [W]::PrintWindow($h, $dc, 3) | Out-Null
  $g.ReleaseHdc($dc); $g.Dispose()
  $bmp.Save($file, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
}

if ($Action -eq 'shot') { Grab $Out; "saved $Out" }
if ($Action -eq 'record') {
  New-Item -ItemType Directory -Force $Out | Out-Null
  for ($i = 0; $i -lt $Frames; $i++) {
    Grab (Join-Path $Out ('f{0:D4}.png' -f $i))
    Start-Sleep -Milliseconds $IntervalMs
  }
  "recorded $Frames frames"
}
