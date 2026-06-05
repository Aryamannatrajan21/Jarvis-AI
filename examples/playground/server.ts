import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ModelProvider, ToolDefinition, Orchestrator, ChatMessage } from '@jarvis-ai/core';
import { OpenAIProvider } from '@jarvis-ai/openai';
import { Agent } from '@jarvis-ai/agent';
import { ensureApiConfig } from './setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Mock Provider as fallback
class MockVoiceOrchestrationProvider implements ModelProvider {
  id = 'mock';
  async generateResponse(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ) {
    const lastMsgObj = messages[messages.length - 1];
    const lastMessage = lastMsgObj.content || '';
    console.log(`[Voice Server Mock LLM Input]: "${lastMessage}"`);

    // Break infinite loop when tool outputs are fed back to the Mock Provider
    if (lastMsgObj.role === 'tool') {
      return {
        content: `I have successfully completed the agent operation: ${lastMessage}`
      };
    }

    if (/create/i.test(lastMessage) && /agent/i.test(lastMessage)) {
      const matchName = lastMessage.match(/named\s+([\w\s]+?)(?:\s+that|\s+with|\s*$)/i);
      const name = matchName ? matchName[1].trim() : 'Helper Agent';
      return {
        content: `Affirmative. I have created a new specialized agent named ${name} with system instructions.`,
        toolCalls: [{
          id: 'call-spawn',
          name: 'createAgent',
          arguments: JSON.stringify({ agents: [{ name, instructions: `You are the specialized ${name}.` }] })
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
      if (config) {
        let newBaseUrl = config.baseUrl || undefined;
        let newApiKey = config.apiKey || undefined;
        let newModel = config.model || process.env.DEFAULT_MODEL || 'gpt-4o';
        
        // Prevent mismatch between UI provider selection and .env fallback
        if (!newBaseUrl && config.provider) {
          if (config.provider === 'openai') newBaseUrl = 'https://api.openai.com/v1';
          if (config.provider === 'ollama') newBaseUrl = 'http://localhost:11434/v1';
          if (config.provider === 'nvidia') newBaseUrl = 'https://integrate.api.nvidia.com/v1';
        }

        // Final safety net: If we ended up with NVIDIA NIM (either explicitly or via fallback), 
        // ensure the model is actually a valid NVIDIA NIM model, otherwise it throws 404.
        const finalBaseUrl = newBaseUrl || process.env.OPENAI_BASE_URL || '';
        if (finalBaseUrl.includes('integrate.api.nvidia.com')) {
          if (!newModel.includes('meta/llama')) {
            newModel = 'meta/llama-3.1-70b-instruct';
          }
        } else if (finalBaseUrl.includes('api.openai.com')) {
          if (newModel.includes('llama')) {
            newModel = 'gpt-4o';
          }
        }
        
        // We can just update the global orchestrator's provider for this local playground
        // rather than recreating a tempOrchestrator which wipes agent memory.
        const provider = new OpenAIProvider({
          apiKey: newApiKey,
          baseURL: newBaseUrl
        });
        
        // Use any provided config settings or fallback to defaults
        // Need to bypass TypeScript's private modifiers for this quick local playground fix
        (orchestrator as any).provider = provider;
        (orchestrator as any).defaultModel = newModel;
        
        // Update jarvis meta-agent as well
        (orchestrator as any).jarvisAgent.provider = provider;
        (orchestrator as any).jarvisAgent.model = newModel;
      }

      const result = await orchestrator.handleInput(message, config?.wakeWord);
      console.log('--- API CHAT RESPONSE ---');
      console.log(JSON.stringify(result, null, 2));
      console.log('-------------------------');
      res.json(result);
    } catch (error: any) {
      console.error('Error handling orchestrator input:', error);
      res.status(500).json({ error: error.message });
    }
  });

  // New endpoint to handle human-in-the-loop tool approvals
  app.post('/api/approve', async (req, res) => {
    try {
      const { toolCallId, toolName, args } = req.body;
      
      if (!toolCallId || !toolName) {
        return res.status(400).json({ error: 'toolCallId and toolName are required.' });
      }

      // Resume JARVIS execution with the approved tool
      // Since orchestrator doesn't expose jarvisAgent directly, we use typescript any to access it
      const jarvisAgent = (orchestrator as any).jarvisAgent;
      
      const response = await jarvisAgent.resumeWithApproval(toolCallId, toolName, args, {
        orchestrator
      });

      res.json({ response, sessionActive: orchestrator.isSessionOpen() });
    } catch (error: any) {
      console.error('Error handling approval:', error);
      res.status(500).json({ error: error.message });
    }
  });

  const startListening = (port: number) => {
    const server = app.listen(port, () => {
      console.log(`\n====================================================`);
      console.log(`  JARVIS Voice Live Chat server running at:`);
      console.log(`  👉 http://localhost:${port}`);
      console.log(`====================================================\n`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} is in use, trying ${port + 1}...`);
        startListening(port + 1);
      } else {
        console.error('Server error:', err);
      }
    });
  };

  const initialPort = typeof PORT === 'string' ? parseInt(PORT, 10) : PORT;
  startListening(initialPort);
}

startServer().catch(console.error);
