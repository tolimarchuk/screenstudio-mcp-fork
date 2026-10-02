# Coordinates and input

Get the actual native window bounds and a screenshot of the same ID. Coordinates passed to desktop input are in points relative to that window's top-left, including chrome.

For a screenshot of width 2400 and a window width 1200 points, divide screenshot coordinates by 2. A button at screenshot (1800,1000) is (900,500) in window points. The native helper maps this to desktop coordinates; the agent never adds the desktop origin itself. A moved/resized window invalidates the previous observation.

Focus is an explicit action. Then inspect again and act with a new token. A click smoothly moves the real pointer over approximately 300ms. Typing uses native Unicode key events, without the clipboard. Supported keys: return, tab, escape, backspace, selectAll. Scroll is vertical native line scrolling at the current pointer position; move to the intended scroll region first.

Screenshots and source listings may contain private information. Choose the requested target and keep any material intended for public delivery free of private data. Clicking a control with external consequences still follows the host agent's action rules.

Input fails when Accessibility is missing, focus changes, a window cannot be identified, or coordinates leave the target. Ask the owner to resolve a required permission, then repeat inspection. Leave all desktop permissions and security settings under the owner's control.
