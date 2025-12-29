/**
 * AI Chat Block Renderer Registration
 * 注册 AI 对话块的自定义渲染器
 */

import AiChatBlockRenderer from "../components/AiChatBlockRenderer";

const BLOCK_TYPE = "aichat.conversation";

/**
 * 注册 AI 对话块渲染器
 */
export function registerAiChatRenderer(): void {
  orca.renderers.registerBlock(
    BLOCK_TYPE,
    false, // 不可编辑
    AiChatBlockRenderer as any,
    [] // 无资源字段
  );
  console.log("[ai-chat-renderer] Registered block renderer:", BLOCK_TYPE);
}

/**
 * 注销 AI 对话块渲染器
 */
export function unregisterAiChatRenderer(): void {
  // Orca 目前可能没有 unregisterBlock API，这里留空
  console.log("[ai-chat-renderer] Unregistered block renderer:", BLOCK_TYPE);
}

/**
 * 获取块类型名称
 */
export function getAiChatBlockType(): string {
  return BLOCK_TYPE;
}
