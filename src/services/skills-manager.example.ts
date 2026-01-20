/**
 * Skills Manager 使用示例
 */

import {
  listSkills,
  getSkill,
  createSkill,
  updateSkill,
  deleteSkill,
  listSkillFiles,
  readSkillFile,
  writeSkillFile,
  deleteSkillFile,
  isSkillEnabled,
  setSkillEnabled,
  exportSkill,
  importSkill,
} from "./skills-manager";

// ─────────────────────────────────────────────────────────────────────────────
// 示例 1: 创建一个新 Skill
// ─────────────────────────────────────────────────────────────────────────────

async function exampleCreateSkill() {
  const skillId = "日记整理";
  const metadata = {
    name: "日记整理",
    description: "自动整理和分类日记内容",
    version: "1.0.0",
    author: "User",
    tags: ["日记", "整理", "AI"],
  };

  const instruction = `
你是一个日记整理助手。

## 功能
- 自动分类日记内容
- 提取关键信息
- 生成摘要

## 使用方法
1. 输入日记内容
2. 系统自动分类和整理
3. 生成结构化输出
`;

  const success = await createSkill(skillId, metadata, instruction);
  console.log(`Create skill result: ${success}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 2: 获取 Skill 详情
// ─────────────────────────────────────────────────────────────────────────────

async function exampleGetSkill() {
  const skill = await getSkill("日记整理");
  if (skill) {
    console.log("Skill ID:", skill.id);
    console.log("Metadata:", skill.metadata);
    console.log("Instruction:", skill.instruction);
    console.log("Files:", skill.files);
    console.log("Enabled:", skill.enabled);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 3: 添加脚本文件到 Skill
// ─────────────────────────────────────────────────────────────────────────────

async function exampleAddScriptToSkill() {
  const skillId = "日记整理";

  // 添加 Python 脚本
  const pythonScript = `
import json

def process_diary(content):
    """处理日记内容"""
    lines = content.split('\\n')
    return {
        'total_lines': len(lines),
        'content': content
    }

if __name__ == '__main__':
    result = process_diary('Sample diary content')
    print(json.dumps(result))
`;

  await writeSkillFile(skillId, "scripts/process.py", pythonScript);

  // 添加 JavaScript 工具函数
  const jsUtils = `
export function extractKeywords(text) {
  return text.split(' ').filter(word => word.length > 3);
}

export function generateSummary(text, maxLength = 100) {
  return text.substring(0, maxLength) + '...';
}
`;

  await writeSkillFile(skillId, "scripts/utils.js", jsUtils);

  console.log("Scripts added successfully");
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 4: 列出所有 Skills
// ─────────────────────────────────────────────────────────────────────────────

async function exampleListSkills() {
  const skillIds = await listSkills();
  console.log("Available skills:", skillIds);

  for (const skillId of skillIds) {
    const skill = await getSkill(skillId);
    if (skill) {
      console.log(`\n${skill.metadata.name}:`);
      console.log(`  Description: ${skill.metadata.description}`);
      console.log(`  Enabled: ${skill.enabled}`);
      console.log(`  Files: ${skill.files.length}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 5: 更新 Skill
// ─────────────────────────────────────────────────────────────────────────────

async function exampleUpdateSkill() {
  const skillId = "日记整理";

  const success = await updateSkill(
    skillId,
    {
      version: "1.1.0",
      description: "改进的日记整理助手，支持更多分类",
    },
    `
你是一个高级日记整理助手。

## 新功能
- 支持多语言日记
- AI 情感分析
- 自动标签生成

## 使用方法
1. 输入日记内容
2. 系统自动分析和分类
3. 生成详细的结构化输出
`
  );

  console.log(`Update skill result: ${success}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 6: 启用/禁用 Skill
// ─────────────────────────────────────────────────────────────────────────────

async function exampleToggleSkill() {
  const skillId = "日记整理";

  // 禁用
  await setSkillEnabled(skillId, false);
  console.log(`Skill ${skillId} disabled`);

  // 检查状态
  const enabled = await isSkillEnabled(skillId);
  console.log(`Skill ${skillId} enabled: ${enabled}`);

  // 启用
  await setSkillEnabled(skillId, true);
  console.log(`Skill ${skillId} enabled`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 7: 导出和导入 Skill
// ─────────────────────────────────────────────────────────────────────────────

async function exampleExportImportSkill() {
  const skillId = "日记整理";

  // 导出
  const exported = await exportSkill(skillId);
  if (exported) {
    console.log("Exported skill:");
    console.log(exported);

    // 导入到新 Skill
    const newSkillId = "日记整理_备份";
    const success = await importSkill(newSkillId, exported);
    console.log(`Import skill result: ${success}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 8: 读取 Skill 中的文件
// ─────────────────────────────────────────────────────────────────────────────

async function exampleReadSkillFile() {
  const skillId = "日记整理";

  // 读取 Python 脚本
  const pythonContent = await readSkillFile(skillId, "scripts/process.py");
  if (pythonContent) {
    console.log("Python script content:");
    console.log(pythonContent);
  }

  // 读取 JavaScript 工具
  const jsContent = await readSkillFile(skillId, "scripts/utils.js");
  if (jsContent) {
    console.log("JavaScript utils content:");
    console.log(jsContent);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 9: 列出 Skill 中的所有文件
// ─────────────────────────────────────────────────────────────────────────────

async function exampleListSkillFiles() {
  const skillId = "日记整理";
  const files = await listSkillFiles(skillId);

  console.log(`Files in skill ${skillId}:`);
  for (const file of files) {
    console.log(`  ${file.isDir ? "[DIR]" : "[FILE]"} ${file.name}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 示例 10: 删除 Skill
// ─────────────────────────────────────────────────────────────────────────────

async function exampleDeleteSkill() {
  const skillId = "日记整理_备份";
  const success = await deleteSkill(skillId);
  console.log(`Delete skill result: ${success}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// 完整工作流示例
// ─────────────────────────────────────────────────────────────────────────────

async function exampleCompleteWorkflow() {
  console.log("=== Complete Workflow Example ===\n");

  // 1. 创建 Skill
  console.log("1. Creating skill...");
  await exampleCreateSkill();

  // 2. 添加脚本
  console.log("\n2. Adding scripts...");
  await exampleAddScriptToSkill();

  // 3. 列出文件
  console.log("\n3. Listing files...");
  await exampleListSkillFiles();

  // 4. 读取文件
  console.log("\n4. Reading files...");
  await exampleReadSkillFile();

  // 5. 更新 Skill
  console.log("\n5. Updating skill...");
  await exampleUpdateSkill();

  // 6. 获取详情
  console.log("\n6. Getting skill details...");
  await exampleGetSkill();

  // 7. 导出
  console.log("\n7. Exporting skill...");
  await exampleExportImportSkill();

  // 8. 列出所有 Skills
  console.log("\n8. Listing all skills...");
  await exampleListSkills();

  // 9. 清理
  console.log("\n9. Cleaning up...");
  await exampleDeleteSkill();

  console.log("\n=== Workflow Complete ===");
}

// 运行示例
// exampleCompleteWorkflow().catch(console.error);
