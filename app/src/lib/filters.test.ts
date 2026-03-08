import { describe, test, expect } from "vitest";
import { filterSessions } from "./filters";
import type { Session } from "@/types/session";

function makeSession(overrides: Partial<Session> = {}): Session {
	return {
		name: "cc-test",
		branch: "main",
		status: "Running",
		created_at: "2025-01-01T00:00:00Z",
		pane_path: "/home/user/project",
		git_dirty_count: 0,
		git_insertions: 0,
		git_deletions: 0,
		git_ahead: 0,
		git_behind: 0,
		git_status: "clean",
		tags: [],
		cost: "$0.00",
		tokens: "0",
		age: "1m",
		...overrides,
	};
}

const sessions: Session[] = [
	makeSession({
		name: "cc-api",
		branch: "feat/auth",
		tags: ["backend", "urgent"],
		pane_path: "/home/user/api",
	}),
	makeSession({
		name: "cc-web",
		branch: "main",
		tags: ["frontend"],
		pane_path: "/home/user/web",
	}),
	makeSession({
		name: "cc-docs",
		branch: "fix/typo",
		tags: ["docs", "urgent"],
		pane_path: "/home/user/docs",
	}),
	makeSession({
		name: "cc-mobile",
		branch: "feat/auth-mobile",
		tags: ["frontend", "mobile"],
		pane_path: null,
	}),
];

describe("filterSessions", () => {
	test("no filters returns all sessions", () => {
		const result = filterSessions(sessions, "", [], null);
		expect(result).toHaveLength(4);
	});

	test("search by name", () => {
		const result = filterSessions(sessions, "api", [], null);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("cc-api");
	});

	test("search by branch", () => {
		const result = filterSessions(sessions, "auth", [], null);
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.name)).toEqual(["cc-api", "cc-mobile"]);
	});

	test("search is case insensitive", () => {
		const result = filterSessions(sessions, "API", [], null);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("cc-api");
	});

	test("search with no match returns empty", () => {
		const result = filterSessions(sessions, "nonexistent", [], null);
		expect(result).toHaveLength(0);
	});

	test("filter by single tag", () => {
		const result = filterSessions(sessions, "", ["frontend"], null);
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.name)).toEqual(["cc-web", "cc-mobile"]);
	});

	test("filter by multiple tags (AND logic)", () => {
		const result = filterSessions(sessions, "", ["frontend", "mobile"], null);
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("cc-mobile");
	});

	test("filter by tag with no match", () => {
		const result = filterSessions(sessions, "", ["nonexistent"], null);
		expect(result).toHaveLength(0);
	});

	test("filter by workspace", () => {
		const result = filterSessions(sessions, "", [], "/home/user/api");
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("cc-api");
	});

	test("workspace filters out sessions with null pane_path", () => {
		const result = filterSessions(sessions, "", [], "/home/user");
		expect(result).toHaveLength(3);
		expect(result.map((s) => s.name)).toEqual(["cc-api", "cc-web", "cc-docs"]);
	});

	test("combined search + tag filter", () => {
		const result = filterSessions(sessions, "cc", ["urgent"], null);
		expect(result).toHaveLength(2);
		expect(result.map((s) => s.name)).toEqual(["cc-api", "cc-docs"]);
	});

	test("combined search + tag + workspace", () => {
		const result = filterSessions(sessions, "cc", ["urgent"], "/home/user/api");
		expect(result).toHaveLength(1);
		expect(result[0].name).toBe("cc-api");
	});

	test("empty sessions list", () => {
		const result = filterSessions([], "test", ["tag"], "/path");
		expect(result).toHaveLength(0);
	});
});
