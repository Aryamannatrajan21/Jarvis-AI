import { ToolDefinition } from './types.js';

export const createAgentTool: ToolDefinition = {
  name: 'createAgent',
  description: 'Create and register one or more AI agents with specialized system instructions.',
  schema: {
    type: 'object',
    properties: {
      agents: {
        type: 'array',
        description: 'List of agents to create.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Name of the agent' },
            instructions: { type: 'string', description: 'Specialized behavior instructions' }
          },
          required: ['name', 'instructions']
        }
      }
    },
    required: ['agents']
  },
  execute: async (args, context) => {
    const orchestrator = context.orchestrator;
    if (!orchestrator) {
      throw new Error('Orchestrator context missing.');
    }
    const results = [];
    
    // Safely parse if LLM hallucinates a stringified array
    let agentsToCreate = args.agents;
    if (typeof agentsToCreate === 'string') {
      try {
        agentsToCreate = JSON.parse(agentsToCreate);
      } catch (e) {
        throw new Error('Failed to parse agents array string: ' + (e as Error).message);
      }
    }
    
    if (!Array.isArray(agentsToCreate)) {
      throw new Error('args.agents must be an array of agent objects.');
    }

    for (const agentData of agentsToCreate) {
      if (!agentData.name) continue; // Prevent toLowerCase crash
      const newAgent = orchestrator.createAgent(agentData.name, agentData.instructions || '');
      results.push(`Agent "${agentData.name}" created successfully with ID: ${newAgent.id}`);
    }
    return results.join('\n');
  }
};

export const delegateTaskTool: ToolDefinition = {
  name: 'delegateTask',
  description: 'Delegate a specific task to an existing agent in the system by their name or ID.',
  schema: {
    type: 'object',
    properties: {
      agentIdentifier: { type: 'string', description: 'Name or ID of the target agent' },
      task: { type: 'string', description: 'The task description or query to run' }
    },
    required: ['agentIdentifier', 'task']
  },
  execute: async (args, context) => {
    const orchestrator = context.orchestrator;
    if (!orchestrator) {
      throw new Error('Orchestrator context missing.');
    }
    const agent = orchestrator.findAgent(args.agentIdentifier);
    if (!agent) {
      return `Error: Agent "${args.agentIdentifier}" not found. Available agents: ${orchestrator.listAgents().map((a: any) => a.name).join(', ')}`;
    }

    console.log(`\n[Orchestrator]: Delegating task to "${agent.name}"...`);
    const result = await agent.run(args.task, {
      correlationId: context.correlationId,
      parentId: context.agentId,
      orchestrator: context.orchestrator
    });
    
    return `Task completed by agent "${agent.name}":\n\n${result}`;
  }
};

export const collaborateTool: ToolDefinition = {
  name: 'collaborate',
  description: 'Initiate a collaborative sequence where Agent A generates output and passes it to Agent B for processing.',
  schema: {
    type: 'object',
    properties: {
      agentAIdentifier: { type: 'string', description: 'Name or ID of the first agent' },
      agentBIdentifier: { type: 'string', description: 'Name or ID of the second agent' },
      task: { type: 'string', description: 'Task description to initiate' }
    },
    required: ['agentAIdentifier', 'agentBIdentifier', 'task']
  },
  execute: async (args, context) => {
    const orchestrator = context.orchestrator;
    if (!orchestrator) {
      throw new Error('Orchestrator context missing.');
    }
    const agentA = orchestrator.findAgent(args.agentAIdentifier);
    const agentB = orchestrator.findAgent(args.agentBIdentifier);

    if (!agentA || !agentB) {
      return `Error: Failed to start collaboration. One or both agents not found.`;
    }

    console.log(`\n[Orchestrator]: Starting collaboration sequence between "${agentA.name}" and "${agentB.name}"...`);
    
    // Step 1: Run Agent A
    const resultA = await agentA.run(args.task, {
      correlationId: context.correlationId,
      parentId: context.agentId,
      orchestrator: context.orchestrator
    });

    console.log(`\n[Orchestrator]: Agent "${agentA.name}" finished. Passing result to "${agentB.name}"...`);

    // Step 2: Pass result to Agent B
    const finalResult = await agentB.run(`Here is the input from ${agentA.name}: "${resultA}". Please process it and provide the final output.`, {
      correlationId: context.correlationId,
      parentId: context.agentId,
      orchestrator: context.orchestrator
    });

    return `Collaboration sequence completed between "${agentA.name}" and "${agentB.name}".\n\nFinal Result:\n${finalResult}`;
  }
};
