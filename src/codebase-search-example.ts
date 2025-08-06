#!/usr/bin/env node

import { ElasticClient } from './elastic-client';
import { loadConfig } from './config';

/**
 * Advanced codebase search examples
 */
async function advancedSearchExamples() {
  try {
    const config = loadConfig();
    const client = new ElasticClient(
      config.elasticsearchUrl,
      config.elasticsearchUsername,
      config.elasticsearchPassword
    );

    console.log('🔍 Advanced Codebase Search Examples\n');

    // 1. Basic search for authentication
    console.log('1. 🔐 Finding authentication-related code...');
    const authResults = await client.searchCodebase('authentication');
    console.log(`   Found ${authResults.hits.total.value} auth-related files:`);
    authResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.file_path})`);
    });
    console.log();

    // 2. Find TypeScript files
    console.log('2. 🎯 Finding TypeScript files...');
    const tsResults = await client.search({
      index: 'codebase-store',
      query: {
        term: { extension: 'ts' }
      },
      size: 5
    });
    
    console.log(`   Found ${tsResults.hits.total.value} TypeScript files:`);
    tsResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.file_path})`);
    });
    console.log();

    // 3. Find database-related files
    console.log('3. 🗄️  Finding database-related files...');
    const dbResults = await client.searchCodebase('database');
    console.log(`   Found ${dbResults.hits.total.value} database-related files:`);
    dbResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.element_type})`);
    });
    console.log();

    // 4. Find configuration files
    console.log('4. ⚙️  Finding configuration files...');
    const configResults = await client.search({
      index: 'codebase-store',
      query: {
        bool: {
          should: [
            { term: { element_type: 'configuration' } },
            { match: { name: 'config' } }
          ]
        }
      },
      size: 5
    });
    
    console.log(`   Found ${configResults.hits.total.value} configuration files:`);
    configResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.file_path})`);
    });
    console.log();

    // 5. Find class definitions
    console.log('5. 🏗️  Finding class definitions...');
    const classResults = await client.searchCodebase('class');
    console.log(`   Found ${classResults.hits.total.value} files with classes:`);
    classResults.hits.hits.forEach((hit: any, index: number) => {
      const classes = hit._source.metadata?.classes || [];
      console.log(`   ${index + 1}. ${hit._source.name}: [${classes.join(', ')}]`);
    });
    console.log();

    // 6. Search for API controllers
    console.log('6. 🌐 Finding API controllers...');
    const controllerResults = await client.searchCodebase('Controller API');
    console.log(`   Found ${controllerResults.hits.total.value} controller files:`);
    controllerResults.hits.hits.forEach((hit: any, index: number) => {
      console.log(`   ${index + 1}. ${hit._source.name} (${hit._source.element_type})`);
    });
    console.log();

    // 7. Basic repository statistics
    console.log('7. 📊 Basic repository statistics...');
    const allFiles = await client.search({
      index: 'codebase-store',
      query: { match_all: {} },
      size: 0
    });
    
    console.log(`   📈 Repository Statistics:`);
    console.log(`      Total files: ${allFiles.hits.total.value}`);
    console.log();

    console.log('✅ Advanced search examples completed!');
    console.log('\n🎯 Next steps:');
    console.log('- Modify these queries for your specific needs');
    console.log('- Build custom dashboards in Kibana');
    console.log('- Create automated code analysis workflows');

  } catch (error) {
    console.error('❌ Search examples failed:', error);
  }
}

if (require.main === module) {
  advancedSearchExamples();
}

export { advancedSearchExamples };