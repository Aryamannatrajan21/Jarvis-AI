import { 
  AgentConfig, 
  AgentState, 
  MessageEnvelope, 
  globalBus, 
  ModelProvider, 
  ToolDefinition, 
  ExecutionContext 
} from '@jarvis-ai/core';

export class Agent {
  public id: string;
  public name: string;
  public instructions: string;
  public provider: ModelProvider;
  public model: string;
  public tools: ToolDefinition[] = [];
  public state: AgentState = 'Uninitialized';
  
  private messageHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [];
  private children: Agent[] = [];
  private unsubscribeBus?: () => void;

  constructor(config: AgentConfig & { id?: string }) {
    this.id = config.id || `agent-${Math.random().toString(36).substring(2, 9)}`;
    this.name = config.name;
    this.instructions = config.instructions;
    this.provider = config.provider;
    this.model = config.model;
    if (config.tools) {
      this.tools = config.tools;
    }
    this.state = 'Idle';

    this.messageHistory.push({ role: 'system', content: this.instructions });

    // Register on the message bus for point-to-point requests
    this.unsubscribeBus = globalBus.subscribe(`agent.message.${this.id}`, async (envelope: MessageEnvelope) => {
      if (envelope.topic === `agent.message.${this.id}` && envelope.recipient.id === this.id) {
        this.state = 'Executing';
        try {
          const responseText = await this.executeLoop(envelope.payload.content, {
            agentId: this.id,
            parentId: envelope.sender.id,
            correlationId: envelope.metadata?.correlationId || `corr-${Date.now()}`
          });
          
          // Reply back to sender
          await globalBus.publish({
            id: `msg-${Math.random().toString(36).substring(2, 9)}`,
            parentId: envelope.id,
            timestamp: Date.now(),
            sender: { id: this.id, role: this.name },
            recipient: { type: 'agent', id: envelope.sender.id },
            topic: `agent.message.${envelope.sender.id}`,
            payload: { content: responseText },
            metadata: { correlationId: envelope.metadata?.correlationId }
          });
        } catch (error: any) {
          console.error(`Agent ${this.name} error handling message:`, error);
          this.state = 'Error';
        } finally {
          if (this.state === 'Executing') {
            this.state = 'Idle';
          }
        }
      }
    });
  }

  /**
   * Run the agent with a text query (initiates the agent execution loop).
   */
  public async run(query: string, context?: Partial<ExecutionContext>): Promise<string> {
    this.state = 'Executing';
    const ctx: ExecutionContext = {
      agentId: this.id,
      correlationId: context?.correlationId || `corr-${Date.now()}`,
      parentId: context?.parentId
    };

    try {
      const response = await this.executeLoop(query, ctx);
      this.state = 'Idle';
      return response;
    } catch (error) {
      this.state = 'Error';
      throw error;
    }
  }

  /**
   * Run the agent execution loop, resolving tools until a final response is generated.
   */
  private async executeLoop(query: string, context: ExecutionContext): Promise<string> {
    this.messageHistory.push({ role: 'user', content: query });

    let loop = true;
    let iterationCount = 0;
    const maxIterations = 10;
    let finalAnswer = '';

    while (loop && iterationCount < maxIterations) {
      iterationCount++;
      
      const response = await this.provider.generateResponse(this.messageHistory, this.tools, {
        model: this.model
      });

      if (response.content) {
        this.messageHistory.push({ role: 'assistant', content: response.content });
        finalAnswer = response.content;
      }

      if (response.toolCalls && response.toolCalls.length > 0) {
        // Log or trigger event
        await globalBus.publish({
          id: `evt-${Math.random().toString(36).substring(2, 9)}`,
          timestamp: Date.now(),
          sender: { id: this.id, role: this.name },
          recipient: { type: 'orchestrator', id: 'core' },
          topic: 'agent.tool.start',
          payload: { toolCalls: response.toolCalls }
        });

        for (const tc of response.toolCalls) {
          const tool = this.tools.find(t => t.name === tc.name);
          if (!tool) {
            const errorMsg = `Tool ${tc.name} not found.`;
            this.messageHistory.push({ role: 'user', content: `Error: ${errorMsg}` });
            continue;
          }

          try {
            const parsedArgs = JSON.parse(tc.arguments);
            const toolResult = await tool.execute(parsedArgs, context);
            
            this.messageHistory.push({
              role: 'user',
              content: `Tool "${tc.name}" execution result: ${JSON.stringify(toolResult)}`
            });

            await globalBus.publish({
              id: `evt-${Math.random().toString(36).substring(2, 9)}`,
              timestamp: Date.now(),
              sender: { id: this.id, role: this.name },
              recipient: { type: 'orchestrator', id: 'core' },
              topic: 'agent.tool.end',
              payload: { toolName: tc.name, output: toolResult }
            });
          } catch (err: any) {
            const errorMsg = `Error running tool "${tc.name}": ${err.message}`;
            this.messageHistory.push({ role: 'user', content: errorMsg });
          }
        }
      } else {
        // No tool calls, finish the loop
        loop = false;
      }
    }

    return finalAnswer;
  }

  /**
   * Ask another agent for assistance, routing via the message bus.
   */
  public async ask(recipientAgent: Agent, query: string): Promise<string> {
    const correlationId = `corr-${Date.now()}`;
    const messageId = `msg-${Math.random().toString(36).substring(2, 9)}`;
    
    // Suspend agent state while waiting for the response
    const prevState = this.state;
    this.state = 'Suspended';

    return new Promise<string>(async (resolve, reject) => {
      // Set a subscription to listen for the reply message
      const unsubscribe = globalBus.subscribe(`agent.message.${this.id}`, (envelope: MessageEnvelope) => {
        if (envelope.parentId === messageId) {
          unsubscribe();
          this.state = prevState;
          resolve(envelope.payload.content);
        }
      });

      // Send the request
      try {
        await globalBus.publish({
          id: messageId,
          timestamp: Date.now(),
          sender: { id: this.id, role: this.name },
          recipient: { type: 'agent', id: recipientAgent.id },
          topic: `agent.message.${recipientAgent.id}`,
          payload: { content: query },
          metadata: { correlationId }
        });
      } catch (err) {
        unsubscribe();
        this.state = prevState;
        reject(err);
      }
    });
  }

  /**
   * Dynamically spawn a child agent that inherits configuration parameters.
   */
  public spawn(config: Partial<AgentConfig> & { name: string }): Agent {
    const childConfig: AgentConfig = {
      name: config.name,
      instructions: config.instructions || this.instructions,
      provider: config.provider || this.provider,
      model: config.model || this.model,
      tools: config.tools !== undefined ? config.tools : this.tools
    };

    const child = new Agent(childConfig);
    this.children.push(child);
    return child;
  }

  /**
   * Clean up resources and subscriptions.
   */
  public destroy(): void {
    this.state = 'Terminated';
    if (this.unsubscribeBus) {
      this.unsubscribeBus();
    }
    for (const child of this.children) {
      child.destroy();
    }
    this.children = [];
  }
}
