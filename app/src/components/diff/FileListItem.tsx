import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { DiffFile } from "@/lib/api";
import type { FileSection } from "./types";
import { statusColors } from "./types";

export function FileListItem({
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

	return (
		<ContextMenu>
			<ContextMenuTrigger
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
			</ContextMenuTrigger>
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
