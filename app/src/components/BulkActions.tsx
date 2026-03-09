import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { killSession, sendPrompt } from "@/lib/api";
import { toast } from "sonner";
import { TagPicker } from "@/components/TagPicker";
import type { Session } from "@/types/session";

interface BulkActionsProps {
	selectedSessions: Set<string>;
	sessions: Session[];
	onClearSelection: () => void;
	onRefresh: () => void;
}

export function BulkActions({
	selectedSessions,
	sessions,
	onClearSelection,
	onRefresh,
}: BulkActionsProps) {
	const [bulkSendOpen, setBulkSendOpen] = useState(false);
	const [bulkTagOpen, setBulkTagOpen] = useState(false);
	const [killing, setKilling] = useState(false);

	const count = selectedSessions.size;
	if (count === 0) return null;

	const selectedNames = Array.from(selectedSessions);
	const selectedSessionObjects = sessions.filter((s) =>
		selectedSessions.has(s.name),
	);
	const killableCount = selectedSessionObjects.filter(
		(s) => s.status !== "Dead",
	).length;

	function handleBulkKill() {
		const killable = selectedSessionObjects.filter((s) => s.status !== "Dead");
		if (killable.length === 0) return;

		setKilling(true);
		Promise.all(killable.map((s) => killSession(s.name)))
			.then(() => {
				toast.success(`Killed ${killable.length} sessions`);
				onClearSelection();
				onRefresh();
			})
			.catch((err) => {
				toast.error(`Failed to kill some sessions: ${err}`);
			})
			.finally(() => {
				setKilling(false);
			});
	}

	function handleBulkSend(text: string) {
		Promise.all(selectedNames.map((name) => sendPrompt(name, text)))
			.then(() => {
				toast.success(`Sent prompt to ${count} sessions`);
				setBulkSendOpen(false);
			})
			.catch((err) => {
				toast.error(`Failed to send to some sessions: ${err}`);
			});
	}

	return (
		<>
			<div className="flex items-center gap-2 border-t border-blue-500/20 bg-blue-500/5 px-4 py-1.5">
				<Badge
					variant="outline"
					className="border-blue-500/30 text-blue-400 text-[10px]"
				>
					{count} selected
				</Badge>

				<div className="flex items-center gap-1">
					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-[10px]"
						onClick={() => setBulkSendOpen(true)}
					>
						Send Prompt
					</Button>

					<Button
						variant="ghost"
						size="sm"
						className="h-6 text-[10px]"
						onClick={() => setBulkTagOpen(true)}
					>
						Tag
					</Button>

					{killableCount > 0 && (
						<Button
							variant="ghost"
							size="sm"
							className="h-6 text-[10px] text-destructive hover:text-destructive"
							onClick={handleBulkKill}
							disabled={killing}
						>
							{killing
								? "Killing..."
								: `Kill${killableCount < count ? ` (${killableCount})` : ""}`}
						</Button>
					)}
				</div>

				<span className="flex-1" />

				<Button
					variant="ghost"
					size="sm"
					className="h-6 text-[10px] text-muted-foreground"
					onClick={onClearSelection}
				>
					Clear
				</Button>
			</div>

			{/* Bulk send dialog */}
			{bulkSendOpen && (
				<BulkSendDialog
					open={bulkSendOpen}
					onOpenChange={setBulkSendOpen}
					count={count}
					onSend={handleBulkSend}
				/>
			)}

			{/* Bulk tag picker */}
			{bulkTagOpen && (
				<TagPicker
					open={bulkTagOpen}
					onOpenChange={setBulkTagOpen}
					sessionName={selectedNames[0]}
					currentTags={[]}
					onTagsUpdated={() => {
						onRefresh();
						setBulkTagOpen(false);
					}}
					bulkMode
					bulkSessionNames={selectedNames}
				/>
			)}
		</>
	);
}

function BulkSendDialog({
	open,
	onOpenChange,
	count,
	onSend,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	count: number;
	onSend: (text: string) => void;
}) {
	const [text, setText] = useState("");

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Send Prompt</DialogTitle>
					<DialogDescription>
						Send a prompt to {count} sessions.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2">
					<Label htmlFor="bulk-prompt-text">Prompt</Label>
					<Textarea
						id="bulk-prompt-text"
						placeholder="Type your prompt here..."
						value={text}
						onChange={(e) => setText(e.target.value)}
						rows={5}
						onKeyDown={(e) => {
							if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
								onSend(text);
							}
						}}
					/>
				</div>
				<DialogFooter>
					<Button onClick={() => onSend(text)} disabled={!text.trim()}>
						Send
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
