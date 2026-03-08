import { useState, useEffect, useCallback } from "react";
import { getConfig, addWorkspace, removeWorkspace } from "@/lib/api";
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

interface WorkspacePickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onWorkspaceSelected: (path: string | null) => void;
	activeWorkspace: string | null;
}

export function WorkspacePicker({
	open,
	onOpenChange,
	onWorkspaceSelected,
	activeWorkspace,
}: WorkspacePickerProps) {
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [newPath, setNewPath] = useState("");
	const [adding, setAdding] = useState(false);
	const [error, setError] = useState<string | null>(null);

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

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-lg overflow-hidden">
				<DialogHeader>
					<DialogTitle>Workspaces</DialogTitle>
					<DialogDescription>
						Filter sessions by workspace directory.
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

					<div className="max-h-48 space-y-1 overflow-y-auto">
						{workspaces.map((ws) => (
							<div
								key={ws.path}
								className={`group flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted ${
									activeWorkspace === ws.path
										? "bg-muted font-medium text-foreground"
										: "text-muted-foreground"
								}`}
							>
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
								<Button
									variant="ghost"
									size="sm"
									className="h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 text-destructive"
									onClick={() => handleRemoveWorkspace(ws.path)}
								>
									x
								</Button>
							</div>
						))}

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
