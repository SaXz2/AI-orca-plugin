import { test, assert, assertEqual } from "./test-harness";
import {
  executeSkill,
  getSkillTools,
  parseSkillDefinitionFromContent,
  parseSkillFile,
} from "../src/services/skill-service";
import { skillStore } from "../src/store/skill-store";

const sampleContent = `---
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

test("parseSkillFile extracts metadata and instruction", () => {
  const parsed = parseSkillFile(sampleContent);
  assertEqual(parsed.metadata.name, "Sample Skill");
  assert(parsed.instruction.includes("Instruction body"), "Instruction not parsed");
});

test("parseSkillDefinitionFromContent builds skill definition", () => {
  const skill = parseSkillDefinitionFromContent(sampleContent, "SampleFolder", "user");
  assert(skill !== null, "Skill definition should parse");
  assertEqual(skill!.name, "Sample Skill");
  assertEqual(skill!.steps.length, 2);
});

test("getSkillTools maps skills into tool definitions", () => {
  const skill = parseSkillDefinitionFromContent(sampleContent, "SampleFolder", "user");
  if (!skill) throw new Error("Missing skill definition");
  skillStore.skills = [skill];

  const tools = getSkillTools();
  assertEqual(tools.length, 1);
  assertEqual(tools[0].function.name, `skill_${skill.id}`);
});

test("executeSkill runs steps with overrides", async () => {
  const skill = parseSkillDefinitionFromContent(sampleContent, "SampleFolder", "user");
  if (!skill) throw new Error("Missing skill definition");
  skillStore.skills = [skill];

  const output = await executeSkill(`skill_${skill.id}`, { topic: "alpha" }, {
    toolExecutor: async (toolName, args) => {
      assertEqual(toolName, "searchBlocksByText");
      assertEqual(args.searchText, "alpha");
      return "tool-output";
    },
    pythonExecutor: async () => ({ output: "python-output", runtime: "backend" }),
    instructionProvider: async () => "Instruction override",
  });

  assert(output.includes("tool-output"), "Missing tool output");
  assert(output.includes("python-output"), "Missing python output");
  assert(output.includes("Instruction override"), "Missing instruction");
});
