import type { ParsedFile, ParsedHunk, ReviewComment } from "./types";

export function parseUnifiedDiff(raw: string): ParsedFile[] {
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

export function formatReviewPrompt(comments: ReviewComment[]): string {
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
		const sorted = [...fileComments].sort(
			(a, b) => a.lines[0].line - b.lines[0].line,
		);
		for (const c of sorted) {
			if (c.lines.length === 1) {
				const l = c.lines[0];
				const prefix = l.type === "add" ? "+" : l.type === "del" ? "-" : " ";
				parts.push(
					`Line ${l.line} (${prefix}): \`${l.content.trim()}\`\n> ${c.text}\n`,
				);
			} else {
				const first = c.lines[0].line;
				const last = c.lines[c.lines.length - 1].line;
				parts.push(`Lines ${first}-${last}:\n\`\`\``);
				for (const l of c.lines) {
					const prefix = l.type === "add" ? "+" : l.type === "del" ? "-" : " ";
					parts.push(`${prefix} ${l.content}`);
				}
				parts.push(`\`\`\`\n> ${c.text}\n`);
			}
		}
	}

	parts.push(
		"\nPlease address each comment above. Fix the issues mentioned, explain your reasoning where needed, and make the necessary changes.",
	);

	return parts.join("\n");
}

export function lineKey(hunkIndex: number, changeIndex: number): string {
	return `${hunkIndex}:${changeIndex}`;
}

export function anchorKey(hunkIndex: number, lineIndex: number): string {
	return `${hunkIndex}:${lineIndex}`;
}

export function groupSelectedByHunk(
	selectedLines: Set<string>,
): Map<number, number[]> {
	const map = new Map<number, number[]>();
	for (const key of selectedLines) {
		const [h, c] = key.split(":").map(Number);
		if (!map.has(h)) map.set(h, []);
		map.get(h)!.push(c);
	}
	return map;
}
