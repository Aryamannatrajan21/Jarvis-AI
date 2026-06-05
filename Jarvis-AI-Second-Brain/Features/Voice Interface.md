# Voice Interface

The Voice Interface enables a completely hands-free interaction loop with the [[Orchestrator]].

## Acoustic Triggers
JARVIS runs a transient background spike detector. Users can configure double-snaps or double-claps to wake the system or interrupt JARVIS mid-sentence.

## Permission Handling
When JARVIS invokes high-risk tools (like [[AppleScript]] or terminal commands), the Voice Interface intercepts the raw JSON request and paints a visual "Accept/Reject" modal, supporting verbal approvals ("Yes", "Approve").
