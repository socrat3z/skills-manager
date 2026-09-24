import { invoke } from "@tauri-apps/api/core";
import type { ManagedSkill } from "./tauri";

export interface SkillFileInfo {
  relative_path: string;
  name: string;
  is_dir: boolean;
  size: number;
}

export const listSkillFiles = (skillId: string) =>
  invoke<SkillFileInfo[]>("list_skill_files", { skillId });

export const readSkillFile = (skillId: string, relativePath: string) =>
  invoke<string>("read_skill_file", { skillId, relativePath });

export const saveSkillFile = (skillId: string, relativePath: string, content: string) =>
  invoke<void>("save_skill_file", { skillId, relativePath, content });

export const createSkillFile = (skillId: string, relativePath: string, content: string) =>
  invoke<void>("create_skill_file", { skillId, relativePath, content });

export const deleteSkillFile = (skillId: string, relativePath: string) =>
  invoke<void>("delete_skill_file", { skillId, relativePath });

export const createCustomSkill = (name: string, description: string, tags: string[]) =>
  invoke<ManagedSkill>("create_custom_skill", { name, description, tags });

export const commitSkillChanges = (skillId: string, message: string) =>
  invoke<string>("commit_skill_changes", { skillId, message });

export const generateAiSkillContent = (prompt: string, mode: string, fileContext?: string) =>
  invoke<string>("generate_ai_skill_content", { prompt, mode, fileContext: fileContext ?? null });
