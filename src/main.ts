import { setupL10N } from "./libs/l10n";
import zhCN from "./translations/zhCN";
import { registerAiChatSettingsSchema } from "./settings/ai-chat-settings";
import { registerAiChatUI, unregisterAiChatUI } from "./ui/ai-chat-ui";

let pluginName: string;

export async function load(_name: string) {
  pluginName = _name;

  setupL10N(orca.state.locale, { "zh-CN": zhCN });

  await registerAiChatSettingsSchema(pluginName);
  registerAiChatUI(pluginName);

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  unregisterAiChatUI();
}
