# Jarvis-AI

An open-source, npm-installable monorepo framework that allows developers to create, orchestrate, and deploy multiple AI agents that can collaborate with each other.

---

## Key Features

- **Model Agnostic**: Supports OpenAI, Anthropic, Gemini, Ollama, OpenRouter, and custom model backends.
- **Provider Agnostic**: Works locally, in the cloud, or self-hosted.
- **Dynamic Agent Spawning**: Create specialized child agents programmatically to handle sub-tasks with credential/tool inheritance limits.
- **Agent-to-Agent Communication**: Message passing via a shared asynchronous Message Bus.
- **Schema-Validated Tools**: Easily define and attach executable tools to agents with auto-validation support.

---

## High-Level Architecture

```
                    User Application
                           │
                           ▼
                  Core Orchestrator
                           │
                           ▼
             Shared Event Message Bus
              ┌────────────┴────────────┐
              ▼                         ▼
        Agent A (Parent)  ◄────────►  Agent B
              │ (spawns)
              ▼
        Agent C (Child)
        ┌─────┴─────┬───────────┐
        ▼           ▼           ▼
      Tools       Memory     Models
```

---

## Installation

```bash
npm install jarvis-ai
```

### Second Brain (Long-Term Memory)
JARVIS comes with a built-in long-term memory system that stores information in a local directory (`Jarvis-AI-Second-Brain`). While optional, it is **highly recommended** to use [Obsidian](https://obsidian.md/) (or an alternative Markdown knowledge base like Logseq or Notion) to visually manage and explore these memories:
1. Download and install [Obsidian](https://obsidian.md/).
2. Open Obsidian and select **"Open folder as vault"**.
3. Select the `Jarvis-AI-Second-Brain` directory located in the root of this project.

JARVIS will autonomously read, write, and search markdown files in this vault to manage his memories. You can also manually view or edit these memories in any text or Markdown editor of your choice at any time!

---

## Configuration & API Keys

> [!IMPORTANT]
> To make Jarvis-AI smart and functional, you need to provide your own API keys. The framework is fully model-agnostic, meaning you can plug in any OpenAI-compatible provider (e.g., OpenAI, NVIDIA NIM, OpenRouter, or local Ollama).

Create a `.env` file at the root of your workspace:

```env
# Example configuration for OpenAI
OPENAI_API_KEY=your-openai-api-key
DEFAULT_MODEL=gpt-4o

# Example configuration for NVIDIA NIM endpoints
OPENAI_API_KEY=your-nvidia-api-key
OPENAI_BASE_URL=https://integrate.api.nvidia.com/v1
DEFAULT_MODEL=meta/llama-3.1-70b-instruct
```

---

## Quickstart

Here is how easily you can create cooperative agents with Jarvis-AI:

```typescript
import { Agent } from '@jarvis-ai/agent';
import { Tool } from '@jarvis-ai/tools';
import { OpenAIProvider } from '@jarvis-ai/openai';

const provider = new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });

// 1. Define a tool
const calculator = new Tool({
  name: 'calculator',
  description: 'Perform math operations',
  schema: {
    type: 'object',
    properties: {
      operation: { type: 'string' },
      a: { type: 'number' },
      b: { type: 'number' }
    },
    required: ['operation', 'a', 'b']
  },
  execute: async ({ operation, a, b }) => a + b // basic implementation
});

// 2. Instantiate Parent Agent
const researcher = new Agent({
  name: 'Research Agent',
  instructions: 'Use your calculator tool when asked to do math.',
  provider,
  model: 'gpt-4o',
  tools: [calculator]
});

// 3. Instantiate Second Agent
const writer = new Agent({
  name: 'Writer Agent',
  instructions: 'You write reports based on research.',
  provider,
  model: 'gpt-4o'
});

// 4. Run the Agent Loop (Tool is executed automatically)
const response = await researcher.run('What is 5 + 7?');

// 5. Point-to-Point Agent-to-Agent Collaboration
const report = await researcher.ask(writer, `Write a summary report of: ${response}`);

console.log(report);
```

### Interactive Orchestrator (Live Chat)
You can instantiate the global `Orchestrator` and process continuous natural language conversations. It handles wake word detection, registers spawned agents, and performs tool orchestration:

```typescript
import { Orchestrator } from '@jarvis-ai/core';
import { Agent } from '@jarvis-ai/agent';
import { OpenAIProvider } from '@jarvis-ai/openai';

const orchestrator = new Orchestrator({
  provider: new OpenAIProvider(),
  AgentClass: Agent
});

// Standby mode by default. Triggers active session when "Hey JARVIS" is detected.
const { response, sessionActive } = await orchestrator.handleInput("Hey JARVIS, create an agent named Researcher");
console.log(response); // "I will create a new specialized agent named..."
```

To run the live chat terminal demo:
```bash
npm run start:chat
```

### Voice Chat & Web Interface
JARVIS includes a fully functional, hands-free voice chat interface powered by Web Speech API and Web Audio API.

To launch the web interface:
1. Open your terminal in the root of the project.
2. Run `npm run start:voice`

**Features of the Voice Interface:**
- **Custom Wake Words**: Configure your own custom wake word by clicking the ⚙️ Settings icon.
- **Acoustic Triggers**: JARVIS runs a background transient spike detector. You can configure it to wake JARVIS up with a **Double Clap** or **Double Snap** instead of (or alongside) the wake word!
- **Voice Interruption**: Simply say your wake word, or snap your fingers twice, to immediately interrupt JARVIS while he is speaking.
- **Voice Approval**: When JARVIS wants to run a system command, he will display a popup. Simply say "Yes", "Approve", or "Do it" to grant permission.

### Cross-Platform Desktop UI Automation
JARVIS has deep integration with the host operating system, allowing him to take over the mouse, keyboard, and foreground applications. He is pre-configured with rules to dynamically select the right automation tool based on the OS:
- **macOS**: Uses the dedicated `executeAppleScript` tool. **Note:** You MUST manually grant your Terminal app "Accessibility" and "Automation" permissions in `System Settings > Privacy & Security` for UI scripting to work.
- **Windows**: Uses PowerShell with `SendKeys`.
- **Linux**: Uses `xdotool` and `wmctrl`.

---

## Development Workspace Setup

This project is set up as a Turborepo monorepo:

### Folder Structure
- `packages/core`: Communication Bus, Event Loop, types, schemas.
- `packages/tools`: Base Class for tool registry and execution validator.
- `packages/agent`: Agent execution loops and spawning rules.
- `providers/openai`: Provider wrapper mapping to the OpenAI SDK.
- `examples/playground`: Executable test suite for verifying runtime.

### Build and Run locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Build all packages:
   ```bash
   npm run build
   ```
3. Run the Playground:
   ```bash
   npm run start:playground
   ```

---

## License

MIT
