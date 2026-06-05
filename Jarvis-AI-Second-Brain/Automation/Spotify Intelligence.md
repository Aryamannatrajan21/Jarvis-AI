# Spotify Intelligence

Controlling Spotify on macOS via [[AppleScript]] and standard [[macOS UI Automation]] is notoriously difficult because Spotify does not expose native AppleScript commands for custom playlists like "Liked Songs." 

Instead of relying on fragile UI keystroke manipulation, JARVIS uses a secret native URI:
`tell application "Spotify" to play track "spotify:collection:tracks"`

This bypasses UI scripting entirely, allowing instantaneous playback of the user's Liked Songs.
