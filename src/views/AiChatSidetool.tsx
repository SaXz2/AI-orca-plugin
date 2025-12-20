import { uiStore } from "../store/ui-store";
import { findViewPanelById } from "../utils/panel-tree";
import { toggleAiChatPanel } from "../ui/ai-chat-ui";

const { createElement, useMemo } = window.React;
const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Tooltip, Button } = orca.components;

type Props = {
  rootBlockId?: number;
};

export default function AiChatSidetool(_props: Props) {
  const orcaSnap = useSnapshot(orca.state);
  const snap = useSnapshot(uiStore);

  const isOpened = useMemo(() => {
    if (!snap.aiChatPanelId) return false;
    return findViewPanelById(orcaSnap.panels, snap.aiChatPanelId) !== null;
  }, [orcaSnap.panels, snap.aiChatPanelId]);

  return createElement(
    Tooltip,
    { text: "AI Chat", placement: "horizontal" },
    createElement(
      Button,
      {
        className: `orca-block-editor-sidetools-btn ${isOpened ? "orca-opened" : ""}`,
        variant: "plain",
        onClick: toggleAiChatPanel,
      },
      createElement("i", { className: "ti ti-message-chatbot" }),
    ),
  );
}
