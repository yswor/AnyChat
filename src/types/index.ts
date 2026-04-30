export interface Provider {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string[];
  default_model?: string;
  supports_thinking: boolean;
  thinking_param?: {
    switch: string;
    effort: string;
  };
  default_params?: {
    temperature: number;
    max_tokens: number;
    top_p: number;
  };
  reasoning_effort_options?: string[];
  balance_path?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  title?: string;
  provider_id: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  frequency_penalty: number;
  presence_penalty: number;
  system_prompt: string;
  thinking_enabled: boolean;
  reasoning_effort: string;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  reasoning_content?: string;
  attachment_type?: string;
  attachment_data?: string;
  tokens?: number;
  usage_details?: {
    prompt: number;
    completion: number;
    cached: number;
  };
  provider_id?: string;
  tool_call_id?: string;
  tool_calls?: ToolCallInfo[];
  toolNodes?: ToolCallNode[];
  created_at: string;
}

export interface ModelInfo {
  id: string;
  object: string;
  owned_by: string;
}

export interface StreamChunk {
  content: string | null;
  reasoning_content: string | null;
  done: boolean;
  error: string | null;
  usage_prompt?: number;
  usage_completion?: number;
  usage_cached?: number;
  tool_status?: string;
  tool_call?: ToolCallEvent;
}

export interface ToolCallEvent {
  id: string;
  name: string;
  arguments: string;
  status: "executing" | "completed" | "failed";
  result?: string;
}

export interface ToolCallNode {
  reasoning: string;
  toolName: string;
  arguments?: string;
  toolStatus: "executing" | "completed" | "failed";
  toolResult?: string;
  mode?: "thinking" | "non-thinking";
}

export interface ToolCallInfo {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface BalanceInfo {
  currency: string;
  total_balance: string;
  granted_balance: string;
  topped_up_balance: string;
}

export interface ChatParams {
  base_url: string;
  api_key: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  thinking_enabled: boolean;
  reasoning_effort: string;
}

export interface ProviderTemplate {
  name: string;
  base_url: string;
  description?: string;
  supports_thinking: boolean;
  thinking_param?: {
    switch: string;
    effort: string;
  };
  reasoning_effort_options?: string[];
  balance_path?: string;
  default_model?: string;
}

export const PROVIDER_TEMPLATES: Record<string, ProviderTemplate> = {
  deepseek: {
    name: "DeepSeek",
    base_url: "https://api.deepseek.com",
    description: "api.deepseek.com",
    supports_thinking: true,
    thinking_param: {
      switch: "thinking",
      effort: "reasoning_effort",
    },
    reasoning_effort_options: ["high", "max"],
    balance_path: "/user/balance",
  },
  kimi: {
    name: "Kimi",
    base_url: "https://api.moonshot.cn/v1",
    description: "api.moonshot.cn",
    supports_thinking: true,
    thinking_param: {
      switch: "thinking",
      effort: "reasoning_effort",
    },
    reasoning_effort_options: ["high", "max"],
    balance_path: "/users/me/balance",
  },
  zhipu: {
    name: "智谱 GLM",
    base_url: "https://open.bigmodel.cn/api/paas/v4",
    description: "智谱 AI 开放平台",
    supports_thinking: true,
    thinking_param: {
      switch: "thinking",
      effort: "reasoning_effort",
    },
    reasoning_effort_options: [],
  },
  custom: {
    name: "",
    base_url: "",
    description: "空白配置",
    supports_thinking: false,
  },
};
