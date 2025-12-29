/**
 * Export Service
 * 提供聊天记录导出功能：导出为 Markdown 文件或保存到 Orca 笔记
 */

import type { Message, SavedSession } from "./session-service";

/**
 * 将消息转换为 Markdown 格式
 */
function messageToMarkdown(msg: Message): string {
  const roleLabel = msg.role === "user" ? "👤 用户" : msg.role === "assistant" ? "🤖 AI" : "🔧 工具";
  const time = new Date(msg.createdAt).toLocaleString("zh-CN");
  
  let content = msg.content || "";
  
  // 处理推理内容
  if (msg.reasoning) {
    content = `<details>\n<summary>💭 推理过程</summary>\n\n${msg.reasoning}\n</details>\n\n${content}`;
  }
  
  // 处理工具调用
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolCallsText = msg.tool_calls.map(tc => {
      return `- 调用 \`${tc.function.name}\``;
    }).join("\n");
    content = `${content}\n\n**工具调用:**\n${toolCallsText}`;
  }
  
  return `### ${roleLabel}\n*${time}*\n\n${content}\n`;
}

/**
 * 将会话导出为 Markdown 字符串
 */
export function sessionToMarkdown(session: SavedSession): string {
  const title = session.title || "AI 对话";
  const createdAt = new Date(session.createdAt).toLocaleString("zh-CN");
  const model = session.model || "未知模型";
  
  const header = `# ${title}\n\n- **创建时间**: ${createdAt}\n- **模型**: ${model}\n\n---\n\n`;
  
  const messages = session.messages
    .filter(m => !m.localOnly && m.role !== "tool")
    .map(messageToMarkdown)
    .join("\n---\n\n");
  
  return header + messages;
}

/**
 * 导出会话为 Markdown 文件（下载）
 */
export function exportSessionAsFile(session: SavedSession): void {
  const markdown = sessionToMarkdown(session);
  const title = session.title || "AI对话";
  const filename = `${title.replace(/[\\/:*?"<>|]/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`;
  
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 保存会话到 Orca 笔记（创建新页面）
 */
export async function saveSessionToNote(session: SavedSession): Promise<{ success: boolean; blockId?: number; message: string }> {
  try {
    const title = session.title || "AI 对话";
    const markdown = sessionToMarkdown(session);
    
    // 创建新页面
    const result = await orca.invokeBackend("create-page", title);
    
    if (!result || typeof result !== "number") {
      return { success: false, message: "创建页面失败" };
    }
    
    const pageId = result;
    
    // 获取页面块以添加内容
    const block = await orca.invokeBackend("get-block", pageId);
    if (!block) {
      return { success: false, message: "获取页面失败" };
    }
    
    // 将 Markdown 内容转换为块内容
    // 简化处理：将整个 Markdown 作为文本内容
    const contentLines = markdown.split("\n").filter(line => !line.startsWith("# "));
    const contentText = contentLines.join("\n");
    
    // 在页面下创建内容块
    await orca.invokeBackend("insert-blocks", pageId, "append", [{
      text: contentText,
    }]);
    
    return { success: true, blockId: pageId, message: `已保存到笔记: ${title}` };
  } catch (err: any) {
    console.error("[export-service] Failed to save to note:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}

/**
 * 保存会话到今日日记
 */
export async function saveSessionToJournal(session: SavedSession): Promise<{ success: boolean; message: string }> {
  try {
    const title = session.title || "AI 对话";
    
    // 获取今日日记
    const today = new Date();
    const journalResult = await orca.invokeBackend("get-journal", today.getTime());
    
    if (!journalResult) {
      return { success: false, message: "获取今日日记失败" };
    }
    
    const journalId = typeof journalResult === "number" ? journalResult : (journalResult as any).id;
    
    // 构建简化的对话摘要
    const userMessages = session.messages.filter(m => m.role === "user" && !m.localOnly);
    const assistantMessages = session.messages.filter(m => m.role === "assistant" && !m.localOnly);
    
    let summary = `## 💬 ${title}\n\n`;
    
    // 只取前几轮对话作为摘要
    const maxRounds = 3;
    for (let i = 0; i < Math.min(userMessages.length, maxRounds); i++) {
      const userMsg = userMessages[i];
      const assistantMsg = assistantMessages[i];
      
      if (userMsg) {
        const userContent = userMsg.content.length > 100 
          ? userMsg.content.slice(0, 100) + "..." 
          : userMsg.content;
        summary += `**Q:** ${userContent}\n\n`;
      }
      
      if (assistantMsg) {
        const assistantContent = assistantMsg.content.length > 200 
          ? assistantMsg.content.slice(0, 200) + "..." 
          : assistantMsg.content;
        summary += `**A:** ${assistantContent}\n\n`;
      }
    }
    
    if (userMessages.length > maxRounds) {
      summary += `*...还有 ${userMessages.length - maxRounds} 轮对话*\n`;
    }
    
    // 在日记中添加内容
    await orca.invokeBackend("insert-blocks", journalId, "append", [{
      text: summary,
    }]);
    
    return { success: true, message: "已保存到今日日记" };
  } catch (err: any) {
    console.error("[export-service] Failed to save to journal:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}
