import { test, assert, assertEqual } from "./test-harness";
import {
  loadToolPrompt,
  initToolPrompts,
  clearToolPromptCache,
} from "../src/services/tool-prompt-loader";
import { getDefaultToolPrompt } from "../src/services/tool-prompt-defaults";

// ─────────────────────────────────────────────────────────────────────────────
// Mock setup for orca environment
// ─────────────────────────────────────────────────────────────────────────────

// Store original orca reference if it exists
const originalOrca = (globalThis as any).orca;

interface MockFs {
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
  createDir: (path: string, opts?: { recursive?: boolean }) => Promise<void>;
}

interface MockOrcaState {
  plugins: Record<string, { path: string }>;
}

interface MockOrca {
  state: MockOrcaState;
  fs: MockFs;
}

function createMockOrca(
  files: Map<string, string>,
  pluginPath: string = "/mock/plugin/path"
): MockOrca {
  return {
    state: {
      plugins: {
        "ai-chat": { path: pluginPath },
      },
    },
    fs: {
      readTextFile: async (path: string) => {
        const content = files.get(path);
        if (content === undefined) {
          throw new Error(`File not found: ${path}`);
        }
        return content;
      },
      writeTextFile: async (path: string, content: string) => {
        files.set(path, content);
      },
      exists: async (path: string) => {
        return files.has(path);
      },
      createDir: async () => {
        // no-op for tests
      },
    },
  };
}

function installMockOrca(mockOrca: MockOrca) {
  (globalThis as any).orca = mockOrca;
}

function restoreOrca() {
  if (originalOrca !== undefined) {
    (globalThis as any).orca = originalOrca;
  } else {
    delete (globalThis as any).orca;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests for loadToolPrompt
// ─────────────────────────────────────────────────────────────────────────────

test("loadToolPrompt correctly loads a prompt from an existing file", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";
  const expectedContent = "# Custom Tool Prompt\n\nThis is user-modified content.";
  files.set(`${pluginPath}/Tool-Prompt/searchNotes.md`, expectedContent);

  const mockOrca = createMockOrca(files, pluginPath);
  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    const content = await loadToolPrompt("searchNotes");
    assertEqual(content, expectedContent, "Should load content from existing file");
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

test("loadToolPrompt restores a prompt from defaults if the file is missing", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";
  // No file in the map - simulating missing file

  const mockOrca = createMockOrca(files, pluginPath);
  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    const content = await loadToolPrompt("searchNotes");

    // Should have restored from defaults
    assert(content !== null, "Should restore content from defaults");
    assert(content!.includes("searchNotes"), "Restored content should contain tool name");
    assert(content!.includes("全文搜索"), "Restored content should have default description");

    // Should have written the file
    const writtenFile = files.get(`${pluginPath}/Tool-Prompt/searchNotes.md`);
    assert(writtenFile !== undefined, "Should have written the restored file");
    assertEqual(writtenFile, content, "Written file should match returned content");
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

test("loadToolPrompt utilizes caching to avoid redundant file reads", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";
  const initialContent = "# Initial Content for Cache Test";
  files.set(`${pluginPath}/Tool-Prompt/getPage.md`, initialContent);

  let readCount = 0;
  const mockOrca = createMockOrca(files, pluginPath);
  const originalReadTextFile = mockOrca.fs.readTextFile;
  mockOrca.fs.readTextFile = async (path: string) => {
    readCount++;
    return originalReadTextFile(path);
  };

  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    // First call should read from file
    const content1 = await loadToolPrompt("getPage");
    assertEqual(content1, initialContent, "First call should return file content");
    const firstReadCount = readCount;
    assert(firstReadCount >= 1, "Should have read from file at least once");

    // Second call should use cache
    const content2 = await loadToolPrompt("getPage");
    assertEqual(content2, initialContent, "Second call should return same content");
    assertEqual(readCount, firstReadCount, "Should not read from file again (cache hit)");

    // Third call should still use cache
    const content3 = await loadToolPrompt("getPage");
    assertEqual(content3, initialContent, "Third call should return same content");
    assertEqual(readCount, firstReadCount, "Should still not read from file (cache hit)");
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests for initToolPrompts
// ─────────────────────────────────────────────────────────────────────────────

test("initToolPrompts creates default markdown files if they do not exist", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";

  const mockOrca = createMockOrca(files, pluginPath);
  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    // Run initialization
    await initToolPrompts();

    // Check that default files were created
    const expectedTools = ["searchNotes", "getPage", "getBlocksText", "queryByTagProperty"];
    for (const toolName of expectedTools) {
      const filePath = `${pluginPath}/Tool-Prompt/${toolName}.md`;
      const exists = files.has(filePath);
      assert(exists, `Should have created ${toolName}.md`);
      
      const content = files.get(filePath);
      assert(content !== undefined && content.length > 0, `${toolName}.md should have content`);
      assert(content!.includes(toolName), `${toolName}.md should contain the tool name`);
    }
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

test("initToolPrompts does not overwrite existing user files", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";
  const userContent = "# User Modified Content\n\nCustom instructions here.";
  files.set(`${pluginPath}/Tool-Prompt/searchNotes.md`, userContent);

  const mockOrca = createMockOrca(files, pluginPath);
  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    await initToolPrompts();

    // User file should not be overwritten
    const content = files.get(`${pluginPath}/Tool-Prompt/searchNotes.md`);
    assertEqual(content, userContent, "User file should not be overwritten");
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Tests for error messages including tool instructions
// ─────────────────────────────────────────────────────────────────────────────

test("Error messages include detailed tool instructions when execution fails", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";
  const toolInstruction = "# searchNotes - 全文搜索笔记\n\n## 使用说明\n详细说明内容...";
  files.set(`${pluginPath}/Tool-Prompt/searchNotes.md`, toolInstruction);

  const mockOrca = createMockOrca(files, pluginPath);
  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    // Simulate the error message formatting logic from ai-tools.ts
    // This tests the pattern: when a tool fails, the error includes instructions
    const toolName = "searchNotes";
    const errorMessage = "Invalid query parameter";

    const instruction = await loadToolPrompt(toolName);
    
    // Simulate the error formatting from ai-tools.ts lines 3538-3545
    let formattedError: string;
    if (instruction) {
      formattedError = `Error executing ${toolName}: ${errorMessage}\n\n---\n**工具使用说明：**\n${instruction}`;
    } else {
      formattedError = `Error executing ${toolName}: ${errorMessage}`;
    }

    assert(
      formattedError.includes(errorMessage),
      "Error message should include the original error"
    );
    assert(
      formattedError.includes("工具使用说明"),
      "Error message should include tool instructions header"
    );
    assert(
      formattedError.includes(toolInstruction),
      "Error message should include the full tool instruction"
    );
    assert(
      formattedError.includes("全文搜索"),
      "Error message should include specific tool details"
    );
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

test("Error messages are concise when tool instruction is not available", async () => {
  const files = new Map<string, string>();
  const pluginPath = "/test/plugin";
  // No tool prompt file exists for nonExistentTool

  const mockOrca = createMockOrca(files, pluginPath);
  installMockOrca(mockOrca);
  clearToolPromptCache();

  try {
    // Test with a non-existent tool (no default either)
    const toolName = "nonExistentTool";
    const errorMessage = "Tool not found";

    const instruction = await loadToolPrompt(toolName);
    
    // Simulate the error formatting
    let formattedError: string;
    if (instruction) {
      formattedError = `Error executing ${toolName}: ${errorMessage}\n\n---\n**工具使用说明：**\n${instruction}`;
    } else {
      formattedError = `Error executing ${toolName}: ${errorMessage}`;
    }

    assert(
      formattedError.includes(errorMessage),
      "Error message should include the original error"
    );
    assert(
      !formattedError.includes("工具使用说明"),
      "Error message should NOT include instructions header when no instruction available"
    );
    assertEqual(
      formattedError,
      `Error executing ${toolName}: ${errorMessage}`,
      "Error should be concise without available instructions"
    );
  } finally {
    restoreOrca();
    clearToolPromptCache();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Additional test: Verify default prompts exist
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
