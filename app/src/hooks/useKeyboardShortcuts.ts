import { useEffect, useCallback, useRef } from "react";
import type { Session } from "@/types/session";
import { isMac } from "@/lib/utils";

interface UseKeyboardShortcutsOptions {
	anyDialogOpen: boolean;
	selectedSession: Session | null;
	terminalFullscreen: boolean;
	filteredSessions: Session[];
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
		selectAll,
		clearSelection,
		selectedSessions,
	} = options;

	// Use ref to avoid recreating the keydown handler on every selection change
	const selectedSessionsRef = useRef(selectedSessions);
	selectedSessionsRef.current = selectedSessions;

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (anyDialogOpen) return;
			const mod = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
			if (!mod || e.altKey) return;

			switch (e.key) {
				case "a":
					e.preventDefault();
					if (selectedSessionsRef.current.size > 0) {
						clearSelection();
					} else {
						selectAll();
					}
					break;
				case "f":
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
				case "/":
					e.preventDefault();
					setShowSearch(true);
					break;
				case "n":
					e.preventDefault();
					setLaunchOpen(true);
					break;
				case "t":
					if (selectedSession) {
						e.preventDefault();
						setTagPickerOpen(true);
					}
					break;
				case "w":
					e.preventDefault();
					setWorkspacePickerOpen(true);
					break;
				case "j":
					if (selectedSession) {
						e.preventDefault();
						setQuickActionOpen(true);
					}
					break;
				case "p":
					if (selectedSession) {
						e.preventDefault();
						handleSendPrompt(selectedSession);
					}
					break;
				case "k":
					if (selectedSession && selectedSession.status !== "Dead") {
						e.preventDefault();
						requestKill(selectedSession);
					}
					break;
				case "r":
					if (selectedSession) {
						e.preventDefault();
						handleRename(selectedSession);
					}
					break;
				case "d":
					if (selectedSession) {
						e.preventDefault();
						toggleDiffView();
					}
					break;
				case "Enter":
					if (selectedSession) {
						e.preventDefault();
						setTerminalSession(selectedSession.name);
						setTerminalFullscreen(true);
					}
					break;
				case "ArrowDown":
				case "ArrowUp": {
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
						e.key === "ArrowDown"
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
			selectAll,
			clearSelection,
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [handleKeyDown]);
}
