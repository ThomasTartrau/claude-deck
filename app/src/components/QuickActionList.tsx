import { useState, useEffect, useCallback } from "react";
import { getQuickActions, sendPrompt, deleteQuickAction } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QuickActionEditor } from "@/components/QuickActionEditor";
import type { QuickAction } from "@/types/quickAction";

interface QuickActionListProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionName: string;
	onActionSent: () => void;
}

export function QuickActionList({
	open,
	onOpenChange,
	sessionName,
	onActionSent,
}: QuickActionListProps) {
	const [actions, setActions] = useState<QuickAction[]>([]);
	const [sending, setSending] = useState<number | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [editorOpen, setEditorOpen] = useState(false);
	const [editAction, setEditAction] = useState<{
		key: string;
		label: string;
		prompt: string;
		index: number;
	} | null>(null);

	const loadActions = useCallback(() => {
		getQuickActions()
			.then((result) => {
				setActions(result);
			})
			.catch((err) => {
				setError(String(err));
			});
	}, []);

	useEffect(() => {
		if (open) {
			loadActions();
			setError(null);
		}
	}, [open, loadActions]);

	function handleSendAction(action: QuickAction, index: number) {
		setSending(index);
		setError(null);

		sendPrompt(sessionName, action.prompt)
			.then(() => {
				onActionSent();
				onOpenChange(false);
			})
			.catch((err) => {
				setError(String(err));
			})
			.finally(() => {
				setSending(null);
			});
	}

	function handleDelete(index: number) {
		deleteQuickAction(index)
			.then(() => {
				loadActions();
			})
			.catch((err) => {
				setError(String(err));
			});
	}

	function handleEdit(action: QuickAction, index: number) {
		setEditAction({
			key: action.key,
			label: action.label,
			prompt: action.prompt,
			index,
		});
		setEditorOpen(true);
	}

	function handleNew() {
		setEditAction(null);
		setEditorOpen(true);
	}

	function handleEditorSaved() {
		loadActions();
	}

	function truncate(text: string, max: number) {
		if (text.length <= max) return text;
		return `${text.slice(0, max)}...`;
	}

	return (
		<>
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Quick Actions</DialogTitle>
						<DialogDescription>
							Send a pre-configured prompt to "{sessionName}".
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-2 max-h-80 overflow-y-auto">
						{actions.length === 0 && (
							<p className="text-sm text-muted-foreground py-4 text-center">
								No quick actions configured yet.
							</p>
						)}
						{actions.map((action, index) => (
							<div
								key={index}
								className="flex items-center gap-2 rounded-lg border p-2 hover:bg-muted/50 cursor-pointer group"
								onClick={() => handleSendAction(action, index)}
								onKeyDown={(e) => {
									if (e.key === "Enter") handleSendAction(action, index);
								}}
								tabIndex={0}
								role="button"
							>
								<Badge variant="secondary" className="shrink-0 font-mono">
									{action.key}
								</Badge>
								<div className="flex-1 min-w-0">
									<span className="font-medium text-sm">{action.label}</span>
									<span className="text-muted-foreground text-xs ml-2">
										{truncate(action.prompt, 60)}
									</span>
								</div>
								<div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
									<Button
										variant="ghost"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											handleEdit(action, index);
										}}
									>
										Edit
									</Button>
									<Button
										variant="ghost"
										size="sm"
										onClick={(e) => {
											e.stopPropagation();
											handleDelete(index);
										}}
									>
										Delete
									</Button>
								</div>
								{sending === index && (
									<span className="text-xs text-muted-foreground">
										Sending...
									</span>
								)}
							</div>
						))}
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
					<div className="flex justify-end pt-2">
						<Button variant="outline" size="sm" onClick={handleNew}>
							New
						</Button>
					</div>
				</DialogContent>
			</Dialog>
			<QuickActionEditor
				open={editorOpen}
				onOpenChange={setEditorOpen}
				editAction={editAction}
				onSaved={handleEditorSaved}
			/>
		</>
	);
}
