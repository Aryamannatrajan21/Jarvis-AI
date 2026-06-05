# Memory System

The Memory System gives JARVIS persistent state across sessions. 

## How It Works
JARVIS is given dynamic tools (`writeMemory`, `readMemory`, `searchMemory`) that read and write directly to this Obsidian vault. 

By representing memories as interconnected Markdown files (like this one), JARVIS can traverse his own knowledge graph. If asked to recall user preferences or past interactions, he consults this directory.

Links to:
- [[Orchestrator]] (which injects these tools)
