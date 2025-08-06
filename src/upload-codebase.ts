#!/usr/bin/env node

import * as path from 'path';
import * as fs from 'fs';
import { ElasticClient } from './elastic-client';
import { CodebaseUploader, UploadOptions } from './codebase-uploader';
import { loadConfig } from './config';

interface CLIOptions {
  codebasePath: string;
  repositoryName?: string;
  generateEmbeddings?: boolean;
  batchSize?: number;
  maxFileSize?: number;
  includePatterns?: string[];
  excludePatterns?: string[];
  preview?: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  const options: CLIOptions = {
    codebasePath: ''
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--path':
      case '-p':
        options.codebasePath = nextArg;
        i++;
        break;
      
      case '--repo':
      case '-r':
        options.repositoryName = nextArg;
        i++;
        break;
      
      case '--embeddings':
      case '-e':
        options.generateEmbeddings = true;
        break;
      
      case '--batch-size':
      case '-b':
        options.batchSize = parseInt(nextArg);
        i++;
        break;
      
      case '--max-size':
      case '-s':
        options.maxFileSize = parseInt(nextArg) * 1024; // Convert KB to bytes
        i++;
        break;
      
      case '--include':
      case '-i':
        options.includePatterns = nextArg.split(',');
        i++;
        break;
      
      case '--exclude':
      case '-x':
        options.excludePatterns = nextArg.split(',');
        i++;
        break;
      
      case '--preview':
        options.preview = true;
        break;
      
      default:
        if (!arg.startsWith('--') && !arg.startsWith('-') && !options.codebasePath) {
          options.codebasePath = arg;
        }
    }
  }

  if (!options.codebasePath) {
    console.error('❌ Error: Codebase path is required');
    printHelp();
    process.exit(1);
  }

  return options;
}

function printHelp() {
  console.log(`
🚀 Codebase Uploader for Elasticsearch

Upload an entire codebase to your Elasticsearch instance with intelligent parsing,
metadata extraction, and optional semantic embeddings.

USAGE:
  npm run upload-codebase -- --path <codebase-path> [options]
  npm run upload-codebase -- <codebase-path> [options]

OPTIONS:
  --path, -p <path>        Path to the codebase directory (required)
  --repo, -r <name>        Repository name (default: directory name)
  --embeddings, -e         Generate OpenAI embeddings for semantic search
  --batch-size, -b <num>   Number of files to process in each batch (default: 50)
  --max-size, -s <kb>      Maximum file size in KB to process (default: 1024)
  --include, -i <patterns> Comma-separated include patterns (e.g., "*.ts,*.js")
  --exclude, -x <patterns> Comma-separated exclude patterns
  --preview                Preview files that would be uploaded without uploading
  --help, -h               Show this help message

EXAMPLES:
  # Upload current directory
  npm run upload-codebase -- ./

  # Upload with custom repository name
  npm run upload-codebase -- --path ./my-app --repo "MyAwesomeApp"

  # Upload with semantic embeddings
  npm run upload-codebase -- --path ./my-app --embeddings

  # Upload only TypeScript and JavaScript files
  npm run upload-codebase -- --path ./my-app --include "*.ts,*.js,*.tsx,*.jsx"

  # Exclude additional patterns
  npm run upload-codebase -- --path ./my-app --exclude "tests/**,*.spec.ts"

  # Preview mode (see what would be uploaded)
  npm run upload-codebase -- --path ./my-app --preview

ENVIRONMENT:
  Make sure your .env file contains:
  - OPENAI_API_KEY=your_key_here (required for embeddings)
  - ELASTICSEARCH_URL=http://localhost:9200

DEFAULT EXCLUSIONS:
  - node_modules, .git, dist, build directories
  - Binary files (.exe, .dll, images, videos, etc.)
  - Log files, temp files, lock files
  - Large/minified files
`);
}

async function previewUpload(uploader: CodebaseUploader, codebasePath: string, options: UploadOptions) {
  console.log('👀 Preview Mode - Files that would be uploaded:\n');
  
  // We'll need to access the private walkDirectory method
  // For now, let's create a simple preview
  const fs = require('fs');
  const path = require('path');
  
  function walkDir(dirPath: string, currentDepth = 0): void {
    const maxDepth = 3; // Limit depth for preview
    if (currentDepth > maxDepth) return;
    
    try {
      const items = fs.readdirSync(dirPath);
      
      for (const item of items) {
        const fullPath = path.join(dirPath, item);
        const relativePath = path.relative(codebasePath, fullPath);
        const stats = fs.statSync(fullPath);
        
        if (stats.isDirectory()) {
          console.log('  '.repeat(currentDepth) + `📁 ${relativePath}/`);
          if (currentDepth < 2) walkDir(fullPath, currentDepth + 1);
        } else if (stats.isFile()) {
          const ext = path.extname(fullPath);
          const sizeMB = (stats.size / 1024 / 1024).toFixed(2);
          console.log('  '.repeat(currentDepth) + `📄 ${relativePath} (${sizeMB}MB, ${ext})`);
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dirPath}:`, error);
    }
  }
  
  walkDir(codebasePath);
  console.log('\nℹ️  This is a simplified preview. Actual upload will apply all filters and exclusions.');
}

async function main() {
  try {
    const cliOptions = parseArgs();
    
    // Resolve path
    const codebasePath = path.resolve(cliOptions.codebasePath);
    
    // Validate path
    if (!fs.existsSync(codebasePath)) {
      console.error(`❌ Error: Path does not exist: ${codebasePath}`);
      process.exit(1);
    }
    
    if (!fs.statSync(codebasePath).isDirectory()) {
      console.error(`❌ Error: Path is not a directory: ${codebasePath}`);
      process.exit(1);
    }
    
    // Load configuration
    const config = loadConfig();
    
    // Create clients
    const elasticClient = new ElasticClient(
      config.elasticsearchUrl,
      config.elasticsearchUsername,
      config.elasticsearchPassword
    );
    
    const uploader = new CodebaseUploader(
      elasticClient,
      cliOptions.generateEmbeddings ? config.openaiApiKey : undefined
    );
    
    // Prepare upload options
    const uploadOptions: UploadOptions = {
      repositoryName: cliOptions.repositoryName || path.basename(codebasePath),
      generateEmbeddings: cliOptions.generateEmbeddings || false,
      batchSize: cliOptions.batchSize || 50,
      maxFileSize: cliOptions.maxFileSize || 1024 * 1024,
      includePatterns: cliOptions.includePatterns || [],
      excludePatterns: cliOptions.excludePatterns || []
    };
    
    // Show configuration
    console.log('⚙️  Configuration:');
    console.log(`   📍 Path: ${codebasePath}`);
    console.log(`   📦 Repository: ${uploadOptions.repositoryName}`);
    console.log(`   🧠 Embeddings: ${uploadOptions.generateEmbeddings ? '✅' : '❌'}`);
    console.log(`   📊 Batch size: ${uploadOptions.batchSize}`);
    console.log(`   📏 Max file size: ${(uploadOptions.maxFileSize! / 1024).toFixed(0)}KB`);
    if (uploadOptions.includePatterns!.length > 0) {
      console.log(`   ✅ Include: ${uploadOptions.includePatterns!.join(', ')}`);
    }
    if (uploadOptions.excludePatterns!.length > 0) {
      console.log(`   ❌ Exclude: ${uploadOptions.excludePatterns!.join(', ')}`);
    }
    console.log();
    
    // Preview mode
    if (cliOptions.preview) {
      await previewUpload(uploader, codebasePath, uploadOptions);
      return;
    }
    
    // Test Elasticsearch connection
    console.log('🔗 Testing Elasticsearch connection...');
    try {
      const indices = await elasticClient.getIndices();
      console.log(`✅ Connected to Elasticsearch (${indices.length} indices found)`);
    } catch (error) {
      console.error('❌ Failed to connect to Elasticsearch:', error);
      console.log('💡 Make sure Elasticsearch is running: npm run docker:up');
      process.exit(1);
    }
    
    // Warning for embeddings
    if (uploadOptions.generateEmbeddings) {
      if (!config.openaiApiKey) {
        console.error('❌ OpenAI API key is required for embeddings. Please set OPENAI_API_KEY in your .env file.');
        process.exit(1);
      }
      console.log('⚠️  Generating embeddings will make API calls to OpenAI and may incur costs.');
    }
    
    // Start upload
    console.log('🚀 Starting upload...\n');
    const startTime = Date.now();
    
    const result = await uploader.uploadCodebase(codebasePath, uploadOptions);
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Show results
    console.log(`\n📊 Upload Results (${duration}s):`);
    console.log(`   🔍 Total files found: ${result.totalFiles}`);
    console.log(`   ✅ Files indexed: ${result.indexedFiles}`);
    console.log(`   ❌ Errors: ${result.errors.length}`);
    
    if (result.errors.length > 0 && result.errors.length < 10) {
      console.log('\n❌ Errors:');
      result.errors.forEach(error => console.log(`   ${error}`));
    } else if (result.errors.length >= 10) {
      console.log('\n❌ Many errors occurred. Check the console output above for details.');
    }
    
    if (result.success) {
      console.log('\n🎉 Upload completed successfully!');
      console.log(`\n🔍 Try searching your codebase:`);
      console.log(`   npm run example`);
      console.log(`   Visit http://localhost:5601 for Kibana dashboard`);
    } else {
      console.log('\n⚠️  Upload completed with errors. Some files may not have been indexed.');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Upload failed:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { main as uploadCodebase };