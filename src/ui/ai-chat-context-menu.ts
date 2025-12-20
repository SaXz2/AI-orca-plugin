import type { Block, DbId } from "../orca.d.ts";

import {
  addPageById,
  addTagContext,
  normalizeTagName,
} from "../store/context-store";
import { openAiChatPanel, setLastRootBlockId } from "./ai-chat-ui";

let pageMenuCommandId = "";
let tagMenuCommandId = "";

/**
 * Add page context from right-click menu
 * Only works on page root blocks (blocks without parent)
 */
function addPageContext(blockId: DbId, rootBlockId?: DbId) {
  if (typeof rootBlockId === "number") setLastRootBlockId(rootBlockId);

  // Check if the block is a page root
  const block = (orca.state.blocks as any)?.[blockId];
  if (block && block.parent != null) {
    orca.notify("info", "Please select a page root block, not a child block");
    return;
  }

  const added = addPageById(blockId);
  openAiChatPanel();
  if (added) {
    orca.notify("success", "Added page to AI context");
  }
}

/**
 * Add tag context from right-click menu
 */
function handleAddTagContext(tagBlock: Block) {
  const raw =
    (Array.isArray(tagBlock.aliases) && tagBlock.aliases[0]) ||
    (typeof tagBlock.text === "string" ? tagBlock.text : "");
  const tag = normalizeTagName(raw);
  if (!tag) {
    orca.notify("warn", "Failed to detect tag name");
    return;
  }
  addTagContext(tag);
  openAiChatPanel();
  orca.notify("success", `Added #${tag} to AI context`);
}

export function registerAiChatContextMenus(pluginName: string): void {
  pageMenuCommandId = `${pluginName}.aiChatAddPageContext`;
  tagMenuCommandId = `${pluginName}.aiChatAddTagContext`;

  const MenuText = orca.components.MenuText;

  // Register page context menu (only for root blocks)
  orca.blockMenuCommands.registerBlockMenuCommand(pageMenuCommandId, {
    worksOnMultipleBlocks: false,
    render: (blockId: DbId, rootBlockId: DbId, close: () => void) => {
      // Only show menu for page root blocks
      const block = (orca.state.blocks as any)?.[blockId];
      if (block && block.parent != null) {
        return null; // Don't show menu for child blocks
      }

      return window.React.createElement(MenuText, {
        preIcon: "ti ti-message-chatbot",
        title: "Add Page to AI Context",
        onClick: () => {
          close();
          addPageContext(blockId, rootBlockId);
        },
      });
    },
  });

  // Register tag context menu
  orca.tagMenuCommands.registerTagMenuCommand(tagMenuCommandId, {
    render: (tagBlock: Block, close: () => void) =>
      window.React.createElement(MenuText, {
        preIcon: "ti ti-message-chatbot",
        title: "Add Tag to AI Context",
        onClick: () => {
          close();
          handleAddTagContext(tagBlock);
        },
      }),
  });
}

export function unregisterAiChatContextMenus(): void {
  if (pageMenuCommandId) {
    orca.blockMenuCommands.unregisterBlockMenuCommand(pageMenuCommandId);
    pageMenuCommandId = "";
  }
  if (tagMenuCommandId) {
    orca.tagMenuCommands.unregisterTagMenuCommand(tagMenuCommandId);
    tagMenuCommandId = "";
  }
}
