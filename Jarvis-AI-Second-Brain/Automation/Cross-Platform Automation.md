# Cross-Platform Automation

JARVIS is designed to control native desktop applications across operating systems. 

Through the [[Orchestrator]], he dynamically invokes the appropriate underlying mechanisms:
- **macOS**: [[macOS UI Automation]] via [[AppleScript]].
- **Windows**: PowerShell `SendKeys` via the shell.
- **Linux**: `xdotool` and `wmctrl` via the shell.
