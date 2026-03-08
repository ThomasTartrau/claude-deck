import type { Session } from "@/types/session";

export function filterSessions(
	sessions: Session[],
	searchText: string,
	activeTagFilters: string[],
	activeWorkspace: string | null,
): Session[] {
	let result = sessions;

	if (searchText) {
		const lower = searchText.toLowerCase();
		result = result.filter(
			(s) =>
				s.name.toLowerCase().includes(lower) ||
				s.branch.toLowerCase().includes(lower),
		);
	}

	if (activeTagFilters.length > 0) {
		result = result.filter((s) =>
			activeTagFilters.every((tag) => s.tags.includes(tag)),
		);
	}

	if (activeWorkspace) {
		result = result.filter((s) => s.pane_path?.startsWith(activeWorkspace));
	}

	return result;
}
