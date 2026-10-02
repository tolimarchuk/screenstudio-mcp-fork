---
name: screenstudio-record
description: Record a polished software walkthrough in Screen Studio, including performing the demo yourself with visible native clicks, typing and scrolling. Use when asked to record a screen, demonstrate a product, or capture a reproducible app workflow.
---
# Record a software walkthrough

Deliver a saved Screen Studio project and an actual recording of the requested workflow. Pair this with screenstudio-edit and screenstudio-deliver when a finished video is requested.

## Prepare

1. Read the server's capabilities and launch Screen Studio. Follow the reported build compatibility; a newer build needs a compatible adapter.
2. Establish the audience, destination and one outcome. Infer sensible defaults: a short silent walkthrough, window capture, no microphone or camera. Ask only for missing information that changes the content.
3. Write 3–5 beats: starting state, meaningful action, visible result, closing state. Use real product behavior and seeded data. Rehearse without recording.
4. List sources. Select the exact window by app, title and ID. Inspect its screenshot. Capture a window instead of the whole display where practical. Close notifications, secret panels and unrelated tabs within the authorized scope.
5. Prepare the view, including browser zoom and scroll position. Keep text legible at the delivery size. Record audio or webcam only when the user wants it.

## Perform

Start one recording and inspect the real session state. Focus the selected target with a fresh observation. For each beat: screenshot, inspect, act, inspect the visible result. An observation token expires after 15 seconds and is consumed by one action.

Use native pointer clicks and typing so Screen Studio captures cursor motion, click locations and shortcuts. Browser DOM clicks can change the page while leaving the physical pointer elsewhere. When a browser connector is available, use it for identifying elements, then use native input for the recorded action. Follow that connector's own interaction rules.

Coordinates are window-local macOS points, including the title bar. A screenshot may contain twice as many pixels as points. Read [coordinates and interaction](references/interaction.md) before the first coordinate action.

Let a result become visible before moving to the next beat. Pause recording during substantial reasoning, network waits or setup fixes; resume after observing the target. Add markers at useful transitions. Finish normally and keep the returned project destination. A successful click is insufficient: the screenshot must show the intended product result.

## Recovery

A timeout can mean the change completed. Inspect recording state before any retry. If recording is active, continue, pause or finish it deliberately. If the window moves, disappears, changes focus or receives human interference, stop input and inspect again. Never click through a permission dialog blindly.

On walkthrough failure, finish the recording to preserve recoverable footage. Explain what remains. Avoid starting a second recording while one is active. See [recovery](references/recovery.md).
