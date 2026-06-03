import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ModelProvider, ToolDefinition, Orchestrator } from '@jarvis-ai/core';
import { OpenAIProvider } from '@jarvis-ai/openai';
import { Agent } from '@jarvis-ai/agent';
import { ensureApiConfig } from './setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Provider as fallback
class MockVoiceOrchestrationProvider implements ModelProvider {
  id = 'mock';
  async generateResponse(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools?: ToolDefinition[]
  ) {
    const lastMessage = messages[messages.length - 1].content;
    console.log(`[Voice Server Mock LLM Input]: "${lastMessage}"`);

    if (/create/i.test(lastMessage) && /agent/i.test(lastMessage)) {
      const matchName = lastMessage.match(/named\s+([\w\s]+?)(?:\s+that|\s+with|\s*$)/i);
      const name = matchName ? matchName[1].trim() : 'Helper Agent';
      return {
        content: `Affirmative. I have created a new specialized agent named ${name} with system instructions.`,
        toolCalls: [{
          id: 'call-spawn',
          name: 'createAgent',
          arguments: JSON.stringify({ name, instructions: `You are the specialized ${name}.` })
        }]
      };
    }

    if (lastMessage.includes('quantum computers')) {
      return {
        content: 'Quantum computers process information using qubits, allowing them to solve certain tasks exponentially faster than classical computers.'
      };
    }

    if (/ask/i.test(lastMessage) || /delegate/i.test(lastMessage) || /research/i.test(lastMessage)) {
      return {
        content: 'Task received. I am delegating the action to the Researcher agent now.',
        toolCalls: [{
          id: 'call-delegate',
          name: 'delegateTask',
          arguments: JSON.stringify({ agentIdentifier: 'Researcher', task: lastMessage })
        }]
      };
    }

    return {
      content: 'I am online and ready, sir. I can help you create agents or orchestrate tasks.'
    };
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve the static web interface files
app.use(express.static(path.join(__dirname, '..', 'public')));

async function startServer() {
  await ensureApiConfig();

  const hasKey = !!process.env.OPENAI_API_KEY;
  const provider = hasKey ? new OpenAIProvider() : new MockVoiceOrchestrationProvider();

  // Initialize the global orchestrator
  const orchestrator = new Orchestrator({
    provider,
    AgentClass: Agent,
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o'
  });

  // Chat API endpoint
  app.post('/api/chat', async (req, res) => {
    const { message, config } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message payload is missing.' });
    }

    try {
      // Dynamic client-side config injection
      if (config && config.apiKey) {
        const clientProvider = new OpenAIProvider({
          apiKey: config.apiKey,
          baseURL: config.baseUrl || undefined
        });

        const tempOrchestrator = new Orchestrator({
          provider: clientProvider,
          AgentClass: Agent,
          defaultModel: config.model || process.env.DEFAULT_MODEL || 'gpt-4o'
        });

        // Copy over registered subagents from the global orchestrator registry
        for (const agent of orchestrator.listAgents()) {
          if (agent.id !== 'jarvis-meta-agent') {
            tempOrchestrator.registerAgent(agent);
          }
        }

        // Wake up temp orchestrator session state to match global session state
        if (orchestrator.isSessionOpen()) {
          await tempOrchestrator.handleInput("Hey JARVIS");
        }

        const result = await tempOrchestrator.handleInput(message);

        // Sync back session active states
        if (!result.sessionActive) {
          orchestrator.closeSession();
        } else {
          // Sync any newly created child agents back to global registry
          for (const agent of tempOrchestrator.listAgents()) {
            if (!orchestrator.findAgent(agent.id)) {
              orchestrator.registerAgent(agent);
            }
          }
          if (!orchestrator.isSessionOpen()) {
            await orchestrator.handleInput("Hey JARVIS");
          }
        }

        return res.json(result);
      }

      const result = await orchestrator.handleInput(message);
      res.json(result);
    } catch (error: any) {
      console.error('Error handling orchestrator input:', error);
      res.status(500).json({ error: error.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`\n====================================================`);
    console.log(`  JARVIS Voice Live Chat server running at:`);
    console.log(`  👉 http://localhost:${PORT}`);
    console.log(`====================================================\n`);
  });
}

startServer().catch(console.error);
