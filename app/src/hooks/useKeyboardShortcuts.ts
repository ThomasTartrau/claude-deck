import { useEffect, useCallback } from "react";
import type { Session } from "@/types/session";

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
	} = options;

	const handleKeyDown = useCallback(
		(e: KeyboardEvent) => {
			if (anyDialogOpen) return;
			if (!e.metaKey || e.ctrlKey || e.altKey) return;

			switch (e.key) {
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
		],
	);

	useEffect(() => {
		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [handleKeyDown]);
}
