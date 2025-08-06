#!/usr/bin/env node

import { ElasticClient } from './elastic-client';
import { loadConfig } from './config';

async function setupDatabase() {
  try {
    console.log('🚀 Setting up Elasticsearch database...');
    
    // Load configuration
    const config = loadConfig();
    console.log(`📡 Connecting to Elasticsearch at: ${config.elasticsearchUrl}`);
    
    // Create Elasticsearch client
    const client = new ElasticClient(
      config.elasticsearchUrl,
      config.elasticsearchUsername,
      config.elasticsearchPassword
    );

    // Test connection
    console.log('🔗 Testing connection...');
    const indices = await client.getIndices();
    console.log(`✅ Connected successfully! Found ${indices.length} existing indices.`);

    // Create codebase index
    console.log('📊 Creating codebase index...');
    await client.createCodebaseIndex();
    
    // Verify index creation
    const newIndices = await client.getIndices();
    console.log(`📋 Current indices: ${newIndices.join(', ')}`);

    console.log('✅ Database setup completed successfully!');
    console.log('\n🎯 Next steps:');
    console.log('1. Use client.indexDocument() to add codebase documents');
    console.log('2. Use client.searchCodebase() to search your codebase');
    console.log('3. Visit http://localhost:5601 to access Kibana dashboard');

  } catch (error) {
    console.error('❌ Setup failed:', error);
    process.exit(1);
  }
}

// Sample data for testing
async function addSampleData() {
  try {
    const config = loadConfig();
    const client = new ElasticClient(
      config.elasticsearchUrl,
      config.elasticsearchUsername,
      config.elasticsearchPassword
    );

    console.log('📝 Adding sample codebase data...');

    const sampleDocuments = [
      {
        id: 'sample-1',
        document: {
          name: 'UserService.ts',
          content: 'export class UserService {\n  async getUser(id: string): Promise<User> {\n    return await this.userRepository.findById(id);\n  }\n}',
          repository: 'my-app',
          file_path: 'src/services/UserService.ts',
          extension: 'ts',
          element_type: 'class',
          element_id: 'UserService',
          metadata: {
            functions: ['getUser'],
            imports: ['User']
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      },
      {
        id: 'sample-2',
        document: {
          name: 'database.config.js',
          content: 'module.exports = {\n  host: process.env.DB_HOST || "localhost",\n  port: process.env.DB_PORT || 5432,\n  database: "myapp"\n};',
          repository: 'my-app',
          file_path: 'config/database.config.js',
          extension: 'js',
          element_type: 'configuration',
          element_id: 'database-config',
          metadata: {
            env_vars: ['DB_HOST', 'DB_PORT']
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      }
    ];

    await client.bulkIndexDocuments(sampleDocuments);
    console.log('✅ Sample data added successfully!');

    // Test search
    console.log('🔍 Testing search...');
    const searchResult = await client.searchCodebase('UserService');
    console.log(`Found ${searchResult.hits.total.value} results for "UserService"`);

  } catch (error) {
    console.error('❌ Failed to add sample data:', error);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--sample-data')) {
    await setupDatabase();
    await addSampleData();
  } else {
    await setupDatabase();
  }
}

if (require.main === module) {
  main();
}

export { setupDatabase, addSampleData };