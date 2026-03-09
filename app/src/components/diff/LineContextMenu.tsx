import { useEffect, useRef } from "react";
import type { FileSection } from "./types";

export function LineContextMenu({
	x,
	y,
	count,
	section,
	onStage,
	onUnstage,
	onDiscard,
	onComment,
	onClose,
}: {
	x: number;
	y: number;
	count: number;
	section: FileSection;
	onStage?: () => void;
	onUnstage?: () => void;
	onDiscard?: () => void;
	onComment: () => void;
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
			{/* Comment -- always available */}
			<button
				onClick={() => {
					onComment();
					onClose();
				}}
				className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground cursor-pointer"
			>
				<span className="text-purple-400 mr-2">◆</span>
				Comment {label}
			</button>

			{section === "unstaged" && onStage && (
				<>
					<div className="my-1 h-px bg-border" />
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
				</>
			)}
			{section === "staged" && onUnstage && (
				<>
					<div className="my-1 h-px bg-border" />
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
				</>
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
