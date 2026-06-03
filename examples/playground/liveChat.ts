import readline from 'readline';
import { ModelProvider, ToolDefinition, Orchestrator, globalBus, MessageEnvelope } from '@jarvis-ai/core';
import { OpenAIProvider } from '@jarvis-ai/openai';
import { Agent } from '@jarvis-ai/agent';

// Mock Provider for local out-of-the-box testing of JARVIS orchestrations
class MockOrchestrationProvider implements ModelProvider {
  id = 'mock';
  async generateResponse(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools?: ToolDefinition[]
  ) {
    const lastMessage = messages[messages.length - 1].content;
    
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

    if (/ask/i.test(lastMessage) || /delegate/i.test(lastMessage) || /tell/i.test(lastMessage)) {
      // Find what agent they are talking about
      return {
        content: 'Delegating the requested task to the appropriate agent.',
        toolCalls: [{
          id: 'call-delegate',
          name: 'delegateTask',
          arguments: JSON.stringify({ agentIdentifier: 'helper', task: lastMessage })
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
    defaultModel: 'gpt-4o'
  });

  // Log bus events in real-time to show background actions fluidly
  globalBus.subscribe('agent.tool.start', (envelope: MessageEnvelope) => {
    console.log(`\n\x1b[36m[Event: Tool Triggered]\x1b[0m ${envelope.sender.role} called tool: ${JSON.stringify(envelope.payload.toolCalls[0].name)}`);
  });

  globalBus.subscribe('agent.tool.end', (envelope: MessageEnvelope) => {
    console.log(`\x1b[32m[Event: Tool Finished]\x1b[0m ${envelope.sender.role} tool output: ${JSON.stringify(envelope.payload.output).substring(0, 80)}...`);
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

      console.log('\x1b[2mProcessing...\x1b[0m');
      
      try {
        const { response, sessionActive } = await orchestrator.handleInput(userInput);
        
        console.log(`\n\x1b[1mJARVIS:\x1b[0m ${response}\n`);
      } catch (err: any) {
        console.log(`\n\x1b[31mError:\x1b[0m ${err.message}\n`);
      }
      
      promptUser();
    });
  };

  promptUser();
}

startLiveChat().catch(console.error);
