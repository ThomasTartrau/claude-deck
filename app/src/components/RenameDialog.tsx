import { useState, useEffect } from "react";
import { renameSession } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface RenameDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionName: string;
	onRenamed: () => void;
}

export function RenameDialog({
	open,
	onOpenChange,
	sessionName,
	onRenamed,
}: RenameDialogProps) {
	const [newName, setNewName] = useState("");
	const [renaming, setRenaming] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setNewName(sessionName);
			setError(null);
			setRenaming(false);
		}
	}, [open, sessionName]);

	function handleRename() {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === sessionName) return;

		setRenaming(true);
		setError(null);

		renameSession(sessionName, trimmed)
			.then(() => {
				onRenamed();
				onOpenChange(false);
			})
			.catch((err) => {
				setError(String(err));
			})
			.finally(() => {
				setRenaming(false);
			});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Rename Session</DialogTitle>
					<DialogDescription>
						Rename <span className="font-mono font-medium">{sessionName}</span>
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<div className="space-y-2">
						<Label>New name</Label>
						<Input
							value={newName}
							onChange={(e) => setNewName(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === "Enter") handleRename();
							}}
							placeholder="session-name"
							className="font-mono"
							autoFocus
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<div className="flex justify-end gap-2">
						<Button
							variant="ghost"
							size="sm"
							onClick={() => onOpenChange(false)}
						>
							Cancel
						</Button>
						<Button
							size="sm"
							onClick={handleRename}
							disabled={
								renaming || !newName.trim() || newName.trim() === sessionName
							}
						>
							{renaming ? "Renaming..." : "Rename"}
						</Button>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
