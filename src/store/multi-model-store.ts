/**
 * Multi-Model Store
 * 
 * 管理多模型并行输出的状态
 * 使用 "providerId:modelId" 格式唯一标识模型
 */

import { proxy } from "valtio";

export interface MultiModelState {
  /** 是否启用多模型模式 */
  enabled: boolean;
  /** 选中的模型键列表 (格式: "providerId:modelId") */
  selectedModels: string[];
  /** 最大同时选择的模型数 */
  maxModels: number;
}

export const multiModelStore = proxy<MultiModelState>({
  enabled: false,
  selectedModels: [],
  maxModels: 4,
});

/** 生成模型唯一键 */
export function getModelKey(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/** 解析模型键 */
export function parseModelKey(key: string): { providerId: string; modelId: string } | null {
  const idx = key.indexOf(":");
  if (idx === -1) return null;
  return {
    providerId: key.slice(0, idx),
    modelId: key.slice(idx + 1),
  };
}

/** 切换多模型模式 */
export function toggleMultiModelMode() {
  multiModelStore.enabled = !multiModelStore.enabled;
  if (!multiModelStore.enabled) {
    multiModelStore.selectedModels = [];
  }
}

/** 添加模型到选择列表 */
export function addModelToSelection(providerId: string, modelId: string) {
  if (multiModelStore.selectedModels.length >= multiModelStore.maxModels) {
    return false;
  }
  const key = getModelKey(providerId, modelId);
  if (!multiModelStore.selectedModels.includes(key)) {
    multiModelStore.selectedModels.push(key);
  }
  return true;
}

/** 从选择列表移除模型 */
export function removeModelFromSelection(providerId: string, modelId: string) {
  const key = getModelKey(providerId, modelId);
  const index = multiModelStore.selectedModels.indexOf(key);
  if (index > -1) {
    multiModelStore.selectedModels.splice(index, 1);
  }
}

/** 切换模型选择状态 */
export function toggleModelSelection(providerId: string, modelId: string) {
  const key = getModelKey(providerId, modelId);
  if (multiModelStore.selectedModels.includes(key)) {
    removeModelFromSelection(providerId, modelId);
  } else {
    addModelToSelection(providerId, modelId);
  }
}

/** 检查模型是否被选中 */
export function isModelSelected(providerId: string, modelId: string): boolean {
  const key = getModelKey(providerId, modelId);
  return multiModelStore.selectedModels.includes(key);
}

/** 清空选择 */
export function clearModelSelection() {
  multiModelStore.selectedModels = [];
}

/** 设置选中的模型列表 */
export function setSelectedModels(modelKeys: string[]) {
  multiModelStore.selectedModels = modelKeys.slice(0, multiModelStore.maxModels);
}
