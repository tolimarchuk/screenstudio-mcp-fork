# Live tests

Use only the bundled seeded demo. These tests move the actual pointer and create real recordings. Keep the target visible and avoid typing during the run.

1. Build the server and helper. Launch the compatible app through the server.
2. Run `npm run build:demo` and open the generated demo app, or open the sample page in a dedicated visible browser window.
3. List sources and select the exact demo window. The native recording script expects the bundled Cocoa wrapper title and a 1200-point-wide window.
4. Run:

```sh
SCREENSTUDIO_LIVE_TEST=1 node scripts/live-record.mjs <demo-window-id>
SCREENSTUDIO_LIVE_TEST=1 node scripts/live-smoke.mjs <sample.screenstudio>
SCREENSTUDIO_LIVE_TEST=1 node scripts/live-export.mjs <sample.screenstudio>
```

Use the configuration variables from the README for an alternate app bundle, port or media executable.

Recording test: connect through the MCP protocol, focus, record, click, select/type, show the visible workflow, add a marker, finish, render, inspect encoding and leave a screenshot/video/report.

Editing test: duplicate source, style, add loupe zoom, trim 12 seconds to 8 seconds at 1.5× speed, render at 720p/30fps, check 1280×720 output and duration, and leave the report/video. Source files remain intact.

The normal suite uses a real MCP stdio client and a local CDP fixture. It covers render-worker selection, transport errors, disconnects, evaluation timeouts/exceptions, malformed protocol input, source-time edits, speed semantics, invalid intervals, unknown config keys and prototype attacks. No normal test records the user's desktop.
