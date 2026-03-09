import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
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
	gitStageLines,
	gitUnstageLines,
	gitDiscardLines,
	sendPrompt,
} from "@/lib/api";
import type { DiffFile, SessionDiff } from "@/lib/api";
import { modKey } from "@/lib/utils";

/** A review comment attached to a specific diff line */
interface ReviewComment {
	file: string;
	line: number;
	lineType: "add" | "del" | "context";
	lineContent: string;
	text: string;
}

interface DiffViewProps {
	sessionName: string | null;
	visible?: boolean;
	fullscreen?: boolean;
	onToggleFullscreen?: () => void;
	onToggleDiff?: () => void;
}

interface ParsedHunk {
	header: string;
	oldStart: number;
	newStart: number;
	lines: DiffLine[];
}

interface DiffLine {
	type: "add" | "del" | "context" | "header";
	content: string;
	oldLine?: number;
	newLine?: number;
	/** 0-based index counting only +/- lines within the hunk (for git patch) */
	changeIndex?: number;
}

interface ParsedFile {
	path: string;
	hunks: ParsedHunk[];
}

function parseUnifiedDiff(raw: string): ParsedFile[] {
	const files: ParsedFile[] = [];
	const diffBlocks = raw.split(/^diff --git /m).filter(Boolean);

	for (const block of diffBlocks) {
		const lines = block.split("\n");
		const headerMatch = lines[0].match(/a\/(.+?) b\/(.+)/);
		const path = headerMatch ? headerMatch[2] : lines[0];

		const hunks: ParsedHunk[] = [];
		let currentHunk: ParsedHunk | null = null;
		let oldLine = 0;
		let newLine = 0;
		let changeIndex = 0;

		for (let i = 1; i < lines.length; i++) {
			const line = lines[i];
			const hunkMatch = line.match(
				/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)/,
			);
			if (hunkMatch) {
				currentHunk = {
					header: line,
					oldStart: parseInt(hunkMatch[1], 10),
					newStart: parseInt(hunkMatch[2], 10),
					lines: [],
				};
				oldLine = currentHunk.oldStart;
				newLine = currentHunk.newStart;
				changeIndex = 0;
				if (hunkMatch[3]) {
					currentHunk.lines.push({
						type: "header",
						content: hunkMatch[3].trim(),
					});
				}
				hunks.push(currentHunk);
				continue;
			}
			if (!currentHunk) continue;
			if (line.startsWith("+")) {
				currentHunk.lines.push({
					type: "add",
					content: line.slice(1),
					newLine,
					changeIndex,
				});
				newLine++;
				changeIndex++;
			} else if (line.startsWith("-")) {
				currentHunk.lines.push({
					type: "del",
					content: line.slice(1),
					oldLine,
					changeIndex,
				});
				oldLine++;
				changeIndex++;
			} else if (line.startsWith(" ")) {
				currentHunk.lines.push({
					type: "context",
					content: line.slice(1),
					oldLine,
					newLine,
				});
				oldLine++;
				newLine++;
			}
		}

		if (hunks.length > 0) {
			files.push({ path, hunks });
		}
	}
	return files;
}

// ── Types ───────────────────────────────────────────────────────────

type FileSection = "staged" | "unstaged" | "untracked";

interface SidebarFile {
	file: DiffFile;
	section: FileSection;
}

const statusColors: Record<string, string> = {
	M: "text-yellow-400",
	A: "text-green-400",
	D: "text-red-400",
	R: "text-blue-400",
	"?": "text-gray-400",
};

// ── FileListItem ────────────────────────────────────────────────────

function FileListItem({
	file,
	section,
	active,
	onClick,
	onStage,
	onUnstage,
	onRequestDiscard,
	commentCount,
}: {
	file: DiffFile;
	section: FileSection;
	active: boolean;
	onClick: () => void;
	onStage?: () => void;
	onUnstage?: () => void;
	onRequestDiscard?: () => void;
	commentCount?: number;
}) {
	const filename = file.path.split("/").pop() || file.path;
	const dir = file.path.includes("/")
		? file.path.slice(0, file.path.lastIndexOf("/"))
		: "";

	const row = (
		<button
			type="button"
			className={`w-full text-left px-3 py-1 flex items-center gap-2 text-xs transition-colors cursor-pointer ${
				active
					? "bg-accent text-accent-foreground"
					: "hover:bg-accent/50 text-foreground"
			}`}
			onClick={onClick}
		>
			<span
				className={`font-mono font-bold w-3 text-center shrink-0 ${statusColors[file.status] || "text-muted-foreground"}`}
			>
				{file.status}
			</span>
			<span className="truncate min-w-0 flex-1">
				<span className="font-medium">{filename}</span>
				{dir && <span className="text-muted-foreground ml-1">{dir}</span>}
			</span>
			<span className="flex gap-1 shrink-0 font-mono text-[10px]">
				{(commentCount ?? 0) > 0 && (
					<span
						className="text-purple-400"
						title={`${commentCount} comment${commentCount !== 1 ? "s" : ""}`}
					>
						◆{commentCount}
					</span>
				)}
				{file.insertions > 0 && (
					<span className="text-green-400">+{file.insertions}</span>
				)}
				{file.deletions > 0 && (
					<span className="text-red-400">-{file.deletions}</span>
				)}
			</span>
		</button>
	);

	return (
		<ContextMenu>
			<ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
			<ContextMenuContent>
				{(section === "unstaged" || section === "untracked") && onStage && (
					<ContextMenuItem onClick={onStage}>
						<span className="text-green-400 mr-2">+</span>
						Stage file
					</ContextMenuItem>
				)}
				{section === "staged" && onUnstage && (
					<ContextMenuItem onClick={onUnstage}>
						<span className="text-yellow-400 mr-2">−</span>
						Unstage file
					</ContextMenuItem>
				)}
				{(section === "unstaged" || section === "untracked") &&
					onRequestDiscard && (
						<>
							<ContextMenuSeparator />
							<ContextMenuItem
								onClick={onRequestDiscard}
								className="text-red-400 focus:text-red-400"
							>
								<span className="mr-2">✕</span>
								Discard changes
							</ContextMenuItem>
						</>
					)}
			</ContextMenuContent>
		</ContextMenu>
	);
}

// ── Section header ──────────────────────────────────────────────────

function SectionHeader({
	label,
	count,
	color,
	onStageAll,
	onUnstageAll,
}: {
	label: string;
	count: number;
	color: string;
	onStageAll?: () => void;
	onUnstageAll?: () => void;
}) {
	if (count === 0) return null;
	return (
		<div className="flex items-center justify-between px-3 py-1 border-b border-border/10">
			<span
				className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}
			>
				{label}
				<span className="ml-1 text-muted-foreground font-normal">
					({count})
				</span>
			</span>
			<span className="flex gap-1">
				{onStageAll && (
					<button
						onClick={onStageAll}
						className="text-[9px] px-1.5 py-0.5 rounded hover:bg-green-500/20 text-green-400 font-medium"
					>
						Stage all
					</button>
				)}
				{onUnstageAll && (
					<button
						onClick={onUnstageAll}
						className="text-[9px] px-1.5 py-0.5 rounded hover:bg-yellow-500/20 text-yellow-400 font-medium"
					>
						Unstage all
					</button>
				)}
			</span>
		</div>
	);
}

// ── Floating context menu ────────────────────────────────────────────

function LineContextMenu({
	x,
	y,
	count,
	section,
	onStage,
	onUnstage,
	onDiscard,
	onClose,
}: {
	x: number;
	y: number;
	count: number;
	section: FileSection;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	onClose: () => void;
}) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClick(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				onClose();
			}
		}
		function handleKey(e: KeyboardEvent) {
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		}
		document.addEventListener("mousedown", handleClick);
		document.addEventListener("keydown", handleKey);
		return () => {
			document.removeEventListener("mousedown", handleClick);
			document.removeEventListener("keydown", handleKey);
		};
	}, [onClose]);

	const label = `${count} line${count !== 1 ? "s" : ""}`;

	return (
		<div
			ref={ref}
			className="fixed z-50 min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-md animate-in fade-in-0 zoom-in-95"
			style={{ left: x, top: y }}
		>
			{section === "unstaged" && onStage && (
				<button
					onClick={() => {
						onStage();
						onClose();
					}}
					className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
				>
					<span className="text-green-400 mr-2">+</span>
					Stage {label}
				</button>
			)}
			{section === "staged" && onUnstage && (
				<button
					onClick={() => {
						onUnstage();
						onClose();
					}}
					className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
				>
					<span className="text-yellow-400 mr-2">−</span>
					Unstage {label}
				</button>
			)}
			{section === "unstaged" && onDiscard && (
				<>
					<div className="my-1 h-px bg-border" />
					<button
						onClick={() => {
							onDiscard();
							onClose();
						}}
						className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm text-red-400 hover:bg-accent cursor-pointer"
					>
						<span className="mr-2">✕</span>
						Discard {label}
					</button>
				</>
			)}
		</div>
	);
}

// ── Inline comment editor ───────────────────────────────────────────

function InlineCommentEditor({
	initialText,
	isEdit,
	onSubmit,
	onCancel,
	onDelete,
}: {
	initialText: string;
	isEdit: boolean;
	onSubmit: (text: string) => void;
	onCancel: () => void;
	onDelete?: () => void;
}) {
	const [text, setText] = useState(initialText);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	function handleSubmit() {
		if (text.trim()) {
			onSubmit(text.trim());
		}
	}

	return (
		<div className="flex flex-col ml-5 border-l-2 border-purple-500/60 bg-purple-500/10 px-3 py-2 gap-1.5">
			<textarea
				ref={textareaRef}
				className="w-full bg-black/40 border border-border/30 rounded px-2 py-1.5 text-xs text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:border-purple-500/50"
				rows={2}
				placeholder="Add a review comment..."
				value={text}
				onChange={(e) => setText(e.target.value)}
				onKeyDown={(e) => {
					if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
						e.preventDefault();
						handleSubmit();
					} else if (e.key === "Escape") {
						onCancel();
					}
				}}
			/>
			<div className="flex items-center gap-2">
				<button
					type="button"
					className="text-[10px] px-2 py-0.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-medium"
					onClick={handleSubmit}
				>
					{isEdit ? "Update" : "Comment"}
				</button>
				<button
					type="button"
					className="text-[10px] px-2 py-0.5 rounded text-muted-foreground hover:text-foreground"
					onClick={onCancel}
				>
					Cancel
				</button>
				{isEdit && onDelete && (
					<button
						type="button"
						className="text-[10px] px-2 py-0.5 rounded text-red-400 hover:text-red-300 ml-auto"
						onClick={onDelete}
					>
						Delete
					</button>
				)}
				<span className="text-[9px] text-muted-foreground/50 ml-auto">
					{modKey}↵ save · Esc cancel
				</span>
			</div>
		</div>
	);
}

// ── DiffContent ─────────────────────────────────────────────────────

function DiffContent({
	parsedFiles,
	activeFile,
	activeSection,
	sessionName,
	onRefresh,
	onRequestDiscard,
	comments,
	onAddComment,
	onUpdateComment,
	onDeleteComment,
}: {
	parsedFiles: ParsedFile[];
	activeFile: string | null;
	activeSection: FileSection;
	sessionName: string;
	onRefresh: () => void;
	onRequestDiscard: (
		path: string,
		hunkIndex: number,
		lineIndices: number[],
		label: string,
	) => void;
	comments: ReviewComment[];
	onAddComment: (comment: ReviewComment) => void;
	onUpdateComment: (index: number, text: string) => void;
	onDeleteComment: (index: number) => void;
}) {
	const file = activeFile
		? parsedFiles.find((f) => f.path === activeFile)
		: null;

	// Line selection state
	const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
	const lastClickedRef = useRef<string | null>(null);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// Inline comment input state
	const [commentingLine, setCommentingLine] = useState<string | null>(null);

	// Clear selection when file changes
	const activeFilePath = activeFile ?? null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeFilePath is an intentional trigger
	useEffect(() => {
		setSelectedLines(new Set());
		lastClickedRef.current = null;
		setContextMenu(null);
		setCommentingLine(null);
	}, [activeFilePath]);

	const isSelectable =
		activeSection === "unstaged" || activeSection === "staged";

	function lineKey(hunkIndex: number, changeIndex: number): string {
		return `${hunkIndex}:${changeIndex}`;
	}

	function commentKey(hunkIndex: number, lineIndex: number): string {
		return `${hunkIndex}:${lineIndex}`;
	}

	/** Right-click on a change line: select it (or add to selection) then open menu */
	function handleLineContextMenu(
		hunkIndex: number,
		changeIndex: number,
		e: React.MouseEvent,
	) {
		if (!isSelectable) return;
		e.preventDefault();

		const key = lineKey(hunkIndex, changeIndex);

		if (e.shiftKey && lastClickedRef.current) {
			// Range selection
			const [lastH, lastC] = lastClickedRef.current.split(":").map(Number);
			if (lastH === hunkIndex && file) {
				const hunk = file.hunks[hunkIndex];
				const from = Math.min(lastC, changeIndex);
				const to = Math.max(lastC, changeIndex);
				setSelectedLines((prev) => {
					const next = new Set(prev);
					for (const cl of hunk.lines) {
						if (
							cl.changeIndex !== undefined &&
							cl.changeIndex >= from &&
							cl.changeIndex <= to
						) {
							next.add(lineKey(hunkIndex, cl.changeIndex));
						}
					}
					return next;
				});
			}
		} else if (selectedLines.has(key)) {
			// Already selected — keep selection, just open menu
		} else {
			// Not selected — select only this line
			setSelectedLines(new Set([key]));
		}

		lastClickedRef.current = key;
		setContextMenu({ x: e.clientX, y: e.clientY });
	}

	/** Right-click on hunk header: select all lines in hunk, open menu */
	function handleHunkContextMenu(hunkIndex: number, e: React.MouseEvent) {
		if (!isSelectable || !file) return;
		e.preventDefault();

		const hunk = file.hunks[hunkIndex];
		const keys = hunk.lines
			.filter((l) => l.changeIndex !== undefined)
			.map((l) => lineKey(hunkIndex, l.changeIndex!));
		setSelectedLines(new Set(keys));
		lastClickedRef.current = null;
		setContextMenu({ x: e.clientX, y: e.clientY });
	}

	function getSelectedByHunk(): Map<number, number[]> {
		const map = new Map<number, number[]>();
		for (const key of selectedLines) {
			const [h, c] = key.split(":").map(Number);
			if (!map.has(h)) map.set(h, []);
			map.get(h)!.push(c);
		}
		return map;
	}

	function handleStageSelected() {
		if (!file) return;
		const byHunk = getSelectedByHunk();
		const promises: Promise<void>[] = [];
		for (const [hunkIdx, indices] of byHunk) {
			promises.push(gitStageLines(sessionName, file.path, hunkIdx, indices));
		}
		Promise.all(promises)
			.then(() => {
				setSelectedLines(new Set());
				onRefresh();
			})
			.catch((err) => console.error("Stage lines failed:", err));
	}

	function handleUnstageSelected() {
		if (!file) return;
		const byHunk = getSelectedByHunk();
		const promises: Promise<void>[] = [];
		for (const [hunkIdx, indices] of byHunk) {
			promises.push(gitUnstageLines(sessionName, file.path, hunkIdx, indices));
		}
		Promise.all(promises)
			.then(() => {
				setSelectedLines(new Set());
				onRefresh();
			})
			.catch((err) => console.error("Unstage lines failed:", err));
	}

	function handleRequestDiscardSelected() {
		if (!file) return;
		const byHunk = getSelectedByHunk();
		for (const [hunkIdx, indices] of byHunk) {
			const count = indices.length;
			onRequestDiscard(
				file.path,
				hunkIdx,
				indices,
				`${count} line${count !== 1 ? "s" : ""}`,
			);
			break;
		}
	}

	if (!file) {
		return (
			<div className="flex items-center justify-center h-full text-muted-foreground text-sm">
				Select a file to view diff
			</div>
		);
	}

	return (
		<div className="h-full relative">
			<ScrollArea className="h-full">
				<div className="font-mono text-xs leading-5">
					{file.hunks.map((hunk, hi) => (
						<div key={hi}>
							{/* Hunk header */}
							{/* biome-ignore lint/a11y/noStaticElementInteractions: context menu on hunk header */}
							<div
								className={`bg-blue-500/10 text-blue-400 px-4 py-1 border-y border-border/20 sticky top-0 z-10 ${isSelectable ? "cursor-context-menu" : ""}`}
								onContextMenu={
									isSelectable ? (e) => handleHunkContextMenu(hi, e) : undefined
								}
							>
								{hunk.header}
							</div>
							{/* Lines */}
							{hunk.lines.map((line, li) => {
								if (line.type === "header") return null;

								const isChange = line.type === "add" || line.type === "del";
								const isSelected =
									isChange &&
									line.changeIndex !== undefined &&
									selectedLines.has(lineKey(hi, line.changeIndex));

								const bgClass = isSelected
									? "bg-blue-500/25"
									: line.type === "add"
										? "bg-green-500/10"
										: line.type === "del"
											? "bg-red-500/10"
											: "";
								const textClass =
									line.type === "add"
										? "text-green-300"
										: line.type === "del"
											? "text-red-300"
											: "text-foreground/70";
								const prefix =
									line.type === "add" ? "+" : line.type === "del" ? "-" : " ";

								const ck = commentKey(hi, li);
								const lineNum =
									line.type === "del" ? line.oldLine : line.newLine;
								const existingIdx = activeFile
									? comments.findIndex(
											(c) =>
												c.file === activeFile &&
												c.line === lineNum &&
												c.lineType === line.type,
										)
									: -1;

								return (
									<div key={`${hi}-${li}`}>
										{/* biome-ignore lint/a11y/noStaticElementInteractions: context menu on diff line */}
										<div
											className={`group flex ${bgClass} ${isChange && isSelectable ? "cursor-context-menu" : ""} hover:brightness-125 transition-colors`}
											onContextMenu={
												isChange && isSelectable
													? (e) =>
															handleLineContextMenu(hi, line.changeIndex!, e)
													: undefined
											}
										>
											{/* Comment button */}
											<span className="w-5 shrink-0 flex items-center justify-center select-none">
												{existingIdx >= 0 ? (
													<button
														type="button"
														className="text-[10px] text-purple-400 hover:text-purple-300"
														onClick={() => {
															setCommentingLine(
																commentingLine === ck ? null : ck,
															);
														}}
														title="Edit comment"
													>
														◆
													</button>
												) : (
													<button
														type="button"
														className="text-[10px] text-transparent group-hover:text-muted-foreground/40 hover:!text-purple-400 transition-colors"
														onClick={() => setCommentingLine(ck)}
														title="Add comment"
													>
														+
													</button>
												)}
											</span>
											{/* Selection indicator */}
											{isSelectable && (
												<span className="w-4 shrink-0 flex items-center justify-center select-none text-[8px]">
													{isSelected ? (
														<span className="text-blue-400">●</span>
													) : isChange ? (
														<span className="text-muted-foreground/20">○</span>
													) : null}
												</span>
											)}
											<span className="w-12 shrink-0 text-right pr-2 text-muted-foreground/40 select-none border-r border-border/10">
												{line.type !== "add" ? line.oldLine : ""}
											</span>
											<span className="w-12 shrink-0 text-right pr-2 text-muted-foreground/40 select-none border-r border-border/10">
												{line.type !== "del" ? line.newLine : ""}
											</span>
											<span
												className={`w-5 shrink-0 text-center select-none ${textClass}`}
											>
												{prefix}
											</span>
											<span
												className={`flex-1 pr-4 whitespace-pre ${textClass}`}
											>
												{line.content || "\u00A0"}
											</span>
										</div>

										{/* Existing comment display */}
										{existingIdx >= 0 && commentingLine !== ck && (
											<div className="flex ml-5 border-l-2 border-purple-500/40 bg-purple-500/5 px-3 py-1.5">
												<span className="flex-1 text-xs text-purple-200 whitespace-pre-wrap">
													{comments[existingIdx].text}
												</span>
												<div className="flex items-start gap-1 ml-2 shrink-0">
													<button
														type="button"
														className="text-[10px] text-muted-foreground hover:text-purple-400 px-1"
														onClick={() => setCommentingLine(ck)}
													>
														Edit
													</button>
													<button
														type="button"
														className="text-[10px] text-muted-foreground hover:text-red-400 px-1"
														onClick={() => onDeleteComment(existingIdx)}
													>
														Delete
													</button>
												</div>
											</div>
										)}

										{/* Comment input */}
										{commentingLine === ck && (
											<InlineCommentEditor
												initialText={
													existingIdx >= 0 ? comments[existingIdx].text : ""
												}
												isEdit={existingIdx >= 0}
												onSubmit={(t) => {
													if (existingIdx >= 0) {
														onUpdateComment(existingIdx, t);
													} else {
														onAddComment({
															file: file.path,
															line: lineNum ?? 0,
															lineType: line.type as "add" | "del" | "context",
															lineContent: line.content,
															text: t,
														});
													}
													setCommentingLine(null);
												}}
												onCancel={() => setCommentingLine(null)}
												onDelete={
													existingIdx >= 0
														? () => {
																onDeleteComment(existingIdx);
																setCommentingLine(null);
															}
														: undefined
												}
											/>
										)}
									</div>
								);
							})}
						</div>
					))}
				</div>
			</ScrollArea>

			{/* Custom context menu */}
			{contextMenu && selectedLines.size > 0 && (
				<LineContextMenu
					x={contextMenu.x}
					y={contextMenu.y}
					count={selectedLines.size}
					section={activeSection}
					onStage={handleStageSelected}
					onUnstage={handleUnstageSelected}
					onDiscard={handleRequestDiscardSelected}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}

// ── Review formatting ───────────────────────────────────────────────

function formatReviewPrompt(comments: ReviewComment[]): string {
	const byFile = new Map<string, ReviewComment[]>();
	for (const c of comments) {
		const list = byFile.get(c.file) || [];
		list.push(c);
		byFile.set(c.file, list);
	}

	const parts: string[] = [
		"Code review with inline comments on the current diff:\n",
	];

	for (const [filePath, fileComments] of byFile) {
		parts.push(`## ${filePath}\n`);
		const sorted = [...fileComments].sort((a, b) => a.line - b.line);
		for (const c of sorted) {
			const prefix =
				c.lineType === "add" ? "+" : c.lineType === "del" ? "-" : " ";
			parts.push(
				`Line ${c.line} (${prefix}): \`${c.lineContent.trim()}\`\n> ${c.text}\n`,
			);
		}
	}

	parts.push(
		"\nPlease address each comment above. Fix the issues mentioned, explain your reasoning where needed, and make the necessary changes.",
	);

	return parts.join("\n");
}

// ── DiffView (main) ─────────────────────────────────────────────────

export function DiffView({
	sessionName,
	visible = true,
	fullscreen,
	onToggleFullscreen,
	onToggleDiff,
}: DiffViewProps) {
	const [diff, setDiff] = useState<SessionDiff | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeFile, setActiveFile] = useState<string | null>(null);
	const [activeSection, setActiveSection] = useState<FileSection>("unstaged");
	const [refreshKey, setRefreshKey] = useState(0);

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
			return;
		}

		setLoading(true);
		setError(null);
		getSessionDiff(sessionName)
			.then((result) => {
				setDiff(result);
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
			})
			.catch((err) => {
				setError(String(err));
				setDiff(null);
			})
			.finally(() => setLoading(false));
	}, [sessionName, refreshKey]);

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

	// Arrow key navigation
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

	useEffect(() => {
		if (!visible || allFiles.length === 0) return;
		function handleKeyDown(e: KeyboardEvent) {
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
	}, [visible, allFiles, navigateFile]);

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
		if (!sessionName || reviewComments.length === 0) return;
		setSendingReview(true);
		const prompt = formatReviewPrompt(reviewComments);
		sendPrompt(sessionName, prompt)
			.then(() => {
				setReviewComments([]);
			})
			.catch((err) => console.error("Send review failed:", err))
			.finally(() => setSendingReview(false));
	}

	function commentCountForFile(filePath: string): number {
		return reviewComments.filter((c) => c.file === filePath).length;
	}

	// ── Actions ─────────────────────────────────────────────────────

	function handleStageFile(path: string) {
		if (!sessionName) return;
		gitStageFile(sessionName, path)
			.then(() => refresh())
			.catch((err) => console.error("Stage failed:", err));
	}

	function handleUnstageFile(path: string) {
		if (!sessionName) return;
		gitUnstageFile(sessionName, path)
			.then(() => refresh())
			.catch((err) => console.error("Unstage failed:", err));
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
			.catch((err) => console.error("Discard failed:", err))
			.finally(() => setDiscardConfirm(null));
	}

	function handleStageAll(section: "unstaged" | "untracked") {
		if (!sessionName || !diff) return;
		const files =
			section === "unstaged" ? diff.unstaged_files : diff.untracked_files;
		Promise.all(files.map((f) => gitStageFile(sessionName, f.path)))
			.then(() => refresh())
			.catch((err) => console.error("Stage all failed:", err));
	}

	function handleUnstageAll() {
		if (!sessionName || !diff) return;
		Promise.all(
			diff.staged_files.map((f) => gitUnstageFile(sessionName, f.path)),
		)
			.then(() => refresh())
			.catch((err) => console.error("Unstage all failed:", err));
	}

	// ── Render ──────────────────────────────────────────────────────

	if (!sessionName) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground bg-[#0a0a0a]">
				<p className="text-sm">Select a session to view diff</p>
			</div>
		);
	}

	if (loading) {
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
					>
						{sendingReview
							? "Sending..."
							: `Send review (${reviewComments.length})`}
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
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							onClick={confirmDiscard}
							className="bg-destructive text-white hover:bg-destructive/90"
						>
							Discard
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
