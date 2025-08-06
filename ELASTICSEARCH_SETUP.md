# Elasticsearch Codebase Database Setup

This guide will help you set up a sample Elasticsearch database configured for storing and searching codebases.

## Quick Start

### 1. Prerequisites

Make sure you have Docker and Docker Compose installed on your system.

### 2. Environment Setup

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit the `.env` file with your OpenAI API key:

```env
OPENAI_API_KEY=your_openai_api_key_here
ELASTICSEARCH_URL=http://localhost:9200
```

### 3. Start Elasticsearch

Start the Elasticsearch and Kibana containers:

```bash
npm run docker:up
```

This will start:
- **Elasticsearch** on `http://localhost:9200`
- **Kibana Dashboard** on `http://localhost:5601`

Wait for the services to be ready (usually 1-2 minutes).

### 4. Setup Database and Index

Create the codebase index:

```bash
npm run setup-db
```

Or create the index with sample data:

```bash
npm run setup-db-with-sample
```

## Index Configuration

The codebase index (`codebase-store`) is configured with:

### Analyzers
- **Code Analyzer**: Handles camelCase, file paths, and code-specific tokenization
- **Path Filter**: Converts file paths for better searching

### Document Structure
```typescript
{
  vector: number[],          // 768-dimensional embedding vector
  name: string,              // File or element name
  content: string,           // Code content
  repository: string,        // Repository name
  file_path: string,         // Full file path
  extension: string,         // File extension
  element_id: string,        // Unique element identifier
  element_type: string,      // function, class, variable, etc.
  metadata: object,          // Additional metadata
  created_at: Date,          // Creation timestamp
  updated_at: Date           // Last update timestamp
}
```

## Uploading Your Codebase

### Quick Upload

Upload your entire codebase with one command:

```bash
# Upload current directory
npm run upload-codebase -- ./

# Upload with custom repository name
npm run upload-codebase -- --path ./my-app --repo "MyAwesomeApp"

# Upload with semantic embeddings (requires OpenAI API key)
npm run upload-codebase -- --path ./my-app --embeddings

# Preview what would be uploaded
npm run upload-codebase -- --path ./my-app --preview
```

### Advanced Upload Options

```bash
# Upload only specific file types
npm run upload-codebase -- --path ./my-app --include "*.ts,*.js,*.tsx,*.jsx"

# Exclude additional patterns
npm run upload-codebase -- --path ./my-app --exclude "tests/**,*.spec.ts,temp/**"

# Custom batch size and file size limits
npm run upload-codebase -- --path ./my-app --batch-size 100 --max-size 2048

# Full example with all options
npm run upload-codebase -- \
  --path ./my-large-project \
  --repo "Enterprise App" \
  --embeddings \
  --batch-size 25 \
  --max-size 1024 \
  --include "*.ts,*.js,*.py" \
  --exclude "node_modules/**,dist/**,*.test.*"
```

### What Gets Uploaded

The uploader intelligently parses your codebase and extracts:

- **File metadata**: Size, line count, language detection
- **Code elements**: Functions, classes, imports, exports
- **Smart filtering**: Excludes binaries, dependencies, build artifacts
- **Embeddings**: Optional semantic vectors for AI-powered search
- **Repository context**: File paths, relationships, timestamps

### Supported Languages

- **JavaScript/TypeScript**: Functions, classes, imports, exports
- **Python**: Functions, classes, imports
- **Java/C#**: Methods, classes
- **Configuration**: JSON, YAML, TOML, etc.
- **Documentation**: Markdown, text files
- **Databases**: SQL files
- **Frontend**: HTML, CSS, SCSS, Vue, Svelte

## Usage Examples

### Basic Document Indexing

```typescript
import { ElasticClient } from './src/elastic-client';
import { CodebaseUploader } from './src/codebase-uploader';
import { loadConfig } from './src/config';

const config = loadConfig();
const client = new ElasticClient(config.elasticsearchUrl);
const uploader = new CodebaseUploader(client, config.openaiApiKey);

// Upload entire codebase
await uploader.uploadCodebase('./my-project', {
  repositoryName: 'My Project',
  generateEmbeddings: true,
  batchSize: 50
});
```

### Advanced Searching

```bash
# Run advanced search examples
npm run search-examples
```

```typescript
// Search for React components
const reactComponents = await client.search({
  index: 'codebase-store',
  query: {
    bool: {
      must: [
        { match: { content: 'React' } },
        { terms: { extension: ['ts', 'tsx'] } }
      ]
    }
  }
});

// Find complex files
const complexFiles = await client.search({
  index: 'codebase-store',
  query: {
    range: {
      'metadata.complexity_score': { gte: 20 }
    }
  },
  sort: [{ 'metadata.complexity_score': { order: 'desc' } }]
});

// Search by function names
const authFunctions = await client.searchCodebase('authentication login');
```

## Management Commands

```bash
# Docker & Setup
npm run docker:up              # Start Elasticsearch & Kibana
npm run docker:down            # Stop containers
npm run docker:logs            # View container logs
npm run setup-db               # Create index only
npm run setup-db-with-sample   # Create index + sample data

# Codebase Operations
npm run upload-codebase        # Upload codebase to Elasticsearch
npm run example                # Run basic usage examples
npm run search-examples        # Run advanced search examples

# Development
npm run dev                    # Start the AI agent
npm run build                  # Build TypeScript
npm run start                  # Run built application
```

## Kibana Dashboard

Access Kibana at `http://localhost:5601` to:
- Visualize your codebase data
- Create custom dashboards
- Monitor search performance
- Browse index contents

## Troubleshooting

### Connection Issues
1. Make sure Docker containers are running: `docker ps`
2. Check Elasticsearch health: `curl http://localhost:9200/_cluster/health`
3. View container logs: `npm run docker:logs`

### Index Issues
```bash
# Delete and recreate index
curl -X DELETE "localhost:9200/codebase-store"
npm run setup-db
```

### Memory Issues
If Elasticsearch fails to start, increase Docker memory allocation to at least 4GB.

## Complete Workflow Example

### 1. Setup Environment
```bash
# Start Elasticsearch & Kibana
npm run docker:up

# Create your .env file
echo "OPENAI_API_KEY=your_key_here" > .env
echo "ELASTICSEARCH_URL=http://localhost:9200" >> .env
```

### 2. Initialize Database
```bash
# Setup the codebase index
npm run setup-db
```

### 3. Upload Your Codebase
```bash
# Upload with embeddings for semantic search
npm run upload-codebase -- --path ./my-project --repo "My Project" --embeddings
```

### 4. Search and Analyze
```bash
# Run example searches
npm run search-examples

# Use the AI agent for natural language queries
npm run dev
```

### 5. Explore in Kibana
Visit `http://localhost:5601` to:
- Create visualizations of your codebase
- Build dashboards for code analytics
- Monitor search performance
- Explore data relationships

## Next Steps

1. **Upload Your Actual Codebase**: Use the uploader to index your real projects
2. **Semantic Search**: Enable embeddings for AI-powered code search
3. **Custom Analytics**: Build Kibana dashboards for code metrics
4. **CI/CD Integration**: Automate codebase indexing in your deployment pipeline
5. **Advanced Queries**: Create complex search patterns for code analysis

## Security Notes

This setup is configured for development use with security disabled. For production:
- Enable Elasticsearch security features
- Set up proper authentication
- Use HTTPS connections
- Configure proper network security