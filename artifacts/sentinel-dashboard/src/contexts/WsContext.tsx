/**
 * WsContext — single shared WebSocket connection for the entire dashboard.
 *
 * Why: multiple pages were each opening their own WebSocket and each had
 * independent polling loops for /swarm/map and /status. WsContext consolidates
 * all of that into one connection that auto-reconnects with exponential backoff.
 *
 * API:
 *   useWsEvent(type, callback)
 *     Subscribe to a specific WS event type. `callback` is called with the
 *     event's `data` payload. The subscription is automatically cleaned up
 *     when the component unmounts or the arguments change.
 *
 *   useWsStatus()
 *     Returns "connecting" | "connected" | "disconnected".
 *
 * Usage:
 *   1. Wrap your app in <WsProvider> (already done in App.tsx).
 *   2. Call useWsEvent("swarm_map", (data) => …) in any component or hook.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type WsStatus = "connecting" | "connected" | "disconnected";
type Listener = (data: unknown) => void;

interface WsContextValue {
  subscribe: (type: string, cb: Listener) => () => void;
  status: WsStatus;
}

const WsContext = createContext<WsContextValue>({
  subscribe: () => () => {},
  status: "disconnected",
});

export function WsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const wsRef      = useRef<WebSocket | null>(null);
  const retryRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCount = useRef(0);

  // Listener map: eventType → Set of callbacks
  // Use a ref so subscribe/dispatch never causes re-renders.
  const listeners = useRef(new Map<string, Set<Listener>>());

  function dispatch(type: string, data: unknown) {
    const set = listeners.current.get(type);
    if (!set) return;
    for (const cb of set) {
      try { cb(data); } catch {}
    }
  }

  const connect = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const url = `${protocol}//${window.location.host}${BASE}/api/v1/ws`;
    const ws  = new WebSocket(url);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      setStatus("connected");
      retryCount.current = 0;
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type?: string; data?: unknown; message?: unknown };
        if (msg.type) dispatch(msg.type, msg.data ?? msg.message ?? null);
      } catch {}
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
      const delay = Math.min(1000 * 2 ** retryCount.current, 30_000);
      retryCount.current += 1;
      retryRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  // subscribe() is intentionally stable — it never changes identity so
  // consumers don't need it in their dependency arrays.
  const subscribe = useCallback((type: string, cb: Listener): (() => void) => {
    let set = listeners.current.get(type);
    if (!set) { set = new Set(); listeners.current.set(type, set); }
    set.add(cb);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) listeners.current.delete(type);
    };
  }, []);

  return (
    <WsContext.Provider value={{ subscribe, status }}>
      {children}
    </WsContext.Provider>
  );
}

export function useWsContext(): WsContextValue {
  return useContext(WsContext);
}

export function useWsStatus(): WsStatus {
  return useContext(WsContext).status;
}

/**
 * useWsEvent — subscribe to a specific WebSocket event type.
 *
 * @param type     The event type string (e.g. "swarm_map", "integrity_status")
 * @param callback Called with the event payload whenever the event arrives.
 *                 Wrap in useCallback to prevent re-subscribing on every render.
 */
export function useWsEvent(type: string, callback: Listener): void {
  const { subscribe } = useWsContext();
  useEffect(() => subscribe(type, callback), [subscribe, type, callback]);
}
