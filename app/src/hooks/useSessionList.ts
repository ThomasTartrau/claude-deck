import { useState, useEffect, useCallback, useRef } from "react";
import { listSessions } from "@/lib/api";
import type { Session } from "@/types/session";

export function useSessionList() {
	const [sessions, setSessions] = useState<Session[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const refresh = useCallback(() => {
		listSessions()
			.then((result) => {
				setSessions(result);
				setError(null);
				setLoading(false);
			})
			.catch((err) => {
				setError(String(err));
				setLoading(false);
			});
	}, []);

	useEffect(() => {
		refresh();
		intervalRef.current = setInterval(refresh, 2000);
		return () => {
			if (intervalRef.current) {
				clearInterval(intervalRef.current);
			}
		};
	}, [refresh]);

	return { sessions, loading, error, refresh };
}
