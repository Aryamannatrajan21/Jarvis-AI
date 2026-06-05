# AppleScript

AppleScript is the native language for scripting macOS applications. JARVIS uses the `executeAppleScript` tool to run scripts.

## Key Rules for AI Automation
1. **Double Quotes**: AppleScript strictly forbids single quotes for strings. When generating JSON, the AI must escape double quotes (e.g. `\"Spotify\"`).
2. **Foregrounding**: When simulating keystrokes via `System Events`, JARVIS must always pull the target app to the front using `activate`, otherwise keystrokes misfire into the wrong application window.
