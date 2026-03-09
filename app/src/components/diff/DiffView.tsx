import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
	getSessionDiff,
	gitStageFile,
	gitUnstageFile,
	gitDiscardFile,
	gitDiscardLines,
	sendPrompt,
} from "@/lib/api";
import type { SessionDiff } from "@/lib/api";
import { modKey } from "@/lib/utils";
import { toast } from "sonner";
import type {
	DiffViewProps,
	FileSection,
	ReviewComment,
	SidebarFile,
} from "./types";
import { parseUnifiedDiff, formatReviewPrompt } from "./utils";
import { FileListItem } from "./FileListItem";
import { SectionHeader } from "./SectionHeader";
import { DiffContent } from "./DiffContent";

const AUTO_REFRESH_INTERVAL = 5000;

export function DiffView({
	sessionName,
	visible = true,
	fullscreen,
	onToggleFullscreen,
	onToggleDiff,
}: DiffViewProps) {
	const [diff, setDiff] = useState<SessionDiff | null>(null);
	const [initialLoading, setInitialLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeFile, setActiveFile] = useState<string | null>(null);
	const [activeSection, setActiveSection] = useState<FileSection>("unstaged");
	const [refreshKey, setRefreshKey] = useState(0);
	const hasLoadedOnce = useRef(false);

	// Review comments
	const [reviewComments, setReviewComments] = useState<ReviewComment[]>([]);
	const [sendingReview, setSendingReview] = useState(false);

	// Discard confirmation
	const [discardConfirm, setDiscardConfirm] = useState<{
		type: "file" | "lines";
		path: string;
		hunkIndex?: number;
		lineIndices?: number[];
		label: string;
	} | null>(null);

	const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional trigger to re-fetch
	useEffect(() => {
		if (!sessionName) {
			setDiff(null);
			setActiveFile(null);
			hasLoadedOnce.current = false;
			return;
		}

		// Only show loading spinner on first load, not on refreshes
		if (!hasLoadedOnce.current) {
			setInitialLoading(true);
		}
		setError(null);
		getSessionDiff(sessionName)
			.then((result) => {
				setDiff(result);
				hasLoadedOnce.current = true;
				// Preserve current file selection if it still exists in the new diff
				const allNewFiles = [
					...result.unstaged_files,
					...result.untracked_files,
					...result.staged_files,
				];
				const currentStillExists =
					activeFile && allNewFiles.some((f) => f.path === activeFile);
				if (!currentStillExists) {
					const first =
						result.unstaged_files[0] ||
						result.untracked_files[0] ||
						result.staged_files[0];
					if (first) {
						setActiveFile(first.path);
						if (result.unstaged_files.includes(first))
							setActiveSection("unstaged");
						else if (result.untracked_files.includes(first))
							setActiveSection("untracked");
						else setActiveSection("staged");
					} else {
						setActiveFile(null);
					}
				}
			})
			.catch((err) => {
				setError(String(err));
				setDiff(null);
			})
			.finally(() => setInitialLoading(false));
	}, [sessionName, refreshKey]);

	// Auto-refresh diff every AUTO_REFRESH_INTERVAL ms (silent, no flash)
	useEffect(() => {
		if (!sessionName || !visible) return;
		const timer = setInterval(() => {
			setRefreshKey((k) => k + 1);
		}, AUTO_REFRESH_INTERVAL);
		return () => clearInterval(timer);
	}, [sessionName, visible]);

	const allFiles: SidebarFile[] = useMemo(() => {
		if (!diff) return [];
		return [
			...diff.staged_files.map((f) => ({
				file: f,
				section: "staged" as FileSection,
			})),
			...diff.unstaged_files.map((f) => ({
				file: f,
				section: "unstaged" as FileSection,
			})),
			...diff.untracked_files.map((f) => ({
				file: f,
				section: "untracked" as FileSection,
			})),
		];
	}, [diff]);

	const parsedFiles = useMemo(() => {
		if (!diff) return [];
		if (activeSection === "staged") return parseUnifiedDiff(diff.staged_diff);
		if (activeSection === "untracked")
			return parseUnifiedDiff(diff.untracked_diff);
		return parseUnifiedDiff(diff.unstaged_diff);
	}, [diff, activeSection]);

	// Arrow key navigation + Cmd+Enter to send review
	const navigateFile = useCallback(
		(direction: "up" | "down") => {
			if (allFiles.length === 0) return;
			const idx = allFiles.findIndex(
				(f) => f.file.path === activeFile && f.section === activeSection,
			);
			const next =
				direction === "down"
					? Math.min(idx + 1, allFiles.length - 1)
					: Math.max(idx - 1, 0);
			setActiveFile(allFiles[next].file.path);
			setActiveSection(allFiles[next].section);
		},
		[allFiles, activeFile, activeSection],
	);

	// Stable ref for handleSendReview so the keyboard handler doesn't go stale
	const sendReviewRef = useRef<() => void>(() => {});

	useEffect(() => {
		if (!visible) return;
		function handleKeyDown(e: KeyboardEvent) {
			// Cmd+Enter (or Ctrl+Enter) to send review — only in fullscreen
			if (
				fullscreen &&
				e.key === "Enter" &&
				(e.metaKey || e.ctrlKey) &&
				!e.altKey
			) {
				// Don't intercept if inside a textarea (comment editor handles its own Cmd+Enter)
				if ((e.target as HTMLElement).tagName === "TEXTAREA") return;
				e.preventDefault();
				sendReviewRef.current();
				return;
			}
			if (allFiles.length === 0) return;
			if (e.key === "ArrowUp" && !e.metaKey && !e.ctrlKey && !e.altKey) {
				e.preventDefault();
				navigateFile("up");
			} else if (
				e.key === "ArrowDown" &&
				!e.metaKey &&
				!e.ctrlKey &&
				!e.altKey
			) {
				e.preventDefault();
				navigateFile("down");
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [visible, allFiles, navigateFile, fullscreen]);

	// ── Comment management ──────────────────────────────────────────

	function addComment(comment: ReviewComment) {
		setReviewComments((prev) => [...prev, comment]);
	}

	function updateComment(index: number, text: string) {
		setReviewComments((prev) =>
			prev.map((c, i) => (i === index ? { ...c, text } : c)),
		);
	}

	function deleteComment(index: number) {
		setReviewComments((prev) => prev.filter((_, i) => i !== index));
	}

	function handleSendReview() {
		if (!sessionName || reviewComments.length === 0 || sendingReview) return;
		setSendingReview(true);
		const prompt = formatReviewPrompt(reviewComments);
		sendPrompt(sessionName, prompt)
			.then(() => {
				setReviewComments([]);
			})
			.catch((err) => toast.error(`Send review failed: ${err}`))
			.finally(() => setSendingReview(false));
	}

	// Keep the ref in sync
	sendReviewRef.current = handleSendReview;

	function commentCountForFile(filePath: string): number {
		return reviewComments.filter((c) => c.file === filePath).length;
	}

	// ── Actions ─────────────────────────────────────────────────────

	function handleStageFile(path: string) {
		if (!sessionName) return;
		gitStageFile(sessionName, path)
			.then(() => refresh())
			.catch((err) => toast.error(`Stage failed: ${err}`));
	}

	function handleUnstageFile(path: string) {
		if (!sessionName) return;
		gitUnstageFile(sessionName, path)
			.then(() => refresh())
			.catch((err) => toast.error(`Unstage failed: ${err}`));
	}

	function confirmDiscard() {
		if (!sessionName || !discardConfirm) return;
		const { type, path, hunkIndex, lineIndices } = discardConfirm;
		const promise =
			type === "file"
				? gitDiscardFile(sessionName, path)
				: gitDiscardLines(sessionName, path, hunkIndex!, lineIndices!);
		promise
			.then(() => refresh())
			.catch((err) => toast.error(`Discard failed: ${err}`))
			.finally(() => setDiscardConfirm(null));
	}

	function handleStageAll(section: "unstaged" | "untracked") {
		if (!sessionName || !diff) return;
		const files =
			section === "unstaged" ? diff.unstaged_files : diff.untracked_files;
		Promise.all(files.map((f) => gitStageFile(sessionName, f.path)))
			.then(() => refresh())
			.catch((err) => toast.error(`Stage all failed: ${err}`));
	}

	function handleUnstageAll() {
		if (!sessionName || !diff) return;
		Promise.all(
			diff.staged_files.map((f) => gitUnstageFile(sessionName, f.path)),
		)
			.then(() => refresh())
			.catch((err) => toast.error(`Unstage all failed: ${err}`));
	}

	// ── Render ──────────────────────────────────────────────────────

	if (!sessionName) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground bg-[#0a0a0a]">
				<p className="text-sm">Select a session to view diff</p>
			</div>
		);
	}

	if (initialLoading) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground bg-[#0a0a0a]">
				<p className="text-sm">Loading diff...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full items-center justify-center text-red-400 bg-[#0a0a0a]">
				<p className="text-sm">{error}</p>
			</div>
		);
	}

	const headerBar = (
		<div className="flex items-center justify-between px-3 py-1 border-b border-border/30 bg-black/50 shrink-0">
			<div className="flex items-center gap-2">
				<span className="text-[10px] font-medium text-yellow-400/60 tracking-wider uppercase">
					Diff — {sessionName}
				</span>
				{allFiles.length > 0 && (
					<span className="text-[10px] font-mono text-muted-foreground">
						{allFiles.length} file
						{allFiles.length !== 1 ? "s" : ""}
						{allFiles.reduce((s, f) => s + f.file.insertions, 0) > 0 && (
							<span className="text-green-400 ml-1">
								+{allFiles.reduce((s, f) => s + f.file.insertions, 0)}
							</span>
						)}
						{allFiles.reduce((s, f) => s + f.file.deletions, 0) > 0 && (
							<span className="text-red-400 ml-1">
								-{allFiles.reduce((s, f) => s + f.file.deletions, 0)}
							</span>
						)}
					</span>
				)}
				{reviewComments.length > 0 && (
					<span className="text-[10px] font-mono text-purple-400">
						◆ {reviewComments.length} comment
						{reviewComments.length !== 1 ? "s" : ""}
					</span>
				)}
			</div>
			<div className="flex items-center gap-1">
				{reviewComments.length > 0 && (
					<button
						onClick={handleSendReview}
						disabled={sendingReview}
						className="text-[10px] transition-colors px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium disabled:opacity-50"
						title={`${modKey}↵ to send`}
					>
						{sendingReview
							? "Sending..."
							: `Send review (${reviewComments.length})${fullscreen ? ` ${modKey}↵` : ""}`}
					</button>
				)}
				{reviewComments.length > 0 && (
					<button
						onClick={() => setReviewComments([])}
						className="text-[10px] transition-colors px-2 py-0.5 rounded text-muted-foreground hover:text-red-400 hover:bg-white/5"
						title="Clear all comments"
					>
						Clear
					</button>
				)}
				<button
					onClick={refresh}
					title="Refresh diff"
					className="text-[10px] transition-colors px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5"
				>
					↻
				</button>
				{onToggleDiff && (
					<button
						onClick={onToggleDiff}
						className="text-[10px] transition-colors px-2 py-0.5 rounded text-muted-foreground hover:text-foreground hover:bg-white/5"
					>
						{modKey}D Terminal
					</button>
				)}
				{onToggleFullscreen && fullscreen && (
					<button
						onClick={onToggleFullscreen}
						className="text-[10px] transition-colors px-2 py-0.5 rounded text-foreground bg-white/10 hover:bg-white/20"
					>
						{modKey}F Exit fullscreen
					</button>
				)}
			</div>
		</div>
	);

	if (!diff || allFiles.length === 0) {
		return (
			<div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
				{headerBar}
				<div className="flex flex-1 items-center justify-center text-muted-foreground">
					<p className="text-sm">Working tree clean</p>
				</div>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
			{headerBar}

			<div className="flex flex-1 overflow-hidden">
				{/* Sidebar */}
				<ScrollArea className="w-56 shrink-0 border-r border-border/20 bg-black/30">
					<SectionHeader
						label="Staged"
						count={diff.staged_files.length}
						color="text-green-400"
						onUnstageAll={
							diff.staged_files.length > 0 ? handleUnstageAll : undefined
						}
					/>
					{diff.staged_files.map((file) => (
						<FileListItem
							key={`staged-${file.path}`}
							file={file}
							section="staged"
							active={activeFile === file.path && activeSection === "staged"}
							onClick={() => {
								setActiveFile(file.path);
								setActiveSection("staged");
							}}
							onUnstage={() => handleUnstageFile(file.path)}
							commentCount={commentCountForFile(file.path)}
						/>
					))}

					<SectionHeader
						label="Unstaged"
						count={diff.unstaged_files.length}
						color="text-yellow-400"
						onStageAll={
							diff.unstaged_files.length > 0
								? () => handleStageAll("unstaged")
								: undefined
						}
					/>
					{diff.unstaged_files.map((file) => (
						<FileListItem
							key={`unstaged-${file.path}`}
							file={file}
							section="unstaged"
							active={activeFile === file.path && activeSection === "unstaged"}
							onClick={() => {
								setActiveFile(file.path);
								setActiveSection("unstaged");
							}}
							onStage={() => handleStageFile(file.path)}
							onRequestDiscard={() =>
								setDiscardConfirm({
									type: "file",
									path: file.path,
									label: file.path,
								})
							}
							commentCount={commentCountForFile(file.path)}
						/>
					))}

					<SectionHeader
						label="Untracked"
						count={diff.untracked_files.length}
						color="text-gray-400"
						onStageAll={
							diff.untracked_files.length > 0
								? () => handleStageAll("untracked")
								: undefined
						}
					/>
					{diff.untracked_files.map((file) => (
						<FileListItem
							key={`untracked-${file.path}`}
							file={file}
							section="untracked"
							active={activeFile === file.path && activeSection === "untracked"}
							onClick={() => {
								setActiveFile(file.path);
								setActiveSection("untracked");
							}}
							onStage={() => handleStageFile(file.path)}
							onRequestDiscard={() =>
								setDiscardConfirm({
									type: "file",
									path: file.path,
									label: file.path,
								})
							}
							commentCount={commentCountForFile(file.path)}
						/>
					))}
				</ScrollArea>

				{/* Diff viewer */}
				<div className="flex-1 overflow-hidden">
					<DiffContent
						parsedFiles={parsedFiles}
						activeFile={activeFile}
						activeSection={activeSection}
						sessionName={sessionName}
						onRefresh={refresh}
						onRequestDiscard={(path, hunkIndex, lineIndices, label) =>
							setDiscardConfirm({
								type: "lines",
								path,
								hunkIndex,
								lineIndices,
								label,
							})
						}
						comments={reviewComments}
						onAddComment={addComment}
						onUpdateComment={updateComment}
						onDeleteComment={deleteComment}
					/>
				</div>
			</div>

			{/* Discard confirmation */}
			<AlertDialog
				open={discardConfirm !== null}
				onOpenChange={(open) => {
					if (!open) setDiscardConfirm(null);
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Discard changes?</AlertDialogTitle>
						<AlertDialogDescription>
							{discardConfirm?.type === "lines" ? (
								<>
									Discard {discardConfirm.label} in{" "}
									<span className="font-mono font-medium">
										{discardConfirm.path}
									</span>
									? This cannot be undone.
								</>
							) : (
								<>
									Discard all changes in{" "}
									<span className="font-mono font-medium">
										{discardConfirm?.path}
									</span>
									? This cannot be undone.
								</>
							)}
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
							onClick={confirmDiscard}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							Discard{" "}
							<kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-white/25 text-[11px] font-mono font-bold">
								y
							</kbd>
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
