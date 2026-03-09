import { useState, useEffect, useCallback } from "react";
import {
	getConfig,
	addWorkspace,
	removeWorkspace,
	updateWorkspaceColor,
} from "@/lib/api";
import type { Workspace } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	WORKSPACE_COLORS,
	getWorkspaceColorStyles,
} from "@/lib/workspaceColors";
import type { Session } from "@/types/session";

interface WorkspacePickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onWorkspaceSelected: (path: string | null) => void;
	activeWorkspace: string | null;
	sessions: Session[];
}

function getWorkspaceStats(sessions: Session[], workspacePath: string) {
	const ws = sessions.filter((s) => s.pane_path?.startsWith(workspacePath));
	const totalCost = ws.reduce((sum, s) => {
		const val = Number.parseFloat(s.cost.replace("$", ""));
		return sum + (Number.isNaN(val) ? 0 : val);
	}, 0);
	return {
		totalCost: totalCost > 0 ? `$${totalCost.toFixed(2)}` : null,
	};
}

const COLOR_OPTIONS = Object.keys(WORKSPACE_COLORS);

export function WorkspacePicker({
	open,
	onOpenChange,
	onWorkspaceSelected,
	activeWorkspace,
	sessions,
}: WorkspacePickerProps) {
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [newPath, setNewPath] = useState("");
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

	const loadWorkspaces = useCallback(() => {
		getConfig()
			.then((config) => {
				setWorkspaces(config.workspaces || []);
				setError(null);
			})
			.catch((err) => {
				setError(String(err));
				setWorkspaces([]);
			});
	}, []);

	useEffect(() => {
		if (!open) return;
		setNewPath("");
		setAdding(false);
		setError(null);
		setColorPickerFor(null);
		loadWorkspaces();
	}, [open, loadWorkspaces]);

	function handleSelect(path: string | null) {
		onWorkspaceSelected(path);
		onOpenChange(false);
	}

	function handleAddWorkspace() {
		const trimmed = newPath.trim();
		if (!trimmed) return;

		setAdding(true);
		setError(null);

		addWorkspace(trimmed)
			.then(() => {
				setNewPath("");
				loadWorkspaces();
			})
			.catch((err) => {
				setError(String(err));
			})
			.finally(() => {
				setAdding(false);
			});
	}

	function handleRemoveWorkspace(path: string) {
		removeWorkspace(path)
			.then(() => {
				if (activeWorkspace === path) {
					onWorkspaceSelected(null);
				}
				loadWorkspaces();
			})
			.catch((err) => {
				setError(String(err));
			});
	}

	function handleColorChange(path: string, color: string | null) {
		updateWorkspaceColor(path, color)
			.then(() => {
				loadWorkspaces();
				setColorPickerFor(null);
			})
			.catch((err) => {
				setError(String(err));
			});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg overflow-hidden">
				<DialogHeader>
					<DialogTitle>Manage Workspaces</DialogTitle>
					<DialogDescription>
						Configure workspace directories, colors, and filtering.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<button
						onClick={() => handleSelect(null)}
						className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted ${
							activeWorkspace === null
								? "bg-muted font-medium text-foreground"
								: "text-muted-foreground"
						}`}
					>
						All Sessions
					</button>

					<div className="max-h-64 space-y-1 overflow-y-auto">
						{workspaces.map((ws) => {
							const colorStyles = getWorkspaceColorStyles(ws.color);
							const stats = getWorkspaceStats(sessions, ws.path);

							return (
								<div key={ws.path} className="space-y-0">
									<div
										className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted ${
											activeWorkspace === ws.path
												? "bg-muted font-medium text-foreground"
												: "text-muted-foreground"
										}`}
									>
										{/* Color dot (clickable) */}
										<button
											onClick={() =>
												setColorPickerFor(
													colorPickerFor === ws.path ? null : ws.path,
												)
											}
											className="shrink-0"
										>
											<span
												className={`inline-block h-3 w-3 rounded-full border ${colorStyles.border} ${colorStyles.bg}`}
											/>
										</button>

										<button
											onClick={() => handleSelect(ws.path)}
											className="flex min-w-0 flex-1 flex-col items-start gap-0.5"
										>
											<span className="font-mono text-xs font-medium">
												{ws.name}
											</span>
											<span className="truncate w-full text-left font-mono text-[10px] opacity-50">
												{ws.path}
											</span>
										</button>

										{/* Stats */}
										{stats.totalCost && (
											<span className="text-[9px] text-muted-foreground font-mono shrink-0">
												{stats.totalCost}
											</span>
										)}

										<Button
											variant="ghost"
											size="sm"
											className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
											onClick={() => handleRemoveWorkspace(ws.path)}
										>
											x
										</Button>
									</div>

									{/* Color picker row */}
									{colorPickerFor === ws.path && (
										<div className="flex items-center gap-1 px-3 pb-2">
											<button
												onClick={() => handleColorChange(ws.path, null)}
												className={`h-5 w-5 rounded-full border border-border bg-muted ${
													!ws.color
														? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
														: ""
												}`}
												title="Default"
											/>
											{COLOR_OPTIONS.map((color) => (
												<button
													key={color}
													onClick={() => handleColorChange(ws.path, color)}
													className={`h-5 w-5 rounded-full ${
														WORKSPACE_COLORS[color].bg
													} ${
														ws.color === color
															? "ring-2 ring-foreground ring-offset-1 ring-offset-background"
															: ""
													}`}
													title={color}
												/>
											))}
										</div>
									)}
								</div>
							);
						})}

						{workspaces.length === 0 && (
							<p className="px-2 py-4 text-center text-sm text-muted-foreground">
								No workspaces configured
							</p>
						)}
					</div>

					<div className="flex items-center gap-2">
						<Input
							placeholder="~/projects/my-app"
							value={newPath}
							onChange={(e) => setNewPath(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleAddWorkspace();
							}}
							className="font-mono text-xs"
						/>
						<Button
							variant="outline"
							size="sm"
							onClick={handleAddWorkspace}
							disabled={!newPath.trim() || adding}
						>
							Add
						</Button>
					</div>

					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
			</DialogContent>
		</Dialog>
	);
}
