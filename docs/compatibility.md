# Screen Studio 4 compatibility

Supported app build: **4.0.1-4897**. Supported project schema: **4.0.0**. Apple Silicon macOS was exercised locally.

| Surface | Coverage | Exercised |
| --- | --- | --- |
| App discovery | Select editor, skip render worker | Real app plus protocol regression test |
| Sources and state | Actual window/display IDs, devices, live recording state | Real app |
| Recording | Start exact window, finish into actual project | Real app |
| Native walkthrough | Focus, mouse motion/click, Unicode typing, basic key, screenshot | Real sample app |
| Pause/resume, markers | Current app routes and state checks | Pause/resume, session transitions and marker exercised |
| Nested configuration | Validated supported keys; preserve other data | Cursor, aspect ratio, background exercised |
| Source edits | Trimming, inverse timeScale for speed | Real export duration compared to expected |
| Zoom | Screen/loupe, optional manual target | Loupe render exercised; other variants pending |
| Export | Local MP4/GIF, job lifecycle, exclusive delivery, encoded inspection | MP4 H.264, 720p/30fps exercised; GIF and cancellation exercised; job metadata reconnection exercised |
| Preview | Extract frame from Screen Studio's actual render | Real exported frame inspected |
| Captions | Existing transcript query and caption styling | Routes inspected; speech project pending |
| Webcam/audio effects | Supported nested settings | Schema mapped; camera/audio recording pending |
| Transcript generation/filler editing | Host computer controls in app UI | No programmatic adapter yet |
| Voiceover, timeline layout, masks | Existing data preserved; edits via UI | No programmatic adapter yet |

Feature coverage is distinct from live exercise. This document deliberately names the remaining test gaps. Homepage feature descriptions do not constitute automation compatibility.

The app's local bridge is an undocumented interface. A future build is rejected before app changes. To add compatibility: inspect its actual state/schema, add a behavior regression test, exercise a seeded end-to-end recording and export, and update the compatibility table. Avoid simply removing the build check.

Vendor source and extracted application bundles are absent from this repository. The integration calls local interfaces; Screen Studio remains separately installed and licensed.
