import { findRendererPage } from "./page-finder.js";

interface CDPMessage {
  id: number;
  result?: {
    result?: {
      type: string;
      value?: unknown;
      description?: string;
      objectId?: string;
    };
    exceptionDetails?: {
      text: string;
      exception?: { description?: string };
    };
  };
}

export class CDPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private port: number;

  constructor(port = 9222) {
    this.port = port;
  }

  async connect(): Promise<void> {
    const wsUrl = await findRendererPage(this.port);
    this.ws = new WebSocket(wsUrl);

    await new Promise<void>((resolve, reject) => {
      this.ws!.onopen = () => resolve();
      this.ws!.onerror = () =>
        reject(new Error("Failed to connect to Screen Studio via WebSocket."));
    });
  }

  async evaluate<T = unknown>(expression: string): Promise<T> {
    if (!this.ws) throw new Error("Not connected. Call connect() first.");

    const id = ++this.messageId;

    // Wrap in try/catch so errors propagate as values, not CDP exceptions
    const wrapped = `
      try { JSON.stringify((function() { ${expression} })()); }
      catch(__e) { JSON.stringify({ __error: true, message: __e.message, stack: __e.stack ? __e.stack.slice(0, 500) : '' }); }
    `;

    const ws = this.ws;

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("CDP evaluation timed out after 30 seconds."));
      }, 30_000);

      const handler = (event: MessageEvent) => {
        const msg: CDPMessage = JSON.parse(
          typeof event.data === "string" ? event.data : event.data.toString(),
        );
        if (msg.id !== id) return;

        clearTimeout(timeout);
        ws.removeEventListener("message", handler);

        if (msg.result?.exceptionDetails) {
          const desc =
            msg.result.exceptionDetails.exception?.description ||
            msg.result.exceptionDetails.text;
          reject(new Error(`Screen Studio error: ${desc}`));
          return;
        }

        const raw = msg.result?.result?.value;
        if (raw === undefined || raw === null) {
          resolve(undefined as T);
          return;
        }

        try {
          const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
          if (parsed && parsed.__error) {
            reject(new Error(parsed.message));
            return;
          }
          resolve(parsed as T);
        } catch {
          resolve(raw as T);
        }
      };

      ws.addEventListener("message", handler);
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression: wrapped, returnByValue: true },
        }),
      );
    });
  }

  async evaluateRaw(expression: string): Promise<string> {
    if (!this.ws) throw new Error("Not connected. Call connect() first.");

    const id = ++this.messageId;
    const ws = this.ws;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("CDP evaluation timed out after 30 seconds."));
      }, 30_000);

      const handler = (event: MessageEvent) => {
        const msg: CDPMessage = JSON.parse(
          typeof event.data === "string" ? event.data : event.data.toString(),
        );
        if (msg.id !== id) return;

        clearTimeout(timeout);
        ws.removeEventListener("message", handler);

        const value = msg.result?.result?.value;
        resolve(value !== undefined ? String(value) : "undefined");
      };

      ws.addEventListener("message", handler);
      ws.send(
        JSON.stringify({
          id,
          method: "Runtime.evaluate",
          params: { expression, returnByValue: true },
        }),
      );
    });
  }

  async dispatchKeyEvent(
    key: string,
    code: string,
    modifiers: number,
  ): Promise<void> {
    if (!this.ws) throw new Error("Not connected.");

    const id = ++this.messageId;
    const ws = this.ws;

    for (const type of ["keyDown", "keyUp"]) {
      const sendId = type === "keyDown" ? id : ++this.messageId;
      ws.send(
        JSON.stringify({
          id: sendId,
          method: "Input.dispatchKeyEvent",
          params: { type, key, code, modifiers },
        }),
      );
    }

    // Brief wait for the keypress to register
    await new Promise((r) => setTimeout(r, 100));
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export async function withClient<T>(
  port: number,
  fn: (client: CDPClient) => Promise<T>,
): Promise<T> {
  const client = new CDPClient(port);
  try {
    await client.connect();
    return await fn(client);
  } finally {
    client.disconnect();
  }
}
