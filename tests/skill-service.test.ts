import { test, assert, assertEqual } from "./test-harness";
import {
  executeSkill,
  getSkillTools,
  parseSkillDefinitionFromContent,
  parseSkillFile,
  parseSkillMd,
  serializeSkillMd,
} from "../src/services/skill-service";
import { skillStore } from "../src/store/skill-store";
import type { SkillDefinition } from "../src/types/skill";

// Legacy format sample for parseSkillFile and parseSkillDefinitionFromContent tests
const legacySampleContent = `---
id: sample-skill
name: Sample Skill
description: Test skill
inputs:
  - name: topic
    type: string
    description: Topic to search
    default: notes
steps:
  - type: tool
    tool: searchBlocksByText
    args:
      searchText: "{{topic}}"
  - type: python
    code: |
      result = "ok"
---
Instruction body goes here.
`;

// New Codex-style SKILL.md format sample
const codexSampleContent = `---
name: Sample Skill
description: Test skill for unit testing. Use when testing skill functionality.
---

# Sample Skill

Instruction body goes here.
`;

test("parseSkillFile extracts metadata and instruction", () => {
  const parsed = parseSkillFile(legacySampleContent);
  assertEqual(parsed.metadata.name, "Sample Skill");
  assert(parsed.instruction.includes("Instruction body"), "Instruction not parsed");
});

test("parseSkillDefinitionFromContent builds skill definition", () => {
  const skill = parseSkillDefinitionFromContent(legacySampleContent, "SampleFolder", "user");
  assert(skill !== null, "Skill definition should parse");
  assertEqual(skill!.name, "Sample Skill");
  assertEqual(skill!.steps.length, 2);
});

test("parseSkillMd extracts metadata and instruction from Codex format", () => {
  const parsed = parseSkillMd(codexSampleContent);
  assertEqual(parsed.metadata.name, "Sample Skill");
  assert(parsed.metadata.description.includes("Test skill"), "Description not parsed");
  assert(parsed.instruction.includes("Instruction body"), "Instruction not parsed");
});

test("serializeSkillMd produces valid SKILL.md format", () => {
  const metadata = { name: "Test Skill", description: "A test skill description." };
  const instruction = "# Test\n\nInstruction content.";
  const serialized = serializeSkillMd(metadata, instruction);
  
  assert(serialized.startsWith("---"), "Should start with frontmatter delimiter");
  assert(serialized.includes("name: Test Skill"), "Should contain name");
  assert(serialized.includes("description: A test skill description."), "Should contain description");
  assert(serialized.includes("# Test"), "Should contain instruction");
});

test("getSkillTools maps skills into tool definitions", () => {
  // Create a new-style SkillDefinition
  const skill: SkillDefinition = {
    id: "sample-skill",
    metadata: {
      name: "Sample Skill",
      description: "Test skill for unit testing.",
    },
    instruction: "Instruction body goes here.",
    source: "user",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  skillStore.skills = [skill];

  const tools = getSkillTools();
  assertEqual(tools.length, 1);
  assertEqual(tools[0].function.name, `skill_${skill.id}`);
  assertEqual(tools[0].function.description, skill.metadata.description);
});

test("executeSkill returns instruction for Codex-style skills", async () => {
  // Create a new-style SkillDefinition
  const skill: SkillDefinition = {
    id: "sample-skill",
    metadata: {
      name: "Sample Skill",
      description: "Test skill for unit testing.",
    },
    instruction: "Instruction body goes here.",
    source: "user",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  skillStore.skills = [skill];

  const output = await executeSkill(`skill_${skill.id}`, {});

  assert(output.includes("Sample Skill"), "Missing skill name");
  assert(output.includes("Test skill for unit testing"), "Missing description");
  assert(output.includes("Instruction body"), "Missing instruction");
});
