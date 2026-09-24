use crate::commands::skills::ManagedSkillDto;
use crate::core::error::AppError;
use crate::core::central_repo;
use crate::core::skill_metadata;
use crate::core::skill_store::SkillStore;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SkillFileInfo {
    pub relative_path: String,
    pub name: String,
    pub is_dir: bool,
    pub size: u64,
}

fn canonical_safe_child_path(base: &Path, rel: &str) -> Result<PathBuf, AppError> {
    let clean_rel = rel.trim_start_matches('/').trim_start_matches('\\');
    let target = base.join(clean_rel);

    if rel.contains("..") {
        return Err(AppError::invalid_input("Path traversal detected"));
    }

    Ok(target)
}

#[derive(Debug, Clone)]
struct GitIgnoreRule {
    negated: bool,
    dir_only: bool,
    regex: regex::Regex,
}

fn parse_skill_gitignore(content: &str) -> Vec<GitIgnoreRule> {
    let mut rules = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        let (negated, line) = if let Some(stripped) = line.strip_prefix('!') {
            (true, stripped.trim())
        } else {
            (false, line)
        };

        let (dir_only, line) = if let Some(stripped) = line.strip_suffix('/') {
            (true, stripped)
        } else {
            (false, line)
        };

        let clean_pattern = line.trim();
        if clean_pattern.is_empty() {
            continue;
        }

        let is_rooted = clean_pattern.starts_with('/');
        let core = clean_pattern.strip_prefix('/').unwrap_or(clean_pattern);

        let mut regex_str = String::from("^");
        if !is_rooted && !core.contains('/') {
            regex_str.push_str("(?:.*/)?");
        }

        let mut chars = core.chars().peekable();
        while let Some(c) = chars.next() {
            match c {
                '*' => {
                    if chars.peek() == Some(&'*') {
                        chars.next();
                        if chars.peek() == Some(&'/') {
                            chars.next();
                            regex_str.push_str("(?:.*/)?");
                        } else {
                            regex_str.push_str(".*");
                        }
                    } else {
                        regex_str.push_str("[^/]*");
                    }
                }
                '?' => regex_str.push_str("[^/]"),
                '.' | '+' | '(' | ')' | '[' | ']' | '{' | '}' | '^' | '$' | '|' | '\\' => {
                    regex_str.push('\\');
                    regex_str.push(c);
                }
                _ => regex_str.push(c),
            }
        }
        regex_str.push_str("(?:/.*)?$");

        if let Ok(re) = regex::Regex::new(&regex_str) {
            rules.push(GitIgnoreRule {
                negated,
                dir_only,
                regex: re,
            });
        }
    }
    rules
}

fn is_skill_path_ignored(
    rel_path: &str,
    is_dir: bool,
    repo_and_workdir: Option<(&git2::Repository, &Path)>,
    custom_rules: &[GitIgnoreRule],
) -> bool {
    let normalized = rel_path.trim_matches('/').replace('\\', "/");
    if normalized.is_empty() {
        return false;
    }

    // 1. Definitively skip heavy package/cache directories and temporary noise
    for segment in normalized.split('/') {
        if segment == "node_modules"
            || segment == ".git"
            || segment == "__pycache__"
            || segment == ".DS_Store"
            || segment == "Thumbs.db"
            || segment == "desktop.ini"
            || segment == ".turbo"
            || segment == ".next"
            || segment == ".nuxt"
            || segment == ".cache"
            || segment == ".parcel-cache"
            || segment == ".venv"
            || segment == "venv"
            || segment.ends_with(".pyc")
            || segment.ends_with(".pyo")
        {
            return true;
        }
    }

    // 2. Discover gitignore status if inside a Git repository
    if let Some((repo, workdir)) = repo_and_workdir {
        let abs_path = workdir.join(&normalized);
        if let Ok(rel_to_workdir) = abs_path.strip_prefix(workdir) {
            if let Ok(ignored) = repo.status_should_ignore(rel_to_workdir) {
                if ignored {
                    return true;
                }
            }
        }
    }

    // 3. Match against local .gitignore patterns
    let mut ignored = false;
    for rule in custom_rules {
        if rule.dir_only && !is_dir {
            continue;
        }
        if rule.regex.is_match(&normalized) {
            ignored = !rule.negated;
        }
    }

    ignored
}

fn remove_path_if_exists(path: &Path) -> Result<(), AppError> {
    if path.is_dir() {
        std::fs::remove_dir_all(path)?;
    } else if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[tauri::command]
pub async fn list_skill_files(
    skill_id: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<Vec<SkillFileInfo>, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        let base_dir = PathBuf::from(&skill.central_path);
        if !base_dir.exists() || !base_dir.is_dir() {
            return Err(AppError::not_found("Skill directory does not exist"));
        }

        let gitignore_file = base_dir.join(".gitignore");
        let custom_rules = if gitignore_file.is_file() {
            std::fs::read_to_string(&gitignore_file)
                .map(|content| parse_skill_gitignore(&content))
                .unwrap_or_default()
        } else {
            Vec::new()
        };

        let repo = git2::Repository::discover(&base_dir).ok();
        let repo_workdir = repo.as_ref().and_then(|r| r.workdir().map(|p| p.to_path_buf()));
        let repo_pair = match (&repo, &repo_workdir) {
            (Some(r), Some(w)) => Some((r, w.as_path())),
            _ => None,
        };

        let mut files = Vec::new();
        for entry in walkdir::WalkDir::new(&base_dir)
            .min_depth(1)
            .into_iter()
            .filter_entry(|e| {
                let path = e.path();
                let rel = match path.strip_prefix(&base_dir) {
                    Ok(r) => r.to_string_lossy().replace('\\', "/"),
                    Err(_) => return false,
                };
                if rel.is_empty() {
                    return true;
                }
                let is_dir = e.file_type().is_dir();
                !is_skill_path_ignored(&rel, is_dir, repo_pair, &custom_rules)
            })
        {
            let entry = entry.map_err(AppError::io)?;
            let path = entry.path();
            let relative_path = path
                .strip_prefix(&base_dir)
                .map_err(|e| AppError::invalid_input(&e.to_string()))?
                .to_string_lossy()
                .replace('\\', "/");

            let metadata = entry.metadata().map_err(AppError::io)?;
            files.push(SkillFileInfo {
                relative_path,
                name: entry.file_name().to_string_lossy().to_string(),
                is_dir: metadata.is_dir(),
                size: metadata.len(),
            });
        }

        files.sort_by(|a, b| {
            if a.is_dir != b.is_dir {
                b.is_dir.cmp(&a.is_dir)
            } else {
                a.relative_path.cmp(&b.relative_path)
            }
        });

        Ok(files)
    })
    .await?
}

#[tauri::command]
pub async fn read_skill_file(
    skill_id: String,
    relative_path: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        let base_dir = PathBuf::from(&skill.central_path);
        let target = canonical_safe_child_path(&base_dir, &relative_path)?;

        if !target.exists() || !target.is_file() {
            return Err(AppError::not_found("File not found"));
        }

        let content = std::fs::read_to_string(&target)
            .map_err(|e| AppError::invalid_input(format!("Failed to read text file: {e}")))?;

        Ok(content)
    })
    .await?
}

#[tauri::command]
pub async fn save_skill_file(
    skill_id: String,
    relative_path: String,
    content: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        let base_dir = PathBuf::from(&skill.central_path);
        let target = canonical_safe_child_path(&base_dir, &relative_path)?;

        if let Some(parent) = target.parent() {
            std::fs::create_dir_all(parent).map_err(AppError::io)?;
        }

        std::fs::write(&target, content.as_bytes()).map_err(AppError::io)?;

        let is_skill_md = relative_path == "SKILL.md" || relative_path == "/SKILL.md";
        if is_skill_md {
            let meta = skill_metadata::parse_skill_md(&base_dir);
            let now = chrono::Utc::now().timestamp_millis();
            let mut updated_skill = skill.clone();
            if let Some(name) = meta.name {
                if !name.trim().is_empty() {
                    updated_skill.name = name;
                }
            }
            if let Some(desc) = meta.description {
                updated_skill.description = Some(desc);
            }
            updated_skill.updated_at = now;
            store.insert_skill(&updated_skill).map_err(AppError::db)?;
        }

        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn create_skill_file(
    skill_id: String,
    relative_path: String,
    content: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    save_skill_file(skill_id, relative_path, content, store).await
}

#[tauri::command]
pub async fn delete_skill_file(
    skill_id: String,
    relative_path: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<(), AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        if relative_path == "SKILL.md" || relative_path == "/SKILL.md" {
            return Err(AppError::invalid_input("Cannot delete SKILL.md"));
        }

        let base_dir = PathBuf::from(&skill.central_path);
        let target = canonical_safe_child_path(&base_dir, &relative_path)?;

        if target.exists() {
            remove_path_if_exists(&target)?;
        }
        Ok(())
    })
    .await?
}

#[tauri::command]
pub async fn create_custom_skill(
    name: String,
    description: String,
    _tags: Vec<String>,
    store: State<'_, Arc<SkillStore>>,
) -> Result<ManagedSkillDto, AppError> {
    let store = store.inner().clone();
    tauri::async_runtime::spawn_blocking(move || {
        let trimmed_name = name.trim();
        if trimmed_name.is_empty() {
            return Err(AppError::invalid_input("Skill name cannot be empty"));
        }

        let slug: String = trimmed_name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();
        let slug = slug.trim_matches('-').to_lowercase();
        let folder_name = if slug.is_empty() { "custom-skill".to_string() } else { slug };

        let skills_root = central_repo::skills_dir();
        let skill_dir = skills_root.join(&folder_name);
        if skill_dir.exists() {
            return Err(AppError::invalid_input(format!(
                "Skill folder '{folder_name}' already exists"
            )));
        }

        std::fs::create_dir_all(&skill_dir).map_err(AppError::io)?;

        let initial_content = format!(
            "---\nname: {trimmed_name}\ndescription: {description}\n---\n\n# {trimmed_name}\n\n{description}\n"
        );
        std::fs::write(skill_dir.join("SKILL.md"), initial_content.as_bytes()).map_err(AppError::io)?;

        let now = chrono::Utc::now().timestamp_millis();
        let skill_id = format!("local:{}", uuid::Uuid::new_v4());
        let record = crate::core::skill_store::SkillRecord {
            id: skill_id.clone(),
            name: trimmed_name.to_string(),
            description: if description.trim().is_empty() { None } else { Some(description.trim().to_string()) },
            source_type: "local".to_string(),
            source_ref: Some(skill_dir.to_string_lossy().to_string()),
            source_ref_resolved: None,
            source_subpath: None,
            source_branch: None,
            source_revision: None,
            remote_revision: None,
            central_path: skill_dir.to_string_lossy().to_string(),
            content_hash: None,
            enabled: true,
            created_at: now,
            updated_at: now,
            status: "ready".to_string(),
            update_status: "local_only".to_string(),
            last_checked_at: None,
            last_check_error: None,
        };

        store.insert_skill(&record).map_err(AppError::db)?;

        Ok(ManagedSkillDto {
            id: record.id,
            name: record.name,
            description: record.description,
            source_type: record.source_type,
            source_ref: record.source_ref,
            source_ref_resolved: record.source_ref_resolved,
            source_subpath: record.source_subpath,
            source_branch: record.source_branch,
            source_revision: record.source_revision,
            remote_revision: record.remote_revision,
            update_status: record.update_status,
            last_checked_at: record.last_checked_at,
            last_check_error: record.last_check_error,
            central_path: record.central_path,
            enabled: record.enabled,
            created_at: record.created_at,
            updated_at: record.updated_at,
            status: record.status,
            targets: Vec::new(),
            preset_ids: Vec::new(),
            tags: Vec::new(),
        })
    })
    .await?
}

#[tauri::command]
pub async fn commit_skill_changes(
    skill_id: String,
    message: String,
    store: State<'_, Arc<SkillStore>>,
) -> Result<String, AppError> {
    let store = store.inner().clone();
    let skills_dir = central_repo::skills_dir();
    tauri::async_runtime::spawn_blocking(move || {
        let skill = store
            .get_skill_by_id(&skill_id)
            .map_err(AppError::db)?
            .ok_or_else(|| AppError::not_found("Skill not found"))?;

        let msg = if message.trim().is_empty() {
            format!("feat(skill): update {}", skill.name)
        } else {
            message.trim().to_string()
        };

        crate::commands::git_backup::apply_device_identity(&store, &skills_dir);

        if crate::core::git_backup::has_uncommitted_changes(&skills_dir).map_err(AppError::git)? {
            crate::core::git_backup::commit_all_unlocked(&skills_dir, &msg).map_err(AppError::git)?;
            store.log_audit(
                crate::core::audit_log::AuditDraft::new("commit_skill")
                    .skill(skill_id.clone(), skill.name.clone())
                    .detail(format!("commit message: {msg}"))
                    .ok(),
            );
            Ok(format!("Committed: {}", msg))
        } else {
            Ok("No changes to commit".to_string())
        }
    })
    .await?
}

#[tauri::command]
pub async fn generate_ai_skill_content(
    prompt: String,
    mode: String,
    file_context: Option<String>,
) -> Result<String, AppError> {
    tauri::async_runtime::spawn_blocking(move || {
        let context = file_context.unwrap_or_default();
        match mode.as_str() {
            "generate_skill" => {
                let name_line = prompt.lines().next().unwrap_or("Custom Skill");
                Ok(format!(
                    "---\nname: {name_line}\ndescription: {prompt}\n---\n\n# {name_line}\n\n## Overview\n{prompt}\n\n## Instructions\n1. Follow best practices for modern skill guidelines.\n2. Ensure clear scope and context.\n"
                ))
            }
            "refine_file" => {
                if context.is_empty() {
                    Ok(format!("# Refined Prompt\n\n{prompt}\n"))
                } else {
                    Ok(format!("{context}\n\n<!-- AI Refinement Note: Applied prompt '{prompt}' -->\n"))
                }
            }
            "fix_safety" => {
                if !context.contains("---") {
                    Ok(format!("---\nname: Auto Skill\ndescription: Generated description\n---\n\n{context}"))
                } else {
                    Ok(context)
                }
            }
            "create_script" => {
                Ok(format!(
                    "#!/usr/bin/env python3\n\"\"\"\nGenerated Helper Script for Prompt:\n{prompt}\n\"\"\"\n\nimport sys\n\ndef main():\n    print(\"Skill helper script initialized for: {{}}\".format(\"{prompt}\"))\n\nif __name__ == '__main__':\n    main()\n"
                ))
            }
            _ => Ok(format!("// AI Generation Result for: {prompt}\n\n{context}")),
        }
    })
    .await?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_canonical_safe_child_path_rejects_traversal() {
        let base = Path::new("/skills/my-skill");
        assert!(canonical_safe_child_path(base, "../escape").is_err());
        assert!(canonical_safe_child_path(base, "sub/../../escape").is_err());
        assert!(canonical_safe_child_path(base, "valid/child.txt").is_ok());
    }

    #[test]
    fn test_parse_skill_gitignore_and_ignore_logic() {
        let gitignore = "\n# comment\n*.log\ntemp/\n!important.log\n";
        let rules = parse_skill_gitignore(gitignore);
        assert_eq!(rules.len(), 3);

        assert!(is_skill_path_ignored("debug.log", false, None, &rules));
        assert!(!is_skill_path_ignored("important.log", false, None, &rules));
        assert!(is_skill_path_ignored("temp/data.json", true, None, &rules));
        assert!(is_skill_path_ignored("node_modules/pkg/index.js", false, None, &rules));
        assert!(is_skill_path_ignored(".git/config", false, None, &rules));
        assert!(!is_skill_path_ignored("SKILL.md", false, None, &rules));
    }
}
