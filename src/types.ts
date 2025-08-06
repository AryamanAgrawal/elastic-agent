export interface ElasticQuery {
  index: string;
  query: any;
  size?: number;
  from?: number;
}

export interface ElasticResult {
  hits: {
    total: {
      value: number;
    };
    hits: Array<{
      _source: any;
      _score: number;
      _id: string;
    }>;
  };
}

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface ToolCall {
  name: string;
  arguments: Record<string, any>;
}

export interface AgentMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: any[];
  tool_call_id?: string;
  name?: string;
}

export interface AgentState {
  query: string;
  messages: AgentMessage[];
  elasticResults: ElasticResult[];
  isComplete: boolean;
  finalResponse?: string;
}