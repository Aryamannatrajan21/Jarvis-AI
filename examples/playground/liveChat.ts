import readline from 'readline';
import { ModelProvider, ToolDefinition, Orchestrator, globalBus, MessageEnvelope, ChatMessage } from '@jarvis-ai/core';
import { OpenAIProvider } from '@jarvis-ai/openai';
import { Agent } from '@jarvis-ai/agent';
import { ensureApiConfig } from './setup.js';
import ora from 'ora';

// Mock Provider for local out-of-the-box testing of JARVIS orchestrations
class MockOrchestrationProvider implements ModelProvider {
  id = 'mock';
  async generateResponse(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ) {
    const lastMsgObj = messages[messages.length - 1];
    
    // Break infinite loop when tool outputs are fed back to the Mock Provider
    if (lastMsgObj.role === 'tool') {
      return {
        content: `Task completed successfully: ${lastMsgObj.content}`
      };
    }

    const lastMessage = lastMsgObj.content || '';

    // Simulate smart parsing for dynamic creation, delegation, and collaboration
    if (/create/i.test(lastMessage) && /agent/i.test(lastMessage)) {
      const matchName = lastMessage.match(/named\s+([\w\s]+?)(?:\s+that|\s+with|\s*$)/i);
      const name = matchName ? matchName[1].trim() : 'Helper Agent';
      return {
        content: `I will create a new specialized agent named "${name}".`,
        toolCalls: [{
          id: 'call-spawn',
          name: 'createAgent',
          arguments: JSON.stringify({ name, instructions: `You are the specialized ${name}.` })
        }]
      };
    }

    if (lastMessage.includes('quantum computers')) {
      return {
        content: 'Quantum computers use qubits to compute complex algorithms. Researcher finished.'
      };
    }

    if (/ask/i.test(lastMessage) || /delegate/i.test(lastMessage) || /tell/i.test(lastMessage) || /research/i.test(lastMessage)) {
      return {
        content: 'Delegating the requested task to the Researcher agent.',
        toolCalls: [{
          id: 'call-delegate',
          name: 'delegateTask',
          arguments: JSON.stringify({ agentIdentifier: 'Researcher', task: lastMessage })
        }]
      };
    }

    if (/collaborate/i.test(lastMessage) || /pipeline/i.test(lastMessage)) {
      return {
        content: 'Initiating collaborative sequence between agents.',
        toolCalls: [{
          id: 'call-collab',
          name: 'collaborate',
          arguments: JSON.stringify({
            agentAIdentifier: 'researcher',
            agentBIdentifier: 'writer',
            task: 'Perform research and compile the final summary'
          })
        }]
      };
    }

    return {
      content: 'I can assist you with dynamic agent creation, delegation, and collaboration. Try saying:\n' +
               '1. "Create an agent named Researcher"\n' +
               '2. "Ask Researcher to search for AI news"\n' +
               '3. "Run collaboration between Researcher and Writer to summarize AI trends"'
    };
  }
}

async function startLiveChat() {
  await ensureApiConfig();
  console.clear();
  console.log('====================================================');
  console.log('           JARVIS-AI LIVE CONVERSATIONAL LOOP       ');
  console.log('====================================================');
  console.log('  * Standby Mode: Listening for "Hey JARVIS"');
  console.log('  * Active Mode: Ongoing chat, meta-tools control');
  console.log('  * To close session: Say "bye" or "go to sleep"');
  console.log('  * To force quit: Press Ctrl+C');
  console.log('====================================================\n');

  const hasKey = !!process.env.OPENAI_API_KEY;
  const provider = hasKey ? new OpenAIProvider() : new MockOrchestrationProvider();

  // Create the orchestrator injecting our Agent runtime class
  const orchestrator = new Orchestrator({
    provider,
    AgentClass: Agent,
    defaultModel: process.env.DEFAULT_MODEL || 'gpt-4o'
  });

  // We'll use a global spinner reference to update the UI cleanly
  let spinner: any = null;

  globalBus.subscribe('agent.tool.start', (envelope: MessageEnvelope) => {
    if (spinner) {
      const toolName = envelope.payload.toolCalls[0].name;
      spinner.text = `Agent ${envelope.sender.role} is using tool: ${toolName}...`;
    }
  });

  globalBus.subscribe('agent.tool.end', (envelope: MessageEnvelope) => {
    if (spinner) {
      spinner.text = `Agent ${envelope.sender.role} finished tool execution. Analyzing results...`;
    }
  });

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    const prefix = orchestrator.isSessionOpen() 
      ? '\x1b[33mJARVIS (Active) >\x1b[0m ' 
      : '\x1b[90m(Standby) >\x1b[0m ';

    rl.question(prefix, async (userInput) => {
      if (!userInput.trim()) {
        promptUser();
        return;
      }

      spinner = ora('JARVIS is thinking...').start();
      
      try {
        const { response, sessionActive } = await orchestrator.handleInput(userInput);
        
        spinner.stop();
        console.log(`\n\x1b[1mJARVIS:\x1b[0m ${response}\n`);
      } catch (err: any) {
        spinner.fail(`Error: ${err.message}`);
        console.log(`\n`);
      }
      
      spinner = null;
      promptUser();
    });
  };

  promptUser();
}

startLiveChat().catch(console.error);
