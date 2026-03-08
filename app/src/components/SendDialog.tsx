import { useState } from "react";
import { sendPrompt } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface SendDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionName: string;
}

export function SendDialog({
	open,
	onOpenChange,
	sessionName,
}: SendDialogProps) {
	const [text, setText] = useState("");
	const [sending, setSending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	function handleSend() {
		if (!text.trim()) return;

		setSending(true);
		setError(null);

		sendPrompt(sessionName, text.trim())
			.then(() => {
				setText("");
				onOpenChange(false);
			})
			.catch((err) => {
				setError(String(err));
			})
			.finally(() => {
				setSending(false);
			});
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Send Prompt</DialogTitle>
					<DialogDescription>
						Send a prompt to session "{sessionName}".
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-2">
						<Label htmlFor="prompt-text">Prompt</Label>
						<Textarea
							id="prompt-text"
							placeholder="Type your prompt here..."
							value={text}
							onChange={(e) => setText(e.target.value)}
							rows={5}
							onKeyDown={(e) => {
								if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
									handleSend();
								}
							}}
						/>
					</div>
					{error && <p className="text-sm text-destructive">{error}</p>}
				</div>
				<DialogFooter>
					<Button onClick={handleSend} disabled={!text.trim() || sending}>
						{sending ? "Sending..." : "Send"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
