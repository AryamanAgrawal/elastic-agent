export interface StreamingResponse {
  content: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface AIProviderConfig {
  apiKey: string;
  model?: string;
}

export interface AIProvider {
  streamCompletion(
    messages: AIMessage[],
    tools: any[],
    onContent?: (content: string) => void
  ): Promise<StreamingResponse>;
}