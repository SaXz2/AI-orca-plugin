/**
 * Skill Manager Modal
 * 管理技能列表与导入导出
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useState, useEffect, useCallback, useMemo } = React;
const { Button } = orca.components;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};

import { skillStore } from "../store/skill-store";
import { withTooltip } from "../utils/orca-tooltip";
import {
  createSkillTemplate,
  deleteSkill,
  getSkillContent,
  loadSkillRegistry,
  parseSkillFile,
  restoreBuiltInSkills,
  updateSkillContent,
} from "../services/skill-service";
import { getTools } from "../services/ai-tools";
import { exportSkillsZip, importSkillsZip } from "../services/skill-zip";
import MarkdownMessage from "../components/MarkdownMessage";
import type { OpenAITool } from "../services/openai-client";
import { stringify as stringifyYaml } from "yaml";

interface SkillManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type FormMode = "simple" | "advanced";
type ParamMode = "input" | "fixed";
type InputType = "string" | "number" | "boolean" | "object" | "array";
type ToolFunction = OpenAITool["function"];

type ToolParamSpec = {
  name: string;
  type: InputType;
  description?: string;
  required: boolean;
  enumValues?: string[];
  defaultValue?: any;
};

type SkillFormParam = {
  name: string;
  type: InputType;
  required: boolean;
  description?: string;
  enumValues?: string[];
  defaultValue?: any;
  mode: ParamMode;
  value: string;
};

type SkillFormStep = {
  id: string;
  toolName: string;
  params: SkillFormParam[];
};

type SkillFormState = {
  id: string;
  name: string;
  description: string;
  instruction: string;
  steps: SkillFormStep[];
};

function normalizeInputType(raw: any): InputType {
  const value = String(raw ?? "").toLowerCase();
  if (value === "number" || value === "integer") return "number";
  if (value === "boolean") return "boolean";
  if (value === "object") return "object";
  if (value === "array") return "array";
  return "string";
}

let stepIdCounter = 0;

function createStepId(): string {
  stepIdCounter += 1;
  return `step-${Date.now().toString(36)}-${stepIdCounter}`;
}

function getFirstLine(text?: string): string {
  if (!text) return "";
  const line = text.split(/\r?\n/).find((entry) => entry.trim());
  return line ? line.trim() : "";
}

function getToolLabel(toolFn: ToolFunction): string {
  const override = (toolFn as any).displayName || (toolFn as any).label;
  if (override) return String(override);
  const label = getFirstLine(toolFn.description);
  return label || toolFn.name;
}

function formatToolOptionLabel(toolFn: ToolFunction): string {
  const label = getToolLabel(toolFn);
  return label && label !== toolFn.name ? `${label} (${toolFn.name})` : toolFn.name;
}

function getParamLabel(param: SkillFormParam): string {
  const override = (param as any).label;
  if (override) return String(override);
  const label = getFirstLine(param.description);
  return label || param.name;
}

function formatValueForInput(value: any): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function coerceFixedValue(raw: string, type: InputType): { value?: any; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: "" };

  if (type === "number") {
    const num = Number(trimmed);
    if (Number.isNaN(num)) return { error: "请输入有效数字" };
    return { value: num };
  }
  if (type === "boolean") {
    if (trimmed === "true") return { value: true };
    if (trimmed === "false") return { value: false };
    return { error: "请输入 true 或 false" };
  }
  if (type === "object" || type === "array") {
    try {
      const parsed = JSON.parse(trimmed);
      return { value: parsed };
    } catch {
      return { error: "请输入合法的 JSON" };
    }
  }
  return { value: raw };
}

function slugifySkillId(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug;
}

function buildToolParamSpecs(toolFn: ToolFunction): ToolParamSpec[] {
  const requiredSet = new Set(toolFn?.parameters?.required ?? []);
  const props = toolFn?.parameters?.properties ?? {};
  return Object.entries(props).map(([name, schema]) => ({
    name,
    type: normalizeInputType(schema?.type),
    description: schema?.description ? String(schema.description) : undefined,
    required: requiredSet.has(name),
    enumValues: Array.isArray(schema?.enum) ? schema.enum.map(String) : undefined,
    defaultValue: schema?.default,
  }));
}

function buildParamsFromTool(toolFn: ToolFunction): SkillFormParam[] {
  return buildToolParamSpecs(toolFn).map((spec) => ({
    name: spec.name,
    type: spec.type,
    required: spec.required,
    description: spec.description,
    enumValues: spec.enumValues,
    defaultValue: spec.defaultValue,
    mode: spec.required ? "input" : "fixed",
    value: spec.defaultValue !== undefined ? formatValueForInput(spec.defaultValue) : "",
  }));
}

function createStepFromTool(toolFn: ToolFunction): SkillFormStep {
  return {
    id: createStepId(),
    toolName: toolFn.name,
    params: buildParamsFromTool(toolFn),
  };
}

function buildSkillContentFromForm(state: SkillFormState): string {
  const trimmedName = state.name.trim();
  const description = state.description.trim();
  const instruction = state.instruction.trim();
  const generatedId = state.id.trim() || slugifySkillId(trimmedName);

  const inputsMap = new Map<string, any>();
  const steps: any[] = [];

  for (const stepState of state.steps) {
    const args: Record<string, any> = {};
    for (const param of stepState.params) {
      if (param.mode === "input") {
        args[param.name] = `{{${param.name}}}`;
        if (!inputsMap.has(param.name)) {
          const input: any = {
            name: param.name,
            type: param.type,
          };
          if (param.description) input.description = param.description;
          if (param.required) input.required = true;
          if (param.enumValues && param.enumValues.length > 0) {
            input.enum = param.enumValues;
          }
          if (param.defaultValue !== undefined) {
            input.default = param.defaultValue;
          }
          inputsMap.set(param.name, input);
        }
        continue;
      }

      if (param.mode === "fixed") {
        const rawValue = param.value.trim();
        if (!rawValue && param.defaultValue !== undefined) {
          args[param.name] = param.defaultValue;
          continue;
        }
        if (!rawValue) continue;
        const { value } = coerceFixedValue(rawValue, param.type);
        if (value !== undefined) {
          args[param.name] = value;
        }
      }
    }

    const step: any = {
      type: "tool",
      tool: stepState.toolName,
    };
    if (Object.keys(args).length > 0) {
      step.args = args;
    }
    steps.push(step);
  }

  const metadata: any = {
    name: trimmedName || "未命名技能",
    steps,
  };
  if (generatedId) metadata.id = generatedId;
  if (description) metadata.description = description;
  const inputs = Array.from(inputsMap.values());
  if (inputs.length > 0) metadata.inputs = inputs;

  const yamlBody = stringifyYaml(metadata).trim();
  const content = `---\n${yamlBody}\n---\n${instruction}`.trimEnd();
  return `${content}\n`;
}

function buildFormStateFromContent(
  content: string,
  toolMap: Map<string, ToolFunction>,
): { state?: SkillFormState; reason?: string } {
  const { metadata, instruction } = parseSkillFile(content);
  const name = String(metadata.name ?? "").trim();
  const description = String(metadata.description ?? "").trim();
  const id = String(metadata.id ?? "").trim();

  const steps = Array.isArray(metadata.steps) ? metadata.steps : [];
  if (steps.length === 0) {
    return { reason: "未找到可用的工具步骤" };
  }

  const inputs = Array.isArray(metadata.inputs) ? metadata.inputs : [];
  const inputMap = new Map<string, any>();
  for (const input of inputs) {
    if (!input || typeof input !== "object") continue;
    const inputName = String(input.name ?? "").trim();
    if (!inputName) continue;
    inputMap.set(inputName, input);
  }

  let unsupportedReason: string | null = null;
  const allParamNames = new Set<string>();
  const stepStates: SkillFormStep[] = [];

  for (const rawStep of steps) {
    const stepType = String(rawStep?.type ?? "").toLowerCase();
    if (stepType !== "tool" || !rawStep?.tool) {
      return { reason: "仅支持工具类型的技能" };
    }

    const toolName = String(rawStep.tool);
    const toolFn = toolMap.get(toolName);
    if (!toolFn) {
      return { reason: "当前工具不在可用列表中" };
    }

    const paramSpecs = buildToolParamSpecs(toolFn);
    const paramNames = new Set(paramSpecs.map((param) => param.name));
    for (const name of paramNames) {
      allParamNames.add(name);
    }

    const args = rawStep.args && typeof rawStep.args === "object" ? rawStep.args : {};
    for (const key of Object.keys(args)) {
      if (!paramNames.has(key)) {
        return { reason: "参数不匹配，建议使用高级模式" };
      }
    }

    const params: SkillFormParam[] = paramSpecs.map((spec) => {
      const argValue = Object.prototype.hasOwnProperty.call(args, spec.name)
        ? (args as any)[spec.name]
        : undefined;
      let mode: ParamMode = spec.required ? "input" : "fixed";
      let value = spec.defaultValue !== undefined ? formatValueForInput(spec.defaultValue) : "";

      if (typeof argValue === "string") {
        const match = argValue.match(/^{{\s*([\w-]+)\s*}}$/);
        if (match) {
          if (match[1] !== spec.name) {
            unsupportedReason = "参数占位符与字段不一致，建议使用高级模式";
          }
          mode = "input";
        } else if (argValue.trim()) {
          mode = "fixed";
          value = formatValueForInput(argValue);
        }
      } else if (argValue !== undefined) {
        mode = "fixed";
        value = formatValueForInput(argValue);
      }

      if (inputMap.has(spec.name)) {
        mode = "input";
      }

      const inputDef = inputMap.get(spec.name);
      const resolvedType = normalizeInputType(inputDef?.type ?? spec.type);

      return {
        name: spec.name,
        type: resolvedType,
        required: Boolean(inputDef?.required ?? spec.required),
        description: inputDef?.description ? String(inputDef.description) : spec.description,
        enumValues: Array.isArray(inputDef?.enum) ? inputDef.enum.map(String) : spec.enumValues,
        defaultValue: inputDef?.default ?? spec.defaultValue,
        mode,
        value,
      };
    });

    stepStates.push({
      id: createStepId(),
      toolName,
      params,
    });
  }

  for (const inputName of inputMap.keys()) {
    if (!allParamNames.has(inputName)) {
      return { reason: "输入字段不匹配，建议使用高级模式" };
    }
  }

  if (unsupportedReason) {
    return { reason: unsupportedReason };
  }

  return {
    state: {
      id,
      name,
      description,
      instruction: instruction ?? "",
      steps: stepStates,
    },
  };
}

function validateFormState(state: SkillFormState): string | null {
  if (!state.name.trim()) return "请输入技能名称";
  if (state.steps.length === 0) return "请至少添加一个步骤";

  for (let stepIndex = 0; stepIndex < state.steps.length; stepIndex += 1) {
    const step = state.steps[stepIndex];
    if (!step.toolName) {
      return `步骤 ${stepIndex + 1} 请选择工具`;
    }
    for (const param of step.params) {
      if (param.mode !== "fixed") continue;
      const rawValue = param.value.trim();
      if (!rawValue && param.required && param.defaultValue === undefined) {
        return `步骤 ${stepIndex + 1} 参数 ${param.name} 需要填写值`;
      }
      if (!rawValue) continue;
      const { error } = coerceFixedValue(rawValue, param.type);
      if (error) {
        return `步骤 ${stepIndex + 1} 参数 ${param.name}：${error}`;
      }
    }
  }

  return null;
}

export default function SkillManagerModal({ isOpen, onClose }: SkillManagerModalProps) {
  const snap = useSnapshot(skillStore);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [newSkillName, setNewSkillName] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [editingSkill, setEditingSkill] = useState<typeof snap.skills[number] | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [editingLoading, setEditingLoading] = useState(false);
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<FormMode>("advanced");
  const [simpleSupported, setSimpleSupported] = useState(false);
  const [formState, setFormState] = useState<SkillFormState | null>(null);
  const [formHint, setFormHint] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<typeof snap.skills[number] | null>(null);
  const [draggingStepId, setDraggingStepId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !snap.loading) {
      loadSkillRegistry();
    }
  }, [isOpen]);

  useEffect(() => {
    setSelectedSkills(prev => {
      const available = new Set(snap.skills.map(skill => skill.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (available.has(id)) next.add(id);
      }
      return next;
    });
  }, [snap.skills]);

  const toolOptions = useMemo(() => {
    const tools = getTools();
    return tools
      .filter((tool) => tool.type === "function")
      .map((tool) => tool.function)
      .filter((toolFn) => !toolFn.name.startsWith("skill_"))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, []);

  const toolMap = useMemo(() => {
    return new Map<string, ToolFunction>(toolOptions.map((tool) => [tool.name, tool]));
  }, [toolOptions]);

  const toggleSkillSelection = useCallback((skillId: string) => {
    setSelectedSkills(prev => {
      const next = new Set(prev);
      if (next.has(skillId)) {
        next.delete(skillId);
      } else {
        next.add(skillId);
      }
      return next;
    });
  }, []);

  const handleSkillRefresh = useCallback(async () => {
    await loadSkillRegistry();
  }, []);

  const handleRestoreBuiltIns = useCallback(async () => {
    setRestoring(true);
    try {
      await restoreBuiltInSkills();
      orca.notify("success", "内置技能已恢复");
    } catch (err: any) {
      orca.notify("error", err?.message ?? "恢复内置技能失败");
    } finally {
      setRestoring(false);
    }
  }, []);

  const handleCreateSkill = useCallback(async () => {
    const name = newSkillName.trim();
    if (!name) {
      orca.notify("warn", "请输入技能名称");
      return;
    }
    setCreating(true);
    try {
      await createSkillTemplate(name);
      await loadSkillRegistry();
      setNewSkillName("");
    } catch (err: any) {
      orca.notify("error", err?.message ?? "新建技能失败");
    } finally {
      setCreating(false);
    }
  }, [newSkillName]);

  const handleExportSkills = useCallback(async () => {
    const selected = snap.skills.filter(skill => selectedSkills.has(skill.id));
    if (selected.length === 0) return;
    await exportSkillsZip(selected);
  }, [snap.skills, selectedSkills]);

  const handleImportSkills = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      await importSkillsZip(file);
      await loadSkillRegistry();
    };
    input.click();
  }, []);

  const handleOpenEditor = useCallback(async (skill: typeof snap.skills[number]) => {
    setEditingSkill(skill);
    setEditingError(null);
    setFormHint(null);
    setEditingLoading(true);
    try {
      const content = await getSkillContent(skill);
      setEditingContent(content);
      const parsed = buildFormStateFromContent(content, toolMap);
      if (parsed.state) {
        setFormState(parsed.state);
        setSimpleSupported(true);
        setEditorMode("simple");
        setFormHint(null);
      } else {
        setFormState(null);
        setSimpleSupported(false);
        setEditorMode("advanced");
        setFormHint(parsed.reason ?? "该技能暂不支持简化编辑");
      }
    } catch (err: any) {
      orca.notify("error", err?.message ?? "读取技能失败");
      setEditingSkill(null);
      setEditingContent("");
    } finally {
      setEditingLoading(false);
    }
  }, [toolMap]);

  const handleCloseEditor = useCallback(() => {
    setEditingSkill(null);
    setEditingContent("");
    setEditingError(null);
    setEditingLoading(false);
    setFormState(null);
    setSimpleSupported(false);
    setEditorMode("advanced");
    setFormHint(null);
    setDraggingStepId(null);
  }, []);

  const generatedContent = useMemo(() => {
    if (!formState) return "";
    return buildSkillContentFromForm(formState);
  }, [formState]);

  const effectiveContent =
    editorMode === "simple" && formState ? generatedContent : editingContent;

  const previewContent = useMemo(() => {
    if (!effectiveContent) return "";
    const { instruction } = parseSkillFile(effectiveContent);
    return instruction || "";
  }, [effectiveContent]);

  const handleSaveEditor = useCallback(async () => {
    if (!editingSkill) return;
    setEditingSaving(true);
    setEditingError(null);
    try {
      if (editorMode === "simple") {
        if (!formState) {
          throw new Error("简化表单不可用");
        }
        const validationError = validateFormState(formState);
        if (validationError) {
          setEditingError(validationError);
          return;
        }
        await updateSkillContent(editingSkill, generatedContent);
      } else {
        await updateSkillContent(editingSkill, editingContent);
      }
      await loadSkillRegistry();
      setEditingSkill(null);
      setEditingContent("");
    } catch (err: any) {
      setEditingError(err?.message ?? "保存失败");
    } finally {
      setEditingSaving(false);
    }
  }, [editingSkill, editingContent, editorMode, formState, generatedContent]);

  const handleDeleteSkill = useCallback((skill: typeof snap.skills[number]) => {
    setDeleteTarget(skill);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkill(deleteTarget);
      await loadSkillRegistry();
    } catch (err: any) {
      orca.notify("error", err?.message ?? "删除失败");
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  const handleSwitchMode = useCallback(
    (mode: FormMode) => {
      if (mode === editorMode) return;
      if (mode === "simple") {
        const parsed = buildFormStateFromContent(editingContent, toolMap);
        if (!parsed.state) {
          const hint = parsed.reason ?? "该技能暂不支持简化编辑";
          setFormHint(hint);
          setSimpleSupported(false);
          orca.notify("warn", hint);
          return;
        }
        setFormState(parsed.state);
        setSimpleSupported(true);
        setFormHint(null);
      } else if (mode === "advanced" && formState) {
        setEditingContent(buildSkillContentFromForm(formState));
      }
      setEditorMode(mode);
    },
    [editorMode, editingContent, toolMap, formState]
  );

  const handleFormFieldChange = useCallback(
    (patch: Partial<SkillFormState>) => {
      setFormState((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    []
  );

  const handleToolChange = useCallback(
    (stepId: string, toolName: string) => {
      const toolFn = toolMap.get(toolName);
      if (!toolFn) return;
      setFormState((prev) => {
        if (!prev) return prev;
        const nextSteps = prev.steps.map((step) => {
          if (step.id !== stepId) return step;
          return {
            ...step,
            toolName,
            params: buildParamsFromTool(toolFn),
          };
        });
        return {
          ...prev,
          steps: nextSteps,
        };
      });
    },
    [toolMap]
  );

  const handleParamModeChange = useCallback((stepId: string, name: string, mode: ParamMode) => {
    setFormState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((step) => {
          if (step.id !== stepId) return step;
          return {
            ...step,
            params: step.params.map((param) =>
              param.name === name ? { ...param, mode } : param
            ),
          };
        }),
      };
    });
  }, []);

  const handleParamValueChange = useCallback((stepId: string, name: string, value: string) => {
    setFormState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: prev.steps.map((step) => {
          if (step.id !== stepId) return step;
          return {
            ...step,
            params: step.params.map((param) =>
              param.name === name ? { ...param, value } : param
            ),
          };
        }),
      };
    });
  }, []);

  const handleAddStep = useCallback(() => {
    const firstTool = toolOptions[0];
    if (!firstTool) {
      orca.notify("warn", "暂无可用工具");
      return;
    }
    setFormState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        steps: [...prev.steps, createStepFromTool(firstTool)],
      };
    });
  }, [toolOptions]);

  const handleRemoveStep = useCallback((stepId: string) => {
    setFormState((prev) => {
      if (!prev) return prev;
      const nextSteps = prev.steps.filter((step) => step.id !== stepId);
      return {
        ...prev,
        steps: nextSteps,
      };
    });
  }, []);

  const handleReorderSteps = useCallback((sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    setFormState((prev) => {
      if (!prev) return prev;
      const sourceIndex = prev.steps.findIndex((step) => step.id === sourceId);
      const targetIndex = prev.steps.findIndex((step) => step.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) return prev;
      const nextSteps = [...prev.steps];
      const [moved] = nextSteps.splice(sourceIndex, 1);
      nextSteps.splice(targetIndex, 0, moved);
      return { ...prev, steps: nextSteps };
    });
  }, []);

  const handleDragStart = useCallback((stepId: string, event: any) => {
    setDraggingStepId(stepId);
    if (event.dataTransfer) {
      event.dataTransfer.setData("text/plain", stepId);
      event.dataTransfer.effectAllowed = "move";
    }
  }, []);

  const handleDragOver = useCallback((event: any) => {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleDrop = useCallback(
    (targetId: string, event: any) => {
      event.preventDefault();
      const sourceId =
        event.dataTransfer?.getData("text/plain") || draggingStepId || "";
      if (sourceId) {
        handleReorderSteps(sourceId, targetId);
      }
      setDraggingStepId(null);
    },
    [draggingStepId, handleReorderSteps]
  );

  const handleDragEnd = useCallback(() => {
    setDraggingStepId(null);
  }, []);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)",
    borderRadius: 12,
    padding: 20,
    width: 520,
    maxWidth: "92vw",
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: 18,
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
  };

  const toolbarStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 12,
  };

  const inputStyle: React.CSSProperties = {
    flex: 1,
    minWidth: 180,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: 12,
  };

  const actionRowStyle: React.CSSProperties = {
    display: "flex",
    gap: 6,
    alignItems: "center",
  };

  const editOverlayStyle: React.CSSProperties = {
    ...overlayStyle,
    zIndex: 1100,
  };

  const editModalStyle: React.CSSProperties = {
    ...modalStyle,
    width: "min(920px, 94vw)",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
  };

  const editBodyStyle: React.CSSProperties = {
    marginTop: 12,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    flex: 1,
    minHeight: 320,
    overflow: "hidden",
  };

  const editorStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 320,
    height: "100%",
    resize: "none",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: 12,
    fontFamily: "monospace",
    boxSizing: "border-box",
  };

  const previewStyle: React.CSSProperties = {
    border: "1px solid var(--orca-color-border)",
    borderRadius: 8,
    padding: 12,
    background: "var(--orca-color-bg-2)",
    overflowY: "auto",
    height: "100%",
  };

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    gap: 8,
  };

  const modeToggleStyle: React.CSSProperties = {
    display: "flex",
    gap: 8,
    marginTop: 8,
  };

  const formContainerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
  };

  const formScrollStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
    overflowY: "auto",
    paddingRight: 4,
    height: "100%",
  };

  const previewColumnStyle: React.CSSProperties = {
    minWidth: 0,
    overflowY: "auto",
    height: "100%",
  };

  const formFieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--orca-color-text-3)",
  };

  const fieldInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: 12,
    boxSizing: "border-box",
  };

  const fieldTextAreaStyle: React.CSSProperties = {
    ...fieldInputStyle,
    minHeight: 120,
    resize: "vertical",
    fontFamily: "inherit",
  };

  const paramListStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  };

  const paramCardStyle: React.CSSProperties = {
    border: "1px solid var(--orca-color-border)",
    borderRadius: 8,
    padding: 8,
    background: "var(--orca-color-bg-2)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  };

  const stepCardStyle: React.CSSProperties = {
    border: "1px solid var(--orca-color-border)",
    borderRadius: 10,
    padding: 12,
    background: "var(--orca-color-bg-1)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };

  const stepHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const stepTitleStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
  };

  const stepMetaStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--orca-color-text-3)",
  };

  const dragHandleStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "grab",
    padding: 4,
    borderRadius: 6,
    color: "var(--orca-color-text-3)",
  };

  const stepActionsStyle: React.CSSProperties = {
    marginLeft: "auto",
    display: "flex",
    gap: 6,
    alignItems: "center",
  };

  const paramHeaderStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--orca-color-text-1)",
  };

  const paramMetaStyle: React.CSSProperties = {
    fontSize: 11,
    color: "var(--orca-color-text-3)",
  };

  const paramControlRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
  };

  const requiredBadgeStyle: React.CSSProperties = {
    fontSize: 10,
    padding: "1px 6px",
    borderRadius: 10,
    background: "var(--orca-color-red)",
    color: "#fff",
  };

  const listStyle: React.CSSProperties = {
    marginTop: 16,
    maxHeight: 320,
    overflowY: "auto",
    border: "1px solid var(--orca-color-border)",
    borderRadius: 8,
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    borderBottom: "1px solid var(--orca-color-border)",
    fontSize: 12,
    color: "var(--orca-color-text-2)",
  };

  const renderEditModal = () => {
    if (!editingSkill) return null;

    return createElement(
      "div",
      {
        style: editOverlayStyle,
        onClick: (e: any) => {
          e.stopPropagation();
          handleCloseEditor();
        },
      },
      createElement(
        "div",
        { style: editModalStyle, onClick: (e: any) => e.stopPropagation() },
        createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          createElement("div", { style: titleStyle }, `编辑技能：${editingSkill.name}`),
          withTooltip(
            "关闭",
            createElement(
              Button,
              { variant: "plain", onClick: handleCloseEditor },
              createElement("i", { className: "ti ti-x" })
            )
          )
        ),
        createElement(
          "div",
          { style: modeToggleStyle },
          withTooltip(
            simpleSupported ? "使用简化编辑" : formHint ?? "尝试简化编辑",
            createElement(
              Button,
              {
                variant: editorMode === "simple" ? "secondary" : "plain",
                onClick: () => handleSwitchMode("simple"),
              },
              "简化模式"
            )
          ),
          withTooltip(
            "使用高级编辑",
            createElement(
              Button,
              {
                variant: editorMode === "advanced" ? "secondary" : "plain",
                onClick: () => handleSwitchMode("advanced"),
              },
              "高级模式"
            )
          )
        ),
        formHint &&
          createElement(
            "div",
            { style: { marginTop: 6, fontSize: 11, color: "var(--orca-color-text-3)" } },
            formHint
          ),
        editingLoading
          ? createElement(
              "div",
              { style: { marginTop: 12, fontSize: 12, color: "var(--orca-color-text-3)" } },
              "加载中..."
            )
          : editorMode === "simple"
            ? createElement(
                "div",
                { style: editBodyStyle },
                formState
                  ? createElement(
                      "div",
                      { style: formScrollStyle },
                      createElement(
                        "div",
                        { style: formFieldStyle },
                        createElement("div", { style: fieldLabelStyle }, "技能名称"),
                        createElement("input", {
                          value: formState.name,
                          onChange: (e: any) => handleFormFieldChange({ name: e.target.value }),
                          style: fieldInputStyle,
                        })
                      ),
                      createElement(
                        "div",
                        { style: formFieldStyle },
                        createElement("div", { style: fieldLabelStyle }, "技能描述"),
                        createElement("input", {
                          value: formState.description,
                          onChange: (e: any) => handleFormFieldChange({ description: e.target.value }),
                          style: fieldInputStyle,
                        })
                      ),
                      createElement(
                        "div",
                        { style: formFieldStyle },
                        createElement("div", { style: fieldLabelStyle }, "指令说明"),
                        createElement("textarea", {
                          value: formState.instruction,
                          onChange: (e: any) => handleFormFieldChange({ instruction: e.target.value }),
                          style: fieldTextAreaStyle,
                        })
                      ),
                      createElement(
                        "div",
                        { style: formFieldStyle },
                        createElement("div", { style: fieldLabelStyle }, "步骤设置"),
                        createElement(
                          "div",
                          { style: paramListStyle },
                          formState.steps.length === 0
                            ? createElement(
                                "div",
                                { style: paramMetaStyle },
                                "暂无步骤，请添加工具步骤"
                              )
                            : formState.steps.map((step, stepIndex) => {
                                const toolFn = toolMap.get(step.toolName);
                                const optionLabel = toolFn ? formatToolOptionLabel(toolFn) : step.toolName;
                                return createElement(
                                  "div",
                                  {
                                    key: step.id,
                                    style: {
                                      ...stepCardStyle,
                                      borderColor:
                                        draggingStepId === step.id
                                          ? "var(--orca-color-primary)"
                                          : stepCardStyle.borderColor,
                                    },
                                    onDragOver: handleDragOver,
                                    onDrop: (event: any) => handleDrop(step.id, event),
                                  },
                                  createElement(
                                    "div",
                                    { style: stepHeaderStyle },
                                    withTooltip(
                                      "拖拽排序",
                                      createElement(
                                        "div",
                                        {
                                          style: dragHandleStyle,
                                          draggable: true,
                                          onDragStart: (event: any) => handleDragStart(step.id, event),
                                          onDragEnd: handleDragEnd,
                                        },
                                        createElement("i", { className: "ti ti-grip-vertical" })
                                      )
                                    ),
                                    createElement(
                                      "div",
                                      { style: stepTitleStyle },
                                      `步骤 ${stepIndex + 1}`
                                    ),
                                    toolFn &&
                                      createElement(
                                        "div",
                                        { style: stepMetaStyle },
                                        getToolLabel(toolFn)
                                      ),
                                    createElement(
                                      "div",
                                      { style: stepActionsStyle },
                                      withTooltip(
                                        "删除步骤",
                                        createElement(
                                          Button,
                                          {
                                            variant: "plain",
                                            onClick: () => handleRemoveStep(step.id),
                                          },
                                          createElement("i", { className: "ti ti-trash" })
                                        )
                                      )
                                    )
                                  ),
                                  createElement(
                                    "div",
                                    { style: formFieldStyle },
                                    createElement("div", { style: fieldLabelStyle }, "选择工具"),
                                    createElement(
                                      "select",
                                      {
                                        value: step.toolName,
                                        onChange: (e: any) =>
                                          handleToolChange(step.id, e.target.value),
                                        style: fieldInputStyle,
                                      },
                                      toolOptions.map((tool) =>
                                        createElement(
                                          "option",
                                          { key: tool.name, value: tool.name },
                                          formatToolOptionLabel(tool)
                                        )
                                      )
                                    ),
                                    toolFn?.description &&
                                      createElement(
                                        "div",
                                        { style: stepMetaStyle },
                                        getFirstLine(toolFn.description) || optionLabel
                                      )
                                  ),
                                  createElement(
                                    "div",
                                    { style: formFieldStyle },
                                    createElement("div", { style: fieldLabelStyle }, "参数设置"),
                                    createElement(
                                      "div",
                                      { style: paramListStyle },
                                      step.params.length === 0
                                        ? createElement(
                                            "div",
                                            { style: paramMetaStyle },
                                            "该工具没有参数"
                                          )
                                        : step.params.map((param) =>
                                            createElement(
                                              "div",
                                              { key: param.name, style: paramCardStyle },
                                              createElement(
                                                "div",
                                                { style: paramHeaderStyle },
                                                getParamLabel(param),
                                                getParamLabel(param) !== param.name &&
                                                  createElement(
                                                    "span",
                                                    { style: paramMetaStyle },
                                                    param.name
                                                  ),
                                                createElement(
                                                  "span",
                                                  { style: paramMetaStyle },
                                                  `(${param.type})`
                                                ),
                                                param.required &&
                                                  createElement("span", { style: requiredBadgeStyle }, "必填")
                                              ),
                                              param.description &&
                                                createElement("div", { style: paramMetaStyle }, param.description),
                                              createElement(
                                                "div",
                                                { style: paramControlRowStyle },
                                                createElement(
                                                  "select",
                                                  {
                                                    value: param.mode,
                                                    onChange: (e: any) =>
                                                      handleParamModeChange(
                                                        step.id,
                                                        param.name,
                                                        e.target.value as ParamMode
                                                      ),
                                                    style: fieldInputStyle,
                                                  },
                                                  createElement("option", { value: "input" }, "作为输入"),
                                                  createElement("option", { value: "fixed" }, "固定值")
                                                ),
                                                param.mode === "fixed"
                                                  ? param.enumValues && param.enumValues.length > 0
                                                    ? createElement(
                                                        "select",
                                                        {
                                                          value: param.value,
                                                          onChange: (e: any) =>
                                                            handleParamValueChange(
                                                              step.id,
                                                              param.name,
                                                              e.target.value
                                                            ),
                                                          style: fieldInputStyle,
                                                        },
                                                        !param.required &&
                                                          createElement("option", { value: "" }, "（可选）"),
                                                        param.enumValues.map((item) =>
                                                          createElement(
                                                            "option",
                                                            { key: item, value: item },
                                                            item
                                                          )
                                                        )
                                                      )
                                                    : param.type === "boolean"
                                                      ? createElement(
                                                          "select",
                                                          {
                                                            value: param.value,
                                                            onChange: (e: any) =>
                                                              handleParamValueChange(
                                                                step.id,
                                                                param.name,
                                                                e.target.value
                                                              ),
                                                            style: fieldInputStyle,
                                                          },
                                                          !param.required &&
                                                            createElement("option", { value: "" }, "（可选）"),
                                                          createElement("option", { value: "true" }, "true"),
                                                          createElement("option", { value: "false" }, "false")
                                                        )
                                                      : param.type === "object" || param.type === "array"
                                                        ? createElement("textarea", {
                                                            value: param.value,
                                                            onChange: (e: any) =>
                                                              handleParamValueChange(
                                                                step.id,
                                                                param.name,
                                                                e.target.value
                                                              ),
                                                            style: fieldTextAreaStyle,
                                                            placeholder: "请输入 JSON",
                                                          })
                                                        : createElement("input", {
                                                            value: param.value,
                                                            onChange: (e: any) =>
                                                              handleParamValueChange(
                                                                step.id,
                                                                param.name,
                                                                e.target.value
                                                              ),
                                                            style: fieldInputStyle,
                                                            placeholder: param.required ? "必填" : "可选",
                                                          })
                                                  : createElement(
                                                      "div",
                                                      { style: paramMetaStyle },
                                                      "执行时由 AI 填写"
                                                    )
                                              )
                                            )
                                          )
                                    )
                                  )
                                );
                              })
                        ),
                        createElement(
                          Button,
                          { variant: "secondary", onClick: handleAddStep },
                          "添加步骤"
                        )
                      )
                    )
                  : createElement(
                      "div",
                      { style: { fontSize: 12, color: "var(--orca-color-text-3)" } },
                      "当前技能无法简化编辑，请切换高级模式。"
                    ),
                createElement(
                  "div",
                  { style: previewColumnStyle },
                  createElement(
                    "div",
                    { style: previewStyle },
                    previewContent
                      ? createElement(MarkdownMessage, { content: previewContent, role: "assistant" })
                      : createElement(
                          "div",
                          { style: { fontSize: 12, color: "var(--orca-color-text-3)" } },
                          "暂无预览内容"
                        )
                  )
                )
              )
            : createElement(
                "div",
                { style: editBodyStyle },
                createElement("textarea", {
                  value: editingContent,
                  onChange: (e: any) => setEditingContent(e.target.value),
                  style: editorStyle,
                }),
                createElement(
                  "div",
                  { style: previewColumnStyle },
                  createElement(
                    "div",
                    { style: previewStyle },
                    previewContent
                      ? createElement(MarkdownMessage, { content: previewContent, role: "assistant" })
                      : createElement(
                          "div",
                          { style: { fontSize: 12, color: "var(--orca-color-text-3)" } },
                          "暂无预览内容"
                        )
                  )
                )
              ),
        editingError &&
          createElement(
            "div",
            { style: { marginTop: 8, fontSize: 12, color: "var(--orca-color-red)" } },
            editingError
          ),
        createElement(
          "div",
          { style: footerStyle },
          createElement(
            "div",
            { style: { fontSize: 11, color: "var(--orca-color-text-3)" } },
            "预览仅显示指令部分，保存后将更新技能内容。"
          ),
          createElement(
            "div",
            { style: actionRowStyle },
            createElement(
              Button,
              { variant: "secondary", onClick: handleCloseEditor },
              "取消"
            ),
            createElement(
              Button,
              {
                variant: "secondary",
                onClick: handleSaveEditor,
                disabled: editingSaving || editingLoading,
              },
              editingSaving ? "保存中..." : "保存"
            )
          )
        )
      )
    );
  };

  const renderDeleteConfirm = () => {
    if (!deleteTarget) return null;

    return createElement(
      "div",
      {
        style: editOverlayStyle,
        onClick: (e: any) => {
          e.stopPropagation();
          handleCancelDelete();
        },
      },
      createElement(
        "div",
        { style: modalStyle, onClick: (e: any) => e.stopPropagation() },
        createElement("div", { style: titleStyle }, "删除技能"),
        createElement(
          "div",
          { style: { marginTop: 8, fontSize: 12, color: "var(--orca-color-text-2)" } },
          `确定删除「${deleteTarget.name}」吗？此操作无法撤销。`
        ),
        createElement(
          "div",
          { style: { display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 } },
          createElement(
            Button,
            { variant: "secondary", onClick: handleCancelDelete },
            "取消"
          ),
          createElement(
            Button,
            { variant: "secondary", onClick: handleConfirmDelete },
            "删除"
          )
        )
      )
    );
  };

  return createElement(
    "div",
    { style: overlayStyle, onClick: onClose },
    createElement(
      "div",
      { style: modalStyle, onClick: (e: any) => e.stopPropagation() },
      createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        createElement("div", { style: titleStyle }, "技能管理"),
        withTooltip(
          "关闭",
          createElement(
            Button,
            { variant: "plain", onClick: onClose },
            createElement("i", { className: "ti ti-x" })
          )
        )
      ),
      createElement(
        "div",
        { style: toolbarStyle },
        createElement("input", {
          value: newSkillName,
          onChange: (e: any) => setNewSkillName(e.target.value),
          placeholder: "技能名称",
          style: inputStyle,
          onKeyDown: (e: any) => {
            if (e.key === "Enter") {
              handleCreateSkill();
            }
          },
        }),
        createElement(
          Button,
          { variant: "secondary", onClick: handleSkillRefresh },
          "刷新"
        ),
        createElement(
          Button,
          { variant: "secondary", onClick: handleRestoreBuiltIns, disabled: restoring },
          restoring ? "恢复中..." : "恢复内置技能"
        ),
        createElement(
          Button,
          {
            variant: "secondary",
            onClick: handleCreateSkill,
            disabled: creating || newSkillName.trim().length === 0,
          },
          creating ? "创建中..." : "新建"
        ),
        createElement(
          Button,
          { variant: "secondary", onClick: handleImportSkills },
          "导入"
        ),
        createElement(
          Button,
          { variant: "secondary", onClick: handleExportSkills, disabled: selectedSkills.size === 0 },
          "导出"
        )
      ),
      snap.error &&
        createElement(
          "div",
          { style: { marginTop: 8, fontSize: 12, color: "var(--orca-color-red)" } },
          snap.error
        ),
      snap.loading
        ? createElement(
            "div",
            { style: { marginTop: 12, fontSize: 12, color: "var(--orca-color-text-3)" } },
            "技能加载中..."
          )
        : createElement(
            "div",
            { style: listStyle },
            ...(snap.skills.length === 0
              ? [
                  createElement(
                    "div",
                    { style: { padding: 12, fontSize: 12, color: "var(--orca-color-text-3)" } },
                    "暂无技能"
                  ),
                ]
              : snap.skills.map((skill, index) =>
                  createElement(
                    "div",
                    {
                      key: skill.id,
                      style: {
                        ...rowStyle,
                        borderBottom: index === snap.skills.length - 1 ? "none" : rowStyle.borderBottom,
                      },
                    },
                    createElement("input", {
                      type: "checkbox",
                      checked: selectedSkills.has(skill.id),
                      onChange: () => toggleSkillSelection(skill.id),
                    }),
                    createElement(
                      "div",
                      { style: { flex: 1, minWidth: 0 } },
                      createElement(
                        "div",
                        { style: { fontSize: 12, color: "var(--orca-color-text-1)" } },
                        skill.name
                      ),
                      skill.description &&
                        createElement(
                          "div",
                          {
                            style: {
                              fontSize: 11,
                              color: "var(--orca-color-text-3)",
                              marginTop: 2,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            },
                          },
                          skill.description
                        )
                    ),
                    createElement(
                      "div",
                      { style: { fontSize: 11, color: "var(--orca-color-text-3)" } },
                      skill.source === "built-in" ? "内置" : "自定义"
                    ),
                    createElement(
                      "div",
                      { style: actionRowStyle },
                      withTooltip(
                        "编辑技能",
                        createElement(
                          Button,
                          {
                            variant: "plain",
                            onClick: () => handleOpenEditor(skill),
                          },
                          createElement("i", { className: "ti ti-edit" })
                        )
                      ),
                      withTooltip(
                        "删除技能",
                        createElement(
                          Button,
                          {
                            variant: "plain",
                            onClick: () => handleDeleteSkill(skill),
                          },
                          createElement("i", { className: "ti ti-trash" })
                        )
                      )
                    )
                  )
                ))
          )
    ),
    renderEditModal(),
    renderDeleteConfirm()
  );
}
