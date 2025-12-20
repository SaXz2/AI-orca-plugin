export async function registerAiChatSettingsSchema(
  pluginName: string,
): Promise<void> {
  await orca.plugins.setSettingsSchema(pluginName, {
    apiKey: {
      label: "API Key",
      type: "string",
      defaultValue: "",
    },
    apiUrl: {
      label: "API URL",
      type: "string",
      defaultValue: "https://api.openai.com/v1",
    },
    model: {
      label: "AI Model",
      type: "singleChoice",
      choices: [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Custom", value: "custom" },
      ],
      defaultValue: "gpt-4o-mini",
    },
    customModel: {
      label: "Custom Model Name",
      type: "string",
      defaultValue: "",
    },
    systemPrompt: {
      label: "System Prompt",
      type: "string",
      defaultValue: "",
    },
    temperature: {
      label: "Temperature",
      type: "number",
      defaultValue: 0.7,
    },
    maxTokens: {
      label: "Max Tokens",
      type: "number",
      defaultValue: 4096,
    },
  });
}

export type AiChatSettings = {
  apiKey: string;
  apiUrl: string;
  model: string;
  customModel: string;
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
};

export const DEFAULT_AI_CHAT_SETTINGS: AiChatSettings = {
  apiKey: "",
  apiUrl: "https://api.openai.com/v1",
  model: "gpt-4o-mini",
  customModel: "",
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 4096,
};

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  return fallback;
}

export function getAiChatSettings(pluginName: string): AiChatSettings {
  const raw = (orca.state.plugins as any)?.[pluginName]?.settings ?? {};
  const merged: AiChatSettings = {
    apiKey: toString(raw.apiKey, DEFAULT_AI_CHAT_SETTINGS.apiKey),
    apiUrl: toString(raw.apiUrl, DEFAULT_AI_CHAT_SETTINGS.apiUrl),
    model: toString(raw.model, DEFAULT_AI_CHAT_SETTINGS.model),
    customModel: toString(raw.customModel, DEFAULT_AI_CHAT_SETTINGS.customModel),
    systemPrompt: toString(raw.systemPrompt, DEFAULT_AI_CHAT_SETTINGS.systemPrompt),
    temperature: toNumber(raw.temperature, DEFAULT_AI_CHAT_SETTINGS.temperature),
    maxTokens: toNumber(raw.maxTokens, DEFAULT_AI_CHAT_SETTINGS.maxTokens),
  };

  merged.apiUrl = merged.apiUrl.trim();
  merged.apiKey = merged.apiKey.trim();
  merged.model = merged.model.trim();
  merged.customModel = merged.customModel.trim();
  merged.temperature = Math.max(0, Math.min(2, merged.temperature));
  merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));

  return merged;
}

export function resolveAiModel(settings: AiChatSettings): string {
  if (settings.model === "custom") return settings.customModel.trim();
  return settings.model.trim();
}

export function validateAiChatSettings(settings: AiChatSettings): string | null {
  if (!settings.apiUrl.trim()) return "Missing API URL (Settings → API URL)";
  if (!settings.apiKey.trim()) return "Missing API Key (Settings → API Key)";
  const model = resolveAiModel(settings);
  if (!model) return "Missing model (Settings → AI Model / Custom Model Name)";
  return null;
}

export async function updateAiChatSettings(
  to: "app" | "repo",
  pluginName: string,
  patch: Partial<AiChatSettings>,
): Promise<void> {
  const current = getAiChatSettings(pluginName);
  const next: AiChatSettings = { ...current, ...patch };
  await orca.plugins.setSettings(to, pluginName, next);
}
