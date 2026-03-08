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
}

export interface Config {
	workspaces: Workspace[];
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

// ── Hooks ───────────────────────────────────────────────────────────

export function ensureHooks(): Promise<void> {
	return invoke("ensure_hooks");
}
