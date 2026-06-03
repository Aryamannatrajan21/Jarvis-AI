export type AgentState = 'Uninitialized' | 'Idle' | 'Executing' | 'Suspended' | 'Error' | 'Terminated';

export interface MessageSender {
  id: string;
  role: string;
}

export interface MessageRecipient {
  type: 'agent' | 'broadcast' | 'orchestrator';
  id: string; // Target agent ID or '*' for broadcast
}

export interface MessageEnvelope<T = any> {
  id: string;             // UUIDv4
  parentId?: string;      // For thread tracking & causal ordering
  timestamp: number;      // Epoch milliseconds
  sender: MessageSender;
  recipient: MessageRecipient;
  topic: string;          // e.g., "agent.task.delegate", "agent.message.text", "agent.message.ask", "agent.message.reply"
  payload: T;             // Message body
  metadata?: {
    tokens?: number;
    latencyMs?: number;
    correlationId?: string;
    [key: string]: any;
  };
}

export interface ExecutionContext {
  agentId: string;
  parentId?: string;
  correlationId: string;
  [key: string]: any;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  schema: Record<string, any>; // JSON Schema for validation
  execute: (args: TInput, context: ExecutionContext) => Promise<TOutput>;
}

export interface ModelProvider {
  id: string;
  generateResponse: (
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools?: ToolDefinition[],
    options?: Record<string, any>
  ) => Promise<{
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      arguments: string; // JSON string
    }>;
    usage?: {
      promptTokens: number;
      completionTokens: number;
      totalTokens: number;
    };
  }>;
}

export interface AgentConfig {
  name: string;
  instructions: string;
  provider: ModelProvider;
  model: string;
  tools?: ToolDefinition[];
}

export interface AgentInterface {
  id: string;
  name: string;
  instructions: string;
  state: AgentState;
  run: (query: string, context?: any) => Promise<string>;
  destroy: () => void;
  spawn: (config: any) => AgentInterface;
}

