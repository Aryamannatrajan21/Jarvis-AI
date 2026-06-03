import { ModelProvider, ToolDefinition } from '@jarvis-ai/core';
import { Tool } from '@jarvis-ai/tools';
import { OpenAIProvider } from '@jarvis-ai/openai';
import { Agent } from '@jarvis-ai/agent';

// 1. Setup a Mock Model Provider as a fallback to make this runnable without an API key.
class MockProvider implements ModelProvider {
  id = 'mock';
  async generateResponse(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools?: ToolDefinition[]
  ) {
    const lastMessage = messages[messages.length - 1].content;
    console.log(`[Mock LLM received input]: "${lastMessage}"`);

    if (lastMessage.includes('5 + 7')) {
      // Simulate tool call
      return {
        content: 'I need to perform a calculation.',
        toolCalls: [{
          id: 'call-1',
          name: 'calculator',
          arguments: JSON.stringify({ operation: 'add', a: 5, b: 7 })
        }]
      };
    }

    if (lastMessage.includes('result: 12')) {
      return {
        content: 'The sum of 5 and 7 is 12.'
      };
    }

    if (lastMessage.includes('write a report')) {
      return {
        content: 'Report outline: 1. Introduction 2. Data analysis 3. Summary.'
      };
    }

    return {
      content: 'Hello, this is a mock agent response!'
    };
  }
}

async function main() {
  console.log('=== Starting Jarvis-AI Playground ===\n');

  // Determine provider: use real OpenAI if key is present, otherwise fallback to Mock
  const hasKey = !!process.env.OPENAI_API_KEY;
  const provider = hasKey 
    ? new OpenAIProvider() 
    : new MockProvider();

  console.log(`Using model provider: ${provider.id.toUpperCase()}`);
  if (!hasKey) {
    console.log('(Tip: Set OPENAI_API_KEY environment variable to use the actual OpenAI API)\n');
  }

  // 2. Define a Calculator Tool
  const calculatorTool = new Tool<{ operation: string; a: number; b: number }, number>({
    name: 'calculator',
    description: 'Perform basic math operations',
    schema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['operation', 'a', 'b']
    },
    execute: async (args) => {
      console.log(`[Tool calculator executed]: ${args.operation} ${args.a} and ${args.b}`);
      switch (args.operation) {
        case 'add': return args.a + args.b;
        case 'subtract': return args.a - args.b;
        case 'multiply': return args.a * args.b;
        case 'divide': return args.a / args.b;
        default: throw new Error('Unknown operation');
      }
    }
  });

  // 3. Create the Main Agent (Researcher)
  const researcher = new Agent({
    name: 'Research Agent',
    instructions: 'You are a research specialist capable of math calculation using your calculator tool.',
    provider,
    model: process.env.DEFAULT_MODEL || 'gpt-4o',
    tools: [calculatorTool]
  });

  console.log(`Created Main Agent: "${researcher.name}" [ID: ${researcher.id}]`);

  // Run the agent (triggers execution loop and calculator tool execution)
  console.log('\n--- Running task: 5 + 7 ---');
  const calcResult = await researcher.run('What is 5 + 7?');
  console.log(`Final Response: "${calcResult}"`);

  // 4. Create a second Agent (Writer) for Agent-to-Agent collaboration
  const writer = new Agent({
    name: 'Writer Agent',
    instructions: 'You are a professional report writer.',
    provider,
    model: process.env.DEFAULT_MODEL || 'gpt-4o'
  });

  console.log(`\nCreated Second Agent: "${writer.name}" [ID: ${writer.id}]`);

  // Trigger point-to-point collaboration
  console.log('\n--- Initiating Agent-to-Agent Collaboration ---');
  console.log(`${researcher.name} is asking ${writer.name} to write a report...`);
  const report = await researcher.ask(writer, 'Please write a report based on the math result 12');
  console.log(`Response from ${writer.name}: "${report}"`);

  // 5. Spawn a Child Agent dynamically
  console.log('\n--- Spawning Child Agent dynamically ---');
  const codeExpert = researcher.spawn({
    name: 'Child Code Agent',
    instructions: 'You write code scripts.'
  });

  console.log(`Spawned child: "${codeExpert.name}" [ID: ${codeExpert.id}]`);
  
  // Clean up
  researcher.destroy();
  writer.destroy();
  console.log('\n=== Playground Run Finished Successfully ===');
}

main().catch(console.error);
