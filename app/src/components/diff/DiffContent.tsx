import { useState, useEffect, useRef, useMemo } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { gitStageLines, gitUnstageLines } from "@/lib/api";
import { toast } from "sonner";
import type {
	CommentLine,
	FileSection,
	ParsedFile,
	ReviewComment,
} from "./types";
import { lineKey, anchorKey, groupSelectedByHunk } from "./utils";
import { LineContextMenu } from "./LineContextMenu";
import { InlineCommentEditor } from "./InlineCommentEditor";

export function DiffContent({
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

	// Drag selection state
	const isDraggingRef = useRef(false);
	const dragStartRef = useRef<{
		hunkIndex: number;
		changeIndex: number;
	} | null>(null);

	// Context menu state
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// Inline comment input: anchorKey of the line after which to show editor
	const [commentingAnchor, setCommentingAnchor] = useState<string | null>(null);
	// Lines to be included in the comment being created
	const [commentingLines, setCommentingLines] = useState<CommentLine[]>([]);

	// Clear selection when file changes
	const activeFilePath = activeFile ?? null;
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeFilePath is an intentional trigger
	useEffect(() => {
		setSelectedLines(new Set());
		lastClickedRef.current = null;
		setContextMenu(null);
		setCommentingAnchor(null);
		setCommentingLines([]);
	}, [activeFilePath]);

	// End drag on mouseup anywhere
	useEffect(() => {
		function handleMouseUp() {
			isDraggingRef.current = false;
			dragStartRef.current = null;
		}
		window.addEventListener("mouseup", handleMouseUp);
		return () => window.removeEventListener("mouseup", handleMouseUp);
	}, []);

	const isSelectable =
		activeSection === "unstaged" || activeSection === "staged";

	// Build a set of line keys that have comments attached (for persistent highlight)
	const commentedLineKeys = useMemo(() => {
		const keys = new Set<string>();
		if (!file) return keys;
		const fileComments = comments.filter((c) => c.file === activeFile);
		for (const comment of fileComments) {
			const [hunkIdx] = comment.anchorKey.split(":").map(Number);
			const hunk = file.hunks[hunkIdx];
			if (!hunk) continue;
			for (const cl of comment.lines) {
				for (let li = 0; li < hunk.lines.length; li++) {
					const hunkLine = hunk.lines[li];
					if (
						hunkLine.changeIndex !== undefined &&
						hunkLine.type === cl.type &&
						hunkLine.content === cl.content
					) {
						const lineNum =
							hunkLine.type === "del" ? hunkLine.oldLine : hunkLine.newLine;
						if (lineNum === cl.line) {
							keys.add(lineKey(hunkIdx, hunkLine.changeIndex));
						}
					}
				}
			}
		}
		return keys;
	}, [file, comments, activeFile]);

	/** Select range of lines between two change indices within a hunk */
	function selectRange(
		hunkIndex: number,
		fromChange: number,
		toChange: number,
	) {
		if (!file) return;
		const hunk = file.hunks[hunkIndex];
		const lo = Math.min(fromChange, toChange);
		const hi = Math.max(fromChange, toChange);
		const next = new Set<string>();
		for (const cl of hunk.lines) {
			if (
				cl.changeIndex !== undefined &&
				cl.changeIndex >= lo &&
				cl.changeIndex <= hi
			) {
				next.add(lineKey(hunkIndex, cl.changeIndex));
			}
		}
		setSelectedLines(next);
	}

	/** Mouse down on a change line -- start drag selection */
	function handleLineMouseDown(
		hunkIndex: number,
		changeIndex: number,
		e: React.MouseEvent,
	) {
		// Only left-click starts drag
		if (e.button !== 0) return;
		// Don't start drag if clicking on a button or interactive element
		if ((e.target as HTMLElement).closest("button")) return;

		e.preventDefault();
		isDraggingRef.current = true;
		dragStartRef.current = { hunkIndex, changeIndex };

		const key = lineKey(hunkIndex, changeIndex);
		setSelectedLines(new Set([key]));
		lastClickedRef.current = key;
		setContextMenu(null);
	}

	/** Mouse enter on a change line during drag -- extend selection */
	function handleLineMouseEnter(hunkIndex: number, changeIndex: number) {
		if (!isDraggingRef.current || !dragStartRef.current) return;
		// Only extend within the same hunk
		if (dragStartRef.current.hunkIndex !== hunkIndex) return;
		selectRange(hunkIndex, dragStartRef.current.changeIndex, changeIndex);
	}

	/** Right-click on a change line: open context menu with current selection */
	function handleLineContextMenu(
		hunkIndex: number,
		changeIndex: number,
		e: React.MouseEvent,
	) {
		e.preventDefault();

		const key = lineKey(hunkIndex, changeIndex);

		if (!selectedLines.has(key)) {
			// Right-clicked outside current selection -- select only this line
			setSelectedLines(new Set([key]));
		}
		// If already selected, keep entire selection

		lastClickedRef.current = key;
		setContextMenu({ x: e.clientX, y: e.clientY });
	}

	/** Right-click on hunk header: select all lines in hunk, open menu */
	function handleHunkContextMenu(hunkIndex: number, e: React.MouseEvent) {
		if (!file) return;
		e.preventDefault();

		const hunk = file.hunks[hunkIndex];
		const keys = hunk.lines
			.filter((l) => l.changeIndex !== undefined)
			.map((l) => lineKey(hunkIndex, l.changeIndex!));
		setSelectedLines(new Set(keys));
		lastClickedRef.current = null;
		setContextMenu({ x: e.clientX, y: e.clientY });
	}

	/** Collect selected lines info and find anchor position */
	function collectSelectedLines(): {
		lines: CommentLine[];
		anchor: string;
	} | null {
		if (!file || selectedLines.size === 0) return null;

		const collected: CommentLine[] = [];
		let lastHi = 0;
		let lastLi = 0;

		for (const hunk of file.hunks) {
			const hi = file.hunks.indexOf(hunk);
			for (let li = 0; li < hunk.lines.length; li++) {
				const line = hunk.lines[li];
				if (
					line.changeIndex !== undefined &&
					selectedLines.has(lineKey(hi, line.changeIndex))
				) {
					const lineNum = line.type === "del" ? line.oldLine : line.newLine;
					collected.push({
						line: lineNum ?? 0,
						type: line.type as "add" | "del" | "context",
						content: line.content,
					});
					lastHi = hi;
					lastLi = li;
				}
			}
		}

		if (collected.length === 0) return null;
		return { lines: collected, anchor: anchorKey(lastHi, lastLi) };
	}

	function handleCommentSelected() {
		const result = collectSelectedLines();
		if (!result) return;
		setCommentingAnchor(result.anchor);
		setCommentingLines(result.lines);
	}

	function handleStageSelected() {
		if (!file) return;
		const byHunk = groupSelectedByHunk(selectedLines);
		const promises: Promise<void>[] = [];
		for (const [hunkIdx, indices] of byHunk) {
			promises.push(gitStageLines(sessionName, file.path, hunkIdx, indices));
		}
		Promise.all(promises)
			.then(() => {
				setSelectedLines(new Set());
				onRefresh();
			})
			.catch((err) => toast.error(`Stage lines failed: ${err}`));
	}

	function handleUnstageSelected() {
		if (!file) return;
		const byHunk = groupSelectedByHunk(selectedLines);
		const promises: Promise<void>[] = [];
		for (const [hunkIdx, indices] of byHunk) {
			promises.push(gitUnstageLines(sessionName, file.path, hunkIdx, indices));
		}
		Promise.all(promises)
			.then(() => {
				setSelectedLines(new Set());
				onRefresh();
			})
			.catch((err) => toast.error(`Unstage lines failed: ${err}`));
	}

	function handleRequestDiscardSelected() {
		if (!file) return;
		const byHunk = groupSelectedByHunk(selectedLines);
		const totalCount = selectedLines.size;
		for (const [hunkIdx, indices] of byHunk) {
			onRequestDiscard(
				file.path,
				hunkIdx,
				indices,
				`${totalCount} line${totalCount !== 1 ? "s" : ""}`,
			);
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
								className="bg-blue-500/10 text-blue-400 px-4 py-1 border-y border-border/20 sticky top-0 z-10 cursor-context-menu"
								onContextMenu={(e) => handleHunkContextMenu(hi, e)}
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
								const isCommented =
									isChange &&
									line.changeIndex !== undefined &&
									commentedLineKeys.has(lineKey(hi, line.changeIndex));

								const bgClass = isSelected
									? "bg-blue-500/25"
									: isCommented
										? "bg-purple-500/15"
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

								const ak = anchorKey(hi, li);
								// Find existing comment anchored at this line
								const existingIdx = comments.findIndex(
									(c) => c.file === activeFile && c.anchorKey === ak,
								);

								return (
									<div key={`${hi}-${li}`}>
										{/* biome-ignore lint/a11y/noStaticElementInteractions: drag selection + context menu on diff line */}
										<div
											className={`group flex ${bgClass} ${isChange ? "cursor-pointer select-none" : ""} hover:brightness-125 transition-colors`}
											onMouseDown={
												isChange
													? (e) => handleLineMouseDown(hi, line.changeIndex!, e)
													: undefined
											}
											onMouseEnter={
												isChange
													? () => handleLineMouseEnter(hi, line.changeIndex!)
													: undefined
											}
											onContextMenu={
												isChange
													? (e) =>
															handleLineContextMenu(hi, line.changeIndex!, e)
													: undefined
											}
										>
											{/* Comment indicator */}
											<span className="w-5 shrink-0 flex items-center justify-center select-none">
												{existingIdx >= 0 && (
													<button
														type="button"
														className="text-[10px] text-purple-400 hover:text-purple-300"
														onClick={() => {
															setCommentingAnchor(
																commentingAnchor === ak ? null : ak,
															);
															if (commentingAnchor !== ak) {
																setCommentingLines(comments[existingIdx].lines);
															}
														}}
														title="Edit comment"
													>
														◆
													</button>
												)}
											</span>
											{/* Selection indicator */}
											<span className="w-4 shrink-0 flex items-center justify-center select-none text-[8px]">
												{isSelected ? (
													<span className="text-blue-400">●</span>
												) : isCommented ? (
													<span className="text-purple-400">◆</span>
												) : isChange ? (
													<span className="text-muted-foreground/20">○</span>
												) : null}
											</span>
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
										{existingIdx >= 0 && commentingAnchor !== ak && (
											<div className="flex border-l-2 border-purple-500/40 bg-purple-500/5 px-3 py-1.5">
												<div className="flex-1">
													{comments[existingIdx].lines.length > 1 && (
														<span className="text-[9px] text-purple-400/60 block mb-0.5">
															{comments[existingIdx].lines.length} lines
														</span>
													)}
													<span className="text-xs text-purple-200 whitespace-pre-wrap">
														{comments[existingIdx].text}
													</span>
												</div>
												<div className="flex items-start gap-1 ml-2 shrink-0">
													<button
														type="button"
														className="text-[10px] text-muted-foreground hover:text-purple-400 px-1"
														onClick={() => {
															setCommentingAnchor(ak);
															setCommentingLines(comments[existingIdx].lines);
														}}
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
										{commentingAnchor === ak && (
											<InlineCommentEditor
												initialText={
													existingIdx >= 0 ? comments[existingIdx].text : ""
												}
												lineCount={commentingLines.length}
												isEdit={existingIdx >= 0}
												onSubmit={(t) => {
													if (existingIdx >= 0) {
														onUpdateComment(existingIdx, t);
													} else {
														onAddComment({
															file: file.path,
															lines: commentingLines,
															text: t,
															anchorKey: ak,
														});
													}
													setCommentingAnchor(null);
													setCommentingLines([]);
													setSelectedLines(new Set());
												}}
												onCancel={() => {
													setCommentingAnchor(null);
													setCommentingLines([]);
												}}
												onDelete={
													existingIdx >= 0
														? () => {
																onDeleteComment(existingIdx);
																setCommentingAnchor(null);
																setCommentingLines([]);
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
					onStage={isSelectable ? handleStageSelected : undefined}
					onUnstage={isSelectable ? handleUnstageSelected : undefined}
					onDiscard={isSelectable ? handleRequestDiscardSelected : undefined}
					onComment={handleCommentSelected}
					onClose={() => setContextMenu(null)}
				/>
			)}
		</div>
	);
}
