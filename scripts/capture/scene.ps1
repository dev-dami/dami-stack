# Opens a WezTerm window running a command, captures only that window, then closes it.
param(
  [string]$Out,
  [string]$Cwd,
  [int]$Wait = 20,
  [int]$Frames = 0,
  [int]$IntervalMs = 500,
  [string]$CmdLine
)
$Cmd = $CmdLine.Split('|') | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }
# Start the window like a fresh terminal, not as a child of this session.
Get-ChildItem Env: | Where-Object { $_.Name -match '^(CLAUDECODE|CLAUDE_PID|CLAUDE_CODE_|CLAUDE_AGENT_SDK_|NO_COLOR$)' -and $_.Name -notmatch '^CLAUDE_CODE_(USE_|MAX_)' } | ForEach-Object { Remove-Item "Env:$($_.Name)" }
$here = Split-Path $MyInvocation.MyCommand.Path
$wz = @('--config', 'initial_cols=100', '--config', 'initial_rows=40', '--config', 'font_size=10', 'start', '--always-new-process', '--cwd', $Cwd, '--') + $Cmd
$p = Start-Process 'C:\Program Files\WezTerm\wezterm-gui.exe' -ArgumentList $wz -PassThru -WindowStyle Minimized
Start-Sleep -Seconds 4
# Restore without focus, so it never steals the user's keyboard.
Add-Type @"
using System; using System.Runtime.InteropServices;
public class Show { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n); }
"@
[Show]::ShowWindow($p.MainWindowHandle, 4) | Out-Null
if ($Frames -gt 0) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$here\window.ps1" -Action record -ProcessId $p.Id -Out $Out -Frames $Frames -IntervalMs $IntervalMs
} else {
  Start-Sleep -Seconds ([Math]::Max(0, $Wait - 4))
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$here\window.ps1" -Action shot -ProcessId $p.Id -Out $Out
}
Stop-Process -Id $p.Id -ErrorAction SilentlyContinue




