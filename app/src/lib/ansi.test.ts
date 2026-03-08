import { describe, test, expect } from "vitest";
import { parseAnsi, stripAnsi } from "./ansi";

describe("parseAnsi", () => {
	test("plain text without ANSI codes", () => {
		const result = parseAnsi("hello world");
		expect(result).toEqual([{ text: "hello world", className: "" }]);
	});

	test("empty string returns empty segment", () => {
		const result = parseAnsi("");
		expect(result).toEqual([{ text: "", className: "" }]);
	});

	test("only escape codes returns empty segment", () => {
		const result = parseAnsi("\x1b[31m\x1b[0m");
		expect(result).toEqual([{ text: "", className: "" }]);
	});

	test("foreground color red", () => {
		const result = parseAnsi("\x1b[31mhello\x1b[0m");
		expect(result).toEqual([{ text: "hello", className: "text-red-500" }]);
	});

	test("foreground color green", () => {
		const result = parseAnsi("\x1b[32mok\x1b[0m");
		expect(result).toEqual([{ text: "ok", className: "text-green-500" }]);
	});

	test("bright foreground color", () => {
		const result = parseAnsi("\x1b[91mwarn\x1b[0m");
		expect(result).toEqual([{ text: "warn", className: "text-red-400" }]);
	});

	test("background color", () => {
		const result = parseAnsi("\x1b[44mhighlight\x1b[0m");
		expect(result).toEqual([{ text: "highlight", className: "bg-blue-500" }]);
	});

	test("bold text", () => {
		const result = parseAnsi("\x1b[1mtitle\x1b[0m");
		expect(result).toEqual([{ text: "title", className: "font-bold" }]);
	});

	test("dim text", () => {
		const result = parseAnsi("\x1b[2mfaded\x1b[0m");
		expect(result).toEqual([{ text: "faded", className: "opacity-50" }]);
	});

	test("underline text", () => {
		const result = parseAnsi("\x1b[4mlink\x1b[0m");
		expect(result).toEqual([{ text: "link", className: "underline" }]);
	});

	test("combined bold + red", () => {
		const result = parseAnsi("\x1b[1;31merror\x1b[0m");
		expect(result).toEqual([
			{ text: "error", className: "font-bold text-red-500" },
		]);
	});

	test("mixed plain and colored text", () => {
		const result = parseAnsi("hello \x1b[32mworld\x1b[0m!");
		expect(result).toEqual([
			{ text: "hello ", className: "" },
			{ text: "world", className: "text-green-500" },
			{ text: "!", className: "" },
		]);
	});

	test("multiple color switches", () => {
		const result = parseAnsi("\x1b[31mred\x1b[32mgreen\x1b[0m");
		expect(result).toEqual([
			{ text: "red", className: "text-red-500" },
			{ text: "green", className: "text-green-500" },
		]);
	});

	test("reset mid-line", () => {
		const result = parseAnsi("\x1b[1;31mbold red\x1b[0m plain");
		expect(result).toEqual([
			{ text: "bold red", className: "font-bold text-red-500" },
			{ text: " plain", className: "" },
		]);
	});

	test("fg + bg combined", () => {
		const result = parseAnsi("\x1b[31;44mred on blue\x1b[0m");
		expect(result).toEqual([
			{ text: "red on blue", className: "text-red-500 bg-blue-500" },
		]);
	});

	test("reset bold with code 22", () => {
		const result = parseAnsi("\x1b[1mbold\x1b[22mnormal\x1b[0m");
		expect(result).toEqual([
			{ text: "bold", className: "font-bold" },
			{ text: "normal", className: "" },
		]);
	});

	test("reset underline with code 24", () => {
		const result = parseAnsi("\x1b[4munder\x1b[24mplain\x1b[0m");
		expect(result).toEqual([
			{ text: "under", className: "underline" },
			{ text: "plain", className: "" },
		]);
	});

	test("reset fg with code 39", () => {
		const result = parseAnsi("\x1b[31mred\x1b[39mdefault\x1b[0m");
		expect(result).toEqual([
			{ text: "red", className: "text-red-500" },
			{ text: "default", className: "" },
		]);
	});

	test("empty escape sequence treated as reset", () => {
		const result = parseAnsi("\x1b[31mred\x1b[mplain");
		expect(result).toEqual([
			{ text: "red", className: "text-red-500" },
			{ text: "plain", className: "" },
		]);
	});
});

describe("stripAnsi", () => {
	test("strips color codes", () => {
		expect(stripAnsi("\x1b[31mhello\x1b[0m")).toBe("hello");
	});

	test("strips multiple codes", () => {
		expect(
			stripAnsi("\x1b[1;31mbold red\x1b[0m normal \x1b[32mgreen\x1b[0m"),
		).toBe("bold red normal green");
	});

	test("returns plain text unchanged", () => {
		expect(stripAnsi("no codes here")).toBe("no codes here");
	});

	test("empty string", () => {
		expect(stripAnsi("")).toBe("");
	});

	test("only codes", () => {
		expect(stripAnsi("\x1b[31m\x1b[0m")).toBe("");
	});
});
