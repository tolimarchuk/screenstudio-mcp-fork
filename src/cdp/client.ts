import { findRendererPage, assertLocalSocket } from "./page-finder.js";

type Pending = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
};
export class CDPClient {
  private ws: WebSocket | null = null;
  private messageId = 0;
  private pending = new Map<number, Pending>();
  private readonly timeoutMs: number;
  constructor(
    private readonly port = 9222,
    options: { timeoutMs?: number } = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }
  async connect(): Promise<void> {
    await this.connectTo(await findRendererPage(this.port));
  }
  async connectTo(url: string): Promise<void> {
    assertLocalSocket(url, this.port);
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.addEventListener("message", (event) => {
      let msg: any;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const pending = this.pending.get(msg.id);
      if (!pending) return;
      this.pending.delete(msg.id);
      clearTimeout(pending.timer);
      if (msg.error) pending.reject(new Error(`CDP: ${msg.error.message}`));
      else pending.resolve(msg.result);
    });
    ws.addEventListener("close", () =>
      this.failPending(
        new Error(
          "Screen Studio connection closed. Reconnect and inspect state before retrying a change.",
        ),
      ),
    );
    ws.addEventListener("error", () =>
      this.failPending(new Error("Screen Studio connection failed.")),
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error("Screen Studio connection timed out."));
      }, this.timeoutMs);
      ws.addEventListener(
        "open",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
      ws.addEventListener(
        "error",
        () => {
          clearTimeout(timer);
          reject(new Error("Failed to connect to Screen Studio."));
        },
        { once: true },
      );
      ws.addEventListener(
        "close",
        () => {
          clearTimeout(timer);
          reject(new Error("Screen Studio connection closed."));
        },
        { once: true },
      );
    });
  }
  async send<T = any>(
    method: string,
    params: Record<string, unknown> = {},
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN)
      throw new Error("Screen Studio is not connected.");
    const id = ++this.messageId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            `${method} timed out after ${timeoutMs}ms. The operation may have completed; inspect state before retrying.`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  async evaluate<T = unknown>(body: string): Promise<T> {
    return this.evaluateAwait<T>(`(async function(){ ${body} })()`);
  }
  async evaluateAwait<T = unknown>(
    expression: string,
    timeoutMs = this.timeoutMs,
  ): Promise<T> {
    const result = await this.send<any>(
      "Runtime.evaluate",
      {
        expression: `(async()=>{const value=await (${expression});return JSON.stringify(value===undefined?null:value);})()`,
        returnByValue: true,
        awaitPromise: true,
      },
      timeoutMs,
    );
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Screen Studio evaluation failed.",
      );
    const value = result.result?.value;
    return (typeof value === "string" ? JSON.parse(value) : value) as T;
  }
  async evaluateRaw(expression: string): Promise<string> {
    const value = await this.evaluateAwait(expression);
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  async dispatchKeyEvent(
    key: string,
    code: string,
    modifiers: number,
  ): Promise<void> {
    for (const type of ["keyDown", "keyUp"])
      await this.send("Input.dispatchKeyEvent", { type, key, code, modifiers });
  }
  disconnect(): void {
    this.failPending(new Error("Screen Studio disconnected."));
    this.ws?.close();
    this.ws = null;
  }
  private failPending(error: Error): void {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
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
