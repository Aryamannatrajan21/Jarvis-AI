import { ToolDefinition } from './types.js';

export const createAgentTool: ToolDefinition = {
  name: 'createAgent',
  description: 'Create and register a new AI agent with a name and specialized system instructions.',
  schema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name of the agent' },
      instructions: { type: 'string', description: 'Specialized behavior instructions' }
    },
    required: ['name', 'instructions']
  },
  execute: async (args, context) => {
    const orchestrator = context.orchestrator;
    if (!orchestrator) {
      throw new Error('Orchestrator context missing.');
    }
    const newAgent = orchestrator.createAgent(args.name, args.instructions);
    return {
      status: 'success',
      message: `Agent "${args.name}" created successfully with ID: ${newAgent.id}`
    };
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
      return {
        status: 'error',
        message: `Agent "${args.agentIdentifier}" not found. Available agents: ${orchestrator.listAgents().map((a: any) => a.name).join(', ')}`
      };
    }

    console.log(`\n[Orchestrator]: Delegating task to "${agent.name}"...`);
    const result = await agent.run(args.task, {
      correlationId: context.correlationId,
      parentId: context.agentId
    });
    
    return {
      status: 'success',
      agent: agent.name,
      result
    };
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
      return {
        status: 'error',
        message: `Failed to start collaboration. One or both agents not found.`
      };
    }

    console.log(`\n[Orchestrator]: Starting collaboration sequence between "${agentA.name}" and "${agentB.name}"...`);
    
    // Step 1: Run Agent A
    const resultA = await agentA.run(args.task, {
      correlationId: context.correlationId,
      parentId: context.agentId
    });

    console.log(`\n[Orchestrator]: Agent "${agentA.name}" finished. Passing result to "${agentB.name}"...`);

    // Step 2: Pass result to Agent B
    const finalResult = await agentB.run(`Here is the input from ${agentA.name}: "${resultA}". Please process it and provide the final output.`, {
      correlationId: context.correlationId,
      parentId: context.agentId
    });

    return {
      status: 'success',
      sequence: [agentA.name, agentB.name],
      finalResult
    };
  }
};
