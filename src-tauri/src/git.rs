use git2::{Repository, StatusOptions, Sort};
use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
pub struct GitRepoInfo {
    pub default_branch: String,
    pub repo_name: String,
}

#[derive(Serialize)]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
    pub staged: bool,
}

#[derive(Serialize)]
pub struct GitCommitInfo {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub timestamp: i64,
    pub parent_count: usize,
}

#[derive(Serialize)]
pub struct GitStashEntry {
    pub index: usize,
    pub message: String,
    pub timestamp: i64,
}

// ============================================================================
// git2-based read operations
// ============================================================================

#[tauri::command]
pub fn git_validate_repo(path: String) -> Result<GitRepoInfo, String> {
    let repo = Repository::open(&path)
        .map_err(|_| "Not a git repository".to_string())?;

    let default_branch = detect_default_branch(&repo, &path)?;

    let repo_name = std::path::Path::new(&path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    Ok(GitRepoInfo {
        default_branch,
        repo_name,
    })
}

fn detect_default_branch(repo: &Repository, repo_path: &str) -> Result<String, String> {
    // Try: resolve refs/remotes/origin/HEAD
    if let Ok(reference) = repo.find_reference("refs/remotes/origin/HEAD") {
        if let Ok(resolved) = reference.resolve() {
            if let Some(name) = resolved.name() {
                if let Some(branch) = name.strip_prefix("refs/remotes/origin/") {
                    return Ok(branch.to_string());
                }
            }
        }
    }

    // Fallback: check if main, master, or develop exist
    for candidate in &["main", "master", "develop"] {
        let refname = format!("refs/heads/{}", candidate);
        if repo.find_reference(&refname).is_ok() {
            return Ok(candidate.to_string());
        }
    }

    // Last resort: current branch via CLI (HEAD may be detached in worktrees)
    let output = Command::new("git")
        .args(["-C", repo_path, "branch", "--show-current"])
        .output()
        .map_err(|e| format!("Failed to run git: {}", e))?;

    let branch = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if !branch.is_empty() {
        return Ok(branch);
    }

    Err("Could not detect default branch".to_string())
}

#[tauri::command]
pub fn git_init_repo(path: String) -> Result<GitRepoInfo, String> {
    Repository::init(&path)
        .map_err(|e| format!("git init failed: {}", e))?;

    git_validate_repo(path)
}

#[tauri::command]
pub fn git_status(path: String) -> Result<Vec<GitFileStatus>, String> {
    let repo = Repository::open(&path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let mut opts = StatusOptions::new();
    opts.include_untracked(true)
        .recurse_untracked_dirs(true);

    let statuses = repo.statuses(Some(&mut opts))
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let mut result = Vec::new();
    for entry in statuses.iter() {
        let path_str = entry.path().unwrap_or("").to_string();
        let st = entry.status();

        // Staged changes (index)
        if st.is_index_new() {
            result.push(GitFileStatus { path: path_str.clone(), status: "new".to_string(), staged: true });
        }
        if st.is_index_modified() {
            result.push(GitFileStatus { path: path_str.clone(), status: "modified".to_string(), staged: true });
        }
        if st.is_index_deleted() {
            result.push(GitFileStatus { path: path_str.clone(), status: "deleted".to_string(), staged: true });
        }
        if st.is_index_renamed() {
            result.push(GitFileStatus { path: path_str.clone(), status: "renamed".to_string(), staged: true });
        }
        if st.is_index_typechange() {
            result.push(GitFileStatus { path: path_str.clone(), status: "typechange".to_string(), staged: true });
        }

        // Unstaged changes (workdir)
        if st.is_wt_modified() {
            result.push(GitFileStatus { path: path_str.clone(), status: "modified".to_string(), staged: false });
        }
        if st.is_wt_deleted() {
            result.push(GitFileStatus { path: path_str.clone(), status: "deleted".to_string(), staged: false });
        }
        if st.is_wt_renamed() {
            result.push(GitFileStatus { path: path_str.clone(), status: "renamed".to_string(), staged: false });
        }
        if st.is_wt_typechange() {
            result.push(GitFileStatus { path: path_str.clone(), status: "typechange".to_string(), staged: false });
        }
        if st.is_wt_new() {
            result.push(GitFileStatus { path: path_str.clone(), status: "new".to_string(), staged: false });
        }
    }

    Ok(result)
}

#[tauri::command]
pub fn git_log(path: String, limit: Option<usize>) -> Result<Vec<GitCommitInfo>, String> {
    let repo = Repository::open(&path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let mut revwalk = repo.revwalk()
        .map_err(|e| format!("Failed to create revwalk: {}", e))?;

    revwalk.push_head()
        .map_err(|e| format!("Failed to push HEAD: {}", e))?;

    revwalk.set_sorting(Sort::TIME)
        .map_err(|e| format!("Failed to set sorting: {}", e))?;

    let max = limit.unwrap_or(50);
    let mut commits = Vec::new();

    for oid_result in revwalk {
        if commits.len() >= max {
            break;
        }

        let oid = oid_result.map_err(|e| format!("Revwalk error: {}", e))?;
        let commit = repo.find_commit(oid)
            .map_err(|e| format!("Failed to find commit: {}", e))?;

        let hash = oid.to_string();
        let short_hash = hash[..7.min(hash.len())].to_string();
        let message = commit.message().unwrap_or("").lines().next().unwrap_or("").to_string();
        let author = commit.author().name().unwrap_or("Unknown").to_string();
        let timestamp = commit.time().seconds();
        let parent_count = commit.parent_count();

        commits.push(GitCommitInfo {
            hash,
            short_hash,
            message,
            author,
            timestamp,
            parent_count,
        });
    }

    Ok(commits)
}

#[tauri::command]
pub fn git_stash_list(repo_path: String) -> Result<Vec<GitStashEntry>, String> {
    let mut repo = Repository::open(&repo_path)
        .map_err(|e| format!("Failed to open repo: {}", e))?;

    let mut stashes = Vec::new();
    repo.stash_foreach(|index, message, _oid| {
        stashes.push(GitStashEntry {
            index,
            message: message.to_string(),
            timestamp: 0, // git2 stash_foreach doesn't expose timestamp directly
        });
        true
    }).map_err(|e| format!("Failed to list stashes: {}", e))?;

    // Retrieve timestamps from the stash commits
    for stash in &mut stashes {
        let refname = format!("stash@{{{}}}", stash.index);
        let output = Command::new("git")
            .args(["-C", &repo_path, "log", "-1", "--format=%ct", &refname])
            .output();
        if let Ok(out) = output {
            if out.status.success() {
                if let Ok(ts) = String::from_utf8_lossy(&out.stdout).trim().parse::<i64>() {
                    stash.timestamp = ts;
                }
            }
        }
    }

    Ok(stashes)
}

// ============================================================================
// CLI-based write operations (stash save/pop/apply/drop)
// ============================================================================

#[tauri::command]
pub fn git_stash_save(repo_path: String, message: Option<String>, include_untracked: Option<bool>) -> Result<(), String> {
    let mut args = vec!["-C".to_string(), repo_path, "stash".to_string(), "push".to_string()];

    if include_untracked.unwrap_or(false) {
        args.push("--include-untracked".to_string());
    }

    if let Some(msg) = message {
        if !msg.is_empty() {
            args.push("-m".to_string());
            args.push(msg);
        }
    }

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git stash push: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git stash push failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_stash_pop(repo_path: String, index: Option<usize>) -> Result<(), String> {
    let mut args = vec!["-C", &repo_path, "stash", "pop"];
    let index_str;
    if let Some(idx) = index {
        index_str = format!("stash@{{{}}}", idx);
        args.push(&index_str);
    }

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git stash pop: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git stash pop failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_stash_apply(repo_path: String, index: Option<usize>) -> Result<(), String> {
    let mut args = vec!["-C", &repo_path, "stash", "apply"];
    let index_str;
    if let Some(idx) = index {
        index_str = format!("stash@{{{}}}", idx);
        args.push(&index_str);
    }

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git stash apply: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git stash apply failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_stash_drop(repo_path: String, index: Option<usize>) -> Result<(), String> {
    let mut args = vec!["-C", &repo_path, "stash", "drop"];
    let index_str;
    if let Some(idx) = index {
        index_str = format!("stash@{{{}}}", idx);
        args.push(&index_str);
    }

    let output = Command::new("git")
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run git stash drop: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git stash drop failed: {}", stderr));
    }

    Ok(())
}

// ============================================================================
// CLI-based worktree/branch operations (unchanged)
// ============================================================================

#[tauri::command]
pub fn git_create_worktree(
    repo_path: String,
    branch_name: String,
    base_branch: String,
    worktree_path: String,
) -> Result<(), String> {
    let output = Command::new("git")
        .args([
            "-C",
            &repo_path,
            "worktree",
            "add",
            &worktree_path,
            "-b",
            &branch_name,
            &base_branch,
        ])
        .output()
        .map_err(|e| format!("Failed to run git worktree add: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git worktree add failed: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub fn git_remove_worktree(
    repo_path: String,
    worktree_path: String,
    delete_branch: bool,
) -> Result<(), String> {
    let output = Command::new("git")
        .args(["-C", &repo_path, "worktree", "remove", &worktree_path, "--force"])
        .output()
        .map_err(|e| format!("Failed to run git worktree remove: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git worktree remove failed: {}", stderr));
    }

    if delete_branch {
        // Branch deletion handled by separate command from frontend
    }

    Ok(())
}

#[tauri::command]
pub fn git_delete_branch(repo_path: String, branch_name: String) -> Result<(), String> {
    let output = Command::new("git")
        .args(["-C", &repo_path, "branch", "-D", &branch_name])
        .output()
        .map_err(|e| format!("Failed to run git branch -D: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Err(format!("git branch -D failed: {}", stderr));
    }

    Ok(())
}
