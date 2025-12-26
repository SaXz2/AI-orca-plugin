import { registerAiChatSettingsSchema } from "./settings/ai-chat-settings";
import { registerAiChatUI, unregisterAiChatUI } from "./ui/ai-chat-ui";
import { loadMemoryStore } from "./store/memory-store";

let pluginName: string;

export async function load(_name: string) {
  pluginName = _name;

  // PR review note: Localization init removed to keep PR focused on style fixes.
  await registerAiChatSettingsSchema(pluginName);
  registerAiChatUI(pluginName);

  // Load persisted memory data
  await loadMemoryStore();

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  unregisterAiChatUI();
}
