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

    const mappedMessages: any[] = [];
    
    // Sanitize history: NIM Llama 3 crashes if an assistant message has >1 tool calls.
    // If we find one, we split it into sequential assistant -> tool turns.
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 1) {
        // Split this assistant message into multiple sequential assistant messages
        const originalContent = msg.content;
        for (let j = 0; j < msg.tool_calls.length; j++) {
          const tc = msg.tool_calls[j];
          mappedMessages.push({
            role: 'assistant',
            content: j === 0 ? originalContent : null,
            tool_calls: [tc]
          });
          
          // Look ahead in the history to find the corresponding tool result
          const toolResultIndex = messages.findIndex(m => m.role === 'tool' && m.tool_call_id === tc.id);
          if (toolResultIndex !== -1) {
            mappedMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: messages[toolResultIndex].content
            });
            // Mark the tool message as processed so we don't add it again later
            (messages[toolResultIndex] as any)._processed = true;
          }
        }
      } else if (msg.role === 'tool' && (msg as any)._processed) {
        // Skip tool messages we already processed during the split
        continue;
      } else {
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
        mappedMessages.push(mapped);
      }
    }

    if (process.env.DEBUG_LLM === 'true') {
      const logPath = path.join(process.cwd(), 'llm_trace.md');
      const timestamp = new Date().toISOString();
      let logContent = `\n## Request (${timestamp})\n\n\`\`\`json\n`;
      logContent += JSON.stringify(mappedMessages, null, 2);
      logContent += `\n\`\`\`\n`;
      fs.appendFileSync(logPath, logContent);
    }

    const requestPayload: any = {
      model,
      messages: mappedMessages,
      ...options,
    };

    if (openaiTools) {
      requestPayload.tools = openaiTools;
      // NVIDIA NIM Llama 3 models throw 500 if parallel_tool_calls is true (the SDK default)
      requestPayload.parallel_tool_calls = false;
    }

    const response = await this.client.chat.completions.create(requestPayload);

    const choice = response.choices[0];
    const assistantMessage = choice?.message;

    if (process.env.DEBUG_LLM === 'true') {
      const logPath = path.join(process.cwd(), 'llm_trace.md');
      let logContent = `\n### Response\n\n\`\`\`json\n`;
      logContent += JSON.stringify(assistantMessage, null, 2);
      logContent += `\n\`\`\`\n`;
      fs.appendFileSync(logPath, logContent);
    }

    let toolCalls = assistantMessage?.tool_calls?.map(tc => ({
      id: tc.id,
      name: tc.function.name,
      arguments: tc.function.arguments,
    }));
    
    let content = assistantMessage?.content || '';

    // Extract potential raw JSON tool calls from content
    let rawJsonStr = null;
    
    // Scenario 1: Wrapped with <|python_tag|>
    if (content.includes('<|python_tag|>')) {
      const parts = content.split('<|python_tag|>');
      rawJsonStr = parts[1].trim();
      content = parts[0].trim();
    } 
    // Scenario 2: Just bare JSON in the content that looks like a tool call
    else if (content.trim().startsWith('{') && content.includes('"name"') && content.includes('"parameters"')) {
      // It's entirely possible the assistant just generated raw JSON
      rawJsonStr = content.trim();
      content = '';
    }

    if (rawJsonStr) {
      try {
        let parsed;
        try {
          parsed = JSON.parse(rawJsonStr);
        } catch (err) {
          try {
            parsed = new Function('return ' + rawJsonStr)();
          } catch (e2) {
            try {
              parsed = new Function('return ' + rawJsonStr + '}')();
            } catch (e3) {
              try {
                parsed = new Function('return ' + rawJsonStr + '}}')();
              } catch (e4) {
                // Cannot parse
              }
            }
          }
        }
        
        if (parsed && parsed.name && parsed.parameters) {
          toolCalls = toolCalls || [];
          toolCalls.push({
            id: 'call_' + Math.random().toString(36).substring(2, 11),
            name: parsed.name,
            arguments: typeof parsed.parameters === 'string' ? parsed.parameters : JSON.stringify(parsed.parameters),
          });
        } else if (!content) {
          content = rawJsonStr; // restore if it wasn't a tool call
        }
      } catch (e) {
        // Failed to parse, leave it as content so the agent at least sees it
        if (!content) content = rawJsonStr;
      }
    }

    // NVIDIA NIM Llama 3 bug: model sometimes generates multiple tool calls even with parallel_tool_calls=false.
    // If we return all of them, they go into the message history, which crashes the NIM jinja template on the next request.
    // So we strictly truncate to a single tool call. The agent will just call them sequentially.
    if (toolCalls && toolCalls.length > 1) {
      toolCalls = [toolCalls[0]];
    }

    return {
      content,
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
