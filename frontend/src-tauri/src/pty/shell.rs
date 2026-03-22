use std::env;
use std::path::PathBuf;

/// Get the default shell path for the current platform
pub fn get_default_shell() -> PathBuf {
    // Priority 1: Use $SHELL environment variable (Unix-like systems)
    if let Ok(shell) = env::var("SHELL") {
        let path = PathBuf::from(&shell);
        if path.exists() {
            return path;
        }
    }

    // Priority 2: Use platform-specific defaults
    get_platform_default_shell()
}

#[cfg(target_os = "macos")]
fn get_platform_default_shell() -> PathBuf {
    if std::fs::metadata("/bin/zsh").is_ok() {
        return PathBuf::from("/bin/zsh");
    }
    PathBuf::from("/bin/bash")
}

#[cfg(target_os = "linux")]
fn get_platform_default_shell() -> PathBuf {
    if std::fs::metadata("/bin/bash").is_ok() {
        return PathBuf::from("/bin/bash");
    }
    PathBuf::from("/bin/sh")
}

#[cfg(target_os = "windows")]
fn get_platform_default_shell() -> PathBuf {
    // Try PowerShell 7 first, fall back to Windows PowerShell
    if let Ok(pwsh) = which::which("pwsh.exe") {
        return pwsh;
    }
    PathBuf::from("powershell.exe")
}

#[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
fn get_platform_default_shell() -> PathBuf {
    PathBuf::from("/bin/sh")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_default_shell() {
        let shell = get_default_shell();
        assert!(shell.as_os_str().len() > 0, "Shell path should not be empty");
    }

    #[test]
    fn test_platform_default_exists() {
        let shell = get_platform_default_shell();
        #[cfg(not(target_os = "windows"))]
        assert!(shell.exists(), "Platform default shell should exist: {:?}", shell);
    }
}
