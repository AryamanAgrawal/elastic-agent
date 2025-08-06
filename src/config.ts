import * as fs from 'fs';
import * as path from 'path';

export interface Config {
  openaiApiKey: string;
  elasticsearchUrl: string;
  elasticsearchUsername?: string;
  elasticsearchPassword?: string;
  aiProvider: 'openai' | 'ai-sdk'; // Choose between 'openai' (original) and 'ai-sdk' (new)
  aiModel?: string; // Optional model override (defaults to gpt-4o)
}

export function loadConfig(): Config {
  // Try to load from .env file
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const envLines = envContent.split('\n');
    
    for (const line of envLines) {
      const [key, value] = line.split('=');
      if (key && value) {
        process.env[key.trim()] = value.trim();
      }
    }
  }

  const config: Config = {
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    elasticsearchUrl: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    elasticsearchUsername: process.env.ELASTICSEARCH_USERNAME,
    elasticsearchPassword: process.env.ELASTICSEARCH_PASSWORD,
    aiProvider: (process.env.AI_PROVIDER as 'openai' | 'ai-sdk') || 'openai',
    aiModel: process.env.AI_MODEL || 'gpt-4o'
  };

  if (!config.openaiApiKey) {
    throw new Error('OPENAI_API_KEY is required. Please set it as an environment variable or in a .env file.');
  }

  return config;
}