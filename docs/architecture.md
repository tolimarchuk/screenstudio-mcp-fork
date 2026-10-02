# Architecture

The MCP entry point registers structured operations with the official TypeScript SDK. App interaction uses loopback Chrome DevTools Protocol to call Screen Studio's local bridge. The adapter is build-specific and operates on explicit project destinations rather than an assumed active editor.

Renderer discovery identifies the main editor by app environment and excludes render workers. Connection requests reject CDP errors, renderer exceptions, disconnects and timeouts. Requests are never automatically retried because a timed-out mutation may have completed.

Project edits validate on a detached clone, require the last content revision, preserve unrelated fields and save a private checkpoint before writing. The app saves the data; the adapter reads it back. A failed comparison requires inspection. Keep the copy closed in the editor while saving: the app's internal API does not offer a transactional compare-and-swap against external concurrent edits.

The native helper uses public Accessibility and Core Graphics APIs. Input targets one on-screen window with matching PID and geometry, requires the correct focused window and stays inside its bounds. Observation tokens expire and are single use. Mouse movement and typing check focus during input. It uses no clipboard, arbitrary shell execution or UI script evaluation.

Exports are asynchronous jobs in the app renderer. The server stores private job metadata for reconnection after server restart. App restart loses renderer job state and requires inspection. The app's local QA destination bypasses the native save dialog; the final output is copied exclusively to the requested destination and inspected with ffprobe. The adapter never invokes remote sharing. Previews are extracted from this canonical render, including app effects.

The original CLI is retained as upstream source history, not as the version 4 MCP backend. There is no generic execution operation in the MCP surface.
