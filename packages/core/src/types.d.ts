export type AgentState = 'Uninitialized' | 'Idle' | 'Executing' | 'Suspended' | 'Error' | 'Terminated';
export interface MessageSender {
    id: string;
    role: string;
}
export interface MessageRecipient {
    type: 'agent' | 'broadcast' | 'orchestrator';
    id: string;
}
export interface MessageEnvelope<T = any> {
    id: string;
    parentId?: string;
    timestamp: number;
    sender: MessageSender;
    recipient: MessageRecipient;
    topic: string;
    payload: T;
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
    schema: object;
    execute: (args: TInput, context: ExecutionContext) => Promise<TOutput>;
}
export interface ModelProvider {
    id: string;
    generateResponse: (messages: Array<{
        role: 'system' | 'user' | 'assistant';
        content: string;
    }>, tools?: ToolDefinition[], options?: Record<string, any>) => Promise<{
        content: string;
        toolCalls?: Array<{
            id: string;
            name: string;
            arguments: string;
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
//# sourceMappingURL=types.d.ts.map