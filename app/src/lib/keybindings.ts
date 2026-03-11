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
	"zoom_in",
	"zoom_out",
	"zoom_reset",
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
	zoom_in: "Zoom In",
	zoom_out: "Zoom Out",
	zoom_reset: "Zoom Reset",
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
	zoom_in: "mod+=",
	zoom_out: "mod+-",
	zoom_reset: "mod+0",
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

// Map e.code to the character used in binding strings, for keys that
// vary across keyboard layouts (=, -, 0, etc.).
const CODE_TO_KEY: Record<string, string> = {
	Equal: "=",
	Minus: "-",
	Digit0: "0",
	Digit1: "1",
	Digit2: "2",
	Digit3: "3",
	Digit4: "4",
	Digit5: "5",
	Digit6: "6",
	Digit7: "7",
	Digit8: "8",
	Digit9: "9",
};

/**
 * Convert a KeyboardEvent into one or more signature strings for matching.
 * Returns an array because layout-dependent keys may need both e.key and e.code lookups.
 */
export function eventToSignatures(e: KeyboardEvent): string[] {
	const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
	if (!mod) return [];

	const prefix: string[] = ["mod"];
	if (e.shiftKey) prefix.push("shift");
	if (e.altKey) prefix.push("alt");

	const sigs: string[] = [];
	// Primary: use e.key
	sigs.push([...prefix, e.key.toLowerCase()].join("+"));
	// Fallback: use e.code mapping for layout-independent matching
	const codeKey = CODE_TO_KEY[e.code];
	if (codeKey) {
		const codeSig = [...prefix, codeKey].join("+");
		if (!sigs.includes(codeSig)) sigs.push(codeSig);
	}
	return sigs;
}

/**
 * Convert a KeyboardEvent into a signature string for matching.
 * @deprecated Use eventToSignatures for layout-independent matching.
 */
export function eventToSignature(e: KeyboardEvent): string | null {
	const sigs = eventToSignatures(e);
	return sigs.length > 0 ? sigs[0] : null;
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
