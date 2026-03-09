import { useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import type { Session } from "@/types/session";

interface SessionsTableProps {
	sessions: Session[];
	selectedSession: Session | null;
	onSelectSession: (session: Session) => void;
	onDoubleClickSession?: (session: Session) => void;
	loading: boolean;
	selectedSessions: Set<string>;
	onSelectionChange: (selected: Set<string>) => void;
	collapsedGroups: Set<string>;
	onToggleGroup: (status: string) => void;
}

const statusColors: Record<Session["status"], string> = {
	Running: "bg-green-500",
	Waiting: "bg-yellow-500",
	Idle: "bg-gray-500",
	Dead: "bg-red-500",
};

const statusOrder: Session["status"][] = ["Running", "Waiting", "Idle", "Dead"];

const groupHeaderColors: Record<Session["status"], string> = {
	Running: "text-green-400",
	Waiting: "text-yellow-400",
	Idle: "text-gray-400",
	Dead: "text-red-400",
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
	selectedSessions,
	onSelectionChange,
	collapsedGroups,
	onToggleGroup,
}: SessionsTableProps) {
	const lastClickedRef = useRef<string | null>(null);

	const groups = statusOrder
		.map((status) => ({
			status,
			sessions: sessions.filter((s) => s.status === status),
		}))
		.filter((g) => g.sessions.length > 0);

	const handleClick = useCallback(
		(session: Session, e: React.MouseEvent) => {
			const isMod = e.metaKey || e.ctrlKey;
			const isShift = e.shiftKey;

			if (isMod) {
				const next = new Set(selectedSessions);
				if (next.has(session.name)) {
					next.delete(session.name);
				} else {
					next.add(session.name);
				}
				onSelectionChange(next);
				lastClickedRef.current = session.name;
			} else if (isShift && lastClickedRef.current) {
				const allNames = sessions.map((s) => s.name);
				const lastIdx = allNames.indexOf(lastClickedRef.current);
				const currentIdx = allNames.indexOf(session.name);
				if (lastIdx >= 0 && currentIdx >= 0) {
					const start = Math.min(lastIdx, currentIdx);
					const end = Math.max(lastIdx, currentIdx);
					const next = new Set(selectedSessions);
					for (let i = start; i <= end; i++) {
						next.add(allNames[i]);
					}
					onSelectionChange(next);
				}
			} else {
				onSelectionChange(new Set());
				onSelectSession(session);
				lastClickedRef.current = session.name;
			}
		},
		[sessions, selectedSessions, onSelectionChange, onSelectSession],
	);

	const handleCheckboxChange = useCallback(
		(sessionName: string, checked: boolean) => {
			const next = new Set(selectedSessions);
			if (checked) {
				next.add(sessionName);
			} else {
				next.delete(sessionName);
			}
			onSelectionChange(next);
		},
		[selectedSessions, onSelectionChange],
	);

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

	const isMultiSelectActive = selectedSessions.size > 0;

	return (
		<div className="h-full overflow-y-auto">
			<div className="py-1">
				{groups.map(({ status, sessions: groupSessions }) => {
					const isCollapsed = collapsedGroups.has(status);
					return (
						<div key={status}>
							<button
								onClick={() => onToggleGroup(status)}
								className="flex w-full items-center gap-2 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider hover:bg-muted/30 transition-colors"
							>
								<span
									className={`transition-transform text-[8px] ${isCollapsed ? "" : "rotate-90"}`}
								>
									&#9654;
								</span>
								<span className={groupHeaderColors[status]}>{status}</span>
								<span className="text-muted-foreground font-mono">
									({groupSessions.length})
								</span>
							</button>

							{!isCollapsed &&
								groupSessions.map((session) => {
									const isSelected = selectedSession?.name === session.name;
									const isMultiSelected = selectedSessions.has(session.name);

									return (
										<div
											key={session.name}
											role="row"
											tabIndex={0}
											onClick={(e) => handleClick(session, e)}
											onKeyDown={(e) => {
												if (e.key === "Enter") onDoubleClickSession?.(session);
											}}
											onDoubleClick={() => onDoubleClickSession?.(session)}
											className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors border-l-2 ${
												isMultiSelected
													? "border-l-blue-400 bg-blue-500/10"
													: isSelected
														? "border-l-accent bg-accent/50"
														: "border-l-transparent hover:bg-muted/30"
											} ${session.status === "Dead" ? "opacity-50" : ""}`}
										>
											{isMultiSelectActive && (
												<Checkbox
													checked={isMultiSelected}
													onCheckedChange={(checked) =>
														handleCheckboxChange(session.name, checked === true)
													}
													onClick={(e) => e.stopPropagation()}
													className="h-3.5 w-3.5"
												/>
											)}

											<StatusDot status={session.status} />

											<span className="font-semibold text-sm text-foreground truncate min-w-0 flex-shrink">
												{session.name}
											</span>

											<span className="font-mono text-[10px] text-muted-foreground truncate hidden sm:inline">
												{session.branch}
											</span>

											<span className="flex-1" />

											<GitStatus
												gitStatus={session.git_status}
												dirtyCount={session.git_dirty_count}
											/>

											{session.tags.length > 0 && (
												<div className="flex gap-0.5">
													{session.tags.slice(0, 2).map((tag) => (
														<Badge
															key={tag}
															variant="secondary"
															className="text-[9px] py-0 px-1"
														>
															{tag}
														</Badge>
													))}
													{session.tags.length > 2 && (
														<span className="text-[9px] text-muted-foreground">
															+{session.tags.length - 2}
														</span>
													)}
												</div>
											)}

											<span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
												{session.cost}
											</span>

											<span className="text-[10px] text-muted-foreground whitespace-nowrap">
												{session.age}
											</span>
										</div>
									);
								})}
						</div>
					);
				})}
			</div>
		</div>
	);
}
