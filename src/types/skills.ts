/**
 * Skills Manager Types
 * 
 * 新的 Skills 系统类型定义，采用文件夹结构存储
 */

/**
 * Skill 元数据
 */
export interface SkillMetadata {
  id: string;           // Skill ID = 文件夹名称
  name: string;         // Skill 显示名称
  description?: string; // Skill 描述
  version?: string;     // 版本号
  author?: string;      // 作者
  tags?: string[];      // 标签
  [key: string]: any;   // 其他自定义字段
}

/**
 * Skill 文件信息
 */
export interface SkillFile {
  path: string;         // 相对于 skill 文件夹的路径
  name: string;         // 文件名
  isDir: boolean;       // 是否为目录
  size?: number;        // 文件大小（字节）
}

/**
 * 完整的 Skill 定义
 */
export interface Skill {
  id: string;           // Skill ID = 文件夹名称
  metadata: SkillMetadata;
  instruction: string;  // SKILL.md 的指令内容
  files: SkillFile[];   // Skill 下的所有文件
  enabled: boolean;     // 是否启用
}
