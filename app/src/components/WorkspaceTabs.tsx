import { useState, useEffect, useCallback } from "react";
import { getConfig, type Workspace } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
	WORKSPACE_COLORS,
	getWorkspaceColorStyles,
} from "@/lib/workspaceColors";
import type { Session } from "@/types/session";

interface WorkspaceTabsProps {
	sessions: Session[];
	activeWorkspace: string | null;
	onWorkspaceSelected: (path: string | null) => void;
	onManageWorkspaces: () => void;
}

function getSessionCountsByStatus(
	sessions: Session[],
	workspacePath: string | null,
) {
	const filtered = workspacePath
		? sessions.filter((s) => s.pane_path?.startsWith(workspacePath))
		: sessions;
	return {
		total: filtered.length,
		running: filtered.filter((s) => s.status === "Running").length,
		waiting: filtered.filter((s) => s.status === "Waiting").length,
	};
}

export function WorkspaceTabs({
	sessions,
	activeWorkspace,
	onWorkspaceSelected,
	onManageWorkspaces,
}: WorkspaceTabsProps) {
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);

	const loadWorkspaces = useCallback(() => {
		getConfig()
			.then((config) => {
				setWorkspaces(config.workspaces || []);
			})
			.catch(() => {
				setWorkspaces([]);
			});
	}, []);

	useEffect(() => {
		loadWorkspaces();
		const interval = setInterval(loadWorkspaces, 5000);
		return () => clearInterval(interval);
	}, [loadWorkspaces]);

	const allCounts = getSessionCountsByStatus(sessions, null);

	return (
		<div className="flex items-center gap-1 border-b border-border/50 px-2 py-1 bg-background/50">
			<ScrollArea orientation="horizontal" className="flex-1">
				<div className="flex items-center gap-1">
					{/* All sessions tab */}
					<button
						onClick={() => onWorkspaceSelected(null)}
						className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
							activeWorkspace === null
								? "bg-accent text-foreground"
								: "text-muted-foreground hover:bg-muted hover:text-foreground"
						}`}
					>
						All
						{allCounts.total > 0 && (
							<Badge
								variant="secondary"
								className="h-4 px-1 text-[9px] font-mono"
							>
								{allCounts.total}
							</Badge>
						)}
					</button>

					{workspaces.map((ws) => {
						const counts = getSessionCountsByStatus(sessions, ws.path);
						const colorStyles = getWorkspaceColorStyles(ws.color);
						const isActive = activeWorkspace === ws.path;

						return (
							<button
								key={ws.path}
								onClick={() => onWorkspaceSelected(ws.path)}
								className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
									isActive
										? `${colorStyles.bg} ${colorStyles.text}`
										: "text-muted-foreground hover:bg-muted hover:text-foreground"
								}`}
							>
								{ws.color && (
									<span
										className={`inline-block h-2 w-2 rounded-full ${
											WORKSPACE_COLORS[ws.color]?.bg.replace("/15", "") ??
											"bg-gray-500"
										}`}
									/>
								)}
								{ws.name}
								{counts.total > 0 && (
									<span className="flex items-center gap-0.5">
										{counts.running > 0 && (
											<span
												className="inline-block h-1.5 w-1.5 rounded-full bg-green-500"
												title={`${counts.running} running`}
											/>
										)}
										{counts.waiting > 0 && (
											<span
												className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-500"
												title={`${counts.waiting} waiting`}
											/>
										)}
										<Badge
											variant="secondary"
											className="h-4 px-1 text-[9px] font-mono"
										>
											{counts.total}
										</Badge>
									</span>
								)}
							</button>
						);
					})}
				</div>
			</ScrollArea>

			<Button
				variant="ghost"
				size="sm"
				className="h-6 px-1.5 text-[10px] text-muted-foreground shrink-0"
				onClick={onManageWorkspaces}
			>
				+
			</Button>
		</div>
	);
}
