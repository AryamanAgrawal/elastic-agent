import { AgentState, AgentMessage } from './types';
import { ToolSystem } from './tools';
import { ElasticClient } from './elastic-client';
import { AIProvider, AIMessage } from './ai-providers';
import { OpenAIProvider } from './providers/openai-provider';
import { AISdkProvider } from './providers/ai-sdk-provider';
import { Config } from './config';

export class AIAgent {
  private aiProvider: AIProvider;
  private toolSystem: ToolSystem;
  private state: AgentState;
  public onStreamingContent?: (content: string) => void;

  constructor(config: { apiKey: string; provider?: string; model?: string }, elasticClient: ElasticClient) {
    // Create appropriate provider based on config
    const provider = config.provider || 'openai';
    const providerConfig = {
      apiKey: config.apiKey,
      model: config.model
    };

    if (provider === 'ai-sdk') {
      this.aiProvider = new AISdkProvider(providerConfig);
    } else {
      this.aiProvider = new OpenAIProvider(providerConfig);
    }
    
    this.toolSystem = new ToolSystem(elasticClient);
    this.state = {
      query: '',
      messages: [],
      elasticResults: [],
      isComplete: false
    };
  }

  async processQuery(userQuery: string): Promise<string> {
    this.initializeState(userQuery);
    
    while (!this.state.isComplete) {
      try {
        const response = await this.callAIProvider();
        
        if (response.tool_calls && response.tool_calls.length > 0) {
          await this.handleToolCalls(response.tool_calls);
        } else if (response.content) {
          // If no tool calls, treat as final response
          this.state.finalResponse = response.content;
          this.state.isComplete = true;
        }
        
        // Safety check to prevent infinite loops
        if (this.state.messages.length > 20) {
          this.state.finalResponse = "I apologize, but I'm having trouble finding a complete answer. Please try rephrasing your question or being more specific.";
          this.state.isComplete = true;
        }
        
      } catch (error) {
        console.error('Error in processing loop:', error);
        this.state.finalResponse = `An error occurred while processing your request: ${error instanceof Error ? error.message : 'Unknown error'}`;
        this.state.isComplete = true;
      }
    }
    
    return this.state.finalResponse || 'No response generated.';
  }

  private initializeState(userQuery: string): void {
    this.state = {
      query: userQuery,
      messages: [
        {
          role: 'system',
          content: `You are an AI assistant that helps users query and analyze data from an Elasticsearch database. 

Your goal is to:
1. Understand the user's question
2. Explore the available data in Elasticsearch
3. Refine your searches to find the most relevant information
4. Provide a comprehensive answer based on the data found

Available tools:
- search_elastic: Search the database with specific queries
- list_indices: See what data collections are available
- get_mapping: Understand the structure of data in an index
- reply: Provide your final answer to the user

Always start by exploring what data is available, then progressively refine your searches. When you have enough information to answer the user's question comprehensively, use the reply tool to provide your final response.`
        },
        {
          role: 'user',
          content: userQuery
        }
      ],
      elasticResults: [],
      isComplete: false
    };
  }

  private async callAIProvider(): Promise<any> {
    // Convert our internal message format to provider format
    const providerMessages: AIMessage[] = this.state.messages.map(msg => ({
      role: msg.role,
      content: msg.content || undefined,
      tool_calls: msg.tool_calls,
      tool_call_id: msg.tool_call_id,
      name: msg.name
    }));

    const response = await this.aiProvider.streamCompletion(
      providerMessages,
      this.toolSystem.getTools(),
      this.onStreamingContent
    );
    
    // Add assistant's message to conversation
    this.state.messages.push({
      role: 'assistant',
      content: response.content,
      tool_calls: response.tool_calls
    });

    return response;
  }

  private async handleToolCalls(toolCalls: any[]): Promise<void> {
    // Add newline before tool execution for better formatting
    if (this.onStreamingContent) {
      this.onStreamingContent('\n');
    }
    
    console.log(`\n🎯 ========== AI AGENT TOOL CALL HANDLER ==========`);
    console.log(`📊 Processing ${toolCalls.length} tool call(s)`);
    console.log(`⏱️  Timestamp: ${new Date().toISOString()}`);
    
    for (let i = 0; i < toolCalls.length; i++) {
      const toolCall = toolCalls[i];
      const toolName = toolCall.function.name;
      
      console.log(`\n📋 [AI Agent] Tool Call ${i + 1}/${toolCalls.length}:`);
      console.log(`   🔗 Tool Call ID: ${toolCall.id}`);
      console.log(`   📛 Tool Name: ${toolName}`);
      
      let toolArgs: any;
      try {
        toolArgs = JSON.parse(toolCall.function.arguments);
        console.log(`   📥 Raw Arguments: ${toolCall.function.arguments}`);
        console.log(`   📋 Parsed Arguments:`, toolArgs);
      } catch (parseError) {
        console.log(`   ❌ Failed to parse tool arguments: ${parseError}`);
        continue;
      }

      console.log(`   🚀 [AI Agent] Delegating to ToolSystem...`);
      
      let result: string;
      try {
        result = await this.toolSystem.executeTool({
          name: toolName,
          arguments: toolArgs
        });
        
        console.log(`   ✅ [AI Agent] Tool execution successful`);
        console.log(`   📏 [AI Agent] Result length: ${result.length} characters`);
        
      } catch (toolError) {
        console.log(`   ❌ [AI Agent] Tool execution failed: ${toolError}`);
        result = `Error executing ${toolName}: ${toolError instanceof Error ? toolError.message : 'Unknown error'}`;
      }

      // Check if this is the reply tool
      if (toolName === 'reply') {
        console.log(`   🏁 [AI Agent] Reply tool detected - ending conversation`);
        console.log(`   📄 [AI Agent] Final response set`);
        this.state.finalResponse = toolArgs.message;
        this.state.isComplete = true;
        return;
      }

      // Add tool result to conversation with proper OpenAI format
      const toolMessage = {
        role: 'tool' as const,
        tool_call_id: toolCall.id,
        name: toolName,
        content: result
      };
      
      this.state.messages.push(toolMessage);
      console.log(`   📨 [AI Agent] Tool response added to conversation history`);
      console.log(`   📊 [AI Agent] Conversation length: ${this.state.messages.length} messages`);
    }
    
    console.log(`\n🔚 ========== AI AGENT TOOL CALL HANDLER END ==========\n`);
  }
}