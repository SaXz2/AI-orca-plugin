/**
 * Tool-Prompt 测试
 * 
 * 注意：tool-prompt-loader.ts 依赖浏览器环境（通过 ai-chat-ui.ts），
 * 因此这里只测试 tool-prompt-defaults.ts 的功能。
 * 
 * tool-prompt-loader.ts 的集成测试需要在完整的 Orca 环境中进行。
 */

import { test, assert, assertEqual } from "./test-harness";
import { 
  getDefaultToolPrompt, 
  getDefaultToolNames 
} from "../src/services/tool-prompt-defaults";

// ─────────────────────────────────────────────────────────────────────────────
// Tests for getDefaultToolPrompt
// ─────────────────────────────────────────────────────────────────────────────

test("getDefaultToolPrompt returns valid content for known tools", () => {
  const knownTools = ["searchNotes", "getPage", "getBlocksText", "queryByTagProperty"];
  
  for (const toolName of knownTools) {
    const content = getDefaultToolPrompt(toolName);
    assert(content !== null, `Default prompt for ${toolName} should exist`);
    assert(content!.length > 0, `Default prompt for ${toolName} should have content`);
    assert(content!.includes(toolName), `Default prompt should reference ${toolName}`);
  }
});

test("getDefaultToolPrompt returns null for unknown tools", () => {
  const content = getDefaultToolPrompt("unknownToolThatDoesNotExist");
  assertEqual(content, null, "Unknown tool should return null");
});

test("getDefaultToolNames returns list of all default tools", () => {
  const names = getDefaultToolNames();
  
  assert(Array.isArray(names), "Should return an array");
  assert(names.length > 0, "Should have at least one default tool");
  
  // 检查关键工具都在列表中
  const expectedTools = ["searchNotes", "getPage", "getBlocksText", "queryByTagProperty"];
  for (const toolName of expectedTools) {
    assert(names.includes(toolName), `Should include ${toolName}`);
  }
});

test("getDefaultToolPrompt content includes usage instructions", () => {
  const content = getDefaultToolPrompt("searchNotes");
  
  assert(content !== null, "searchNotes should have default content");
  assert(content!.includes("功能") || content!.includes("## "), "Should include section headers");
  assert(content!.includes("参数") || content!.includes("parameter"), "Should include parameter info");
});

test("All default tool prompts are valid and non-empty", () => {
  const names = getDefaultToolNames();
  
  for (const toolName of names) {
    const content = getDefaultToolPrompt(toolName);
    assert(content !== null, `${toolName} should have content`);
    assert(content!.length > 50, `${toolName} content should be substantial (>50 chars)`);
    assert(content!.trim().length > 0, `${toolName} should not be just whitespace`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests for error message formatting pattern
// ─────────────────────────────────────────────────────────────────────────────

test("Error message includes tool instruction when available", () => {
  const toolInstruction = getDefaultToolPrompt("searchNotes");
  const toolName = "searchNotes";
  const errorMessage = "Invalid query parameter";

  // 模拟 ai-tools.ts 中的错误格式化逻辑
  let formattedError: string;
  if (toolInstruction) {
    formattedError = `Error executing ${toolName}: ${errorMessage}\n\n---\n**工具使用说明：**\n${toolInstruction}`;
  } else {
    formattedError = `Error executing ${toolName}: ${errorMessage}`;
  }

  assert(formattedError.includes(errorMessage), "Should include original error");
  assert(formattedError.includes("工具使用说明"), "Should include instruction header");
  assert(formattedError.includes("全文搜索"), "Should include tool description");
});

test("Error message is concise when no instruction available", () => {
  const toolInstruction = getDefaultToolPrompt("nonExistentTool");
  const toolName = "nonExistentTool";
  const errorMessage = "Tool not found";

  let formattedError: string;
  if (toolInstruction) {
    formattedError = `Error executing ${toolName}: ${errorMessage}\n\n---\n**工具使用说明：**\n${toolInstruction}`;
  } else {
    formattedError = `Error executing ${toolName}: ${errorMessage}`;
  }

  assert(formattedError.includes(errorMessage), "Should include original error");
  assert(!formattedError.includes("工具使用说明"), "Should NOT include instruction header");
  assertEqual(formattedError, `Error executing ${toolName}: ${errorMessage}`);
});
