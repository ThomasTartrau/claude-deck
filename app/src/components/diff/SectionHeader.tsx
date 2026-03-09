export function SectionHeader({
	label,
	count,
	color,
	onStageAll,
	onUnstageAll,
}: {
	label: string;
	count: number;
	color: string;
	onStageAll?: () => void;
	onUnstageAll?: () => void;
}) {
	if (count === 0) return null;
	return (
		<div className="flex items-center justify-between px-3 py-1 border-b border-border/10">
			<span
				className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}
			>
				{label}
				<span className="ml-1 text-muted-foreground font-normal">
					({count})
				</span>
			</span>
			<span className="flex gap-1">
				{onStageAll && (
					<button
						onClick={onStageAll}
						className="text-[9px] px-1.5 py-0.5 rounded hover:bg-green-500/20 text-green-400 font-medium"
					>
						Stage all
					</button>
				)}
				{onUnstageAll && (
					<button
						onClick={onUnstageAll}
						className="text-[9px] px-1.5 py-0.5 rounded hover:bg-yellow-500/20 text-yellow-400 font-medium"
					>
						Unstage all
					</button>
				)}
			</span>
		</div>
	);
}
