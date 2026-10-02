export interface CDPPage {
  id: string;
  title: string;
  url: string;
  type?: string;
  webSocketDebuggerUrl: string;
}
export function assertLocalSocket(url: string, port: number): void {
  const target = new URL(url);
  if (
    target.protocol !== "ws:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
    Number(target.port) !== port ||
    target.username ||
    target.password
  )
    throw new Error(
      "Screen Studio returned an unexpected debugging address. Only local connections are supported.",
    );
}
export async function listPages(port: number): Promise<CDPPage[]> {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error(
      "Debugging port must be an integer between 1024 and 65535.",
    );
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json`, {
      signal: AbortSignal.timeout(3000),
      redirect: "error",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const pages = await response.json();
    if (!Array.isArray(pages)) throw new Error("Invalid target list");
    for (const p of pages) assertLocalSocket(p.webSocketDebuggerUrl, port);
    return pages;
  } catch (error) {
    throw new Error(
      `Cannot connect to Screen Studio on port ${port}. Start an automation session first. ${error instanceof Error ? error.message : ""}`,
    );
  }
}
export async function findRendererPage(port: number): Promise<string> {
  const pages = await listPages(port);
  // Export workers load the same index.html as the editor. URL order is unsafe.
  for (const p of pages.filter((p) =>
    p.url.includes("app.asar/dist/index.html"),
  )) {
    const ws = new WebSocket(p.webSocketDebuggerUrl);
    try {
      const probe = await new Promise<any>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Renderer probe timed out.")),
          3000,
        );
        ws.onopen = () =>
          ws.send(
            JSON.stringify({
              id: 1,
              method: "Runtime.evaluate",
              params: {
                expression: `JSON.stringify({studio:!!window.bridge && !!window.electronEnv,worker:!!window.electronEnv?.IS_RENDER_WORKER,version:window.electronEnv?.APP_VERSION})`,
                returnByValue: true,
              },
            }),
          );
        ws.onmessage = (e) => {
          try {
            const m = JSON.parse(String(e.data));
            if (m.id === 1) {
              clearTimeout(timer);
              resolve(JSON.parse(m.result?.result?.value ?? "null"));
            }
          } catch (error) {
            clearTimeout(timer);
            reject(error);
          }
        };
        ws.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Renderer probe failed."));
        };
        ws.onclose = () => {
          clearTimeout(timer);
          reject(new Error("Renderer probe closed."));
        };
      });
      if (probe?.studio && !probe.worker) return p.webSocketDebuggerUrl;
    } catch {
      /* Try the next genuine Screen Studio renderer. */
    } finally {
      ws.close();
    }
  }
  throw new Error(
    "Screen Studio editor renderer was not found. Its export worker is not an editor.",
  );
}
