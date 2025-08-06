#!/usr/bin/env node

import * as readline from 'readline';
import { AIAgent } from './ai-agent';
import { ElasticClient } from './elastic-client';
import { loadConfig } from './config';

class ElasticAIAgentCLI {
  private agent: AIAgent;
  private rl: readline.Interface;

  constructor() {
    // Load configuration
    const config = loadConfig();
    
    // Initialize Elasticsearch client
    const elasticClient = new ElasticClient(
      config.elasticsearchUrl,
      config.elasticsearchUsername,
      config.elasticsearchPassword
    );

    // Initialize AI agent with provider configuration
    this.agent = new AIAgent({
      apiKey: config.openaiApiKey,
      provider: config.aiProvider,
      model: config.aiModel
    }, elasticClient);
    
    // Setup streaming callback for real-time output
    this.agent.onStreamingContent = (content: string) => {
      process.stdout.write(content);
    };

    // Setup readline interface
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
  }

  async start(): Promise<void> {
    const config = loadConfig();
    console.log('🤖 Elastic AI Agent Started!');
    console.log(`🧠 Using AI Provider: ${config.aiProvider} (${config.aiModel})`);
    console.log('Ask me anything about your Elasticsearch data.');
    console.log('Type "exit" to quit.\n');

    while (true) {
      try {
        const query = await this.askQuestion('🔍 Your question: ');
        
        if (query.toLowerCase() === 'exit') {
          console.log('👋 Goodbye!');
          break;
        }

        if (query.trim() === '') {
          console.log('Please enter a valid question.\n');
          continue;
        }

        console.log('\n🧠 Processing your query...');
        
        const response = await this.agent.processQuery(query);
        
        // Only show final response box if there was no streaming content
        if (response && !response.includes('💭 AI Agent:')) {
          console.log('\n📋 Final Response:');
          console.log('=' .repeat(50));
          console.log(response);
          console.log('=' .repeat(50));
        } else {
          console.log('\n' + '=' .repeat(50));
        }
        console.log();

      } catch (error) {
        console.error('❌ An error occurred:', error instanceof Error ? error.message : 'Unknown error');
        console.log();
      }
    }

    this.cleanup();
  }

  private askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  private cleanup(): void {
    this.rl.close();
  }
}

// Handle process termination gracefully
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

// Start the CLI application
async function main() {
  try {
    const cli = new ElasticAIAgentCLI();
    await cli.start();
  } catch (error) {
    console.error('Failed to start the application:', error instanceof Error ? error.message : 'Unknown error');
    console.log('\nMake sure you have:');
    console.log('1. Set your OPENAI_API_KEY environment variable');
    console.log('2. Configured your Elasticsearch connection');
    console.log('3. Run "npm install" to install dependencies');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}