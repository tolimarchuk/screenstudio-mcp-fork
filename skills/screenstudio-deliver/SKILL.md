---
name: screenstudio-deliver
description: Render, inspect and deliver a Screen Studio video or GIF with actual media checks and representative frames. Use for export, final quality review, previews, or preparing a recording for sharing.
---
# Deliver the finished video

Deliver a playable local file, its duration and dimensions, and a clear account of any remaining issue. A project or started export alone is insufficient.

1. Read capabilities and the final project. Pick output dimensions, frame rate and format appropriate to the destination. Default to MP4, H.264, 1080p, 30 fps, studio quality. Use a fresh output name.
2. Start a local export and keep its job ID. Poll the same job until completed, failed or cancelled. The server renders with Screen Studio, copies the result into the requested destination and reads the encoded media properties. No upload or share link is created.
3. Compare duration against intended edits and dimensions against aspect ratio. Reject zero duration, missing video, unexpected cuts, wrong aspect ratio or unintended audio.
4. Inspect canonical rendered frames at the start, middle, end and each important transition. Preview takes playback milliseconds. Inspect the actual content: text, cursor, zoom target, webcam, captions and privacy. A passing encoding check cannot judge these.
5. Watch or sample the entire output when pacing matters. If audio is requested, listen to it. Fix problems in the project copy and render to a new destination.
6. Report the finished file with a usable link or attachment and a short description. Publishing is a separate action governed by the user's request.

Read [delivery checklist](references/quality.md) for destination-specific checks and recovery.
