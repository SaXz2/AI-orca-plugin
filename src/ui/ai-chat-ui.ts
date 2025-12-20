import { uiStore } from "../store/ui-store";
import { findViewPanelById } from "../utils/panel-tree";
import AiChatPanel from "../views/AiChatPanel";
import AiChatSidetool from "../views/AiChatSidetool";
import {
  registerAiChatContextMenus,
  unregisterAiChatContextMenus,
} from "./ai-chat-context-menu";

let pluginName = "";
let aiChatViewId = "";
let sidetoolId = "";

export function getAiChatPluginName(): string {
  return pluginName;
}

function isAiChatPanelOpen(): boolean {
  const panelId = uiStore.aiChatPanelId;
  if (!panelId) return false;
  return findViewPanelById(orca.state.panels, panelId) !== null;
}

export function setLastRootBlockId(rootBlockId: number | null): void {
  uiStore.lastRootBlockId = rootBlockId;
}

export function openAiChatPanel(): void {
  if (isAiChatPanelOpen()) return;
  const panelId = orca.nav.addTo(orca.state.activePanel, "left", {
    view: aiChatViewId,
    viewArgs: { rootBlockId: uiStore.lastRootBlockId },
    viewState: {},
  });
  if (!panelId) {
    orca.notify("error", "Failed to open AI panel");
    return;
  }
  uiStore.aiChatPanelId = panelId;
  orca.nav.switchFocusTo(panelId);
}

export function toggleAiChatPanel(): void {
  if (isAiChatPanelOpen()) {
    const panelId = uiStore.aiChatPanelId;
    if (panelId) orca.nav.close(panelId);
    uiStore.aiChatPanelId = null;
    return;
  }

  if (uiStore.aiChatPanelId) uiStore.aiChatPanelId = null;

  const panelId = orca.nav.addTo(orca.state.activePanel, "left", {
    view: aiChatViewId,
    viewArgs: { rootBlockId: uiStore.lastRootBlockId },
    viewState: {},
  });

  if (!panelId) {
    orca.notify("error", "Failed to open AI panel");
    return;
  }

  uiStore.aiChatPanelId = panelId;
  orca.nav.switchFocusTo(panelId);
}

export function closeAiChatPanel(panelId: string): void {
  if (uiStore.aiChatPanelId === panelId) uiStore.aiChatPanelId = null;
  orca.nav.close(panelId);
}

export function registerAiChatUI(name: string): void {
  pluginName = name;
  aiChatViewId = `${pluginName}.aiChat`;
  sidetoolId = `${pluginName}.aiChatSidetool`;

  orca.panels.registerPanel(aiChatViewId, AiChatPanel);
  registerAiChatContextMenus(pluginName);
  orca.editorSidetools.registerEditorSidetool(sidetoolId, {
    render: (rootBlockId) => {
      setLastRootBlockId(typeof rootBlockId === "number" ? rootBlockId : null);
      return window.React.createElement(AiChatSidetool, { rootBlockId });
    },
  });
}

export function unregisterAiChatUI(): void {
  if (uiStore.aiChatPanelId) {
    try {
      orca.nav.close(uiStore.aiChatPanelId);
    } finally {
      uiStore.aiChatPanelId = null;
    }
  }

  if (sidetoolId) orca.editorSidetools.unregisterEditorSidetool(sidetoolId);
  unregisterAiChatContextMenus();
  if (aiChatViewId) orca.panels.unregisterPanel(aiChatViewId);

  pluginName = "";
  aiChatViewId = "";
  sidetoolId = "";
}
