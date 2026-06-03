import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function ensureApiConfig(): Promise<void> {
  const envPath = path.join(__dirname, '..', '..', '..', '.env');
  
  // If .env already exists or key is in environment, skip wizard
  if (fs.existsSync(envPath) || process.env.OPENAI_API_KEY) {
    return;
  }

  console.log('\n====================================================');
  console.log('         JARVIS-AI INITIAL SETUP WIZARD            ');
  console.log('====================================================');
  console.log('No API Configuration detected. Let\'s set it up.\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (query: string): Promise<string> => {
    return new Promise(resolve => rl.question(query, resolve));
  };

  try {
    console.log('Select your AI Model Provider:');
    console.log('1) OpenAI (Default)');
    console.log('2) NVIDIA NIM');
    console.log('3) Custom Endpoint (Ollama, OpenRouter, etc.)');
    
    const choice = await question('\nEnter choice (1-3) [default: 1]: ');
    let apiKey = '';
    let baseUrl = '';
    let defaultModel = '';

    if (choice === '2') {
      apiKey = await question('Enter your NVIDIA API Key: ');
      baseUrl = 'https://integrate.api.nvidia.com/v1';
      defaultModel = 'meta/llama-3.1-70b-instruct';
    } else if (choice === '3') {
      apiKey = await question('Enter your API Key: ');
      baseUrl = await question('Enter Endpoint Base URL (e.g., http://localhost:11434/v1): ');
      defaultModel = await question('Enter Model name: ');
    } else {
      apiKey = await question('Enter your OpenAI API Key: ');
      defaultModel = 'gpt-4o';
    }

    const envContent = `OPENAI_API_KEY=${apiKey.trim()}
${baseUrl ? `OPENAI_BASE_URL=${baseUrl.trim()}` : ''}
DEFAULT_MODEL=${defaultModel.trim()}
`;

    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log(`\nConfig saved successfully to: ${envPath}`);
    
    // Inject into process.env for this session
    process.env.OPENAI_API_KEY = apiKey.trim();
    if (baseUrl) process.env.OPENAI_BASE_URL = baseUrl.trim();
    process.env.DEFAULT_MODEL = defaultModel.trim();
    
    console.log('====================================================\n');
  } finally {
    rl.close();
  }
}
