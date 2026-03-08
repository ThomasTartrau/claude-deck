export interface AnsiSegment {
	text: string;
	className: string;
}

const fgColorMap: Record<number, string> = {
	30: "text-black",
	31: "text-red-500",
	32: "text-green-500",
	33: "text-yellow-500",
	34: "text-blue-500",
	35: "text-magenta-500",
	36: "text-cyan-500",
	37: "text-white",
	90: "text-gray-500",
	91: "text-red-400",
	92: "text-green-400",
	93: "text-yellow-400",
	94: "text-blue-400",
	95: "text-magenta-400",
	96: "text-cyan-400",
	97: "text-gray-200",
};

const bgColorMap: Record<number, string> = {
	40: "bg-black",
	41: "bg-red-500",
	42: "bg-green-500",
	43: "bg-yellow-500",
	44: "bg-blue-500",
	45: "bg-magenta-500",
	46: "bg-cyan-500",
	47: "bg-white",
	100: "bg-gray-500",
	101: "bg-red-400",
	102: "bg-green-400",
	103: "bg-yellow-400",
	104: "bg-blue-400",
	105: "bg-magenta-400",
	106: "bg-cyan-400",
	107: "bg-gray-200",
};

interface AnsiState {
	bold: boolean;
	dim: boolean;
	underline: boolean;
	fgColor: string;
	bgColor: string;
}

function stateToClassName(state: AnsiState): string {
	const classes: string[] = [];
	if (state.bold) classes.push("font-bold");
	if (state.dim) classes.push("opacity-50");
	if (state.underline) classes.push("underline");
	if (state.fgColor) classes.push(state.fgColor);
	if (state.bgColor) classes.push(state.bgColor);
	return classes.join(" ");
}

function resetState(): AnsiState {
	return {
		bold: false,
		dim: false,
		underline: false,
		fgColor: "",
		bgColor: "",
	};
}

function applyCode(state: AnsiState, code: number): AnsiState {
	const next = { ...state };
	if (code === 0) return resetState();
	if (code === 1) next.bold = true;
	else if (code === 2) next.dim = true;
	else if (code === 4) next.underline = true;
	else if (code === 22) {
		next.bold = false;
		next.dim = false;
	} else if (code === 24) next.underline = false;
	else if (code === 39) next.fgColor = "";
	else if (code === 49) next.bgColor = "";
	else if (fgColorMap[code]) next.fgColor = fgColorMap[code];
	else if (bgColorMap[code]) next.bgColor = bgColorMap[code];
	return next;
}

// Regex matching ANSI CSI SGR sequences: ESC[ ... m
const ANSI_RE = /\x1b\[([0-9;]*)m/g;

export function parseAnsi(line: string): AnsiSegment[] {
	const segments: AnsiSegment[] = [];
	let state = resetState();
	let lastIndex = 0;

	ANSI_RE.lastIndex = 0;
	let match = ANSI_RE.exec(line);

	while (match !== null) {
		// Text before this escape sequence
		if (match.index > lastIndex) {
			const text = line.slice(lastIndex, match.index);
			if (text.length > 0) {
				segments.push({ text, className: stateToClassName(state) });
			}
		}

		// Apply all codes in this sequence
		const rawCodes = match[1];
		const codes = rawCodes === "" ? [0] : rawCodes.split(";").map(Number);
		for (const code of codes) {
			state = applyCode(state, code);
		}

		lastIndex = match.index + match[0].length;
		match = ANSI_RE.exec(line);
	}

	// Remaining text after last escape
	if (lastIndex < line.length) {
		segments.push({
			text: line.slice(lastIndex),
			className: stateToClassName(state),
		});
	}

	// If the line was empty or only had escape codes, return at least an empty segment
	if (segments.length === 0) {
		segments.push({ text: "", className: "" });
	}

	return segments;
}

// Strip all ANSI escape sequences from a string
export function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}
