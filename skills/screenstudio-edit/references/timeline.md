# Time and editing

Screen Studio 4 scenes store slices with sourceStartMs, sourceEndMs and timeScale. The public interface uses speed: playback duration = (endMs - startMs) / speed. Speed 2 means twice as fast, with internal timeScale 0.5.

Replacing slices replaces the scene's complete slice list. Specify every retained interval, in order, without overlap. Existing camera, audio and cursor slice settings are retained. Intervals must lie inside the current scene source extent. Work from an untouched copy to restore footage removed from the current scene extent.

Example: retain source 1000–5000 at speed 1 and source 8000–12000 at speed 2. Final playback is 6000ms. Source 9000ms maps to playback 4500ms. A source zoom 8500–10000 appears at playback 4250–5000ms.

A zoom requires a scene ID, source interval, magnification and presentation (screen/loupe). Optional manual target uses x/y from 0 to 1 within the recorded source, independent of desktop coordinates. An added zoom appends; removing a zoom requires its returned ID. Inspect overlap and transitions in the canonical render.

Edits support project schema 4.0.0 and app build 4.0.1-4897. Unknown fields are preserved. Arbitrary project replacement and executable expressions are absent from the MCP interface.
