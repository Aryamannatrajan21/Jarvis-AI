import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { ModelProvider, ToolDefinition, Orchestrator } from '@jarvis-ai/core';
import { OpenAIProvider } from '@jarvis-ai/openai';
import { Agent } from '@jarvis-ai/agent';

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

    if (/ask/i.test(lastMessage) || /delegate/i.test(lastMessage)) {
      return {
        content: 'Task received. I am delegating the action to the appropriate agent now.',
        toolCalls: [{
          id: 'call-delegate',
          name: 'delegateTask',
          arguments: JSON.stringify({ agentIdentifier: 'helper', task: lastMessage })
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

const hasKey = !!process.env.OPENAI_API_KEY;
const provider = hasKey ? new OpenAIProvider() : new MockVoiceOrchestrationProvider();

// Initialize the global orchestrator
const orchestrator = new Orchestrator({
  provider,
  AgentClass: Agent,
  defaultModel: 'gpt-4o'
});

// Chat API endpoint
app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message payload is missing.' });
  }

  try {
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
