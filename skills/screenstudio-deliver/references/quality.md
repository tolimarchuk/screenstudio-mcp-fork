# Delivery review

- Opening frame communicates what the viewer is seeing.
- The intended action and result are both visible.
- Pointer motion matches actions; no click is implied in the wrong place.
- Text remains legible at the final size; no cursor or loupe covers the key detail.
- Cuts preserve causality. Waiting is shortened, not silently mistaken for progress.
- Zoom transitions settle naturally and keep the target in view.
- Captions match speech and avoid essential controls.
- Webcam, background and audio reflect the requested scope.
- No secrets, unrelated windows, notifications or unapproved audience data appear.
- Last frame provides a useful ending instead of a mid-click cut.

720p is useful for fast drafts. 1080p is the normal desktop delivery default. Higher resolutions cost render time and file size; choose them when fine UI detail requires them. GIF lacks audio and can become large, so keep it brief.

If an export fails, inspect its status and reported reason. Retry only after correcting the cause. If a request times out, poll the existing job. Server restart can recover the job metadata; app restart loses its renderer job registry. Keep both source project and any completed temporary render while resolving that state.

The current adapter uses the app's local QA export directory to avoid native save dialogs. It requires that route to continue existing in the supported app build. Final file copies are exclusive: an existing destination is never overwritten. Temporary app exports remain available for recovery; clean them through the app or deliberate file management after acceptance.
