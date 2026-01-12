import { proxy } from "valtio";
import type { SkillDefinition } from "../types/skill";

interface SkillStore {
  skills: SkillDefinition[];
  loading: boolean;
  error?: string;
  lastLoadedAt?: number;
}

export const skillStore = proxy<SkillStore>({
  skills: [],
  loading: false,
  error: undefined,
  lastLoadedAt: undefined,
});

export function setSkillLoading(loading: boolean): void {
  skillStore.loading = loading;
}

export function setSkillError(error?: string): void {
  skillStore.error = error;
}

export function setSkills(skills: SkillDefinition[]): void {
  skillStore.skills = skills;
  skillStore.lastLoadedAt = Date.now();
}
