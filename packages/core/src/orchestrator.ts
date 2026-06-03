import { AgentInterface, ModelProvider } from './types.js';
import { createAgentTool, delegateTaskTool, collaborateTool } from './orchestratorTools.js';

export class Orchestrator {
  private agents: Map<string, AgentInterface> = new Map();
  private jarvisAgent!: AgentInterface;
  private isSessionActive = false;
  private AgentClass: any;
  private provider: ModelProvider;
  private defaultModel: string;

  constructor(options: {
    provider: ModelProvider;
    AgentClass: any; // Class constructor satisfying AgentInterface
    defaultModel?: string;
  }) {
    this.AgentClass = options.AgentClass;
    this.provider = options.provider;
    this.defaultModel = options.defaultModel || 'gpt-4o';

    // Initialize the primary JARVIS agent
    this.jarvisAgent = new this.AgentClass({
      id: 'jarvis-meta-agent',
      name: 'JARVIS',
      instructions: `You are JARVIS, the primary meta-agent orchestrator. 
Your goal is to coordinate a team of AI agents to solve user tasks.
You have tools to:
1. createAgent: Spawn a new specialized agent.
2. delegateTask: Delegate a specific query/task to a spawned agent.
3. collaborate: Setup a pipeline between two agents.

Always explain your plans to the user, call the appropriate tools to dynamically build, direct, and collaborate between agents, and report results clearly.`,
      provider: this.provider,
      model: this.defaultModel,
      tools: [createAgentTool, delegateTaskTool, collaborateTool]
    });

    this.registerAgent(this.jarvisAgent);
  }

  /**
   * Check if a conversation session is currently active.
   */
  public isSessionOpen(): boolean {
    return this.isSessionActive;
  }

  /**
   * Close the active conversation session.
   */
  public closeSession(): void {
    this.isSessionActive = false;
  }

  /**
   * Register a new agent manually.
   */
  public registerAgent(agent: AgentInterface): void {
    this.agents.set(agent.id, agent);
    // Also store by lowercase name for easy lookup
    this.agents.set(agent.name.toLowerCase(), agent);
  }

  /**
   * Dynamically create and register a new agent.
   */
  public createAgent(name: string, instructions: string): AgentInterface {
    const agent = new this.AgentClass({
      name,
      instructions,
      provider: this.provider,
      model: this.defaultModel
    });
    this.registerAgent(agent);
    return agent;
  }

  /**
   * Find an agent by name or ID.
   */
  public findAgent(identifier: string): AgentInterface | undefined {
    return this.agents.get(identifier) || this.agents.get(identifier.toLowerCase());
  }

  /**
   * List all registered agents.
   */
  public listAgents(): AgentInterface[] {
    const list: AgentInterface[] = [];
    const seen = new Set<string>();
    for (const [_, agent] of this.agents.entries()) {
      if (!seen.has(agent.id)) {
        seen.add(agent.id);
        list.push(agent);
      }
    }
    return list;
  }

  /**
   * Handle user natural language input.
   * Returns response text and indicates whether the chat session is currently active.
   */
  public async handleInput(input: string): Promise<{ response: string; sessionActive: boolean }> {
    const trimmedInput = input.trim();
    const wakeWordPattern = /\bhey\s+jarvis\b/i;

    // Wake word detection
    const hasWakeWord = wakeWordPattern.test(trimmedInput);

    if (hasWakeWord) {
      this.isSessionActive = true;
    }

    if (!this.isSessionActive) {
      return {
        response: '[Standby Mode] (Hint: Say "Hey JARVIS" to start)',
        sessionActive: false
      };
    }

    // Strip out wake word from the prompt passed to JARVIS
    let query = trimmedInput;
    if (hasWakeWord) {
      query = trimmedInput.replace(wakeWordPattern, '').trim();
      if (!query) {
        return {
          response: 'JARVIS online. How can I help you, sir?',
          sessionActive: true
        };
      }
    }

    // Check for exit trigger
    const exitPattern = /\b(bye|exit|goodbye|go\s+to\s+sleep)\b/i;
    if (exitPattern.test(query)) {
      this.isSessionActive = false;
      return {
        response: 'Understood. Shutting down active session. Goodbye!',
        sessionActive: false
      };
    }

    // Execute query via JARVIS meta-agent
    const response = await this.jarvisAgent.run(query, {
      orchestrator: this
    });

    return {
      response,
      sessionActive: this.isSessionActive
    };
  }

  /**
   * Clean up all agents.
   */
  public destroy(): void {
    for (const agent of this.listAgents()) {
      agent.destroy();
    }
    this.agents.clear();
  }
}
