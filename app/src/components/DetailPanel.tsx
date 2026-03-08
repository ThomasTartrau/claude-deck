import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Session } from "@/types/session";

interface DetailPanelProps {
	session: Session | null;
	onOpenTags?: () => void;
}

const statusBadgeStyles: Record<Session["status"], string> = {
	Running: "border-green-500/30 text-green-400 bg-green-500/10",
	Waiting: "border-yellow-500/30 text-yellow-400 bg-yellow-500/10",
	Idle: "border-gray-500/30 text-gray-400 bg-gray-500/10",
	Dead: "border-red-500/30 text-red-400 bg-red-500/10",
};

function InfoRow({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between py-0.5">
			<span className="text-xs text-muted-foreground">{label}</span>
			<span className="text-sm text-foreground text-right max-w-[60%]">
				{children}
			</span>
		</div>
	);
}

export function DetailPanel({ session, onOpenTags }: DetailPanelProps) {
	if (!session) {
		return (
			<div className="flex h-full items-center justify-center text-muted-foreground">
				<p className="text-sm">Select a session to view details</p>
			</div>
		);
	}

	return (
		<ScrollArea className="h-full">
			<div className="space-y-2 p-4">
				{/* Header */}
				<div className="flex items-center justify-between">
					<div className="space-y-1">
						<h2 className="text-lg font-semibold text-foreground">
							{session.name}
						</h2>
						<Badge
							variant="outline"
							className={statusBadgeStyles[session.status]}
						>
							{session.status}
						</Badge>
					</div>
					<div className="text-right">
						<div className="font-mono text-sm text-foreground">
							{session.cost}
						</div>
						<div className="font-mono text-xs text-muted-foreground">
							{session.tokens} tokens
						</div>
					</div>
				</div>

				<Separator />

				{/* Details */}
				<div className="space-y-0">
					<InfoRow label="Branch">
						<span className="font-mono text-xs">{session.branch}</span>
					</InfoRow>
					<InfoRow label="Git">
						{session.git_dirty_count === 0 ? (
							<span className="text-green-400 font-mono text-xs">clean</span>
						) : (
							<span className="text-yellow-400 font-mono text-xs">
								{session.git_dirty_count} changed
								{session.git_insertions > 0 && (
									<span className="text-green-400">
										{" "}
										+{session.git_insertions}
									</span>
								)}
								{session.git_deletions > 0 && (
									<span className="text-red-400">
										{" "}
										-{session.git_deletions}
									</span>
								)}
							</span>
						)}
					</InfoRow>
					{session.pane_path && (
						<InfoRow label="Path">
							<span className="font-mono text-xs break-all opacity-70">
								{session.pane_path}
							</span>
						</InfoRow>
					)}
					<InfoRow label="Age">
						<span className="text-xs">{session.age}</span>
					</InfoRow>
				</div>

				{/* Tags */}
				<div className="flex items-center gap-2 flex-wrap">
					{session.tags.map((tag) => (
						<Badge key={tag} variant="secondary" className="text-[10px]">
							{tag}
						</Badge>
					))}
					{onOpenTags && (
						<Button
							size="sm"
							variant="ghost"
							className="h-6 px-2 text-xs text-muted-foreground"
							onClick={onOpenTags}
						>
							{session.tags.length > 0 ? "Edit tags" : "+ Tag"}
						</Button>
					)}
				</div>
			</div>
		</ScrollArea>
	);
}
