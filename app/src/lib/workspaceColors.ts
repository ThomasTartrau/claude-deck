export const WORKSPACE_COLORS: Record<
	string,
	{ bg: string; text: string; border: string }
> = {
	blue: {
		bg: "bg-blue-500/15",
		text: "text-blue-400",
		border: "border-blue-500/30",
	},
	green: {
		bg: "bg-green-500/15",
		text: "text-green-400",
		border: "border-green-500/30",
	},
	purple: {
		bg: "bg-purple-500/15",
		text: "text-purple-400",
		border: "border-purple-500/30",
	},
	orange: {
		bg: "bg-orange-500/15",
		text: "text-orange-400",
		border: "border-orange-500/30",
	},
	pink: {
		bg: "bg-pink-500/15",
		text: "text-pink-400",
		border: "border-pink-500/30",
	},
	teal: {
		bg: "bg-teal-500/15",
		text: "text-teal-400",
		border: "border-teal-500/30",
	},
	red: {
		bg: "bg-red-500/15",
		text: "text-red-400",
		border: "border-red-500/30",
	},
	yellow: {
		bg: "bg-yellow-500/15",
		text: "text-yellow-400",
		border: "border-yellow-500/30",
	},
};

export function getWorkspaceColorStyles(color: string | null) {
	if (!color || !WORKSPACE_COLORS[color]) {
		return {
			bg: "bg-muted/50",
			text: "text-foreground",
			border: "border-border",
		};
	}
	return WORKSPACE_COLORS[color];
}
