import { invoke } from "@tauri-apps/api/core";
import type { Session } from "@/types/session";
import type { QuickAction } from "@/types/quickAction";

// ── Session management ──────────────────────────────────────────────

export function listSessions(): Promise<Session[]> {
	return invoke<Session[]>("list_sessions");
}

export function launchSession(
	name: string,
	prompt?: string,
	path?: string,
): Promise<void> {
	return invoke("launch_session", { name, prompt, path });
}

export function killSession(name: string): Promise<void> {
	return invoke("kill_session", { name });
}

export function renameSession(oldName: string, newName: string): Promise<void> {
	return invoke("rename_session", { oldName, newName });
}

export function sendPrompt(name: string, text: string): Promise<void> {
	return invoke("send_prompt", { name, text });
}

// ── Tags ────────────────────────────────────────────────────────────

export function getAllTags(): Promise<string[]> {
	return invoke<string[]>("get_all_tags");
}

export function setTags(sessionName: string, tags: string[]): Promise<void> {
	return invoke("set_tags", { sessionName, tags });
}

// ── Workspaces ──────────────────────────────────────────────────────

export interface Workspace {
	name: string;
	path: string;
	color: string | null;
}

export interface Config {
	workspaces: Workspace[];
	pinned_workspace: string | null;
	collapsed_groups: string[];
}

export function getConfig(): Promise<Config> {
	return invoke<Config>("get_config");
}

export function addWorkspace(path: string): Promise<void> {
	return invoke("add_workspace", { path });
}

export function removeWorkspace(path: string): Promise<void> {
	return invoke("remove_workspace", { path });
}

export function updateWorkspaceColor(
	path: string,
	color: string | null,
): Promise<void> {
	return invoke("update_workspace_color", { path, color });
}

export function setPinnedWorkspace(path: string | null): Promise<void> {
	return invoke("set_pinned_workspace", { path });
}

export function setCollapsedGroups(groups: string[]): Promise<void> {
	return invoke("set_collapsed_groups", { groups });
}

export function suggestWorkspace(sessionPath: string): Promise<string | null> {
	return invoke<string | null>("suggest_workspace", { sessionPath });
}

// ── Quick Actions ───────────────────────────────────────────────────

export function getQuickActions(): Promise<QuickAction[]> {
	return invoke<QuickAction[]>("get_quick_actions");
}

export function saveQuickAction(
	key: string,
	label: string,
	prompt: string,
	editIndex: number | null,
): Promise<void> {
	return invoke("save_quick_action", { key, label, prompt, editIndex });
}

export function deleteQuickAction(index: number): Promise<void> {
	return invoke("delete_quick_action", { index });
}

// ── PTY ─────────────────────────────────────────────────────────────

export function ptyOpen(
	sessionName: string,
	cols: number,
	rows: number,
): Promise<void> {
	return invoke("pty_open", { sessionName, cols, rows });
}

export function ptyClose(): Promise<void> {
	return invoke("pty_close");
}

export function ptyWrite(data: string): Promise<void> {
	return invoke("pty_write", { data });
}

export function ptyResize(cols: number, rows: number): Promise<void> {
	return invoke("pty_resize", { cols, rows });
}

// ── Diff ────────────────────────────────────────────────────────────

export interface DiffFile {
	path: string;
	old_path: string | null;
	status: string; // "M", "A", "D", "R", "?"
	insertions: number;
	deletions: number;
}

export interface SessionDiff {
	staged_files: DiffFile[];
	unstaged_files: DiffFile[];
	untracked_files: DiffFile[];
	staged_diff: string;
	unstaged_diff: string;
	untracked_diff: string;
}

export function getSessionDiff(sessionName: string): Promise<SessionDiff> {
	return invoke<SessionDiff>("get_session_diff", { sessionName });
}

export function gitStageFile(sessionName: string, path: string): Promise<void> {
	return invoke("git_stage_file", { sessionName, path });
}

export function gitUnstageFile(
	sessionName: string,
	path: string,
): Promise<void> {
	return invoke("git_unstage_file", { sessionName, path });
}

export function gitDiscardFile(
	sessionName: string,
	path: string,
): Promise<void> {
	return invoke("git_discard_file", { sessionName, path });
}

export function gitStageLines(
	sessionName: string,
	path: string,
	hunkIndex: number,
	lineIndices: number[],
): Promise<void> {
	return invoke("git_stage_lines", {
		sessionName,
		path,
		hunkIndex,
		lineIndices,
	});
}

export function gitUnstageLines(
	sessionName: string,
	path: string,
	hunkIndex: number,
	lineIndices: number[],
): Promise<void> {
	return invoke("git_unstage_lines", {
		sessionName,
		path,
		hunkIndex,
		lineIndices,
	});
}

export function gitDiscardLines(
	sessionName: string,
	path: string,
	hunkIndex: number,
	lineIndices: number[],
): Promise<void> {
	return invoke("git_discard_lines", {
		sessionName,
		path,
		hunkIndex,
		lineIndices,
	});
}

// ── Hooks ───────────────────────────────────────────────────────────

export function ensureHooks(): Promise<void> {
	return invoke("ensure_hooks");
}
