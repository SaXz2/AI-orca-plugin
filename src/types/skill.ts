/**
 * Skill System Types - Codex-style Architecture
 * 
 * This module defines the types for the refactored skill system following
 * the Codex Agent Skills pattern with progressive disclosure:
 * - Level 1: Metadata (loaded at startup, ~100 tokens/skill)
 * - Level 2: Instructions (loaded on trigger, <5k tokens)
 * - Level 3: Resources (loaded on demand)
 */

/**
 * Skill metadata - Level 1 data loaded at startup
 * 
 * Format for description:
 * [功能描述]. Use when [触发场景] or when the user mentions [关键词].
 */
export interface SkillMetadata {
  /** 技能名称，max 64 chars */
  name: string;
  /** 技能描述，max 1024 chars */
  description: string;
}

/**
 * Complete skill definition including all levels
 */
export interface SkillDefinition {
  /** 唯一标识 */
  id: string;
  /** 元数据（Level 1，启动时加载） */
  metadata: SkillMetadata;
  /** 指令内容（Level 2） */
  instruction: string;
  /** 来源类型 */
  source: 'built-in' | 'user';
  /** 创建时间戳 */
  createdAt: number;
  /** 更新时间戳 */
  updatedAt: number;
}

/** Maximum length for skill name */
export const SKILL_NAME_MAX_LENGTH = 64;

/** Maximum length for skill description */
export const SKILL_DESCRIPTION_MAX_LENGTH = 1024;

/**
 * Validation result for skill metadata
 */
export interface SkillValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates skill metadata against length constraints
 * @param metadata - The metadata to validate
 * @returns Validation result with error message if invalid
 */
export function validateSkillMetadata(metadata: SkillMetadata): SkillValidationResult {
  if (!metadata.name || metadata.name.trim().length === 0) {
    return { valid: false, error: 'Name is required' };
  }
  
  if (metadata.name.length > SKILL_NAME_MAX_LENGTH) {
    return { 
      valid: false, 
      error: `Name exceeds maximum length of ${SKILL_NAME_MAX_LENGTH} characters` 
    };
  }
  
  if (metadata.description.length > SKILL_DESCRIPTION_MAX_LENGTH) {
    return { 
      valid: false, 
      error: `Description exceeds maximum length of ${SKILL_DESCRIPTION_MAX_LENGTH} characters` 
    };
  }
  
  return { valid: true };
}
