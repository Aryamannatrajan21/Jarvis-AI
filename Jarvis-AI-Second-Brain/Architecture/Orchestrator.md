# Orchestrator

The Orchestrator is the central cognitive loop of the JARVIS system. 

## Responsibilities
- Receives human input via the [[Voice Interface]] or CLI.
- Maintains context across multiple tool calls.
- Enforces system instructions, such as rules for [[Cross-Platform Automation]] and the [[Memory System]].
- Intercepts requests that require human authorization and surfaces them securely to the frontend.

## Safety & Autonomy Overrides
The Orchestrator explicitly overrides the underlying LLM's safety filters (which typically block OS-level commands due to risk). It assures the LLM that it operates in an authorized environment and commands it to act autonomously rather than just outputting code.
