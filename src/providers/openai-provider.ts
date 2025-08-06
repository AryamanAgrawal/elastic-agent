import OpenAI from 'openai';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { AIProvider, AIProviderConfig, AIMessage, StreamingResponse, ToolCall } from '../ai-providers';

export class OpenAIProvider implements AIProvider {
  private openai: OpenAI;
  private model: string;

  constructor(config: AIProviderConfig) {
    this.openai = new OpenAI({
      apiKey: config.apiKey
    });
    this.model = config.model || 'gpt-4o';
  }

  async streamCompletion(
    messages: AIMessage[],
    tools: any[],
    onContent?: (content: string) => void
  ): Promise<StreamingResponse> {
    // Convert our internal message format to OpenAI's expected format
    const openaiMessages: ChatCompletionMessageParam[] = messages.map(msg => {
      if (msg.role === 'tool') {
        return {
          role: 'tool' as const,
          tool_call_id: msg.tool_call_id!,
          content: msg.content || ''
        };
      }
      
      return {
        role: msg.role as 'system' | 'user' | 'assistant',
        content: msg.content || '',
        ...(msg.tool_calls && msg.tool_calls.length > 0 ? { tool_calls: msg.tool_calls } : {})
      };
    });

    const stream = await this.openai.chat.completions.create({
      model: this.model,
      messages: openaiMessages,
      tools: tools.map(tool => ({
        type: 'function' as const,
        function: tool
      })),
      tool_choice: 'auto',
      stream: true
    });

    let fullContent = '';
    let toolCalls: ToolCall[] = [];
    let currentToolCall: any = null;
    let isStreamingContent = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      
      if (delta?.content) {
        fullContent += delta.content;
        
        // Start streaming indicator if this is the first content
        if (!isStreamingContent && onContent) {
          isStreamingContent = true;
          onContent('\n💭 AI Agent: ');
        }
        
        // Stream the content as it arrives
        if (onContent) {
          onContent(delta.content);
        }
      }

      // Handle tool calls
      if (delta?.tool_calls) {
        for (const toolCallDelta of delta.tool_calls) {
          if (toolCallDelta.index !== undefined) {
            // Initialize tool call if it doesn't exist
            if (!toolCalls[toolCallDelta.index]) {
              toolCalls[toolCallDelta.index] = {
                id: toolCallDelta.id || '',
                type: 'function',
                function: {
                  name: '',
                  arguments: ''
                }
              };
            }

            const toolCall = toolCalls[toolCallDelta.index];

            if (toolCallDelta.function?.name) {
              toolCall.function.name += toolCallDelta.function.name;
            }

            if (toolCallDelta.function?.arguments) {
              toolCall.function.arguments += toolCallDelta.function.arguments;
            }
          }
        }
      }
    }

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