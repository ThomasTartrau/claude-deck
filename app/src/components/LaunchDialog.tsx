import { useState, useEffect } from "react";
import { launchSession } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface LaunchDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onLaunched: () => void;
	defaultPath?: string | null;
}

export function LaunchDialog({
	open,
	onOpenChange,
	onLaunched,
	defaultPath,
}: LaunchDialogProps) {
	const [name, setName] = useState("");
	const [prompt, setPrompt] = useState("");
	const [path, setPath] = useState(defaultPath ?? "");
	const [launching, setLaunching] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setPath(defaultPath ?? "");
			setError(null);
		}
	}, [open, defaultPath]);

	function handleLaunch() {
		if (!name.trim()) return;

		setLaunching(true);
		setError(null);

		launchSession(
			name.trim(),
			prompt.trim() || undefined,
			path.trim() || undefined,
		)
			.then(() => {
				setName("");
				setPrompt("");
				setPath("");
				onOpenChange(false);
				onLaunched();
			})
			.catch((err) => {
				setError(String(err));
			})
			.finally(() => {
				setLaunching(false);
			});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>New Session</DialogTitle>
					<DialogDescription>
						Launch a new Claude Code session.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="session-name">Session Name</Label>
						<Input
							id="session-name"
							placeholder="my-feature"
							value={name}
							onChange={(e) => setName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleLaunch();
							}}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="session-prompt">
							Prompt <span className="text-muted-foreground">(optional)</span>
						</Label>
						<Textarea
							id="session-prompt"
							placeholder="Implement the login feature..."
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							rows={3}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="session-path">
							Path <span className="text-muted-foreground">(optional)</span>
						</Label>
						<Input
							id="session-path"
							placeholder="/path/to/project"
							value={path}
							onChange={(e) => setPath(e.target.value)}
							className="font-mono text-sm"
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={handleLaunch} disabled={!name.trim() || launching}>
						{launching ? "Launching..." : "Launch"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
