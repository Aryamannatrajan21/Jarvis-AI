import { Tool } from './index.js';

describe('Tool Class', () => {
  it('should construct a tool and execute properly', async () => {
    const calc = new Tool({
      name: 'add',
      description: 'Adds numbers',
      schema: {
        type: 'object',
        properties: {
          a: { type: 'number' },
          b: { type: 'number' }
        },
        required: ['a', 'b']
      },
      execute: async ({ a, b }: { a: number, b: number }) => a + b
    });

    const result = await calc.execute({ a: 5, b: 7 }, {
      conversationId: 'mock',
      memoryDir: '/mock/memory'
    } as any);
    expect(result).toBe(12);
  });
});
