import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const isMac = navigator.platform.toUpperCase().includes("MAC");
export const modKey = isMac ? "⌘" : "Ctrl+";
