/**
 * Compression Config - 配置 Schema 校验与预设
 * 
 * 功能：
 * - 使用类型安全的 Schema 校验配置
 * - 提供模型特定的预设配置
 * - 启动时打印配置，便于排查
 * - 支持配置合并与覆盖
 */

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义（替代 zod，避免额外依赖）
// ═══════════════════════════════════════════════════════════════════════════

/** 摘要冗余度 */
export type SummaryVerbosity = "minimal" | "medium" | "detailed";

/** 实体映射位置 */
export type EntityMapPosition = "after_system" | "before_dynamic" | "inline";

/** 填充策略 */
export type PaddingStrategy = "comment" | "whitespace" | "marker" | "none";

/** 压缩配置 Schema */
export type CompressionConfigSchema = {
  // === 阈值配置 ===
  /** 触发压缩的 Token 阈值 */
  compressionThreshold: number;
  /** 硬截断阈值（必须压缩） */
  hardLimitThreshold: number;
  /** 最近对话保留的 Token 上限 */
  recentTokenLimit: number;
  
  // === 摘要配置 ===
  /** 每层摘要的目标 Token 数 */
  layerTokenTarget: number;
  /** 摘要输出的最大 Token */
  summaryMaxTokens: number;
  /** 高密度摘要的最大 Token */
  summaryMaxTokensCompact: number;
  /** 中层 Token 上限 */
  middleLayerTokenLimit: number;
  /** 摘要冗余度 */
  summaryVerbosity: SummaryVerbosity;
  
  // === Token 对齐配置 ===
  /** 是否启用 Token 对齐 */
  enableTokenAlignment: boolean;
  /** Token 对齐单位 */
  tokenAlignUnit: number;
  /** 填充策略 */
  paddingStrategy: PaddingStrategy;
  
  // === 里程碑配置 ===
  /** 触发里程碑合并的层数 */
  milestoneThreshold: number;
  /** 触发里程碑再蒸馏的数量 */
  milestoneDistillThreshold: number;
  
  // === 实体配置 ===
  /** 实体映射位置 */
  entityMapPosition: EntityMapPosition;
  
  // === 校准配置 ===
  /** Token 估算误差余量 */
  tokenEstimateMargin: number;
  /** 缓存校准：连续未命中次数阈值 */
  calibrationMissThreshold: number;
  /** 滑动缓冲区：额外 Token 余量 */
  slidingBufferMargin: number;
  /** 偏差校准最小样本数 */
  biasCalibrationMinSamples: number;
  /** 偏差因子上限 */
  biasFactorMax: number;
  /** 偏差因子下限 */
  biasFactorMin: number;
  /** 偏差显著性阈值 */
  biasSignificanceThreshold: number;
  
  // === 其他 ===
  /** 缓存块结尾标记 */
  blockEndMarker: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// 配置校验
// ═══════════════════════════════════════════════════════════════════════════

/** 校验结果 */
export type ValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

/** 校验规则 */
const VALIDATION_RULES: Array<{
  field: keyof CompressionConfigSchema;
  validate: (value: any) => string | null;
}> = [
  {
    field: "compressionThreshold",
    validate: (v) => {
      if (typeof v !== "number" || v < 1000) return "compressionThreshold must be >= 1000";
      if (v > 100000) return "compressionThreshold must be <= 100000";
      return null;
    },
  },
  {
    field: "hardLimitThreshold",
    validate: (v) => {
      if (typeof v !== "number" || v < 2000) return "hardLimitThreshold must be >= 2000";
      return null;
    },
  },
  {
    field: "recentTokenLimit",
    validate: (v) => {
      if (typeof v !== "number" || v < 500) return "recentTokenLimit must be >= 500";
      return null;
    },
  },
  {
    field: "tokenAlignUnit",
    validate: (v) => {
      if (typeof v !== "number" || v < 1) return "tokenAlignUnit must be >= 1";
      if (v > 256) return "tokenAlignUnit must be <= 256";
      return null;
    },
  },
  {
    field: "milestoneThreshold",
    validate: (v) => {
      if (typeof v !== "number" || v < 3) return "milestoneThreshold must be >= 3";
      if (v > 50) return "milestoneThreshold must be <= 50";
      return null;
    },
  },
  {
    field: "summaryVerbosity",
    validate: (v) => {
      if (!["minimal", "medium", "detailed"].includes(v)) {
        return "summaryVerbosity must be 'minimal', 'medium', or 'detailed'";
      }
      return null;
    },
  },
  {
    field: "entityMapPosition",
    validate: (v) => {
      if (!["after_system", "before_dynamic", "inline"].includes(v)) {
        return "entityMapPosition must be 'after_system', 'before_dynamic', or 'inline'";
      }
      return null;
    },
  },
  {
    field: "paddingStrategy",
    validate: (v) => {
      if (!["comment", "whitespace", "marker", "none"].includes(v)) {
        return "paddingStrategy must be 'comment', 'whitespace', 'marker', or 'none'";
      }
      return null;
    },
  },
];

/**
 * 校验配置
 */
export function validateConfig(config: Partial<CompressionConfigSchema>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  for (const rule of VALIDATION_RULES) {
    if (rule.field in config) {
      const error = rule.validate(config[rule.field]);
      if (error) {
        errors.push(error);
      }
    }
  }
  
  // 逻辑校验
  if (config.compressionThreshold && config.hardLimitThreshold) {
    if (config.compressionThreshold >= config.hardLimitThreshold) {
      errors.push("compressionThreshold must be less than hardLimitThreshold");
    }
  }
  
  if (config.summaryMaxTokens && config.summaryMaxTokensCompact) {
    if (config.summaryMaxTokensCompact > config.summaryMaxTokens) {
      warnings.push("summaryMaxTokensCompact should be <= summaryMaxTokens");
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 预设配置
// ═══════════════════════════════════════════════════════════════════════════

/** 默认配置 */
export const DEFAULT_CONFIG: CompressionConfigSchema = {
  compressionThreshold: 4000,
  hardLimitThreshold: 5800,
  recentTokenLimit: 2500,
  layerTokenTarget: 1500,
  summaryMaxTokens: 500,
  summaryMaxTokensCompact: 300,
  middleLayerTokenLimit: 1500,
  summaryVerbosity: "medium",
  enableTokenAlignment: true,
  tokenAlignUnit: 64,
  paddingStrategy: "comment",
  milestoneThreshold: 10,
  milestoneDistillThreshold: 3,
  entityMapPosition: "after_system",
  tokenEstimateMargin: 200,
  calibrationMissThreshold: 3,
  slidingBufferMargin: 200,
  biasCalibrationMinSamples: 3,
  biasFactorMax: 1.15,
  biasFactorMin: 0.90,
  biasSignificanceThreshold: 0.03,
  blockEndMarker: "\n<!-- END -->\n",
};

/** DeepSeek 预设 - 最大化 KV Cache 命中 */
export const PRESET_DEEPSEEK: Partial<CompressionConfigSchema> = {
  compressionThreshold: 4000,
  hardLimitThreshold: 5800,
  recentTokenLimit: 2500,
  summaryMaxTokens: 400,
  summaryMaxTokensCompact: 250,
  summaryVerbosity: "minimal",
  enableTokenAlignment: true,
  tokenAlignUnit: 64,
  paddingStrategy: "comment",
  milestoneThreshold: 10,
  milestoneDistillThreshold: 3,
  entityMapPosition: "after_system",
  middleLayerTokenLimit: 1500,
  layerTokenTarget: 1500,
};

/** Gemini 预设 - 保留更多上下文 */
export const PRESET_GEMINI: Partial<CompressionConfigSchema> = {
  compressionThreshold: 12000,
  hardLimitThreshold: 18000,
  recentTokenLimit: 4000,
  summaryMaxTokens: 600,
  summaryMaxTokensCompact: 400,
  summaryVerbosity: "medium",
  enableTokenAlignment: false,
  tokenAlignUnit: 1,
  paddingStrategy: "none",
  milestoneThreshold: 20,
  milestoneDistillThreshold: 4,
  entityMapPosition: "before_dynamic",
  middleLayerTokenLimit: 3000,
  layerTokenTarget: 2000,
};

/** Claude 预设 - 推理优先 */
export const PRESET_CLAUDE: Partial<CompressionConfigSchema> = {
  compressionThreshold: 10000,
  hardLimitThreshold: 15000,
  recentTokenLimit: 3500,
  summaryMaxTokens: 550,
  summaryMaxTokensCompact: 350,
  summaryVerbosity: "medium",
  enableTokenAlignment: false,
  tokenAlignUnit: 1,
  paddingStrategy: "none",
  milestoneThreshold: 15,
  milestoneDistillThreshold: 4,
  entityMapPosition: "before_dynamic",
  middleLayerTokenLimit: 2500,
  layerTokenTarget: 1800,
};

/** GPT 预设 - 通用平衡 */
export const PRESET_GPT: Partial<CompressionConfigSchema> = {
  compressionThreshold: 6000,
  hardLimitThreshold: 9000,
  recentTokenLimit: 3000,
  summaryMaxTokens: 500,
  summaryMaxTokensCompact: 300,
  summaryVerbosity: "medium",
  enableTokenAlignment: false,
  tokenAlignUnit: 1,
  paddingStrategy: "none",
  milestoneThreshold: 12,
  milestoneDistillThreshold: 3,
  entityMapPosition: "after_system",
  middleLayerTokenLimit: 2000,
  layerTokenTarget: 1800,
};

/** 通用预设 */
export const PRESET_GENERAL: Partial<CompressionConfigSchema> = {
  ...PRESET_GPT,
};

/** 所有预设 */
export const PRESETS: Record<string, Partial<CompressionConfigSchema>> = {
  deepseek: PRESET_DEEPSEEK,
  gemini: PRESET_GEMINI,
  claude: PRESET_CLAUDE,
  gpt: PRESET_GPT,
  general: PRESET_GENERAL,
};

// ═══════════════════════════════════════════════════════════════════════════
// 配置管理
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 根据模型名称获取预设
 */
export function getPresetForModel(modelName: string): Partial<CompressionConfigSchema> {
  const normalized = modelName.toLowerCase();
  
  if (normalized.includes("deepseek")) return PRESET_DEEPSEEK;
  if (normalized.includes("gemini")) return PRESET_GEMINI;
  if (normalized.includes("claude")) return PRESET_CLAUDE;
  if (normalized.includes("gpt") || normalized.includes("o1") || normalized.includes("o3")) return PRESET_GPT;
  
  return PRESET_GENERAL;
}

/**
 * 合并配置（后者覆盖前者）
 */
export function mergeConfigs(
  ...configs: Array<Partial<CompressionConfigSchema>>
): CompressionConfigSchema {
  return configs.reduce(
    (acc, config) => ({ ...acc, ...config }),
    { ...DEFAULT_CONFIG },
  ) as CompressionConfigSchema;
}

/**
 * 创建会话配置
 */
export function createSessionConfig(
  modelName: string,
  overrides?: Partial<CompressionConfigSchema>,
): CompressionConfigSchema {
  const preset = getPresetForModel(modelName);
  const config = mergeConfigs(DEFAULT_CONFIG, preset, overrides || {});
  
  // 校验
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.error("[compression-config] Invalid config:", validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn("[compression-config] Config warnings:", validation.warnings);
  }
  
  return config;
}

/**
 * 打印配置（用于调试）
 */
export function printConfig(config: CompressionConfigSchema, label?: string): void {
  const prefix = label ? `[${label}]` : "[compression-config]";
  
  console.log(`${prefix} Current configuration:`);
  console.log(`  Thresholds: compression=${config.compressionThreshold}, hard=${config.hardLimitThreshold}, recent=${config.recentTokenLimit}`);
  console.log(`  Summary: max=${config.summaryMaxTokens}, compact=${config.summaryMaxTokensCompact}, verbosity=${config.summaryVerbosity}`);
  console.log(`  Alignment: enabled=${config.enableTokenAlignment}, unit=${config.tokenAlignUnit}, strategy=${config.paddingStrategy}`);
  console.log(`  Milestones: threshold=${config.milestoneThreshold}, distill=${config.milestoneDistillThreshold}`);
  console.log(`  Entity: position=${config.entityMapPosition}`);
}

/**
 * 获取配置摘要（用于 UI 显示）
 */
export function getConfigSummary(config: CompressionConfigSchema): {
  mode: string;
  thresholds: string;
  alignment: string;
  milestones: string;
} {
  const mode = config.enableTokenAlignment ? "Cache-Optimized" : "Standard";
  const thresholds = `${config.compressionThreshold}/${config.hardLimitThreshold} tokens`;
  const alignment = config.enableTokenAlignment 
    ? `${config.tokenAlignUnit}-token boundary` 
    : "Disabled";
  const milestones = `Every ${config.milestoneThreshold} layers`;
  
  return { mode, thresholds, alignment, milestones };
}

// ═══════════════════════════════════════════════════════════════════════════
// 调试接口
// ═══════════════════════════════════════════════════════════════════════════

export const compressionConfigDebug = {
  validateConfig,
  getPresetForModel,
  createSessionConfig,
  printConfig,
  getConfigSummary,
  PRESETS,
  DEFAULT_CONFIG,
};

if (typeof window !== "undefined") {
  (window as any).compressionConfig = compressionConfigDebug;
}
