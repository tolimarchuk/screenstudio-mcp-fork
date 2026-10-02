# Version 4 features

| Feature | Current integration |
| --- | --- |
| Screen and loupe zoom | Source-time zoom edit, magnification, optional manual target, app-rendered preview |
| Trims and speed | Validated source slices; positive speed and ordered intervals |
| Cursor | Size, visibility, rotation setting, click effect, idle hiding |
| Transcript captions | Read an existing transcript; caption visibility, size, color, shortcuts and sound labels |
| Transcript editing, filler removal, transcription | Use Screen Studio UI through the host's computer controls; not exposed by this adapter yet |
| Audio | Master volume and independent microphone/system/background mute; background volume |
| Camera | Visibility, mirror, face tracking, grain, sharpening, LUT intensity and background blur |
| Layout | Default camera overlay, split screen or cutout camera; timeline layout editing uses UI |
| Background | Existing system background preserved, or solid color; blur and framing settings |
| Processing | Recording quality improvement and motion blur |
| Masks | Existing masks preserved; creating or adjusting privacy masks uses UI |
| Voiceover | Existing tracks preserved; generation uses UI and may involve a remote service |

Server capabilities are the current contract. Features listed in the vendor's site are not automatically supported MCP operations. When the UI is needed, use observed controls and inspect the result. Transcription, voiceover and publishing can have data transmission or cost implications, so follow the host's action rules and the user's requested scope.
