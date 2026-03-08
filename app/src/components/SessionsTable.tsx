import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Session } from "@/types/session";

interface SessionsTableProps {
	sessions: Session[];
	selectedSession: Session | null;
	onSelectSession: (session: Session) => void;
	onDoubleClickSession?: (session: Session) => void;
	loading: boolean;
}

const statusColors: Record<Session["status"], string> = {
	Running: "bg-green-500",
	Waiting: "bg-yellow-500",
	Idle: "bg-gray-500",
	Dead: "bg-red-500",
};

function StatusDot({ status }: { status: Session["status"] }) {
	return (
		<span className="relative flex h-3 w-3">
			{status === "Running" && (
				<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
			)}
			<span
				className={`relative inline-flex h-3 w-3 rounded-full ${statusColors[status]}`}
			/>
		</span>
	);
}

function GitStatus({
	gitStatus,
	dirtyCount,
}: {
	gitStatus: string;
	dirtyCount: number;
}) {
	if (dirtyCount === 0) {
		return <span className="text-green-400 font-mono text-xs">clean</span>;
	}
	return (
		<span className="text-yellow-400 font-mono text-xs" title={gitStatus}>
			{dirtyCount} changed
		</span>
	);
}

export function SessionsTable({
	sessions,
	selectedSession,
	onSelectSession,
	onDoubleClickSession,
	loading,
}: SessionsTableProps) {
	if (loading) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				Loading sessions...
			</div>
		);
	}

	if (sessions.length === 0) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
				<p className="text-sm">No sessions found</p>
				<p className="text-xs">Create a new session to get started</p>
			</div>
		);
	}

	return (
		<ScrollArea className="h-full">
			<Table>
				<TableHeader>
					<TableRow className="border-border hover:bg-transparent">
						<TableHead className="w-10"></TableHead>
						<TableHead>Name</TableHead>
						<TableHead>Branch</TableHead>
						<TableHead>Git</TableHead>
						<TableHead>Tags</TableHead>
						<TableHead>Cost</TableHead>
						<TableHead>Age</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{sessions.map((session) => (
						<TableRow
							key={session.name}
							className={`cursor-pointer border-border transition-colors ${
								selectedSession?.name === session.name
									? "bg-accent/50"
									: "hover:bg-muted/30"
							}`}
							onClick={() => onSelectSession(session)}
							onDoubleClick={() => onDoubleClickSession?.(session)}
						>
							<TableCell>
								<StatusDot status={session.status} />
							</TableCell>
							<TableCell className="font-semibold text-foreground">
								{session.name}
							</TableCell>
							<TableCell className="font-mono text-xs text-muted-foreground">
								{session.branch}
							</TableCell>
							<TableCell>
								<GitStatus
									gitStatus={session.git_status}
									dirtyCount={session.git_dirty_count}
								/>
							</TableCell>
							<TableCell>
								<div className="flex gap-1">
									{session.tags.map((tag) => (
										<Badge
											key={tag}
											variant="secondary"
											className="text-[10px]"
										>
											{tag}
										</Badge>
									))}
								</div>
							</TableCell>
							<TableCell className="font-mono text-xs text-muted-foreground">
								{session.cost}
							</TableCell>
							<TableCell className="text-xs text-muted-foreground">
								{session.age}
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>
		</ScrollArea>
	);
}
