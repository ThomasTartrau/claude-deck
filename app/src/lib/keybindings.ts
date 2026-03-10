import { isMac } from "@/lib/utils";

export const ALL_ACTIONS = [
	"settings",
	"search",
	"new_session",
	"select_all",
	"fullscreen",
	"navigate_up",
	"navigate_down",
	"enter_fullscreen",
	"tags",
	"workspaces",
	"quick_actions",
	"send_prompt",
	"kill",
	"rename",
	"diff_view",
	"open_terminal",
	"open_editor",
	"copy_path",
] as const;

export type Action = (typeof ALL_ACTIONS)[number];

export const ACTION_LABELS: Record<Action, string> = {
	settings: "Settings",
	search: "Search",
	new_session: "New Session",
	select_all: "Select All",
	fullscreen: "Fullscreen",
	navigate_up: "Navigate Up",
	navigate_down: "Navigate Down",
	enter_fullscreen: "Enter Fullscreen",
	tags: "Tags",
	workspaces: "Workspaces",
	quick_actions: "Quick Actions",
	send_prompt: "Send Prompt",
	kill: "Kill",
	rename: "Rename",
	diff_view: "Diff View",
	open_terminal: "Open Terminal",
	open_editor: "Open Editor",
	copy_path: "Copy Path",
};

export const DEFAULT_KEYBINDINGS: Record<string, string> = {
	settings: "mod+,",
	search: "mod+/",
	new_session: "mod+n",
	select_all: "mod+a",
	fullscreen: "mod+f",
	navigate_up: "mod+ArrowUp",
	navigate_down: "mod+ArrowDown",
	enter_fullscreen: "mod+Enter",
	tags: "mod+t",
	workspaces: "mod+w",
	quick_actions: "mod+j",
	send_prompt: "mod+p",
	kill: "mod+k",
	rename: "mod+r",
	diff_view: "mod+d",
	open_terminal: "mod+o",
	open_editor: "mod+e",
	copy_path: "mod+shift+c",
};

interface ParsedBinding {
	mod: boolean;
	shift: boolean;
	alt: boolean;
	key: string;
}

function parseBinding(binding: string): ParsedBinding {
	const parts = binding.toLowerCase().split("+");
	const key = parts[parts.length - 1];
	return {
		mod: parts.includes("mod"),
		shift: parts.includes("shift"),
		alt: parts.includes("alt"),
		key,
	};
}

/**
 * Build a reverse lookup: from a keyboard event signature to an action name.
 */
export function buildKeyMap(
	keybindings: Record<string, string>,
): Map<string, string> {
	const map = new Map<string, string>();
	for (const [action, binding] of Object.entries(keybindings)) {
		const sig = bindingToSignature(binding);
		if (sig) map.set(sig, action);
	}
	return map;
}

function bindingToSignature(binding: string): string | null {
	const parsed = parseBinding(binding);
	if (!parsed.key) return null;
	const parts: string[] = [];
	if (parsed.mod) parts.push("mod");
	if (parsed.shift) parts.push("shift");
	if (parsed.alt) parts.push("alt");
	parts.push(parsed.key);
	return parts.join("+");
}

/**
 * Convert a KeyboardEvent into a signature string for matching.
 */
export function eventToSignature(e: KeyboardEvent): string | null {
	const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
	if (!mod) return null;

	const parts: string[] = ["mod"];
	if (e.shiftKey) parts.push("shift");
	if (e.altKey) parts.push("alt");
	// Normalize key to lowercase for matching
	parts.push(e.key.toLowerCase());
	return parts.join("+");
}

/**
 * Format a binding string for display (e.g. "mod+shift+c" -> "⌘⇧C")
 */
export function formatBinding(binding: string): string {
	const parsed = parseBinding(binding);
	const parts: string[] = [];
	if (parsed.mod) parts.push(isMac ? "⌘" : "Ctrl+");
	if (parsed.shift) parts.push(isMac ? "⇧" : "Shift+");
	if (parsed.alt) parts.push(isMac ? "⌥" : "Alt+");

	const keyDisplay: Record<string, string> = {
		arrowup: "↑",
		arrowdown: "↓",
		arrowleft: "←",
		arrowright: "→",
		enter: "↵",
		",": ",",
		"/": "/",
	};
	const key = parsed.key;
	parts.push(keyDisplay[key] ?? key.toUpperCase());
	return parts.join("");
}
