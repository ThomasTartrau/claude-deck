import { useState, useEffect, useRef } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getSettings, updateSettings, type AppSettings } from "@/lib/api";
import {
	ALL_ACTIONS,
	ACTION_LABELS,
	DEFAULT_KEYBINDINGS,
	formatBinding,
} from "@/lib/keybindings";
import { isMac } from "@/lib/utils";
import { toast } from "sonner";

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved?: () => void;
}

type Tab = "general" | "keybindings";

function SectionTitle({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-2">
			{children}
		</h3>
	);
}

function Field({
	label,
	description,
	children,
}: {
	label: string;
	description?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1">
			<Label className="text-xs">{label}</Label>
			{children}
			{description && (
				<p className="text-[10px] text-muted-foreground">{description}</p>
			)}
		</div>
	);
}

function eventToBindingString(e: KeyboardEvent): string | null {
	// Ignore lone modifier presses
	if (["Meta", "Control", "Shift", "Alt"].includes(e.key)) return null;

	const parts: string[] = [];
	const mod = isMac ? e.metaKey : e.ctrlKey;
	if (mod) parts.push("mod");
	if (e.shiftKey) parts.push("shift");
	if (e.altKey) parts.push("alt");
	if (parts.length === 0) return null; // Require at least one modifier
	parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
	return parts.join("+");
}

function KeybindingRecorder({
	value,
	onChange,
	onReset,
	defaultValue,
}: {
	value: string;
	onChange: (binding: string) => void;
	onReset: () => void;
	defaultValue: string;
}) {
	const [recording, setRecording] = useState(false);
	const inputRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!recording) return;

		function handleKey(e: KeyboardEvent) {
			e.preventDefault();
			e.stopPropagation();

			if (e.key === "Escape") {
				setRecording(false);
				return;
			}

			const binding = eventToBindingString(e);
			if (binding) {
				onChange(binding);
				setRecording(false);
			}
		}

		window.addEventListener("keydown", handleKey, true);
		return () => window.removeEventListener("keydown", handleKey, true);
	}, [recording, onChange]);

	const isDefault = value === defaultValue;

	return (
		<div className="flex items-center gap-1.5">
			<button
				type="button"
				ref={inputRef}
				onClick={() => setRecording(true)}
				className={`flex-1 h-7 flex items-center px-2 rounded-lg border text-xs font-mono cursor-pointer transition-colors text-left ${
					recording
						? "border-green-500 bg-green-500/10 text-green-400"
						: "border-input bg-transparent text-foreground hover:border-ring"
				}`}
			>
				{recording ? (
					<span className="text-green-400 animate-pulse">Press keys...</span>
				) : (
					formatBinding(value)
				)}
			</button>
			{!isDefault && (
				<button
					type="button"
					onClick={onReset}
					className="text-[10px] text-muted-foreground hover:text-foreground px-1"
					title="Reset to default"
				>
					Reset
				</button>
			)}
		</div>
	);
}

export function SettingsDialog({
	open,
	onOpenChange,
	onSaved,
}: SettingsDialogProps) {
	const [settings, setSettings] = useState<AppSettings | null>(null);
	const [flagsText, setFlagsText] = useState("");
	const [saving, setSaving] = useState(false);
	const [tab, setTab] = useState<Tab>("general");

	useEffect(() => {
		if (!open) return;
		getSettings()
			.then((s) => {
				setSettings(s);
				setFlagsText(s.claude_flags.join(" "));
			})
			.catch((err) => {
				toast.error(`Failed to load settings: ${err}`);
			});
	}, [open]);

	function handleSave() {
		if (!settings) return;
		setSaving(true);

		const flags = flagsText.split(/\s+/).filter((f) => f.length > 0);

		const updated: AppSettings = { ...settings, claude_flags: flags };

		updateSettings(updated)
			.then(() => {
				toast.success("Settings saved");
				onOpenChange(false);
				onSaved?.();
			})
			.catch((err) => {
				toast.error(`Failed to save: ${err}`);
			})
			.finally(() => {
				setSaving(false);
			});
	}

	function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
		if (!settings) return;
		setSettings({ ...settings, [key]: value });
	}

	function updateKeybinding(action: string, binding: string) {
		if (!settings) return;
		setSettings({
			...settings,
			keybindings: { ...settings.keybindings, [action]: binding },
		});
	}

	function resetKeybinding(action: string) {
		const def = DEFAULT_KEYBINDINGS[action];
		if (def) updateKeybinding(action, def);
	}

	function resetAllKeybindings() {
		if (!settings) return;
		setSettings({
			...settings,
			keybindings: { ...DEFAULT_KEYBINDINGS },
		});
	}

	if (!settings) {
		return (
			<Dialog open={open} onOpenChange={onOpenChange}>
				<DialogContent className="sm:max-w-md">
					<div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
						Loading...
					</div>
				</DialogContent>
			</Dialog>
		);
	}

	const mergedKeybindings = { ...DEFAULT_KEYBINDINGS, ...settings.keybindings };

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>
						Configuration is stored in ~/.config/claude-deck/config.toml
					</DialogDescription>
				</DialogHeader>

				{/* Tabs */}
				<div className="flex border-b border-border/30">
					<button
						type="button"
						onClick={() => setTab("general")}
						className={`px-3 py-1.5 text-xs font-medium transition-colors ${
							tab === "general"
								? "text-foreground border-b-2 border-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						General
					</button>
					<button
						type="button"
						onClick={() => setTab("keybindings")}
						className={`px-3 py-1.5 text-xs font-medium transition-colors ${
							tab === "keybindings"
								? "text-foreground border-b-2 border-foreground"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Keybindings
					</button>
				</div>

				<ScrollArea className="max-h-[60vh] pr-3">
					{tab === "general" && (
						<div className="space-y-3">
							{/* Claude */}
							<SectionTitle>Claude</SectionTitle>

							<Field
								label="Command"
								description="Full base command. This is exactly what runs."
							>
								<Input
									value={settings.claude_command}
									onChange={(e) => update("claude_command", e.target.value)}
									placeholder="claude --dangerously-skip-permissions"
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<Field
								label="Extra flags"
								description="Appended to the command above (e.g. --model sonnet --verbose)"
							>
								<Input
									value={flagsText}
									onChange={(e) => setFlagsText(e.target.value)}
									placeholder="--model sonnet"
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<div className="flex items-center justify-between py-1">
								<div>
									<Label className="text-xs">Git worktree</Label>
									<p className="text-[10px] text-muted-foreground">
										Use --worktree for git isolation between sessions
									</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={settings.use_worktree}
									onClick={() => update("use_worktree", !settings.use_worktree)}
									className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
										settings.use_worktree ? "bg-green-500" : "bg-muted"
									}`}
								>
									<span
										className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
											settings.use_worktree ? "translate-x-4" : "translate-x-0"
										}`}
									/>
								</button>
							</div>

							<Separator />

							{/* Applications */}
							<SectionTitle>Applications</SectionTitle>

							<Field
								label="Terminal"
								description="macOS: app name (Terminal, iTerm, Warp, Ghostty). Linux: binary name. Empty = system default"
							>
								<Input
									value={settings.terminal_app ?? ""}
									onChange={(e) =>
										update("terminal_app", e.target.value || null)
									}
									placeholder="System default"
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<Field
								label="Editor"
								description="Command to open a directory (code, cursor, zed, nvim). Empty = code"
							>
								<Input
									value={settings.editor_command ?? ""}
									onChange={(e) =>
										update("editor_command", e.target.value || null)
									}
									placeholder="code"
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<Field
								label="Shell"
								description="Login shell for tmux sessions. Empty = $SHELL or /bin/zsh"
							>
								<Input
									value={settings.shell ?? ""}
									onChange={(e) => update("shell", e.target.value || null)}
									placeholder="$SHELL"
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<Separator />

							{/* Tmux */}
							<SectionTitle>Tmux</SectionTitle>

							<div className="grid grid-cols-2 gap-2">
								<Field label="Columns">
									<Input
										type="number"
										value={settings.tmux_columns}
										onChange={(e) =>
											update("tmux_columns", Number(e.target.value) || 220)
										}
										className="h-7 text-xs font-mono"
									/>
								</Field>
								<Field label="Rows">
									<Input
										type="number"
										value={settings.tmux_rows}
										onChange={(e) =>
											update("tmux_rows", Number(e.target.value) || 50)
										}
										className="h-7 text-xs font-mono"
									/>
								</Field>
							</div>

							<Field
								label="History limit"
								description="Number of scrollback lines per tmux session"
							>
								<Input
									type="number"
									value={settings.tmux_history_limit}
									onChange={(e) =>
										update(
											"tmux_history_limit",
											Number(e.target.value) || 50000,
										)
									}
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<Separator />

							{/* General */}
							<SectionTitle>General</SectionTitle>

							<Field
								label="Refresh interval (seconds)"
								description="How often session list updates"
							>
								<Input
									type="number"
									min={1}
									max={60}
									value={settings.refresh_interval_secs}
									onChange={(e) =>
										update(
											"refresh_interval_secs",
											Math.max(1, Number(e.target.value) || 2),
										)
									}
									className="h-7 text-xs font-mono"
								/>
							</Field>

							<div className="flex items-center justify-between py-1">
								<div>
									<Label className="text-xs">Notifications</Label>
									<p className="text-[10px] text-muted-foreground">
										Desktop notifications on status changes
									</p>
								</div>
								<button
									type="button"
									role="switch"
									aria-checked={settings.notifications}
									onClick={() =>
										update("notifications", !settings.notifications)
									}
									className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
										settings.notifications ? "bg-green-500" : "bg-muted"
									}`}
								>
									<span
										className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow-sm ring-0 transition-transform ${
											settings.notifications ? "translate-x-4" : "translate-x-0"
										}`}
									/>
								</button>
							</div>
						</div>
					)}

					{tab === "keybindings" && (
						<div className="space-y-2">
							<div className="flex items-center justify-between">
								<p className="text-[10px] text-muted-foreground">
									Click a shortcut to record a new binding. Press Esc to cancel.
								</p>
								<button
									type="button"
									onClick={resetAllKeybindings}
									className="text-[10px] text-muted-foreground hover:text-foreground underline"
								>
									Reset all
								</button>
							</div>

							<div className="space-y-1.5">
								{ALL_ACTIONS.map((action) => (
									<div
										key={action}
										className="flex items-center justify-between gap-3"
									>
										<span className="text-xs text-foreground min-w-[120px]">
											{ACTION_LABELS[action]}
										</span>
										<div className="flex-1 max-w-[180px]">
											<KeybindingRecorder
												value={
													mergedKeybindings[action] ??
													DEFAULT_KEYBINDINGS[action]
												}
												defaultValue={DEFAULT_KEYBINDINGS[action]}
												onChange={(binding) =>
													updateKeybinding(action, binding)
												}
												onReset={() => resetKeybinding(action)}
											/>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</ScrollArea>

				<DialogFooter>
					<Button
						variant="outline"
						size="sm"
						onClick={() => onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button size="sm" onClick={handleSave} disabled={saving}>
						{saving ? "Saving..." : "Save"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
