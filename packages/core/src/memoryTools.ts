import { ToolDefinition } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Path to the Obsidian vault
const MEMORY_DIR = path.resolve(process.cwd(), 'Jarvis-AI-Second-Brain');

// Ensure the memory directory exists
if (!fs.existsSync(MEMORY_DIR)) {
  fs.mkdirSync(MEMORY_DIR, { recursive: true });
}

export const writeMemoryTool: ToolDefinition = {
  name: 'writeMemory',
  description: 'Saves or appends a markdown note to JARVIS\'s Obsidian Second Brain for long-term memory.',
  requiresApproval: false, // Memory operations should be seamless
  schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'The topic or title of the memory (will be used as the filename, e.g. "UserPreferences").' },
      content: { type: 'string', description: 'The markdown content to save or append to the note.' }
    },
    required: ['topic', 'content']
  },
  execute: async (args: { topic: string; content: string }) => {
    try {
      const sanitizedTopic = args.topic.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(MEMORY_DIR, `${sanitizedTopic}.md`);
      
      const timestamp = new Date().toISOString();
      const formattedContent = `\n\n### Entry: ${timestamp}\n${args.content}`;

      if (fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, formattedContent, 'utf-8');
        return `Memory successfully appended to ${sanitizedTopic}.md.`;
      } else {
        const header = `# ${args.topic}\nThis is an auto-generated memory file.\n`;
        fs.writeFileSync(filePath, header + formattedContent, 'utf-8');
        return `Memory successfully created as ${sanitizedTopic}.md.`;
      }
    } catch (e: any) {
      return `Failed to write memory: ${e.message}`;
    }
  }
};

export const readMemoryTool: ToolDefinition = {
  name: 'readMemory',
  description: 'Reads a specific memory note from JARVIS\'s Obsidian Second Brain.',
  requiresApproval: false,
  schema: {
    type: 'object',
    properties: {
      topic: { type: 'string', description: 'The topic or title of the memory file to read (e.g. "UserPreferences").' }
    },
    required: ['topic']
  },
  execute: async (args: { topic: string }) => {
    try {
      const sanitizedTopic = args.topic.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filePath = path.join(MEMORY_DIR, `${sanitizedTopic}.md`);
      
      if (!fs.existsSync(filePath)) {
        return `No memory found for topic: ${args.topic}`;
      }
      const content = fs.readFileSync(filePath, 'utf-8');
      return content;
    } catch (e: any) {
      return `Failed to read memory: ${e.message}`;
    }
  }
};

export const searchMemoryTool: ToolDefinition = {
  name: 'searchMemory',
  description: 'Searches all notes in JARVIS\'s Obsidian Second Brain for a specific keyword or phrase.',
  requiresApproval: false,
  schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'The search query to look for in the memory vault.' }
    },
    required: ['query']
  },
  execute: async (args: { query: string }) => {
    try {
      // Use grep to search all markdown files in the memory directory
      const { stdout } = await execAsync(`grep -rnwi '${MEMORY_DIR}' -e '${args.query.replace(/'/g, "'\\''")}'`);
      if (!stdout.trim()) {
        return `No memories found matching query: ${args.query}`;
      }
      return `Search results:\n${stdout}`;
    } catch (e: any) {
      // grep returns exit code 1 if no lines are found
      if (e.code === 1) {
        return `No memories found matching query: ${args.query}`;
      }
      return `Search failed: ${e.message}`;
    }
  }
};
