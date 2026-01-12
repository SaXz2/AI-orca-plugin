/**
 * Skill Manager Modal
 * 管理技能列表与导入导出
 * 
 * Codex-style skills: 只有 name, description, instruction 三个字段
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
  deleteSkillById,
  loadSkillRegistry,
  restoreBuiltInSkills,
  createSkill,
  updateSkill,
  exportSkill,
  importSkill,
  searchSkills,
} from "../services/skill-service";
import type { SkillDefinition } from "../types/skill";
import { exportSkillsZip, importSkillsZip } from "../services/skill-zip";
import MarkdownMessage from "../components/MarkdownMessage";
import { SKILL_NAME_MAX_LENGTH, SKILL_DESCRIPTION_MAX_LENGTH } from "../types/skill";

interface SkillManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Form state for editing a skill
 */
interface SkillFormState {
  name: string;
  description: string;
  instruction: string;
}

export default function SkillManagerModal({ isOpen, onClose }: SkillManagerModalProps) {
  const snap = useSnapshot(skillStore);
  const [selectedSkills, setSelectedSkills] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [restoring, setRestoring] = useState(false);
  
  // Edit modal state
  const [editingSkill, setEditingSkill] = useState<typeof snap.skills[number] | null>(null);
  const [editForm, setEditForm] = useState<SkillFormState>({ name: "", description: "", instruction: "" });
  const [editingSaving, setEditingSaving] = useState(false);
  const [editingError, setEditingError] = useState<string | null>(null);
  
  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState<SkillFormState>({ name: "", description: "", instruction: "" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  
  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<typeof snap.skills[number] | null>(null);

  // Filter skills based on search query
  const filteredSkills = useMemo(() => {
    if (!searchQuery.trim()) {
      return snap.skills;
    }
    return searchSkills(searchQuery);
  }, [snap.skills, searchQuery]);

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

  // Create skill handlers
  const handleOpenCreate = useCallback(() => {
    setCreateForm({ name: "", description: "", instruction: "" });
    setCreateError(null);
    setShowCreateModal(true);
  }, []);

  const handleCloseCreate = useCallback(() => {
    setShowCreateModal(false);
    setCreateForm({ name: "", description: "", instruction: "" });
    setCreateError(null);
  }, []);

  const handleCreateSkill = useCallback(async () => {
    const name = createForm.name.trim();
    if (!name) {
      setCreateError("请输入技能名称");
      return;
    }
    if (name.length > SKILL_NAME_MAX_LENGTH) {
      setCreateError(`技能名称不能超过 ${SKILL_NAME_MAX_LENGTH} 字符`);
      return;
    }
    if (createForm.description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
      setCreateError(`技能描述不能超过 ${SKILL_DESCRIPTION_MAX_LENGTH} 字符`);
      return;
    }
    
    setCreating(true);
    setCreateError(null);
    try {
      await createSkill(name, createForm.description, createForm.instruction);
      await loadSkillRegistry();
      handleCloseCreate();
      orca.notify("success", "技能创建成功");
    } catch (err: any) {
      setCreateError(err?.message ?? "创建技能失败");
    } finally {
      setCreating(false);
    }
  }, [createForm, handleCloseCreate]);

  // Export/Import handlers
  const handleExportSkills = useCallback(async () => {
    const selected = snap.skills.filter(skill => selectedSkills.has(skill.id));
    if (selected.length === 0) return;
    
    if (selected.length === 1) {
      const skill = selected[0];
      const content = exportSkill(skill);
      const blob = new Blob([content], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${skill.metadata.name}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }
    
    await exportSkillsZip(selected);
  }, [snap.skills, selectedSkills]);

  const handleImportSkills = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".zip,.md";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      
      if (file.name.endsWith(".md")) {
        try {
          const content = await file.text();
          await importSkill(content);
          await loadSkillRegistry();
          orca.notify("success", "技能导入成功");
        } catch (err: any) {
          orca.notify("error", err?.message ?? "导入失败");
        }
      } else {
        await importSkillsZip(file);
        await loadSkillRegistry();
      }
    };
    input.click();
  }, []);

  // Edit handlers
  const handleOpenEditor = useCallback((skill: SkillDefinition) => {
    setEditingSkill(skill);
    setEditForm({
      name: skill.metadata.name,
      description: skill.metadata.description,
      instruction: skill.instruction,
    });
    setEditingError(null);
  }, []);

  const handleCloseEditor = useCallback(() => {
    setEditingSkill(null);
    setEditForm({ name: "", description: "", instruction: "" });
    setEditingError(null);
  }, []);

  const handleSaveEditor = useCallback(async () => {
    if (!editingSkill) return;
    
    const name = editForm.name.trim();
    if (!name) {
      setEditingError("请输入技能名称");
      return;
    }
    if (name.length > SKILL_NAME_MAX_LENGTH) {
      setEditingError(`技能名称不能超过 ${SKILL_NAME_MAX_LENGTH} 字符`);
      return;
    }
    if (editForm.description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
      setEditingError(`技能描述不能超过 ${SKILL_DESCRIPTION_MAX_LENGTH} 字符`);
      return;
    }
    
    setEditingSaving(true);
    setEditingError(null);
    try {
      await updateSkill(
        editingSkill.id,
        { name, description: editForm.description },
        editForm.instruction
      );
      await loadSkillRegistry();
      handleCloseEditor();
      orca.notify("success", "技能已保存");
    } catch (err: any) {
      setEditingError(err?.message ?? "保存失败");
    } finally {
      setEditingSaving(false);
    }
  }, [editingSkill, editForm, handleCloseEditor]);

  // Delete handlers
  const handleDeleteSkill = useCallback((skill: SkillDefinition) => {
    setDeleteTarget(skill);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    try {
      await deleteSkillById(deleteTarget.id);
      await loadSkillRegistry();
      orca.notify("success", "技能已删除");
    } catch (err: any) {
      orca.notify("error", err?.message ?? "删除失败");
    } finally {
      setDeleteTarget(null);
    }
  }, [deleteTarget]);

  if (!isOpen) return null;

  // Styles
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

  const listStyle: React.CSSProperties = {
    marginTop: 12,
    maxHeight: 320,
    overflowY: "auto",
    border: "1px solid var(--orca-color-border)",
    borderRadius: 8,
    background: "var(--orca-color-bg-2)",
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

  const editOverlayStyle: React.CSSProperties = {
    ...overlayStyle,
    zIndex: 1100,
  };

  const editModalStyle: React.CSSProperties = {
    ...modalStyle,
    width: "min(1000px, 94vw)",
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
  };

  const editBodyStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginTop: 16,
    flex: 1,
    minHeight: 400,
    overflow: "hidden",
  };

  const formColumnStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    overflowY: "auto",
    paddingRight: 8,
  };

  const previewColumnStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
    overflow: "hidden",
  };

  const previewStyle: React.CSSProperties = {
    flex: 1,
    border: "1px solid var(--orca-color-border)",
    borderRadius: 8,
    padding: 12,
    background: "var(--orca-color-bg-2)",
    overflowY: "auto",
  };

  const formFieldStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginBottom: 12,
  };

  const fieldLabelStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 500,
    color: "var(--orca-color-text-2)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  };

  const fieldInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: 13,
    boxSizing: "border-box",
  };

  const fieldTextAreaStyle: React.CSSProperties = {
    ...fieldInputStyle,
    minHeight: 80,
    resize: "vertical",
    fontFamily: "inherit",
  };

  const instructionTextAreaStyle: React.CSSProperties = {
    ...fieldInputStyle,
    minHeight: 200,
    resize: "vertical",
    fontFamily: "monospace",
    fontSize: 12,
  };

  const footerStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    alignItems: "center",
    marginTop: 16,
    gap: 8,
  };

  const charCountStyle = (current: number, max: number): React.CSSProperties => ({
    fontSize: 10,
    color: current > max ? "var(--orca-color-red)" : "var(--orca-color-text-3)",
  });

  // Render skill form fields (without wrapper)
  const renderSkillFormFields = (
    form: SkillFormState,
    setForm: (f: SkillFormState) => void,
    error: string | null,
    showInstructionField: boolean = true
  ) => {
    const fields = [
      // Name field
      createElement(
        "div",
        { key: "name", style: formFieldStyle },
        createElement(
          "div",
          { style: fieldLabelStyle },
          createElement("span", null, "技能名称"),
          createElement("span", { style: charCountStyle(form.name.length, SKILL_NAME_MAX_LENGTH) },
            `${form.name.length}/${SKILL_NAME_MAX_LENGTH}`
          )
        ),
        createElement("input", {
          value: form.name,
          onChange: (e: any) => setForm({ ...form, name: e.target.value }),
          style: {
            ...fieldInputStyle,
            borderColor: form.name.length > SKILL_NAME_MAX_LENGTH ? "var(--orca-color-red)" : undefined,
          },
          placeholder: "输入技能名称",
        })
      ),
      // Description field
      createElement(
        "div",
        { key: "description", style: formFieldStyle },
        createElement(
          "div",
          { style: fieldLabelStyle },
          createElement("span", null, "技能描述"),
          createElement("span", { style: charCountStyle(form.description.length, SKILL_DESCRIPTION_MAX_LENGTH) },
            `${form.description.length}/${SKILL_DESCRIPTION_MAX_LENGTH}`
          )
        ),
        createElement("textarea", {
          value: form.description,
          onChange: (e: any) => setForm({ ...form, description: e.target.value }),
          style: {
            ...fieldTextAreaStyle,
            borderColor: form.description.length > SKILL_DESCRIPTION_MAX_LENGTH ? "var(--orca-color-red)" : undefined,
          },
          placeholder: "[功能描述]. Use when [触发场景] or when the user mentions [关键词].",
        }),
        createElement(
          "div",
          { style: { fontSize: 11, color: "var(--orca-color-text-3)", marginTop: 4 } },
          "描述格式建议：[功能描述]. Use when [触发场景] or when the user mentions [关键词]."
        )
      ),
    ];

    // Instruction field (optional, for non-split layout)
    if (showInstructionField) {
      fields.push(
        createElement(
          "div",
          { key: "instruction", style: formFieldStyle },
          createElement(
            "div",
            { style: fieldLabelStyle },
            createElement("span", null, "技能指令 (Markdown)")
          ),
          createElement("textarea", {
            value: form.instruction,
            onChange: (e: any) => setForm({ ...form, instruction: e.target.value }),
            style: instructionTextAreaStyle,
            placeholder: "# 技能名称\n\n## 快速开始\n\n描述如何使用这个技能...\n\n## 功能特性\n\n- 特性1\n- 特性2",
          })
        )
      );
    }

    // Error message
    if (error) {
      fields.push(
        createElement(
          "div",
          { key: "error", style: { fontSize: 12, color: "var(--orca-color-red)", marginTop: 8 } },
          error
        )
      );
    }

    return fields;
  };

  // Render skill form (wrapped version for create modal)
  const renderSkillForm = (
    form: SkillFormState,
    setForm: (f: SkillFormState) => void,
    error: string | null
  ) => {
    return createElement(
      "div",
      { style: { marginTop: 16 } },
      ...renderSkillFormFields(form, setForm, error, true)
    );
  };

  // Render create modal
  const renderCreateModal = () => {
    if (!showCreateModal) return null;

    return createElement(
      "div",
      {
        style: editOverlayStyle,
        onClick: (e: any) => {
          e.stopPropagation();
          handleCloseCreate();
        },
      },
      createElement(
        "div",
        { style: editModalStyle, onClick: (e: any) => e.stopPropagation() },
        createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          createElement("div", { style: titleStyle }, "新建技能"),
          withTooltip(
            "关闭",
            createElement(
              Button,
              { variant: "plain", onClick: handleCloseCreate },
              createElement("i", { className: "ti ti-x" })
            )
          )
        ),
        renderSkillForm(createForm, setCreateForm, createError),
        createElement(
          "div",
          { style: footerStyle },
          createElement(Button, { variant: "secondary", onClick: handleCloseCreate }, "取消"),
          createElement(
            Button,
            { variant: "secondary", onClick: handleCreateSkill, disabled: creating },
            creating ? "创建中..." : "创建"
          )
        )
      )
    );
  };

  // Render edit modal with split layout (form + preview)
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
        // Header
        createElement(
          "div",
          { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          createElement("div", { style: titleStyle }, `编辑技能：${editingSkill.metadata.name}`),
          withTooltip(
            "关闭",
            createElement(
              Button,
              { variant: "plain", onClick: handleCloseEditor },
              createElement("i", { className: "ti ti-x" })
            )
          )
        ),
        // Body: split layout
        createElement(
          "div",
          { style: editBodyStyle },
          // Left column: form
          createElement(
            "div",
            { style: formColumnStyle },
            ...renderSkillFormFields(editForm, setEditForm, editingError, false),
            // Instruction textarea (larger, in left column)
            createElement(
              "div",
              { style: { ...formFieldStyle, flex: 1, display: "flex", flexDirection: "column" } },
              createElement(
                "div",
                { style: fieldLabelStyle },
                createElement("span", null, "技能指令 (Markdown)")
              ),
              createElement("textarea", {
                value: editForm.instruction,
                onChange: (e: any) => setEditForm({ ...editForm, instruction: e.target.value }),
                style: {
                  ...instructionTextAreaStyle,
                  flex: 1,
                  minHeight: 200,
                },
                placeholder: "# 技能名称\n\n## 快速开始\n\n描述如何使用这个技能...\n\n## 功能特性\n\n- 特性1\n- 特性2",
              })
            )
          ),
          // Right column: preview
          createElement(
            "div",
            { style: previewColumnStyle },
            createElement(
              "div",
              { style: { ...fieldLabelStyle, marginBottom: 6 } },
              createElement("span", null, "预览")
            ),
            createElement(
              "div",
              { style: previewStyle },
              editForm.instruction
                ? createElement(MarkdownMessage, { content: editForm.instruction, role: "assistant" })
                : createElement(
                    "div",
                    { style: { fontSize: 12, color: "var(--orca-color-text-3)" } },
                    "在左侧输入指令内容，这里会显示 Markdown 预览"
                  )
            )
          )
        ),
        // Footer
        createElement(
          "div",
          { style: footerStyle },
          createElement(Button, { variant: "secondary", onClick: handleCloseEditor }, "取消"),
          createElement(
            Button,
            { variant: "secondary", onClick: handleSaveEditor, disabled: editingSaving },
            editingSaving ? "保存中..." : "保存"
          )
        )
      )
    );
  };

  // Render delete confirmation
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
          `确定要删除技能「${deleteTarget.metadata.name}」吗？此操作不可撤销。`
        ),
        createElement(
          "div",
          { style: { ...footerStyle, marginTop: 16 } },
          createElement(Button, { variant: "secondary", onClick: handleCancelDelete }, "取消"),
          createElement(
            Button,
            { variant: "secondary", onClick: handleConfirmDelete },
            "删除"
          )
        )
      )
    );
  };

  // Main modal content
  return createElement(
    "div",
    { style: overlayStyle, onClick: onClose },
    createElement(
      "div",
      { style: modalStyle, onClick: (e: any) => e.stopPropagation() },
      // Header
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
      // Toolbar
      createElement(
        "div",
        { style: toolbarStyle },
        createElement("input", {
          value: searchQuery,
          onChange: (e: any) => setSearchQuery(e.target.value),
          style: inputStyle,
          placeholder: "搜索技能...",
        }),
        createElement(
          "div",
          { style: actionRowStyle },
          withTooltip(
            "新建技能",
            createElement(
              Button,
              { variant: "secondary", onClick: handleOpenCreate },
              createElement("i", { className: "ti ti-plus" })
            )
          ),
          withTooltip(
            "刷新列表",
            createElement(
              Button,
              { variant: "plain", onClick: handleSkillRefresh },
              createElement("i", { className: "ti ti-refresh" })
            )
          ),
          withTooltip(
            "恢复内置技能",
            createElement(
              Button,
              { variant: "plain", onClick: handleRestoreBuiltIns, disabled: restoring },
              createElement("i", { className: "ti ti-restore" })
            )
          )
        )
      ),
      // Import/Export toolbar
      createElement(
        "div",
        { style: { ...toolbarStyle, marginTop: 8 } },
        withTooltip(
          "导入技能 (.md 或 .zip)",
          createElement(
            Button,
            { variant: "plain", onClick: handleImportSkills },
            createElement("i", { className: "ti ti-upload" }),
            " 导入"
          )
        ),
        withTooltip(
          selectedSkills.size > 0 ? `导出 ${selectedSkills.size} 个技能` : "请先选择技能",
          createElement(
            Button,
            { variant: "plain", onClick: handleExportSkills, disabled: selectedSkills.size === 0 },
            createElement("i", { className: "ti ti-download" }),
            " 导出"
          )
        ),
        selectedSkills.size > 0 && createElement(
          "span",
          { style: { fontSize: 11, color: "var(--orca-color-text-3)" } },
          `已选择 ${selectedSkills.size} 个`
        )
      ),
      // Skill list
      createElement(
        "div",
        { style: listStyle },
        snap.loading
          ? createElement(
              "div",
              { style: { ...rowStyle, justifyContent: "center", borderBottom: "none" } },
              "加载中..."
            )
          : filteredSkills.length === 0
            ? createElement(
                "div",
                { style: { ...rowStyle, justifyContent: "center", borderBottom: "none" } },
                searchQuery ? "未找到匹配的技能" : "暂无技能"
              )
            : filteredSkills.map((skill, index) =>
                createElement(
                  "div",
                  {
                    key: skill.id,
                    style: {
                      ...rowStyle,
                      borderBottom: index === filteredSkills.length - 1 ? "none" : rowStyle.borderBottom,
                    },
                  },
                  // Checkbox
                  createElement("input", {
                    type: "checkbox",
                    checked: selectedSkills.has(skill.id),
                    onChange: () => toggleSkillSelection(skill.id),
                    style: { cursor: "pointer" },
                  }),
                  // Skill info
                  createElement(
                    "div",
                    { style: { flex: 1, minWidth: 0 } },
                    createElement(
                      "div",
                      { style: { fontWeight: 500, color: "var(--orca-color-text-1)" } },
                      skill.metadata.name,
                      skill.source === "built-in" && createElement(
                        "span",
                        { style: { marginLeft: 6, fontSize: 10, color: "var(--orca-color-text-3)" } },
                        "(内置)"
                      )
                    ),
                    skill.metadata.description && createElement(
                      "div",
                      {
                        style: {
                          fontSize: 11,
                          color: "var(--orca-color-text-3)",
                          marginTop: 2,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        },
                      },
                      skill.metadata.description
                    )
                  ),
                  // Actions
                  createElement(
                    "div",
                    { style: actionRowStyle },
                    withTooltip(
                      "编辑",
                      createElement(
                        Button,
                        { variant: "plain", onClick: () => handleOpenEditor(skill) },
                        createElement("i", { className: "ti ti-edit" })
                      )
                    ),
                    withTooltip(
                      "删除",
                      createElement(
                        Button,
                        { variant: "plain", onClick: () => handleDeleteSkill(skill) },
                        createElement("i", { className: "ti ti-trash" })
                      )
                    )
                  )
                )
              )
      ),
      // Error message
      snap.error && createElement(
        "div",
        { style: { marginTop: 8, fontSize: 12, color: "var(--orca-color-red)" } },
        snap.error
      )
    ),
    // Modals
    renderCreateModal(),
    renderEditModal(),
    renderDeleteConfirm()
  );
}
