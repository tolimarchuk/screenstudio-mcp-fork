interface CDPPage {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export async function findRendererPage(port: number): Promise<string> {
  const url = `http://localhost:${port}/json`;

  let response: Response;
  try {
    response = await fetch(url);
  } catch {
    throw new Error(
      `Cannot connect to Screen Studio on port ${port}.\n` +
        `Run: screenstudio launch`,
    );
  }

  const pages: CDPPage[] = await response.json();
  const renderer = pages.find(
    (p) => p.url.includes("app.asar/dist/index.html"),
  );

  if (!renderer) {
    throw new Error(
      "Screen Studio is running but the main window was not found.",
    );
  }

  return renderer.webSocketDebuggerUrl;
}
