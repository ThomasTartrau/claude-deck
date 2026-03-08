import { useState, useEffect } from "react";
import { saveQuickAction } from "@/lib/api";
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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface QuickActionEditorProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	editAction?: {
		key: string;
		label: string;
		prompt: string;
		index: number;
	} | null;
	onSaved: () => void;
}

export function QuickActionEditor({
	open,
	onOpenChange,
	editAction,
	onSaved,
}: QuickActionEditorProps) {
	const [key, setKey] = useState("");
	const [label, setLabel] = useState("");
	const [prompt, setPrompt] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			if (editAction) {
				setKey(editAction.key);
				setLabel(editAction.label);
				setPrompt(editAction.prompt);
			} else {
				setKey("");
				setLabel("");
				setPrompt("");
			}
			setError(null);
		}
	}, [open, editAction]);

	function handleSave() {
		if (!key.trim() || !label.trim() || !prompt.trim()) {
			setError("All fields are required.");
			return;
		}

		setSaving(true);
		setError(null);

		saveQuickAction(
			key.trim(),
			label.trim(),
			prompt.trim(),
			editAction ? editAction.index : null,
		)
			.then(() => {
				onSaved();
				onOpenChange(false);
			})
			.catch((err) => {
				setError(String(err));
			})
			.finally(() => {
				setSaving(false);
			});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>
						{editAction ? "Edit Quick Action" : "New Quick Action"}
					</DialogTitle>
					<DialogDescription>
						Define a reusable prompt shortcut.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="qa-key">Key</Label>
						<Input
							id="qa-key"
							placeholder="e.g. r"
							value={key}
							onChange={(e) => setKey(e.target.value)}
							maxLength={5}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="qa-label">Label</Label>
						<Input
							id="qa-label"
							placeholder="e.g. Review code"
							value={label}
							onChange={(e) => setLabel(e.target.value)}
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="qa-prompt">Prompt</Label>
						<Textarea
							id="qa-prompt"
							placeholder="e.g. Please review the current changes..."
							value={prompt}
							onChange={(e) => setPrompt(e.target.value)}
							rows={4}
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={handleSave} disabled={saving}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
