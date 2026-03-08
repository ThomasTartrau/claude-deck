import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ensureHooks, killSession } from "@/lib/api";
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
import { FilterBar } from "@/components/FilterBar";
import { LaunchDialog } from "@/components/LaunchDialog";
import { SendDialog } from "@/components/SendDialog";
import { RenameDialog } from "@/components/RenameDialog";
import { TagPicker } from "@/components/TagPicker";
import { WorkspacePicker } from "@/components/WorkspacePicker";
import { QuickActionList } from "@/components/QuickActionList";
import { useSessionList } from "@/hooks/useSessionList";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { filterSessions } from "@/lib/filters";
import { modKey } from "@/lib/utils";
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

	// Filter state
	const [searchText, setSearchText] = useState("");
	const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);
	const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);

	// Check if any dialog is open
	const anyDialogOpen =
		launchOpen ||
		sendOpen ||
		renameOpen ||
		tagPickerOpen ||
		workspacePickerOpen ||
		quickActionOpen ||
		killConfirmOpen;

	// Filtered sessions
	const filteredSessions = useMemo(
		() =>
			filterSessions(sessions, searchText, activeTagFilters, activeWorkspace),
		[sessions, searchText, activeTagFilters, activeWorkspace],
	);

	const hasFilters =
		searchText !== "" ||
		activeTagFilters.length > 0 ||
		activeWorkspace !== null;

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

	// Keyboard shortcuts (⌘+key on macOS, Ctrl+key on Linux)
	useKeyboardShortcuts({
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
	}

	return (
		<TooltipProvider>
			<div className="flex h-screen flex-col bg-background text-foreground">
				{!terminalFullscreen && (
					<Header
						sessions={sessions}
						onNewSession={() => setLaunchOpen(true)}
						onOpenWorkspaces={() => setWorkspacePickerOpen(true)}
					/>
				)}

				{!terminalFullscreen && (hasFilters || showSearch) && (
					<FilterBar
						searchText={searchText}
						onSearchChange={setSearchText}
						activeTagFilters={activeTagFilters}
						onTagFilterChange={setActiveTagFilters}
						activeWorkspace={activeWorkspace}
						onWorkspaceClick={() => setWorkspacePickerOpen(true)}
						onClearFilters={handleClearFilters}
					/>
				)}

				<div className="flex flex-1 overflow-hidden">
					{/* Sessions Table */}
					<div
						className={`w-[45%] border-r border-border overflow-hidden ${terminalFullscreen ? "hidden" : ""}`}
					>
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

						{/* Terminal */}
						<div className="flex-1 overflow-hidden">
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
							/>
						</div>
					</div>
				</div>

				{!terminalFullscreen && (
					<div className="border-t border-border px-4 py-1 text-[10px] text-muted-foreground flex gap-3">
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}↑↓
							</kbd>{" "}
							Navigate
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}↵
							</kbd>{" "}
							Fullscreen
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}/
							</kbd>{" "}
							Search
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}N
							</kbd>{" "}
							New
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}T
							</kbd>{" "}
							Tags
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}W
							</kbd>{" "}
							Workspaces
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}J
							</kbd>{" "}
							Quick Actions
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}P
							</kbd>{" "}
							Send Prompt
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}R
							</kbd>{" "}
							Rename
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}K
							</kbd>{" "}
							Kill
						</span>
						<span>
							<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
								{modKey}F
							</kbd>{" "}
							Fullscreen
						</span>
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
					onWorkspaceSelected={setActiveWorkspace}
					activeWorkspace={activeWorkspace}
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
							<AlertDialogCancel>Cancel</AlertDialogCancel>
							<AlertDialogAction
								onClick={confirmKill}
								className="bg-destructive text-white hover:bg-destructive/90"
							>
								Kill
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</div>
		</TooltipProvider>
	);
}

export default App;
