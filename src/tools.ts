import { Tool, ToolCall, ElasticQuery } from './types';
import { ElasticClient } from './elastic-client';
import OpenAI from 'openai';

export class ToolSystem {
  private elasticClient: ElasticClient;
  private executionCounter: number = 0;
  private openai: OpenAI;

  constructor(elasticClient: ElasticClient) {
    this.elasticClient = elasticClient;
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || ''
    });
  }

  private formatJson(obj: any, maxLines: number = 20): string {
    const jsonStr = JSON.stringify(obj, null, 2);
    const lines = jsonStr.split('\n');
    if (lines.length > maxLines) {
      return lines.slice(0, maxLines).join('\n') + `\n... (${lines.length - maxLines} more lines)`;
    }
    return jsonStr;
  }

  private logToolStart(toolName: string, args: any, executionId: number): void {
    console.log(`\n🔧 [${executionId}] ========== TOOL EXECUTION START ==========`);
    console.log(`📛 Tool: ${toolName}`);
    console.log(`⏱️  Timestamp: ${new Date().toISOString()}`);
    console.log(`📥 Input Arguments:`);
    if (Object.keys(args).length > 0) {
      console.log(this.formatJson(args, 15));
    } else {
      console.log('   (no arguments)');
    }
    console.log(`🚀 Executing...`);
  }

  private logToolSuccess(toolName: string, result: string, executionId: number, duration: number): void {
    console.log(`\n✅ [${executionId}] Tool "${toolName}" completed successfully in ${duration}ms`);
    console.log(`📤 Raw Output (first 500 chars):`);
    const preview = result.length > 500 ? result.substring(0, 500) + '...' : result;
    console.log(preview);
    if (result.length > 500) {
      console.log(`📊 Full output size: ${result.length} characters`);
    }
    console.log(`🔚 [${executionId}] ========== TOOL EXECUTION END ==========\n`);
  }

  private logToolError(toolName: string, error: any, executionId: number, duration: number): void {
    console.log(`\n❌ [${executionId}] Tool "${toolName}" failed after ${duration}ms`);
    console.log(`💥 Error Details:`);
    console.log(`   Type: ${error.constructor.name}`);
    console.log(`   Message: ${error.message}`);
    if (error.stack) {
      console.log(`   Stack (first 3 lines):`);
      console.log(error.stack.split('\n').slice(0, 3).map((line: string) => `     ${line}`).join('\n'));
    }
    console.log(`🔚 [${executionId}] ========== TOOL EXECUTION END ==========\n`);
  }

  // Token estimation method (rough approximation: ~4 characters per token)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  // Content condensation method
  private condenseContent(content: string, maxTokens: number = 128000): string {
    const estimatedTokens = this.estimateTokens(content);
    
    if (estimatedTokens <= maxTokens) {
      return content;
    }

    // Calculate how much content we need to keep (with some buffer)
    const maxCharacters = Math.floor(maxTokens * 4 * 0.8); // 80% of max to leave room for other content
    const halfMaxChars = Math.floor(maxCharacters / 2);
    
    // Keep the beginning and end, trim the middle
    const beginning = content.substring(0, halfMaxChars);
    const ending = content.substring(content.length - halfMaxChars);
    
    return `${beginning}\n\n... [CONTENT CONDENSED DUE TO LENGTH] ...\n\n${ending}`;
  }

  // AI-powered result rephrasing method
  private async rephraseResults(originalQuery: string, searchResults: string, executionId: number): Promise<string> {
    try {
      console.log(`🤖 [${executionId}] Starting AI rephrasing with gpt-4o-mini...`);
      
      const prompt = `You are an AI assistant helping to summarize and rephrase search results from an Elasticsearch database.

Original Query: "${originalQuery}"

Search Results:
${searchResults}

Please provide a clear, concise, and well-structured response that:
1. Directly addresses the original query
2. Summarizes the most relevant findings from the search results
3. Highlights key information and patterns
4. Maintains important technical details
5. Is easy to understand and actionable

Focus on what would be most useful for someone trying to understand or work with this codebase data.`;

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that specializes in analyzing and summarizing code search results. Provide clear, concise, and actionable summaries.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 2000,
        temperature: 0.1
      });

      const rephrasedResult = response.choices[0]?.message?.content || searchResults;
      
      console.log(`✅ [${executionId}] AI rephrasing completed successfully`);
      console.log(`📏 [${executionId}] Original length: ${searchResults.length} chars, Rephrased length: ${rephrasedResult.length} chars`);
      
      return rephrasedResult;
    } catch (error) {
      console.log(`⚠️ [${executionId}] AI rephrasing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      console.log(`📋 [${executionId}] Returning original search results instead`);
      return searchResults;
    }
  }

  getTools(): Tool[] {
    return [
      {
        name: 'search_elastic',
        description: 'Search the Elasticsearch database with a specific query. IMPORTANT: Both index and query parameters are required. Use this to find documents from the database with structured Elasticsearch queries.',
        parameters: {
          type: 'object',
          properties: {
            index: {
              type: 'string',
              description: 'The Elasticsearch index to search in (e.g., "codebase-store")'
            },
            query: {
              type: 'object',
              description: 'REQUIRED: The Elasticsearch query object. Examples: {"match_all": {}}, {"match": {"content": "search_term"}}, {"term": {"extension": "ts"}}, {"bool": {"must": [{"match": {"content": "function"}}, {"term": {"extension": "js"}}]}}'
            },
            size: {
              type: 'number',
              description: 'Number of results to return (default: 10, max: 100)'
            }
          },
          required: ['index', 'query']
        }
      },
      {
        name: 'simple_search',
        description: 'Perform a simple text search across codebase documents. This is easier to use than search_elastic for basic queries.',
        parameters: {
          type: 'object',
          properties: {
            index: {
              type: 'string',
              description: 'The index to search in (typically "codebase-store")'
            },
            search_text: {
              type: 'string',
              description: 'The text to search for (will search across name, content, and file_path fields)'
            },
            filter_field: {
              type: 'string',
              description: 'Optional field to filter by (e.g., "extension", "element_type", "repository")'
            },
            filter_value: {
              type: 'string', 
              description: 'Value for the filter field (e.g., "ts", "class", "my-project")'
            },
            size: {
              type: 'number',
              description: 'Number of results to return (default: 10)'
            }
          },
          required: ['index', 'search_text']
        }
      },
      {
        name: 'list_indices',
        description: 'List all available Elasticsearch indices to understand what data is available.',
        parameters: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'get_mapping',
        description: 'Get the field mapping for a specific Elasticsearch index to understand the data structure.',
        parameters: {
          type: 'object',
          properties: {
            index: {
              type: 'string',
              description: 'The index name to get mapping for'
            }
          },
          required: ['index']
        }
      },
      {
        name: 'reply',
        description: 'Provide the final response to the user and end the search loop. Use this when you have gathered sufficient information to answer the user\'s question.',
        parameters: {
          type: 'object',
          properties: {
            message: {
              type: 'string',
              description: 'The final response message to send to the user'
            }
          },
          required: ['message']
        }
      }
    ];
  }

  async executeTool(toolCall: ToolCall): Promise<string> {
    const executionId = ++this.executionCounter;
    const startTime = Date.now();
    
    this.logToolStart(toolCall.name, toolCall.arguments, executionId);
    
    try {
      let result: string;
      
      switch (toolCall.name) {
        case 'search_elastic':
          result = await this.searchElastic(toolCall.arguments, executionId);
          break;
        
        case 'simple_search':
          result = await this.simpleSearch(toolCall.arguments, executionId);
          break;
        
        case 'list_indices':
          result = await this.listIndices(executionId);
          break;
        
        case 'get_mapping':
          result = await this.getMapping(toolCall.arguments, executionId);
          break;
        
        case 'reply':
          result = this.reply(toolCall.arguments, executionId);
          break;
        
        default:
          throw new Error(`Unknown tool: ${toolCall.name}`);
      }
      
      const duration = Date.now() - startTime;
      this.logToolSuccess(toolCall.name, result, executionId, duration);
      return result;
      
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logToolError(toolCall.name, error, executionId, duration);
      throw error;
    }
  }

  private async searchElastic(args: any, executionId: number): Promise<string> {
    try {
      // Validate required parameters
      if (!args.index) {
        const error = 'Missing required parameter: index';
        console.log(`❌ [${executionId}] Validation error: ${error}`);
        return `Error: ${error}`;
      }
      
      if (!args.query) {
        const error = 'Missing required parameter: query';
        console.log(`❌ [${executionId}] Validation error: ${error}`);
        console.log(`💡 [${executionId}] Received args:`, args);
        console.log(`💡 [${executionId}] Expected format: { "index": "index-name", "query": { "match": { "field": "value" } }, "size": 10 }`);
        return `Error: ${error}. The search_elastic tool requires both 'index' and 'query' parameters.`;
      }

      const query: ElasticQuery = {
        index: args.index,
        query: args.query,
        size: args.size || 10
      };

      console.log(`🔍 [${executionId}] Elasticsearch Query Details:`);
      console.log(`   Index: ${query.index}`);
      console.log(`   Size: ${query.size}`);
      
      // Safely determine query type
      let queryType = 'other';
      if (query.query) {
        if (query.query.match) queryType = 'match';
        else if (query.query.bool) queryType = 'bool';
        else if (query.query.term) queryType = 'term';
        else if (query.query.match_all) queryType = 'match_all';
      }
      console.log(`   Query Type: ${queryType}`);
      
      console.log(`   Full Query:`);
      console.log(this.formatJson(query.query, 10));

      const result = await this.elasticClient.search(query);
      
      console.log(`📊 [${executionId}] Elasticsearch Response:`);
      console.log(`   Total hits: ${result.hits.total.value}`);
      console.log(`   Returned: ${result.hits.hits.length} documents`);
      
      if (result.hits.hits.length > 0) {
        console.log(`   Top result preview:`);
        const topHit = result.hits.hits[0];
        console.log(`     ID: ${topHit._id}`);
        console.log(`     Score: ${topHit._score}`);
        console.log(`     Source (keys): ${Object.keys(topHit._source || {}).join(', ')}`);
      }

      const formattedResult = JSON.stringify({
        total: result.hits.total.value,
        results: result.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          source: hit._source
        }))
      }, null, 2);

      // Condensation step: trim content if above token limit
      console.log(`📏 [${executionId}] Original result length: ${formattedResult.length} chars (~${this.estimateTokens(formattedResult)} tokens)`);
      const condensedResult = this.condenseContent(formattedResult, 128000);
      
      if (condensedResult !== formattedResult) {
        console.log(`✂️ [${executionId}] Content condensed: ${condensedResult.length} chars (~${this.estimateTokens(condensedResult)} tokens)`);
      }

      // Extract original query for context (try different query formats)
      let originalQuery = 'elasticsearch query';
      try {
        if (typeof args.query === 'object') {
          if (args.query.match) {
            originalQuery = Object.values(args.query.match)[0] as string;
          } else if (args.query.bool?.must) {
            const mustClause = args.query.bool.must[0];
            if (mustClause.match) {
              originalQuery = Object.values(mustClause.match)[0] as string;
            }
          }
        }
      } catch (e) {
        console.log(`⚠️ [${executionId}] Could not extract query for context, using default`);
      }

      // AI rephrasing step
      const finalResult = await this.rephraseResults(originalQuery, condensedResult, executionId);
      
      return finalResult;
    } catch (error) {
      console.log(`💥 [${executionId}] Elasticsearch error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error searching Elasticsearch: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async simpleSearch(args: any, executionId: number): Promise<string> {
    try {
      // Validate required parameters
      if (!args.index) {
        const error = 'Missing required parameter: index';
        console.log(`❌ [${executionId}] Validation error: ${error}`);
        return `Error: ${error}`;
      }
      
      if (!args.search_text) {
        const error = 'Missing required parameter: search_text';
        console.log(`❌ [${executionId}] Validation error: ${error}`);
        return `Error: ${error}`;
      }

      console.log(`🔍 [${executionId}] Building simple search query:`);
      console.log(`   Index: ${args.index}`);
      console.log(`   Search text: "${args.search_text}"`);
      if (args.filter_field && args.filter_value) {
        console.log(`   Filter: ${args.filter_field} = "${args.filter_value}"`);
      }

      // Build the Elasticsearch query
      let esQuery: any;
      
      if (args.filter_field && args.filter_value) {
        // Search with filter
        esQuery = {
          bool: {
            must: [
              {
                multi_match: {
                  query: args.search_text,
                  fields: ['name^2', 'content', 'file_path'],
                  type: 'best_fields',
                  fuzziness: 'AUTO'
                }
              },
              {
                term: {
                  [args.filter_field]: args.filter_value
                }
              }
            ]
          }
        };
      } else {
        // Simple search across multiple fields
        esQuery = {
          multi_match: {
            query: args.search_text,
            fields: ['name^2', 'content', 'file_path'],
            type: 'best_fields',
            fuzziness: 'AUTO'
          }
        };
      }

      const query: ElasticQuery = {
        index: args.index,
        query: esQuery,
        size: args.size || 10
      };

      console.log(`🔧 [${executionId}] Generated Elasticsearch query:`);
      console.log(this.formatJson(query.query, 15));

      const result = await this.elasticClient.search(query);
      
      console.log(`📊 [${executionId}] Simple Search Response:`);
      console.log(`   Total hits: ${result.hits.total.value}`);
      console.log(`   Returned: ${result.hits.hits.length} documents`);

      if (result.hits.hits.length > 0) {
        console.log(`   Top results:`);
        result.hits.hits.slice(0, 3).forEach((hit, i) => {
          console.log(`     ${i + 1}. ${hit._source?.name || 'Unknown'} (score: ${hit._score?.toFixed(2)})`);
        });
      }

      const formattedResult = JSON.stringify({
        total: result.hits.total.value,
        results: result.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          source: hit._source
        }))
      }, null, 2);

      // Condensation step: trim content if above token limit
      console.log(`📏 [${executionId}] Original result length: ${formattedResult.length} chars (~${this.estimateTokens(formattedResult)} tokens)`);
      const condensedResult = this.condenseContent(formattedResult, 128000);
      
      if (condensedResult !== formattedResult) {
        console.log(`✂️ [${executionId}] Content condensed: ${condensedResult.length} chars (~${this.estimateTokens(condensedResult)} tokens)`);
      }

      // Use the search_text as the original query for AI rephrasing context
      const originalQuery = args.search_text || 'simple search query';

      // AI rephrasing step
      const finalResult = await this.rephraseResults(originalQuery, condensedResult, executionId);
      
      return finalResult;
    } catch (error) {
      console.log(`💥 [${executionId}] Simple search error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error in simple search: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async listIndices(executionId: number): Promise<string> {
    try {
      console.log(`📋 [${executionId}] Fetching indices from Elasticsearch...`);
      const indices = await this.elasticClient.getIndices();
      
      console.log(`📊 [${executionId}] Indices Response:`);
      console.log(`   Found: ${indices.length} indices`);
      if (indices.length > 0) {
        console.log(`   Indices: ${indices.join(', ')}`);
      } else {
        console.log(`   No indices found`);
      }

      return `Available indices: ${indices.join(', ')}`;
    } catch (error) {
      console.log(`💥 [${executionId}] List indices error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error listing indices: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private async getMapping(args: any, executionId: number): Promise<string> {
    try {
      console.log(`🗂️  [${executionId}] Fetching mapping for index: ${args.index}`);
      const mapping = await this.elasticClient.getMapping(args.index);
      
      console.log(`📊 [${executionId}] Mapping Response:`);
      console.log(`   Index: ${args.index}`);
      
      if (mapping && typeof mapping === 'object') {
        const mappingKeys = Object.keys(mapping);
        console.log(`   Top-level keys: ${mappingKeys.join(', ')}`);
        
        // Try to extract field information
        const indexMapping = mapping[args.index] || mapping;
        const properties = indexMapping?.mappings?.properties;
        if (properties && typeof properties === 'object') {
          const fieldNames = Object.keys(properties);
          console.log(`   Fields (${fieldNames.length}): ${fieldNames.join(', ')}`);
        }
      }

      return `Mapping for index "${args.index}":\n${JSON.stringify(mapping, null, 2)}`;
    } catch (error) {
      console.log(`💥 [${executionId}] Get mapping error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return `Error getting mapping: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private reply(args: any, executionId: number): string {
    console.log(`💬 [${executionId}] Generating final reply...`);
    console.log(`📝 [${executionId}] Reply content length: ${args.message?.length || 0} characters`);
    console.log(`📄 [${executionId}] Reply preview: ${args.message?.substring(0, 100)}${args.message?.length > 100 ? '...' : ''}`);
    
    return `REPLY: ${args.message}`;
  }
}