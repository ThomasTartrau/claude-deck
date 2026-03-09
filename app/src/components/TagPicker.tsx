import { useState, useEffect, useRef } from "react";
import { getAllTags, setTags } from "@/lib/api";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusIcon } from "lucide-react";

interface TagPickerProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	sessionName: string;
	currentTags: string[];
	onTagsUpdated: () => void;
	bulkMode?: boolean;
	bulkSessionNames?: string[];
}

export function TagPicker({
	open,
	onOpenChange,
	sessionName,
	currentTags,
	onTagsUpdated,
	bulkMode,
	bulkSessionNames,
}: TagPickerProps) {
	const [allTags, setAllTags] = useState<string[]>([]);
	const [selectedTags, setSelectedTags] = useState<string[]>([]);
	const [search, setSearch] = useState("");
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const prevOpenRef = useRef(false);

	useEffect(() => {
		const justOpened = open && !prevOpenRef.current;
		prevOpenRef.current = open;

		if (!justOpened) return;

		setSelectedTags([...currentTags]);
		setSearch("");
		setError(null);

		getAllTags()
			.then((tags) => {
				setAllTags(tags);
			})
			.catch(() => {
				setAllTags([]);
			});
	}, [open, currentTags]);

	const filteredTags = allTags.filter((tag) =>
		tag.toLowerCase().includes(search.toLowerCase()),
	);

	const searchMatchesExisting = allTags.some(
		(tag) => tag.toLowerCase() === search.trim().toLowerCase(),
	);

	const showCreateOption = search.trim().length > 0 && !searchMatchesExisting;

	function handleToggle(tag: string) {
		setSelectedTags((prev) =>
			prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
		);
	}

	function handleCreateTag() {
		const newTag = search.trim();
		if (!newTag) return;
		setAllTags((prev) => [...prev, newTag]);
		setSelectedTags((prev) => [...prev, newTag]);
		setSearch("");
	}

	function handleSave() {
		setSaving(true);
		setError(null);

		const names =
			bulkMode && bulkSessionNames ? bulkSessionNames : [sessionName];
		Promise.all(names.map((name) => setTags(name, selectedTags)))
			.then(() => {
				onTagsUpdated();
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
			<DialogContent className="sm:max-w-sm">
				<DialogHeader>
					<DialogTitle>Manage Tags</DialogTitle>
					<DialogDescription>
						{bulkMode && bulkSessionNames ? (
							`Tags for ${bulkSessionNames.length} sessions`
						) : (
							<>
								Tags for{" "}
								<span className="font-mono font-medium">{sessionName}</span>
							</>
						)}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<Input
						placeholder="Search or create tag..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						onKeyDown={(e) => {
							if (e.key === "Enter" && showCreateOption) {
								handleCreateTag();
							}
						}}
					/>

					{selectedTags.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{selectedTags.map((tag) => (
								<Badge key={tag} variant="secondary" className="gap-1">
									{tag}
								</Badge>
							))}
						</div>
					)}

					<div className="max-h-48 space-y-1 overflow-y-auto">
						{filteredTags.map((tag) => (
							<label
								key={tag}
								className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
							>
								<Checkbox
									checked={selectedTags.includes(tag)}
									onCheckedChange={() => handleToggle(tag)}
								/>
								<span>{tag}</span>
							</label>
						))}

						{showCreateOption && (
							<button
								onClick={handleCreateTag}
								className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
							>
								<PlusIcon className="size-4" />
								Create &quot;{search.trim()}&quot;
							</button>
						)}

						{filteredTags.length === 0 && !showCreateOption && (
							<p className="px-2 py-4 text-center text-sm text-muted-foreground">
								No tags found
							</p>
						)}
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
