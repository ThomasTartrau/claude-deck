import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface FilterBarProps {
	searchText: string;
	onSearchChange: (text: string) => void;
	activeTagFilters: string[];
	onTagFilterChange: (tags: string[]) => void;
	onClearFilters: () => void;
}

export function FilterBar({
	searchText,
	onSearchChange,
	activeTagFilters,
	onTagFilterChange,
	onClearFilters,
}: FilterBarProps) {
	const hasFilters = searchText.length > 0 || activeTagFilters.length > 0;

	function handleRemoveTag(tag: string) {
		onTagFilterChange(activeTagFilters.filter((t) => t !== tag));
	}

	return (
		<div className="flex items-center gap-3 border-b border-border px-4 py-1.5">
			<div className="relative max-w-xs">
				<Input
					placeholder="Filter sessions..."
					value={searchText}
					onChange={(e) => onSearchChange(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							onClearFilters();
						}
					}}
					className="h-7 text-xs pl-2 w-48"
					autoFocus
				/>
			</div>

			<div className="flex flex-1 items-center gap-1.5 overflow-x-auto">
				{activeTagFilters.map((tag) => (
					<Badge
						key={tag}
						variant="secondary"
						className="shrink-0 gap-1 text-[10px]"
					>
						{tag}
						<button
							onClick={() => handleRemoveTag(tag)}
							className="ml-0.5 rounded-full hover:bg-foreground/10"
						>
							x
						</button>
					</Badge>
				))}
			</div>

			{hasFilters && (
				<Button
					variant="ghost"
					size="sm"
					onClick={onClearFilters}
					className="shrink-0 text-xs text-muted-foreground h-7"
				>
					Clear all
				</Button>
			)}
		</div>
	);
}
