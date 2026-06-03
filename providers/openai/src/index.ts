import { ModelProvider, ToolDefinition, ChatMessage } from '@jarvis-ai/core';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';

export class OpenAIProvider implements ModelProvider {
  public id = 'openai';
  private client: OpenAI;

  constructor(options: { apiKey?: string; baseURL?: string } = {}) {
    const apiKey = options.apiKey || process.env.OPENAI_API_KEY || 'dummy-key';
    let baseURL = options.baseURL || process.env.OPENAI_BASE_URL;

    // Auto-fix Ollama OpenAI compatibility endpoints
    if (baseURL && baseURL.includes(':11434')) {
      if (!baseURL.startsWith('http://') && !baseURL.startsWith('https://')) {
        baseURL = 'http://' + baseURL;
      }
      try {
        const url = new URL(baseURL);
        baseURL = `${url.protocol}//${url.host}/v1`;
      } catch (e) {
        // Ignore invalid URLs
      }
    }

    this.client = new OpenAI({ apiKey, baseURL });
  }

  public async generateResponse(
    messages: ChatMessage[],
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

    const mappedMessages = messages.map(msg => {
      const mapped: any = {
        role: msg.role,
        content: msg.content,
      };
      if (msg.role === 'assistant' && msg.tool_calls) {
        mapped.tool_calls = msg.tool_calls;
      }
      if (msg.role === 'tool') {
        mapped.tool_call_id = msg.tool_call_id;
      }
      return mapped;
    });

    if (process.env.DEBUG_LLM === 'true') {
      const logPath = path.join(process.cwd(), 'llm_trace.md');
      const timestamp = new Date().toISOString();
      let logContent = `\n## Request (${timestamp})\n\n\`\`\`json\n`;
      logContent += JSON.stringify(mappedMessages, null, 2);
      logContent += `\n\`\`\`\n`;
      fs.appendFileSync(logPath, logContent);
    }

    const response = await this.client.chat.completions.create({
      model,
      messages: mappedMessages,
      tools: openaiTools,
      ...options,
    });

    const choice = response.choices[0];
    const assistantMessage = choice?.message;

    if (process.env.DEBUG_LLM === 'true') {
      const logPath = path.join(process.cwd(), 'llm_trace.md');
      let logContent = `\n### Response\n\n\`\`\`json\n`;
      logContent += JSON.stringify(assistantMessage, null, 2);
      logContent += `\n\`\`\`\n`;
      fs.appendFileSync(logPath, logContent);
    }

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
