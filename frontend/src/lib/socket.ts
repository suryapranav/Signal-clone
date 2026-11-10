import { WS_URL } from "./api";
import type { ClientEvent, ServerEvent } from "./types";

export type ConnectionState = "connecting" | "online" | "offline";

interface Handlers {
  onEvent: (event: ServerEvent) => void;
  onState: (state: ConnectionState) => void;
  /** Fired on every successful (re)connect after the first, so the app can
   *  re-fetch anything it may have missed while disconnected. */
  onResync: () => void;
  onUnauthorized: () => void;
}

const PING_MS = 25_000; // keeps proxies (Render, Vercel) from idling us out
const MAX_BACKOFF_MS = 15_000;

/** One reconnecting WebSocket for the signed-in user. */
class RealtimeClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private handlers: Handlers | null = null;
  private attempts = 0;
  private everConnected = false;
  private pingTimer: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  connect(token: string, handlers: Handlers) {
    this.disconnect();
    this.token = token;
    this.handlers = handlers;
    this.everConnected = false;
    this.open();
  }

  disconnect() {
    this.token = null;
    clearInterval(this.pingTimer);
    clearTimeout(this.retryTimer);
    if (this.ws) {
      this.ws.onclose = null;
      this.ws.close();
      this.ws = null;
    }
  }

  get isOpen() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  send(event: ClientEvent): boolean {
    if (!this.isOpen) return false;
    this.ws!.send(JSON.stringify(event));
    return true;
  }

  private open() {
    if (!this.token || !this.handlers) return;
    const handlers = this.handlers;
    handlers.onState("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(this.token)}`);
    this.ws = ws;

    ws.onmessage = (e) => {
      const event = JSON.parse(e.data) as ServerEvent;
      if (event.type === "ready") {
        this.attempts = 0;
        handlers.onState("online");
        if (this.everConnected) handlers.onResync();
        this.everConnected = true;
      }
      handlers.onEvent(event);
    };

    ws.onopen = () => {
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ type: "ping" }), PING_MS);
    };

    ws.onclose = (e) => {
      clearInterval(this.pingTimer);
      this.ws = null;
      if (e.code === 4401) {
        handlers.onUnauthorized();
        return;
      }
      handlers.onState("offline");
      // Exponential backoff with jitter: 0.5s, 1s, 2s … capped at 15s.
      const delay = Math.min(MAX_BACKOFF_MS, 500 * 2 ** this.attempts++) * (0.8 + Math.random() * 0.4);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
  }
}

export const realtime = new RealtimeClient();
