/**
 * Skill Store - Skill 状态管理
 * 管理用户定义的 AI 技能及其激活状态
 */

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

/**
 * Skill 类型
 * - tools: 工具型 Skill，限制可用工具集
 * - prompt: 提示词型 Skill，定义角色和指令
 */
export type SkillType = "tools" | "prompt";

/**
 * Skill 元数据（用于列表显示）
 */
export interface SkillMeta {
  id: number;        // 块 ID
  name: string;      // Skill 名称
  description: string; // Skill 描述
  type: SkillType;   // Skill 类型
}

/**
 * 完整 Skill 定义
 */
export interface Skill extends SkillMeta {
  prompt: string;           // 提示词内容
  tools?: string[];         // 工具名称列表（仅 type='tools' 时有值）
  variables?: string[];     // 变量名列表（如 ["目标语言", "格式"]）
}

/**
 * Skill Store 状态
 */
interface SkillStoreState {
  skills: Skill[];              // 所有已加载的 Skill
  skillsLoaded: boolean;        // 是否已加载 Skill 列表
  skillsLoading: boolean;       // 是否正在加载中（防止重复请求）
  activeSkill: Skill | null;    // 当前激活的 Skill
  variables: Record<string, string>; // 变量值缓存 { 变量名: 值 }
}

/**
 * Skill 状态存储
 */
export const skillStore = proxy<SkillStoreState>({
  skills: [],
  skillsLoaded: false,
  skillsLoading: false,
  activeSkill: null,
  variables: {},
});

// ─────────────────────────────────────────────────────────────────────────────
// Actions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 设置 Skills 列表
 */
export function setSkills(skills: Skill[]): void {
  skillStore.skills = skills;
  skillStore.skillsLoaded = true;
  skillStore.skillsLoading = false;
}

/**
 * 设置加载状态
 */
export function setSkillsLoading(loading: boolean): void {
  skillStore.skillsLoading = loading;
}

/**
 * 设置当前激活的 Skill
 */
export function setActiveSkill(skill: Skill | null): void {
  skillStore.activeSkill = skill;
}

/**
 * 清除当前 Skill 和变量
 */
export function clearSkill(): void {
  skillStore.activeSkill = null;
  skillStore.variables = {};
}

/**
 * 设置变量值
 */
export function setVariable(name: string, value: string): void {
  skillStore.variables[name] = value;
}

/**
 * 获取缺失的变量名列表
 */
export function getMissingVariables(skill: Skill | null): string[] {
  if (!skill?.variables?.length) return [];

  return skill.variables.filter((name) => {
    const value = skillStore.variables[name];
    return !value || value.trim() === "";
  });
}

/**
 * 替换 Skill prompt 中的变量
 */
export function replaceVariables(prompt: string, variables: Record<string, string>): string {
  if (!prompt) return "";

  // 仅替换已声明的变量 {变量名}
  return prompt.replace(/\{([^}]+)\}/g, (match, varName) => {
    const value = variables[varName];
    // 如果变量未定义，保留原样
    return value !== undefined ? value : match;
  });
}

/**
 * 重置 Skill 列表（用于刷新）
 */
export function resetSkillsLoaded(): void {
  skillStore.skillsLoaded = false;
}
