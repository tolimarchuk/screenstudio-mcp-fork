---
name: screenstudio-edit
description: Edit a Screen Studio recording into a clear product demo using trims, speed, screen or loupe zooms, framing, cursor styling, captions and webcam settings. Use for polishing an existing recording or adapting it to a delivery format.
---
# Edit a Screen Studio demo

Make the recorded action easier to understand. Preserve the source and judge the actual rendered result.

1. Read capabilities, project config, scenes and revision. Duplicate the project into a fresh destination before editing. Keep the copy closed in the editor during programmatic saves; external edits can race a save.
2. Outline the final beats. Remove irrelevant setup and waiting, retain causal steps and visible outcomes. Start with trimming and speed changes, then framing, then zooms.
3. All slice and zoom intervals use **source milliseconds**. Preview positions use **playback milliseconds**. Read [time and editing](references/timeline.md) before combining speed and zooms.
4. Apply one purposeful edit at a time using the latest revision. Save the returned checkpoint. Read the result back and use its revision for the next edit.
5. Render a draft, inspect transitions and text legibility, then refine. Use screenstudio-deliver for final inspection and output.

## Style

Choose an aspect ratio for the destination. Default to 16:9 for a desktop walkthrough. Use modest padding and contrast between the app and background. Keep cursor size visible without obscuring controls. Use a click effect only if it helps explain interaction.

Use screen zoom for a region that needs sustained attention. Use loupe for a small detail while retaining surrounding context. Keep zooms sparse and tied to meaningful actions. Automatic follow-click targets require real recorded mouse clicks; use a normalized manual target when the cursor track is unsuitable. Render to confirm the detail remains visible throughout the zoom.

Caption, audio, camera processing and default layout settings live in nested version 4 groups. Read the actual project config and supported key list. Set only keys the adapter exposes. Read [version 4 features](references/features.md) when working with transcripts, webcam effects or layout changes.

## Recovery

Stale revision means another edit happened: reread and reconsider the requested change. A save timeout is ambiguous: read back before retrying. Checkpoints preserve pre-edit project data. Restore deliberately using the current revision; restoration changes that project's editing data, not source recordings. Keep the original project until delivery is accepted.
