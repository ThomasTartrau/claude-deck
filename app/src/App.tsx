import { useState, useEffect, useMemo, useCallback, useRef } from "react";

import {
	ensureHooks,
	killSession,
	setCollapsedGroups as persistCollapsedGroups,
	getConfig,
	suggestWorkspace,
	addWorkspace,
	setPinnedWorkspace,
	openTerminal,
	openInEditor,
} from "@/lib/api";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Header } from "@/components/Header";
import { SessionsTable } from "@/components/SessionsTable";
import { DetailPanel } from "@/components/DetailPanel";
import { TerminalPane } from "@/components/TerminalPane";
import { DiffView } from "@/components/DiffView";
import { FilterBar } from "@/components/FilterBar";
import { LaunchDialog } from "@/components/LaunchDialog";
import { SendDialog } from "@/components/SendDialog";
import { RenameDialog } from "@/components/RenameDialog";
import { TagPicker } from "@/components/TagPicker";
import { WorkspacePicker } from "@/components/WorkspacePicker";
import { WorkspaceTabs } from "@/components/WorkspaceTabs";
import { BulkActions } from "@/components/BulkActions";
import { QuickActionList } from "@/components/QuickActionList";
import { SettingsDialog } from "@/components/SettingsDialog";
import { useSessionList } from "@/hooks/useSessionList";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { filterSessions } from "@/lib/filters";
import {
	formatBinding,
	DEFAULT_KEYBINDINGS,
	ACTION_LABELS,
	ALL_ACTIONS,
} from "@/lib/keybindings";
import { getSettings } from "@/lib/api";
import type { Session } from "@/types/session";

function App() {
	const { sessions, loading, refresh } = useSessionList();
	const [selectedSession, setSelectedSession] = useState<Session | null>(null);
	const [launchOpen, setLaunchOpen] = useState(false);
	const [sendOpen, setSendOpen] = useState(false);
	const [sendTarget, setSendTarget] = useState("");
	const [renameOpen, setRenameOpen] = useState(false);
	const [renameTarget, setRenameTarget] = useState("");
	const [tagPickerOpen, setTagPickerOpen] = useState(false);
	const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
	const [quickActionOpen, setQuickActionOpen] = useState(false);
	const [showSearch, setShowSearch] = useState(false);
	const [terminalFullscreen, setTerminalFullscreen] = useState(false);
	const [terminalSession, setTerminalSession] = useState<string | null>(null);
	const [killConfirmOpen, setKillConfirmOpen] = useState(false);
	const [killTarget, setKillTarget] = useState<Session | null>(null);
	const [rightPanelView, setRightPanelView] = useState<"terminal" | "diff">(
		"terminal",
	);
	const [settingsOpen, setSettingsOpen] = useState(false);

	// Filter state
	const [searchText, setSearchText] = useState("");
	const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
	const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);

	// Multi-select state
	const [selectedSessions, setSelectedSessions] = useState<Set<string>>(
		new Set(),
	);

	// Collapsed groups state
	const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
		new Set(),
	);

	// Keybindings state
	const [keybindings, setKeybindings] =
		useState<Record<string, string>>(DEFAULT_KEYBINDINGS);

	// Auto-detect workspace suggestions
	const suggestedPathsRef = useRef<Set<string>>(new Set());

	// Load persisted config on mount
	useEffect(() => {
		getConfig()
			.then((config) => {
				if (config.pinned_workspace) {
					setActiveWorkspace(config.pinned_workspace);
				}
				if (config.collapsed_groups.length > 0) {
					setCollapsedGroups(new Set(config.collapsed_groups));
				}
			})
			.catch(() => {});
		getSettings()
			.then((s) => {
				setKeybindings({ ...DEFAULT_KEYBINDINGS, ...s.keybindings });
			})
			.catch(() => {});
	}, []);

	// Check if any dialog is open
	const anyDialogOpen =
		launchOpen ||
		sendOpen ||
		renameOpen ||
		tagPickerOpen ||
		workspacePickerOpen ||
		quickActionOpen ||
		killConfirmOpen ||
		settingsOpen;

	// Filtered sessions
	const filteredSessions = useMemo(
		() =>
			filterSessions(sessions, searchText, activeTagFilters, activeWorkspace),
		[sessions, searchText, activeTagFilters, activeWorkspace],
	);

	// Sessions sorted by visual display order (status groups) for keyboard navigation.
	// Excludes sessions in collapsed groups so arrow keys skip them.
	const visualOrderSessions = useMemo(() => {
		const order: Session["status"][] = ["Running", "Waiting", "Idle", "Dead"];
		const result: Session[] = [];
		for (const status of order) {
			if (collapsedGroups.has(status)) continue;
			for (const s of filteredSessions) {
				if (s.status === status) result.push(s);
			}
		}
		return result;
	}, [filteredSessions, collapsedGroups]);

	const hasFilters = searchText !== "" || activeTagFilters.length > 0;

	// Keep selected session in sync with refreshed data, clear if gone
	const selectedNameRef = useRef<string | null>(null);
	selectedNameRef.current = selectedSession?.name ?? null;

	useEffect(() => {
		const name = selectedNameRef.current;
		if (!name) return;
		const updated = sessions.find((s) => s.name === name);
		if (updated) {
			setSelectedSession(updated);
		} else {
			setSelectedSession(null);
		}
	}, [sessions]);

	// Auto-detect workspace (feature 9)
	useEffect(() => {
		for (const session of sessions) {
			if (
				session.pane_path &&
				!suggestedPathsRef.current.has(session.pane_path)
			) {
				suggestedPathsRef.current.add(session.pane_path);
				suggestWorkspace(session.pane_path)
					.then((suggestion) => {
						if (suggestion) {
							const folderName = suggestion.split("/").pop() || suggestion;
							toast(`New project detected: ${folderName}`, {
								description: suggestion,
								action: {
									label: "Add workspace",
									onClick: () => {
										addWorkspace(suggestion)
											.then(() => {
												toast.success(`Added workspace: ${folderName}`);
											})
											.catch((err) => {
												toast.error(`Failed: ${err}`);
											});
									},
								},
								duration: 8000,
							});
						}
					})
					.catch(() => {});
			}
		}
	}, [sessions]);

	// Ensure hooks on mount
	useEffect(() => {
		ensureHooks().catch((err) => {
			console.error("Failed to ensure hooks:", err);
		});
	}, []);

	const handleSendPrompt = useCallback((session: Session) => {
		setSendTarget(session.name);
		setSendOpen(true);
	}, []);

	const requestKill = useCallback((session: Session) => {
		setKillTarget(session);
		setKillConfirmOpen(true);
	}, []);

	const handleRename = useCallback((session: Session) => {
		setRenameTarget(session.name);
		setRenameOpen(true);
	}, []);

	const handleOpenTerminal = useCallback((session: Session) => {
		if (!session.pane_path) {
			toast.error("Session has no working directory");
			return;
		}
		openTerminal(session.pane_path).catch((err) => {
			toast.error(`Failed to open terminal: ${err}`);
		});
	}, []);

	const handleOpenEditor = useCallback((session: Session) => {
		if (!session.pane_path) {
			toast.error("Session has no working directory");
			return;
		}
		openInEditor(session.pane_path).catch((err) => {
			toast.error(`Failed to open editor: ${err}`);
		});
	}, []);

	const handleCopyPath = useCallback((session: Session) => {
		if (!session.pane_path) {
			toast.error("Session has no path to copy");
			return;
		}
		navigator.clipboard
			.writeText(session.pane_path)
			.then(() => {
				toast.success("Path copied to clipboard");
			})
			.catch((err) => {
				toast.error(`Failed to copy: ${err}`);
			});
	}, []);

	const handleWorkspaceSelected = useCallback((path: string | null) => {
		setActiveWorkspace(path);
		setPinnedWorkspace(path).catch(() => {});
	}, []);

	const handleToggleGroup = useCallback((status: string) => {
		setCollapsedGroups((prev) => {
			const next = new Set(prev);
			if (next.has(status)) {
				next.delete(status);
			} else {
				next.add(status);
			}
			return next;
		});
	}, []);

	// Persist collapsed groups on change
	useEffect(() => {
		const timeout = setTimeout(() => {
			persistCollapsedGroups(Array.from(collapsedGroups)).catch(() => {});
		}, 500);
		return () => clearTimeout(timeout);
	}, [collapsedGroups]);

	// Keyboard shortcuts (⌘+key on macOS, Ctrl+key on Linux)
	useKeyboardShortcuts({
		anyDialogOpen,
		selectedSession,
		terminalFullscreen,
		filteredSessions: visualOrderSessions,
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
		toggleDiffView: () =>
			setRightPanelView((v) => (v === "terminal" ? "diff" : "terminal")),
		handleOpenTerminal,
		handleOpenEditor,
		handleCopyPath,
		openSettings: () => setSettingsOpen(true),
		// Multi-select
		selectAll: () => {
			const allNames = new Set(filteredSessions.map((s) => s.name));
			setSelectedSessions(allNames);
		},
		clearSelection: () => setSelectedSessions(new Set()),
		selectedSessions,
	});

	function confirmKill() {
		if (!killTarget) return;
		killSession(killTarget.name)
			.then(() => {
				setSelectedSession(null);
				setTerminalSession(null);
				refresh();
			})
			.catch((err) => {
				console.error("Failed to kill session:", err);
			})
			.finally(() => {
				setKillConfirmOpen(false);
				setKillTarget(null);
			});
	}

	function handleClearFilters() {
		setSearchText("");
		setActiveTagFilters([]);
		setActiveWorkspace(null);
		setShowSearch(false);
		setPinnedWorkspace(null).catch(() => {});
	}

	return (
		<TooltipProvider>
			<div className="flex h-screen flex-col bg-background text-foreground">
				{!terminalFullscreen && (
					<Header
						sessions={sessions}
						onNewSession={() => setLaunchOpen(true)}
					/>
				)}

				{!terminalFullscreen && (hasFilters || showSearch) && (
					<FilterBar
						searchText={searchText}
						onSearchChange={setSearchText}
						activeTagFilters={activeTagFilters}
						onTagFilterChange={setActiveTagFilters}
						onClearFilters={handleClearFilters}
					/>
				)}

				<div className="flex flex-1 overflow-hidden">
					{/* Sessions Panel */}
					<div
						className={`w-[45%] border-r border-border overflow-hidden flex flex-col ${terminalFullscreen ? "hidden" : ""}`}
					>
						{/* Workspace Tabs */}
						<WorkspaceTabs
							sessions={sessions}
							activeWorkspace={activeWorkspace}
							onWorkspaceSelected={handleWorkspaceSelected}
							onManageWorkspaces={() => setWorkspacePickerOpen(true)}
						/>

						{/* Sessions Table with grouping */}
						<div className="flex-1 overflow-hidden">
							<SessionsTable
								sessions={filteredSessions}
								selectedSession={selectedSession}
								onSelectSession={(session) => {
									setSelectedSession(session);
									setTerminalSession(session?.name ?? null);
								}}
								onDoubleClickSession={(session) => {
									setSelectedSession(session);
									setTerminalSession(session.name);
									setTerminalFullscreen(true);
								}}
								loading={loading}
								selectedSessions={selectedSessions}
								onSelectionChange={setSelectedSessions}
								collapsedGroups={collapsedGroups}
								onToggleGroup={handleToggleGroup}
							/>
						</div>

						{/* Bulk Actions bar */}
						<BulkActions
							selectedSessions={selectedSessions}
							sessions={sessions}
							onClearSelection={() => setSelectedSessions(new Set())}
							onRefresh={refresh}
						/>
					</div>

					{/* Right Panel: Detail + Terminal */}
					<div
						className={`flex flex-col overflow-hidden ${terminalFullscreen ? "w-full" : "w-[55%]"}`}
					>
						{/* Detail Panel - top */}
						<div
							className={`shrink-0 border-b border-border overflow-auto ${terminalFullscreen ? "hidden" : ""}`}
						>
							<DetailPanel
								session={selectedSession}
								onOpenTags={() => setTagPickerOpen(true)}
							/>
						</div>

						{/* View toggle */}
						{selectedSession && (
							<div className="flex shrink-0 border-b border-border/30 bg-black/50">
								<button
									onClick={() => setRightPanelView("terminal")}
									className={`px-3 py-1 text-[10px] font-medium tracking-wider uppercase transition-colors ${
										rightPanelView === "terminal"
											? "text-green-400 border-b-2 border-green-400"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Terminal
								</button>
								<button
									onClick={() => setRightPanelView("diff")}
									className={`px-3 py-1 text-[10px] font-medium tracking-wider uppercase transition-colors ${
										rightPanelView === "diff"
											? "text-yellow-400 border-b-2 border-yellow-400"
											: "text-muted-foreground hover:text-foreground"
									}`}
								>
									Diff
								</button>
							</div>
						)}

						{/* Terminal / Diff — both stay mounted, hidden via CSS */}
						<div
							className={`flex-1 min-h-0 overflow-hidden ${rightPanelView !== "terminal" ? "hidden" : ""}`}
						>
							<TerminalPane
								sessionName={terminalSession}
								fullscreen={terminalFullscreen}
								onToggleFullscreen={() => {
									if (terminalFullscreen) {
										setTerminalFullscreen(false);
									} else if (selectedSession) {
										setTerminalSession(selectedSession.name);
										setTerminalFullscreen(true);
									}
								}}
								onToggleDiff={() => setRightPanelView("diff")}
							/>
						</div>
						<div
							className={`flex-1 min-h-0 overflow-hidden ${rightPanelView !== "diff" ? "hidden" : ""}`}
						>
							<DiffView
								sessionName={terminalSession}
								visible={rightPanelView === "diff"}
								fullscreen={terminalFullscreen}
								onToggleFullscreen={() => {
									if (terminalFullscreen) {
										setTerminalFullscreen(false);
									}
								}}
								onToggleDiff={() => setRightPanelView("terminal")}
							/>
						</div>
					</div>
				</div>

				{!terminalFullscreen && (
					<div className="border-t border-border px-4 py-1 text-[10px] text-muted-foreground flex gap-3 flex-wrap">
						{ALL_ACTIONS.map((action) => {
							const binding = keybindings[action];
							if (!binding) return null;
							return (
								<span key={action}>
									<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
										{formatBinding(binding)}
									</kbd>{" "}
									{ACTION_LABELS[action]}
								</span>
							);
						})}
					</div>
				)}

				{/* Dialogs */}
				<LaunchDialog
					open={launchOpen}
					onOpenChange={setLaunchOpen}
					onLaunched={refresh}
					defaultPath={activeWorkspace}
				/>

				<SendDialog
					open={sendOpen}
					onOpenChange={setSendOpen}
					sessionName={sendTarget}
				/>

				<RenameDialog
					open={renameOpen}
					onOpenChange={setRenameOpen}
					sessionName={renameTarget}
					onRenamed={refresh}
				/>

				{selectedSession && (
					<>
						<TagPicker
							open={tagPickerOpen}
							onOpenChange={setTagPickerOpen}
							sessionName={selectedSession.name}
							currentTags={selectedSession.tags}
							onTagsUpdated={refresh}
						/>

						<QuickActionList
							open={quickActionOpen}
							onOpenChange={setQuickActionOpen}
							sessionName={selectedSession.name}
							onActionSent={refresh}
						/>
					</>
				)}

				<WorkspacePicker
					open={workspacePickerOpen}
					onOpenChange={setWorkspacePickerOpen}
					onWorkspaceSelected={handleWorkspaceSelected}
					activeWorkspace={activeWorkspace}
					sessions={sessions}
				/>

				<SettingsDialog
					open={settingsOpen}
					onOpenChange={setSettingsOpen}
					onSaved={() => {
						getSettings()
							.then((s) => {
								setKeybindings({
									...DEFAULT_KEYBINDINGS,
									...s.keybindings,
								});
							})
							.catch(() => {});
					}}
				/>

				{/* Kill confirmation */}
				<AlertDialog open={killConfirmOpen} onOpenChange={setKillConfirmOpen}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>Kill session?</AlertDialogTitle>
							<AlertDialogDescription>
								This will kill{" "}
								<span className="font-mono font-medium">
									{killTarget?.name}
								</span>
								. This action cannot be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>
								Cancel{" "}
								<kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-foreground/15 text-[10px] font-mono font-semibold">
									n
								</kbd>
							</AlertDialogCancel>
							<AlertDialogAction
								onClick={confirmKill}
								className="bg-destructive text-white hover:bg-destructive/90"
							>
								Kill{" "}
								<kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-white/25 text-[11px] font-mono font-bold">
									y
								</kbd>
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
			<Toaster position="bottom-right" />
		</TooltipProvider>
	);
}

export default App;
