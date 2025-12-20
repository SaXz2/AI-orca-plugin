const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

type UiStore = {
  aiChatPanelId: string | null;
  lastRootBlockId: number | null;
};

export const uiStore = proxy<UiStore>({
  aiChatPanelId: null,
  lastRootBlockId: null,
});
