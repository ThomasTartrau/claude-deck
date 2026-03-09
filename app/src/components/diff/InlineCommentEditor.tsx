import { useState, useEffect, useRef } from "react";
import { modKey } from "@/lib/utils";

export function InlineCommentEditor({
	initialText,
	lineCount,
	isEdit,
	onSubmit,
	onCancel,
	onDelete,
}: {
	initialText: string;
	lineCount: number;
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

	const lineLabel = `${lineCount} line${lineCount !== 1 ? "s" : ""}`;

	return (
		<div className="flex flex-col border-l-2 border-purple-500/60 bg-purple-500/10 px-3 py-2 gap-1.5">
			<span className="text-[9px] text-purple-400/70 font-medium">
				{isEdit ? "Edit comment" : `Comment on ${lineLabel}`}
			</span>
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
