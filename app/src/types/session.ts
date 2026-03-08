export interface Session {
	name: string;
	branch: string;
	status: "Running" | "Waiting" | "Idle" | "Dead";
	created_at: string;
	pane_path: string | null;
	git_dirty_count: number;
	git_insertions: number;
	git_deletions: number;
	git_ahead: number;
	git_behind: number;
	git_status: string;
	tags: string[];
	cost: string;
	tokens: string;
	age: string;
}
