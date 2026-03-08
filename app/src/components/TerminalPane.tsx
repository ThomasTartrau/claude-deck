import { useEffect, useRef, useCallback } from "react";
import { ptyClose, ptyWrite, ptyResize, ptyOpen } from "@/lib/api";
import { modKey } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";

interface TerminalPaneProps {
	sessionName: string | null;
	fullscreen?: boolean;
	onToggleFullscreen?: () => void;
}

export function TerminalPane({
	sessionName,
	fullscreen,
	onToggleFullscreen,
}: TerminalPaneProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const termRef = useRef<Terminal | null>(null);
	const fitAddonRef = useRef<FitAddon | null>(null);
	const unlistenRef = useRef<(() => void) | null>(null);
	const currentSessionRef = useRef<string | null>(null);
	// Serializes PTY operations so close finishes before open starts
	const ptyChainRef = useRef<Promise<void>>(Promise.resolve());

	const stopPty = useCallback(() => {
		if (unlistenRef.current) {
			unlistenRef.current();
			unlistenRef.current = null;
		}
		if (currentSessionRef.current) {
			currentSessionRef.current = null;
			return ptyClose().catch(() => {});
		}
		return Promise.resolve();
	}, []);

	// Setup terminal once
	useEffect(() => {
		if (!containerRef.current) return;

		const term = new Terminal({
			cursorBlink: true,
			fontSize: 13,
			fontFamily: "'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
			theme: {
				background: "#0a0a0a",
				foreground: "#e5e5e5",
				cursor: "#e5e5e5",
				selectionBackground: "#ffffff30",
				black: "#0a0a0a",
				red: "#ef4444",
				green: "#22c55e",
				yellow: "#eab308",
				blue: "#3b82f6",
				magenta: "#a855f7",
				cyan: "#06b6d4",
				white: "#e5e5e5",
				brightBlack: "#737373",
				brightRed: "#f87171",
				brightGreen: "#4ade80",
				brightYellow: "#facc15",
				brightBlue: "#60a5fa",
				brightMagenta: "#c084fc",
				brightCyan: "#22d3ee",
				brightWhite: "#ffffff",
			},
			allowProposedApi: true,
			scrollback: 10000,
		});

		const fitAddon = new FitAddon();
		const webLinksAddon = new WebLinksAddon();
		term.loadAddon(fitAddon);
		term.loadAddon(webLinksAddon);
		term.open(containerRef.current);

		setTimeout(() => fitAddon.fit(), 50);

		// Let modifier+key shortcuts bubble up to the app
		term.attachCustomKeyEventHandler((e) => {
			if (e.metaKey || e.ctrlKey) return false;
			return true;
		});

		term.onData((data) => {
			if (currentSessionRef.current) {
				ptyWrite(data).catch(() => {});
			}
		});

		term.onBinary((data) => {
			if (currentSessionRef.current) {
				ptyWrite(data).catch(() => {});
			}
		});

		termRef.current = term;
		fitAddonRef.current = fitAddon;

		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
			if (currentSessionRef.current) {
				ptyResize(term.cols, term.rows).catch(() => {});
			}
		});
		resizeObserver.observe(containerRef.current);

		return () => {
			resizeObserver.disconnect();
			stopPty();
			term.dispose();
			termRef.current = null;
			fitAddonRef.current = null;
		};
	}, [stopPty]);

	// Refit when fullscreen changes — multiple passes to catch layout settling
	useEffect(() => {
		void fullscreen;
		const refit = () => {
			fitAddonRef.current?.fit();
			if (currentSessionRef.current && termRef.current) {
				ptyResize(termRef.current.cols, termRef.current.rows).catch(() => {});
			}
		};
		const t1 = setTimeout(refit, 50);
		const t2 = setTimeout(refit, 150);
		const t3 = setTimeout(refit, 300);
		return () => {
			clearTimeout(t1);
			clearTimeout(t2);
			clearTimeout(t3);
		};
	}, [fullscreen]);

	// Interactive PTY — serialized via ptyChainRef
	useEffect(() => {
		const term = termRef.current;
		if (!term) return;

		if (!sessionName) {
			// No session selected — disconnect and show placeholder
			ptyChainRef.current = ptyChainRef.current
				.then(() => stopPty())
				.then(() => {
					if (termRef.current) {
						termRef.current.reset();
						termRef.current.write(
							"\r\n  \x1b[90mSelect a session to connect\x1b[0m\r\n",
						);
					}
				})
				.catch(() => {});
			return;
		}

		term.reset();
		term.write(`\r\n  \x1b[90mConnecting to ${sessionName}...\x1b[0m\r\n`);

		// Chain: wait for any pending close, then open
		const connectName = sessionName;
		ptyChainRef.current = ptyChainRef.current
			.then(() => stopPty())
			.then(() =>
				listen<string>("pty-output", (event) => {
					term.write(event.payload);
				}),
			)
			.then((unlisten) => {
				unlistenRef.current = unlisten;
				return ptyOpen(connectName, term.cols, term.rows);
			})
			.then(() => {
				currentSessionRef.current = connectName;
				setTimeout(() => {
					fitAddonRef.current?.fit();
					if (termRef.current) {
						ptyResize(termRef.current.cols, termRef.current.rows).catch(
							() => {},
						);
					}
				}, 100);
			})
			.catch((err) => {
				term.write(`\r\n  \x1b[31mFailed to connect: ${err}\x1b[0m\r\n`);
			});

		return () => {
			ptyChainRef.current = ptyChainRef.current
				.then(() => stopPty())
				.catch(() => {});
		};
	}, [sessionName, stopPty]);

	// Focus terminal when session starts
	useEffect(() => {
		if (sessionName && termRef.current) {
			setTimeout(() => termRef.current?.focus(), 100);
		}
	}, [sessionName]);

	return (
		<div className="flex h-full flex-col overflow-hidden bg-[#0a0a0a]">
			<div className="flex items-center justify-between px-3 py-1 border-b border-border/30 bg-black/50 shrink-0">
				<div className="flex items-center gap-2">
					<span className="text-[10px] font-medium text-green-400/60 tracking-wider uppercase">
						{sessionName ? `Terminal — ${sessionName}` : "Terminal"}
					</span>
				</div>
				{onToggleFullscreen && sessionName && (
					<button
						onClick={onToggleFullscreen}
						className={`text-[10px] transition-colors px-2 py-0.5 rounded ${
							fullscreen
								? "text-foreground bg-white/10 hover:bg-white/20"
								: "text-muted-foreground hover:text-foreground hover:bg-white/5"
						}`}
					>
						{fullscreen
							? `${modKey}F Exit fullscreen`
							: `${modKey}F Fullscreen`}
					</button>
				)}
			</div>
			<div ref={containerRef} className="flex-1 p-1" />
		</div>
	);
}
