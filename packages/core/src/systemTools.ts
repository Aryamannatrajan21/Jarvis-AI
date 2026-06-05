import { ToolDefinition } from './types.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun } from 'docx';
import ExcelJS from 'exceljs';

const execAsync = promisify(exec);

const resolvePath = (p: string) => {
  if (p.startsWith('~/') || p === '~') {
    return p.replace(/^~/, os.homedir());
  }
  return path.resolve(process.cwd(), p);
};

export const readFileTool: ToolDefinition = {
  name: 'readFile',
  description: 'Reads the contents of a local file on the system.',
  requiresApproval: true,
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute or relative path to the file to read.' }
    },
    required: ['filePath']
  },
  execute: async (args, context) => {
    try {
      const targetPath = resolvePath(args.filePath);
      const content = await fs.promises.readFile(targetPath, 'utf-8');
      return `File contents of ${targetPath}:\n\n${content}`;
    } catch (err: any) {
      throw new Error(`Failed to read file: ${err.message}`);
    }
  }
};

export const writeFileTool: ToolDefinition = {
  name: 'writeFile',
  description: 'Writes content to a local file, creating or overwriting it.',
  requiresApproval: true,
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute or relative path to the file.' },
      content: { type: 'string', description: 'The text content to write into the file.' }
    },
    required: ['filePath', 'content']
  },
  execute: async (args, context) => {
    try {
      const targetPath = resolvePath(args.filePath);
      const dir = path.dirname(targetPath);
      await fs.promises.mkdir(dir, { recursive: true });
      await fs.promises.writeFile(targetPath, args.content, 'utf-8');
      return `Successfully wrote file to ${targetPath}`;
    } catch (err: any) {
      throw new Error(`Failed to write file: ${err.message}`);
    }
  }
};

export const runCommandTool: ToolDefinition = {
  name: 'runCommand',
  description: 'Executes a shell command on the local system (macOS/Linux) and returns the standard output. IMPORTANT: NEVER run interactive commands (like vim, nano, or commands with interactive flags like rm -i) as they will hang indefinitely. NEVER use sudo, as it requires a password prompt that will hang the system. Always use non-interactive flags (e.g. rm -f).',
  schema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Command to execute' },
      cwd: { type: 'string', description: 'Working directory. Defaults to project root.' }
    },
    required: ['command']
  },
  requiresApproval: true,
  execute: async (args, context) => {
    if (args.command.trim().startsWith('sudo ') || args.command.includes(' sudo ')) {
      throw new Error('Command execution failed: "sudo" is strictly forbidden because it requires an interactive password prompt which will hang the agent. Do not use sudo.');
    }

    try {
      const cwd = args.cwd ? resolvePath(args.cwd) : process.cwd();
      
      // Verify the cwd exists before trying to run a command in it
      try {
        const stats = await fs.promises.stat(cwd);
        if (!stats.isDirectory()) {
          throw new Error(`The specified cwd is not a directory: ${cwd}`);
        }
      } catch (err: any) {
        if (err.code === 'ENOENT') {
          throw new Error(`The specified cwd does not exist: ${cwd}`);
        }
        throw err;
      }

      const { stdout, stderr } = await execAsync(args.command, { cwd, timeout: 15000 });
      let result = '';
      if (stdout) result += `Standard Output:\n${stdout}\n`;
      if (stderr) result += `Standard Error:\n${stderr}\n`;
      return result.trim() || `Command executed successfully with no output.`;
    } catch (err: any) {
      if (err.killed && err.signal === 'SIGTERM') {
        throw new Error(`Command execution failed: Timeout (15s) exceeded. The command may have been interactive and hung waiting for user input. Do not use interactive commands.`);
      }
      throw new Error(`Command execution failed: ${err.message}\nOutput: ${err.stdout || ''}\nError: ${err.stderr || ''}`);
    }
  }
};

export const exportDocumentTool: ToolDefinition = {
  name: 'exportDocument',
  description: 'Compiles text/data into rich formats like PDF, DOCX, and XLSX.',
  requiresApproval: true,
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute or relative path to the file. Must end in .pdf, .docx, or .xlsx' },
      format: { type: 'string', description: 'The format to generate: "pdf", "docx", or "xlsx"' },
      content: { type: 'string', description: 'The markdown/text content for PDF/DOCX, or JSON array string for XLSX.' }
    },
    required: ['filePath', 'format', 'content']
  },
  execute: async (args, context) => {
    try {
      const targetPath = resolvePath(args.filePath);
      const dir = path.dirname(targetPath);
      await fs.promises.mkdir(dir, { recursive: true });

      if (args.format === 'pdf') {
        return new Promise((resolve, reject) => {
          const doc = new PDFDocument();
          const writeStream = fs.createWriteStream(targetPath);
          doc.pipe(writeStream);
          doc.text(args.content);
          doc.end();
          writeStream.on('finish', () => resolve(`Successfully created PDF at ${targetPath}`));
          writeStream.on('error', reject);
        });
      } else if (args.format === 'docx') {
        const doc = new Document({
          sections: [{
            properties: {},
            children: args.content.split('\n').map((line: string) => new Paragraph({ children: [new TextRun(line)] }))
          }]
        });
        const buffer = await Packer.toBuffer(doc);
        await fs.promises.writeFile(targetPath, buffer);
        return `Successfully created DOCX at ${targetPath}`;
      } else if (args.format === 'xlsx') {
        let data;
        try {
          data = JSON.parse(args.content);
          if (!Array.isArray(data)) throw new Error('Data must be a JSON array');
        } catch (e) {
          throw new Error('For XLSX, content must be a valid JSON array of objects.');
        }
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet('Sheet 1');
        if (data.length > 0) {
          sheet.columns = Object.keys(data[0]).map(key => ({ header: key, key }));
          sheet.addRows(data);
        }
        await workbook.xlsx.writeFile(targetPath);
        return `Successfully created XLSX at ${targetPath}`;
      } else {
        throw new Error(`Unsupported format: ${args.format}`);
      }
    } catch (err: any) {
      throw new Error(`Failed to export document: ${err.message}`);
    }
  }
};

export const generateChartTool: ToolDefinition = {
  name: 'generateChart',
  description: 'Generates a beautiful image of a chart (line, bar, pie, etc.) and saves it as a PNG, JPEG, WEBP, or SVG. Uses the QuickChart API. Pass a valid Chart.js configuration object.',
  requiresApproval: true,
  schema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Absolute path to save the chart image (must end in .png, .jpg, .jpeg, .webp, or .svg)' },
      chartConfig: { type: 'object', description: 'A valid Chart.js configuration object (e.g. {"type": "line", "data": {...}})' }
    },
    required: ['filePath', 'chartConfig']
  },
  execute: async (args, context) => {
    try {
      const targetPath = resolvePath(args.filePath);
      const dir = path.dirname(targetPath);
      await fs.promises.mkdir(dir, { recursive: true });

      let format = 'png';
      const lowerPath = targetPath.toLowerCase();
      if (lowerPath.endsWith('.svg')) format = 'svg';
      else if (lowerPath.endsWith('.jpg') || lowerPath.endsWith('.jpeg')) format = 'jpeg';
      else if (lowerPath.endsWith('.webp')) format = 'webp';
      
      let configObj;
      if (typeof args.chartConfig === 'object') {
        configObj = args.chartConfig;
      } else if (typeof args.chartConfig === 'string') {
        const str = args.chartConfig.trim();
        try {
          // First attempt strict JSON parse
          configObj = JSON.parse(str);
        } catch (e1: any) {
          try {
            // Fallback: evaluate as Javascript object literal.
            // This handles unquoted keys, single quotes, and trailing commas that LLMs often generate.
            configObj = new Function('return ' + str)();
          } catch (e2: any) {
             // If it still fails, it might be missing trailing braces due to generation cutoff
             try {
                configObj = new Function('return ' + str + '}')();
             } catch (e3) {
                try {
                   configObj = new Function('return ' + str + '}}')();
                } catch (e4) {
                   try {
                      configObj = new Function('return ' + str + ']}}')();
                   } catch (e5) {
                      throw new Error('chartConfig must be a valid JSON object or JS literal: ' + e1.message);
                   }
                }
             }
          }
        }
      } else {
        throw new Error('chartConfig must be a valid JSON object.');
      }

      const url = `https://quickchart.io/chart?format=${format}&c=${encodeURIComponent(JSON.stringify(configObj))}`;
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`QuickChart API error: ${response.statusText}`);
      }

      if (format === 'svg') {
        const svgContent = await response.text();
        await fs.promises.writeFile(targetPath, svgContent, 'utf-8');
      } else {
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        await fs.promises.writeFile(targetPath, buffer);
      }

      return `Successfully generated and saved chart to ${targetPath}`;
    } catch (err: any) {
      throw new Error(`Failed to generate chart: ${err.message}`);
    }
  }
};

export const executeAppleScriptTool: ToolDefinition = {
  name: 'executeAppleScript',
  description: 'Executes AppleScript code to control macOS applications, open apps, or perform UI automation. IMPORTANT: When sending keystrokes or using System Events, you MUST bring the target app to the foreground first using `tell application "AppName" to activate`, otherwise keystrokes will go to the wrong app and silently fail!',
  schema: {
    type: 'object',
    properties: {
      script: { type: 'string', description: 'The raw AppleScript code to execute.' }
    },
    required: ['script']
  },
  requiresApproval: true,
  execute: async (args, context) => {
    try {
      const tmpPath = path.join(os.tmpdir(), `jarvis_script_${Date.now()}.scpt`);
      await fs.promises.writeFile(tmpPath, args.script, 'utf8');
      
      const { stdout, stderr } = await execAsync(`osascript "${tmpPath}"`, { timeout: 15000 });
      
      // Cleanup
      await fs.promises.unlink(tmpPath).catch(() => {});
      
      let result = '';
      if (stdout) result += `Output:\n${stdout}\n`;
      if (stderr) result += `Error:\n${stderr}\n`;
      return result.trim() || `AppleScript executed successfully.`;
    } catch (err: any) {
      if (err.message.includes('Not authorized to send Apple events') || err.message.includes('System Events got an error') || err.message.includes('not allowed to send')) {
        throw new Error('AppleScript execution blocked by macOS Security. TELL THE USER: "I cannot control this app because the Terminal/IDE running JARVIS needs Accessibility and Automation permissions. Please go to macOS System Settings > Privacy & Security > Accessibility, and grant permission."');
      }
      throw new Error(`AppleScript execution failed: ${err.message}`);
    }
  }
};

export const openBrowserTool: ToolDefinition = {
  name: 'openBrowser',
  description: "Opens a URL or performs a web search in the user's browser. Automatically handles URL encoding for search queries.",
  schema: {
    type: 'object',
    properties: {
      queryOrUrl: { type: 'string', description: 'The URL to open, or the search query string.' },
      browser: { type: 'string', description: 'Optional. Specific browser to use (e.g., "Google Chrome", "Safari").' }
    },
    required: ['queryOrUrl']
  },
  requiresApproval: true,
  execute: async (args, context) => {
    try {
      let finalUrl = args.queryOrUrl;
      if (!finalUrl.startsWith('http') && !finalUrl.includes('://')) {
        finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
      }
      
      let cmd = '';
      if (os.platform() === 'darwin') {
        cmd = args.browser ? `open -a "${args.browser}" "${finalUrl}"` : `open "${finalUrl}"`;
      } else if (os.platform() === 'win32') {
        cmd = `start "" "${finalUrl}"`;
      } else {
        cmd = `xdg-open "${finalUrl}"`;
      }
      
      await execAsync(cmd, { timeout: 10000 });
      return `Successfully opened ${finalUrl} in the browser.`;
    } catch (err: any) {
      throw new Error(`Failed to open browser: ${err.message}`);
    }
  }
};

export const playSpotifyTool: ToolDefinition = {
  name: 'playSpotify',
  description: "Instantly plays the user's Liked Songs or a specific track URI on Spotify (macOS only).",
  schema: {
    type: 'object',
    properties: {
      uri: { type: 'string', description: 'The Spotify URI to play. Defaults to "spotify:collection:tracks" (Liked Songs).' }
    }
  },
  requiresApproval: true,
  execute: async (args, context) => {
    if (os.platform() !== 'darwin') {
      throw new Error('This tool is currently only supported on macOS.');
    }
    const targetUri = args.uri || 'spotify:collection:tracks';
    try {
      const script = `tell application "Spotify" to play track "${targetUri}"`;
      const tmpPath = path.join(os.tmpdir(), `spotify_script_${Date.now()}.scpt`);
      await fs.promises.writeFile(tmpPath, script, 'utf8');
      await execAsync(`osascript "${tmpPath}"`, { timeout: 10000 });
      await fs.promises.unlink(tmpPath).catch(() => {});
      return `Successfully played ${targetUri} on Spotify.`;
    } catch (err: any) {
      throw new Error(`Failed to control Spotify: ${err.message}. Make sure Spotify is open.`);
    }
  }
};

export const sendWhatsAppMessageTool: ToolDefinition = {
  name: 'sendWhatsAppMessage',
  description: 'Natively opens WhatsApp and sends a message to a specific contact. Use this INSTEAD of AppleScript whenever the user asks to send a WhatsApp message.',
  schema: {
    type: 'object',
    properties: {
      contactName: { type: 'string', description: 'The name of the contact to message.' },
      message: { type: 'string', description: 'The text message to send.' }
    },
    required: ['contactName', 'message']
  },
  requiresApproval: true,
  execute: async (args, context) => {
    if (os.platform() !== 'darwin') {
      throw new Error('This tool is currently only supported on macOS.');
    }
    try {
      // Escape quotes and backslashes for AppleScript
      const safeContact = args.contactName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      const safeMessage = args.message.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      
      const script = `
        tell application "WhatsApp" to activate
        delay 1.5
        
        tell application "System Events"
          tell process "WhatsApp"
            set frontmost to true
            delay 1
            
            -- Open New Chat
            keystroke "n" using command down
            delay 2.5
            
            -- Paste contact name
            set the clipboard to "${safeContact}"
            keystroke "v" using command down
            delay 4
            
            -- Select contact
            key code 125 -- Down arrow
            delay 0.5
            key code 36 -- Return key
            delay 2.5
            
            -- Paste message and send
            set the clipboard to "${safeMessage}"
            keystroke "v" using command down
            delay 1
            key code 36 -- Return key
          end tell
        end tell
      `;
      
      const tmpPath = path.join(os.tmpdir(), `whatsapp_script_${Date.now()}.scpt`);
      await fs.promises.writeFile(tmpPath, script, 'utf8');
      await execAsync(`osascript "${tmpPath}"`, { timeout: 15000 });
      await fs.promises.unlink(tmpPath).catch(() => {});
      
      return `Successfully sent message to ${args.contactName} on WhatsApp.`;
    } catch (err: any) {
      if (err.message.includes('Not authorized to send Apple events')) {
        throw new Error('AppleScript execution blocked by macOS Security. Please grant Terminal Accessibility permissions.');
      }
      throw new Error(`Failed to send WhatsApp message: ${err.message}`);
    }
  }
};

export const makeWhatsAppCallTool: ToolDefinition = {
  name: 'makeWhatsAppCall',
  description: 'Natively opens WhatsApp and initiates an audio or video call to a specific contact. Use this INSTEAD of AppleScript whenever the user asks to call someone on WhatsApp.',
  schema: {
    type: 'object',
    properties: {
      contactName: { type: 'string', description: 'The name of the contact to call.' },
      callType: { type: 'string', enum: ['audio', 'video'], description: 'The type of call to make.' }
    },
    required: ['contactName', 'callType']
  },
  requiresApproval: true,
  execute: async (args, context) => {
    if (os.platform() !== 'darwin') {
      throw new Error('This tool is currently only supported on macOS.');
    }
    try {
      const safeContact = args.contactName.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      
      // Determine the shortcut letter: 'a' for Audio, 'v' for Video
      const shortcutKey = args.callType === 'video' ? 'v' : 'a';
      
      const script = `
        tell application "WhatsApp" to activate
        delay 1.5
        
        tell application "System Events"
          tell process "WhatsApp"
            set frontmost to true
            delay 1
            
            -- Open New Chat
            keystroke "n" using command down
            delay 2.5
            
            -- Paste contact name
            set the clipboard to "${safeContact}"
            keystroke "v" using command down
            delay 4
            
            -- Select contact
            key code 125 -- Down arrow
            delay 0.5
            key code 36 -- Return key
            delay 2.5
            
            -- Initiate Call
            if "${args.callType}" is "video" then
              try
                click menu item "Video Call" of menu "Call" of menu bar 1
              end try
              delay 0.5
              keystroke "v" using {command down, shift down}
            else
              try
                click menu item "Voice Call" of menu "Call" of menu bar 1
              end try
              delay 0.5
              keystroke "d" using {command down, shift down}
              delay 0.5
              keystroke "a" using {command down, shift down}
            end if
          end tell
        end tell
      `;
      
      const tmpPath = path.join(os.tmpdir(), `whatsapp_call_script_${Date.now()}.scpt`);
      await fs.promises.writeFile(tmpPath, script, 'utf8');
      await execAsync(`osascript "${tmpPath}"`, { timeout: 15000 });
      await fs.promises.unlink(tmpPath).catch(() => {});
      
      return `Successfully initiated WhatsApp ${args.callType} call to ${args.contactName}.`;
    } catch (err: any) {
      if (err.message.includes('Not authorized to send Apple events')) {
        throw new Error('AppleScript execution blocked by macOS Security. Please grant Terminal Accessibility permissions.');
      }
      throw new Error(`Failed to initiate WhatsApp call: ${err.message}`);
    }
  }
};
