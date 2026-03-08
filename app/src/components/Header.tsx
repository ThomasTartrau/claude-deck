import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Session } from "@/types/session";

interface HeaderProps {
	sessions: Session[];
	onNewSession: () => void;
	onOpenWorkspaces?: () => void;
}

function StatusCount({
	count,
	label,
	className,
}: {
	count: number;
	label: string;
	className: string;
}) {
	if (count === 0) return null;
	return (
		<Badge variant="outline" className={className}>
			{count} {label}
		</Badge>
	);
}

export function Header({
	sessions,
	onNewSession,
	onOpenWorkspaces,
}: HeaderProps) {
	const running = sessions.filter((s) => s.status === "Running").length;
	const waiting = sessions.filter((s) => s.status === "Waiting").length;
	const idle = sessions.filter((s) => s.status === "Idle").length;
	const dead = sessions.filter((s) => s.status === "Dead").length;

	return (
		<header className="flex h-12 items-center justify-between border-b border-border px-4">
			<div className="flex items-center gap-3">
				<h1 className="text-sm font-semibold tracking-tight text-foreground">
					Claude Deck
				</h1>
				<div className="flex items-center gap-1.5">
					<StatusCount
						count={running}
						label="Running"
						className="border-green-500/30 text-green-400 text-[10px] py-0"
					/>
					<StatusCount
						count={waiting}
						label="Waiting"
						className="border-yellow-500/30 text-yellow-400 text-[10px] py-0"
					/>
					<StatusCount
						count={idle}
						label="Idle"
						className="border-gray-500/30 text-gray-400 text-[10px] py-0"
					/>
					<StatusCount
						count={dead}
						label="Dead"
						className="border-red-500/30 text-red-400 text-[10px] py-0"
					/>
				</div>
			</div>
			<div className="flex items-center gap-2">
				{onOpenWorkspaces && (
					<Button
						variant="ghost"
						size="sm"
						className="h-7 text-xs"
						onClick={onOpenWorkspaces}
					>
						Workspaces
					</Button>
				)}
				<Button
					variant="default"
					size="sm"
					className="h-7 text-xs"
					onClick={onNewSession}
				>
					+ New
				</Button>
			</div>
		</header>
	);
}
