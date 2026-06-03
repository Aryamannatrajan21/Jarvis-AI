import { ModelProvider, ToolDefinition } from '@jarvis-ai/core';
import OpenAI from 'openai';

export class OpenAIProvider implements ModelProvider {
  public id = 'openai';
  private client: OpenAI;

  constructor(options: { apiKey?: string; baseURL?: string } = {}) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY || 'dummy-key';
    const baseURL = options.baseURL || process.env.OPENAI_BASE_URL;
    this.client = new OpenAI({ apiKey, baseURL });
  }

  public async generateResponse(
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
    tools?: ToolDefinition[],
    options: Record<string, any> = {}
  ) {
    const model = options.model || 'gpt-4.5-preview';

    // Map tools to OpenAI structure
    const openaiTools = tools && tools.length > 0
      ? tools.map(tool => ({
          type: 'function' as const,
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.schema,
          },
        }))
      : undefined;

    const response = await this.client.chat.completions.create({
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      tools: openaiTools,
      ...options,
    });

    const choice = response.choices[0];
    const assistantMessage = choice?.message;

    const toolCalls = assistantMessage?.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));

    return {
      content: assistantMessage?.content || '',
      toolCalls,
      usage: response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined,
    };
  }
}
