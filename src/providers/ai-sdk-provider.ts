import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { AIProvider, AIProviderConfig, AIMessage, StreamingResponse, ToolCall } from '../ai-providers';

export class AISdkProvider implements AIProvider {
  private openai: any;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.openai = createOpenAI({
      apiKey: config.apiKey
    });
    this.model = config.model || 'gpt-4o';
  }

  async streamCompletion(
    messages: AIMessage[],
    tools: any[],
    onContent?: (content: string) => void
  ): Promise<StreamingResponse> {
    // For now, AI SDK implementation will fall back to OpenAI provider for tool calling
    // This is a limitation we can address in future iterations
    console.log('⚠️ AI SDK provider: Tool calling not yet fully implemented, some features may be limited');

    // Convert messages to AI SDK v5 format
    const aiSdkMessages: any[] = [];
    
    for (const msg of messages) {
      if (msg.role === 'tool') {
        aiSdkMessages.push({
          role: 'tool',
          content: [
            {
              type: 'tool-result',
              toolCallId: msg.tool_call_id!,
              toolName: msg.name || 'unknown',
              result: msg.content || ''
            }
          ]
        });
      } else if (msg.role === 'assistant' && msg.tool_calls && msg.tool_calls.length > 0) {
        const content: any[] = [];
        
        if (msg.content) {
          content.push({ type: 'text', text: msg.content });
        }
        
        msg.tool_calls.forEach(tc => {
          content.push({
            type: 'tool-call',
            toolCallId: tc.id,
            toolName: tc.function.name,
            args: JSON.parse(tc.function.arguments)
          });
        });
        
        aiSdkMessages.push({
          role: 'assistant',
          content
        });
      } else {
        aiSdkMessages.push({
          role: msg.role,
          content: msg.content || ''
        });
      }
    }

    let fullContent = '';
    let toolCalls: ToolCall[] = [];
    let isStreamingContent = false;

    // Stream configuration for AI SDK v5 - simplified without tools for now
    const result = await streamText({
      model: this.openai(this.model),
      messages: aiSdkMessages
    });

    // Handle text streaming
    for await (const delta of result.textStream) {
      if (delta) {
        fullContent += delta;
        
        // Start streaming indicator if this is the first content
        if (!isStreamingContent && onContent) {
          isStreamingContent = true;
          onContent('\n💭 AI Agent: ');
        }
        
        // Stream the content as it arrives
        if (onContent) {
          onContent(delta);
        }
      }
    }

    // For now, no tool call extraction since we're not using tools in AI SDK yet
    // This will be implemented in a future version

    // End streaming indicator
    if (isStreamingContent && onContent) {
      onContent('\n');
    }

    return {
      content: fullContent,
      tool_calls: toolCalls.length > 0 ? toolCalls : undefined
    };
  }
}