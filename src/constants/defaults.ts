export const DEFAULT_REASONING_EFFORT = "high";

export const DEFAULT_CONVERSATION_PARAMS = {
  temperature: 0.7,
  maxTokens: 0,
  topP: 1.0,
  frequencyPenalty: 0,
  presencePenalty: 0,
  systemPrompt: "",
  thinkingEnabled: false,
  reasoningEffort: DEFAULT_REASONING_EFFORT,
};

export const PARAMETER_RANGES = {
  temperature: { min: 0, max: 2, step: 0.1 },
  topP: { min: 0, max: 1, step: 0.05 },
  frequencyPenalty: { min: -2, max: 2, step: 0.1 },
  presencePenalty: { min: -2, max: 2, step: 0.1 },
  maxTokens: { min: 1, max: 384000 },
} as const;
