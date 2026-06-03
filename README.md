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
You can instantiate the global `Orchestrator` and process continuous natural language conversations. It handles wake word detection ("Hey JARVIS"), registers spawned agents, and performs tool orchestration:

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
