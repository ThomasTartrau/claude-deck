import { useEffect, useCallback, useRef, useMemo } from "react";
import type { Session } from "@/types/session";
import {
	buildKeyMap,
	eventToSignature,
	DEFAULT_KEYBINDINGS,
	type Action,
} from "@/lib/keybindings";

interface UseKeyboardShortcutsOptions {
	anyDialogOpen: boolean;
	selectedSession: Session | null;
	terminalFullscreen: boolean;
	filteredSessions: Session[];
	keybindings: Record<string, string>;
	setTerminalFullscreen: (v: boolean) => void;
	setTerminalSession: (v: string | null) => void;
	setSelectedSession: (v: Session | null) => void;
	setShowSearch: (v: boolean) => void;
	setLaunchOpen: (v: boolean) => void;
	setTagPickerOpen: (v: boolean) => void;
	setWorkspacePickerOpen: (v: boolean) => void;
	setQuickActionOpen: (v: boolean) => void;
	handleSendPrompt: (session: Session) => void;
	requestKill: (session: Session) => void;
	handleRename: (session: Session) => void;
	toggleDiffView: () => void;
	handleOpenTerminal: (session: Session) => void;
	handleOpenEditor: (session: Session) => void;
	handleCopyPath: (session: Session) => void;
	openSettings: () => void;
	// Multi-select
	selectAll: () => void;
	clearSelection: () => void;
	selectedSessions: Set<string>;
}

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions) {
	const {
		anyDialogOpen,
		selectedSession,
		terminalFullscreen,
		filteredSessions,
		keybindings,
		setTerminalFullscreen,
		setTerminalSession,
		setSelectedSession,
		setShowSearch,
		setLaunchOpen,
		setTagPickerOpen,
		setWorkspacePickerOpen,
		setQuickActionOpen,
		handleSendPrompt,
		requestKill,
		handleRename,
		toggleDiffView,
		handleOpenTerminal,
		handleOpenEditor,
		handleCopyPath,
		openSettings,
		selectAll,
		clearSelection,
		selectedSessions,
	} = options;

	const selectedSessionsRef = useRef(selectedSessions);
	selectedSessionsRef.current = selectedSessions;

	const keyMap = useMemo(
		() => buildKeyMap({ ...DEFAULT_KEYBINDINGS, ...keybindings }),
		[keybindings],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (anyDialogOpen) return;

			const sig = eventToSignature(e);
			if (!sig) return;

			const action = keyMap.get(sig) as Action | undefined;
			if (!action) return;

			switch (action) {
				case "settings":
					e.preventDefault();
					openSettings();
					break;
				case "open_terminal":
					if (selectedSession) {
						e.preventDefault();
						handleOpenTerminal(selectedSession);
					}
					break;
				case "open_editor":
					if (selectedSession) {
						e.preventDefault();
						handleOpenEditor(selectedSession);
					}
					break;
				case "copy_path":
					if (selectedSession) {
						e.preventDefault();
						handleCopyPath(selectedSession);
					}
					break;
				case "select_all":
					e.preventDefault();
					if (selectedSessionsRef.current.size > 0) {
						clearSelection();
					} else {
						selectAll();
					}
					break;
				case "fullscreen":
					if (selectedSession) {
						e.preventDefault();
						if (terminalFullscreen) {
							setTerminalFullscreen(false);
						} else {
							setTerminalSession(selectedSession.name);
							setTerminalFullscreen(true);
						}
					}
					break;
				case "search":
					e.preventDefault();
					setShowSearch(true);
					break;
				case "new_session":
					e.preventDefault();
					setLaunchOpen(true);
					break;
				case "tags":
					if (selectedSession) {
						e.preventDefault();
						setTagPickerOpen(true);
					}
					break;
				case "workspaces":
					e.preventDefault();
					setWorkspacePickerOpen(true);
					break;
				case "quick_actions":
					if (selectedSession) {
						e.preventDefault();
						setQuickActionOpen(true);
					}
					break;
				case "send_prompt":
					if (selectedSession) {
						e.preventDefault();
						handleSendPrompt(selectedSession);
					}
					break;
				case "kill":
					if (selectedSession && selectedSession.status !== "Dead") {
						e.preventDefault();
						requestKill(selectedSession);
					}
					break;
				case "rename":
					if (selectedSession) {
						e.preventDefault();
						handleRename(selectedSession);
					}
					break;
				case "diff_view":
					if (selectedSession) {
						e.preventDefault();
						toggleDiffView();
					}
					break;
				case "enter_fullscreen":
					if (selectedSession) {
						e.preventDefault();
						setTerminalSession(selectedSession.name);
						setTerminalFullscreen(true);
					}
					break;
				case "navigate_down":
				case "navigate_up": {
					e.preventDefault();
					const list = filteredSessions;
					if (list.length === 0) break;
					if (!selectedSession) {
						setSelectedSession(list[0]);
						setTerminalSession(list[0].name);
						break;
					}
					const idx = list.findIndex((s) => s.name === selectedSession.name);
					const next =
						action === "navigate_down"
							? Math.min(idx + 1, list.length - 1)
							: Math.max(idx - 1, 0);
					setSelectedSession(list[next]);
					setTerminalSession(list[next].name);
					break;
				}
			}
		},
		[
			anyDialogOpen,
			selectedSession,
			terminalFullscreen,
			filteredSessions,
			keyMap,
			handleRename,
			handleSendPrompt,
			requestKill,
			setTerminalFullscreen,
			setTerminalSession,
			setSelectedSession,
			setShowSearch,
			setLaunchOpen,
			setTagPickerOpen,
			setWorkspacePickerOpen,
			setQuickActionOpen,
			toggleDiffView,
			handleOpenTerminal,
			handleOpenEditor,
			handleCopyPath,
			openSettings,
			selectAll,
			clearSelection,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [handleKeyDown]);
}
