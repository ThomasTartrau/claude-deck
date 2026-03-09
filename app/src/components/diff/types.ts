import type { DiffFile } from "@/lib/api";

/** A single line referenced by a review comment */
export interface CommentLine {
	line: number;
	type: "add" | "del" | "context";
	content: string;
}

/** A review comment attached to one or more diff lines */
export interface ReviewComment {
	file: string;
	lines: CommentLine[];
	text: string;
	/** Key identifying where to render the comment (hunkIndex:lastLineIndex) */
	anchorKey: string;
}

export interface DiffViewProps {
	sessionName: string | null;
	visible?: boolean;
	fullscreen?: boolean;
	onToggleFullscreen?: () => void;
	onToggleDiff?: () => void;
}

export interface ParsedHunk {
	header: string;
	oldStart: number;
	newStart: number;
	lines: DiffLine[];
}

export interface DiffLine {
	type: "add" | "del" | "context" | "header";
	content: string;
	oldLine?: number;
	newLine?: number;
	/** 0-based index counting only +/- lines within the hunk (for git patch) */
	changeIndex?: number;
}

export interface ParsedFile {
	path: string;
	hunks: ParsedHunk[];
}

export type FileSection = "staged" | "unstaged" | "untracked";

export interface SidebarFile {
	file: DiffFile;
	section: FileSection;
}

export const statusColors: Record<string, string> = {
	M: "text-yellow-400",
	A: "text-green-400",
	D: "text-red-400",
	R: "text-blue-400",
	"?": "text-gray-400",
};
