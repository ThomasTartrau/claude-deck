pub mod ansi;
pub mod claude;
pub mod config;
pub mod cost;
pub mod duration;
pub mod model;
pub mod tmux;

/// Ensure common binary paths are in PATH.
/// macOS GUI apps don't inherit the shell PATH, so tmux/git/claude
/// from Homebrew won't be found without this.
pub fn ensure_path() {
    use std::env;

    let current = env::var("PATH").unwrap_or_default();
    let extra_dirs = ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"];

    let mut paths: Vec<&str> = current.split(':').collect();
    for dir in &extra_dirs {
        if !paths.contains(dir) {
            paths.push(dir);
        }
    }

    env::set_var("PATH", paths.join(":"));
}
