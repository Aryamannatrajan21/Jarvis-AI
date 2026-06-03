import { ToolDefinition, ExecutionContext } from '@jarvis-ai/core';

export class Tool<TInput = any, TOutput = any> implements ToolDefinition<TInput, TOutput> {
  public name: string;
  public description: string;
  public schema: Record<string, any>;
  private executeFn: (args: TInput, context: ExecutionContext) => Promise<TOutput>;

  constructor(config: {
    name: string;
    description: string;
    schema: Record<string, any>;
    execute: (args: TInput, context: ExecutionContext) => Promise<TOutput>;
  }) {
    this.name = config.name;
    this.description = config.description;
    this.schema = config.schema;
    this.executeFn = config.execute;
  }

  public async execute(args: TInput, context: ExecutionContext): Promise<TOutput> {
    // Simple basic schema property checks for required fields if defined
    this.validate(args);
    return this.executeFn(args, context);
  }

  private validate(args: any): void {
    const schema = this.schema as any;
    if (schema && schema.required && Array.isArray(schema.required)) {
      for (const requiredField of schema.required) {
        if (args === undefined || args === null || args[requiredField] === undefined) {
          throw new Error(`Tool validation failed: Missing required field "${requiredField}"`);
        }
      }
    }
  }
}
