import { describe, test, expect } from "vitest";
import {
	parseUnifiedDiff,
	formatReviewPrompt,
	lineKey,
	anchorKey,
	groupSelectedByHunk,
} from "./utils";
import type { ReviewComment } from "./types";

describe("parseUnifiedDiff", () => {
	test("empty string returns empty array", () => {
		expect(parseUnifiedDiff("")).toEqual([]);
	});

	test("single file with one hunk, additions only", () => {
		const raw = [
			"diff --git a/foo.ts b/foo.ts",
			"index 1234567..abcdefg 100644",
			"--- a/foo.ts",
			"+++ b/foo.ts",
			"@@ -1,3 +1,5 @@",
			" line1",
			"+added1",
			"+added2",
			" line2",
			" line3",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		expect(result[0].path).toBe("foo.ts");
		expect(result[0].hunks).toHaveLength(1);

		const lines = result[0].hunks[0].lines;
		expect(lines.filter((l) => l.type === "add")).toHaveLength(2);
		expect(lines.filter((l) => l.type === "del")).toHaveLength(0);
		expect(lines.filter((l) => l.type === "context")).toHaveLength(3);
	});

	test("single file with deletions only", () => {
		const raw = [
			"diff --git a/bar.ts b/bar.ts",
			"index 1234567..abcdefg 100644",
			"--- a/bar.ts",
			"+++ b/bar.ts",
			"@@ -1,4 +1,2 @@",
			" keep",
			"-removed1",
			"-removed2",
			" keep2",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		const lines = result[0].hunks[0].lines;
		expect(lines.filter((l) => l.type === "del")).toHaveLength(2);
		expect(lines.filter((l) => l.type === "add")).toHaveLength(0);
	});

	test("mixed additions and deletions", () => {
		const raw = [
			"diff --git a/mix.ts b/mix.ts",
			"index 1234567..abcdefg 100644",
			"--- a/mix.ts",
			"+++ b/mix.ts",
			"@@ -1,3 +1,3 @@",
			" context",
			"-old line",
			"+new line",
			" context2",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		const lines = result[0].hunks[0].lines;
		expect(lines.filter((l) => l.type === "del")).toHaveLength(1);
		expect(lines.filter((l) => l.type === "add")).toHaveLength(1);
		expect(lines.find((l) => l.type === "del")?.content).toBe("old line");
		expect(lines.find((l) => l.type === "add")?.content).toBe("new line");
	});

	test("multiple hunks in one file", () => {
		const raw = [
			"diff --git a/multi.ts b/multi.ts",
			"index 1234567..abcdefg 100644",
			"--- a/multi.ts",
			"+++ b/multi.ts",
			"@@ -1,3 +1,4 @@",
			" line1",
			"+added",
			" line2",
			" line3",
			"@@ -10,3 +11,4 @@",
			" line10",
			"+added2",
			" line11",
			" line12",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		expect(result[0].hunks).toHaveLength(2);
		expect(result[0].hunks[0].oldStart).toBe(1);
		expect(result[0].hunks[1].oldStart).toBe(10);
	});

	test("multiple files", () => {
		const raw = [
			"diff --git a/file1.ts b/file1.ts",
			"index 1234567..abcdefg 100644",
			"--- a/file1.ts",
			"+++ b/file1.ts",
			"@@ -1,2 +1,3 @@",
			" line1",
			"+added",
			" line2",
			"diff --git a/file2.ts b/file2.ts",
			"index 1234567..abcdefg 100644",
			"--- a/file2.ts",
			"+++ b/file2.ts",
			"@@ -1,2 +1,3 @@",
			" a",
			"+b",
			" c",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(2);
		expect(result[0].path).toBe("file1.ts");
		expect(result[1].path).toBe("file2.ts");
	});

	test("hunk with function context (text after @@)", () => {
		const raw = [
			"diff --git a/ctx.ts b/ctx.ts",
			"index 1234567..abcdefg 100644",
			"--- a/ctx.ts",
			"+++ b/ctx.ts",
			"@@ -10,3 +10,4 @@ function myFunc() {",
			" existing",
			"+new line",
			" existing2",
			" existing3",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		const hunk = result[0].hunks[0];
		expect(hunk.header).toBe("@@ -10,3 +10,4 @@ function myFunc() {");
		// Function context should be added as a header line
		const headerLines = hunk.lines.filter((l) => l.type === "header");
		expect(headerLines).toHaveLength(1);
		expect(headerLines[0].content).toBe("function myFunc() {");
	});

	test("context lines with correct line numbering", () => {
		const raw = [
			"diff --git a/nums.ts b/nums.ts",
			"index 1234567..abcdefg 100644",
			"--- a/nums.ts",
			"+++ b/nums.ts",
			"@@ -5,4 +5,5 @@",
			" line5",
			" line6",
			"+inserted",
			" line7",
			" line8",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		const lines = result[0].hunks[0].lines;

		// First context line: old=5, new=5
		const ctx1 = lines.find((l) => l.content === "line5");
		expect(ctx1?.oldLine).toBe(5);
		expect(ctx1?.newLine).toBe(5);

		// Second context line: old=6, new=6
		const ctx2 = lines.find((l) => l.content === "line6");
		expect(ctx2?.oldLine).toBe(6);
		expect(ctx2?.newLine).toBe(6);

		// Added line: newLine=7
		const added = lines.find((l) => l.type === "add");
		expect(added?.newLine).toBe(7);
		expect(added?.oldLine).toBeUndefined();

		// Context after insertion: old=7, new=8
		const ctx3 = lines.find((l) => l.content === "line7");
		expect(ctx3?.oldLine).toBe(7);
		expect(ctx3?.newLine).toBe(8);
	});

	test("handles \\ No newline at end of file", () => {
		const raw = [
			"diff --git a/noeof.ts b/noeof.ts",
			"index 1234567..abcdefg 100644",
			"--- a/noeof.ts",
			"+++ b/noeof.ts",
			"@@ -1,2 +1,2 @@",
			"-old",
			"+new",
			"\\ No newline at end of file",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		const lines = result[0].hunks[0].lines;
		// The backslash line should be ignored (not context, not add, not del)
		expect(lines).toHaveLength(2);
		expect(lines[0].type).toBe("del");
		expect(lines[1].type).toBe("add");
	});

	test("file with rename (a/old.ts b/new.ts)", () => {
		const raw = [
			"diff --git a/old-name.ts b/new-name.ts",
			"similarity index 90%",
			"rename from old-name.ts",
			"rename to new-name.ts",
			"index 1234567..abcdefg 100644",
			"--- a/old-name.ts",
			"+++ b/new-name.ts",
			"@@ -1,2 +1,3 @@",
			" kept",
			"+added",
			" also-kept",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		expect(result).toHaveLength(1);
		// Should use the "b/" path (new name)
		expect(result[0].path).toBe("new-name.ts");
	});

	test("changeIndex increments for add and del lines only", () => {
		const raw = [
			"diff --git a/idx.ts b/idx.ts",
			"index 1234567..abcdefg 100644",
			"--- a/idx.ts",
			"+++ b/idx.ts",
			"@@ -1,5 +1,5 @@",
			" ctx1",
			"-del1",
			"-del2",
			"+add1",
			"+add2",
			" ctx2",
		].join("\n");

		const result = parseUnifiedDiff(raw);
		const lines = result[0].hunks[0].lines;

		// Context lines should not have changeIndex
		expect(
			lines.find((l) => l.content === "ctx1")?.changeIndex,
		).toBeUndefined();
		expect(
			lines.find((l) => l.content === "ctx2")?.changeIndex,
		).toBeUndefined();

		// Change lines should have sequential changeIndex
		const changes = lines.filter((l) => l.changeIndex !== undefined);
		expect(changes.map((c) => c.changeIndex)).toEqual([0, 1, 2, 3]);
	});
});

describe("formatReviewPrompt", () => {
	test("single comment on single line", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/app.ts",
				lines: [{ line: 10, type: "add", content: "console.log('debug')" }],
				text: "Remove debug log",
				anchorKey: "0:1",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain("## src/app.ts");
		expect(result).toContain("Line 10 (+): `console.log('debug')`");
		expect(result).toContain("> Remove debug log");
	});

	test("single comment on multiple lines", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/app.ts",
				lines: [
					{ line: 5, type: "del", content: "old code" },
					{ line: 6, type: "del", content: "more old" },
					{ line: 5, type: "add", content: "new code" },
				],
				text: "This refactor looks wrong",
				anchorKey: "0:3",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain("Lines 5-5:");
		expect(result).toContain("```");
		expect(result).toContain("- old code");
		expect(result).toContain("- more old");
		expect(result).toContain("+ new code");
		expect(result).toContain("> This refactor looks wrong");
	});

	test("multiple comments on same file (sorted by line number)", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/utils.ts",
				lines: [{ line: 20, type: "add", content: "late line" }],
				text: "Second comment",
				anchorKey: "0:5",
			},
			{
				file: "src/utils.ts",
				lines: [{ line: 5, type: "add", content: "early line" }],
				text: "First comment",
				anchorKey: "0:1",
			},
		];

		const result = formatReviewPrompt(comments);
		const lines = result.split("\n");
		const firstIdx = lines.findIndex((l) => l.includes("First comment"));
		const secondIdx = lines.findIndex((l) => l.includes("Second comment"));
		expect(firstIdx).toBeLessThan(secondIdx);
	});

	test("comments across multiple files", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/a.ts",
				lines: [{ line: 1, type: "add", content: "a" }],
				text: "Comment A",
				anchorKey: "0:0",
			},
			{
				file: "src/b.ts",
				lines: [{ line: 1, type: "add", content: "b" }],
				text: "Comment B",
				anchorKey: "0:0",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain("## src/a.ts");
		expect(result).toContain("## src/b.ts");
		expect(result).toContain("> Comment A");
		expect(result).toContain("> Comment B");
	});

	test("comment with special characters in text", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/app.ts",
				lines: [{ line: 1, type: "add", content: "x = a && b || c" }],
				text: 'Use `a ?? b` instead of `a || b` for "nullish" coalescing',
				anchorKey: "0:0",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain(
			'> Use `a ?? b` instead of `a || b` for "nullish" coalescing',
		);
	});

	test("context line uses space prefix", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/app.ts",
				lines: [{ line: 7, type: "context", content: "unchanged" }],
				text: "Check this",
				anchorKey: "0:0",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain("Line 7 ( ): `unchanged`");
	});

	test("del line uses minus prefix", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/app.ts",
				lines: [{ line: 3, type: "del", content: "removed" }],
				text: "Why remove this?",
				anchorKey: "0:0",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain("Line 3 (-): `removed`");
	});

	test("includes header and footer text", () => {
		const comments: ReviewComment[] = [
			{
				file: "src/x.ts",
				lines: [{ line: 1, type: "add", content: "x" }],
				text: "Fix",
				anchorKey: "0:0",
			},
		];

		const result = formatReviewPrompt(comments);
		expect(result).toContain(
			"Code review with inline comments on the current diff:",
		);
		expect(result).toContain("Please address each comment above.");
	});
});

describe("lineKey", () => {
	test("basic key generation", () => {
		expect(lineKey(2, 5)).toBe("2:5");
	});

	test("zero values", () => {
		expect(lineKey(0, 0)).toBe("0:0");
	});
});

describe("anchorKey", () => {
	test("basic key generation", () => {
		expect(anchorKey(1, 3)).toBe("1:3");
	});

	test("zero values", () => {
		expect(anchorKey(0, 0)).toBe("0:0");
	});
});

describe("groupSelectedByHunk", () => {
	test("empty set returns empty map", () => {
		const result = groupSelectedByHunk(new Set());
		expect(result.size).toBe(0);
	});

	test("single selection", () => {
		const result = groupSelectedByHunk(new Set(["1:3"]));
		expect(result.size).toBe(1);
		expect(result.get(1)).toEqual([3]);
	});

	test("multiple selections in same hunk", () => {
		const result = groupSelectedByHunk(new Set(["2:0", "2:1", "2:3"]));
		expect(result.size).toBe(1);
		expect(result.get(2)).toEqual([0, 1, 3]);
	});

	test("selections across multiple hunks", () => {
		const result = groupSelectedByHunk(new Set(["0:1", "0:2", "3:5", "3:6"]));
		expect(result.size).toBe(2);
		expect(result.get(0)).toEqual([1, 2]);
		expect(result.get(3)).toEqual([5, 6]);
	});
});
