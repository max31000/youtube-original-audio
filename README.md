# YouTube Original Audio (Un-Dub)

[![License: GPL v3](https://img.shields.io/badge/license-GPLv3-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-green.svg)](manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-111%2B-yellow.svg)](https://www.google.com/chrome/)
[![Edge](https://img.shields.io/badge/Edge-111%2B-yellow.svg)](https://www.microsoft.com/edge)
[![Release](https://img.shields.io/github/v/release/max31000/youtube-original-audio)](https://github.com/max31000/youtube-original-audio/releases/latest)

A Chrome/Edge extension (Manifest V3) that restores the **original audio
track** on YouTube videos with forced auto-dubbing.

## The problem

YouTube rolled out automatic AI dubbing and, for many videos, plays a dubbed
audio track matching your interface language by default — even if you've
selected the original in settings. The player's own "Audio track → Original"
menu **doesn't work** on these videos: you can pick it, but the audio doesn't
change, and the dub comes back on the next reload. This extension fixes the
switch and makes such videos open with the original audio by default.

## Installation

### Option 1 — prebuilt .zip

1. Download the `.zip` from the [latest release](https://github.com/max31000/youtube-original-audio/releases/latest)
   and unzip it.
2. **Chrome:** open `chrome://extensions`, enable **Developer mode** (toggle
   in the top right), click **Load unpacked**, and select the unzipped folder.
3. **Edge:** open `edge://extensions`, enable **Developer mode**, click
   **Load unpacked**, and select the same folder.
4. Open an auto-dubbed video — it'll play the original audio.

### Option 2 — from source

```bash
git clone https://github.com/max31000/youtube-original-audio.git
```

Then the same as above: `chrome://extensions` (or `edge://extensions`) →
Developer mode → Load unpacked → select the repository folder.

## Usage

- **By default**, auto-dubbed videos open with their original audio track —
  nothing to configure.
- The **ORIG / DUB** button in the player controls shows and toggles the
  current mode:
  - **ORIG** (blue) — fix enabled, original audio plays.
  - **DUB** (gray) — fix disabled, default YouTube behavior.
  - Switching to **DUB** asks for confirmation and reloads the page (the
    native track switch is broken on these videos, so this is the only
    reliable way to re-pick).
- The extension icon opens a popup with the same choice ("Original" /
  "Don't intervene"), always in sync with the player button.

## How it works

In short: the extension intercepts the `/youtubei/v1/player` response (XHR,
fetch, and the embedded `ytInitialPlayerResponse`) and strips out every
dubbed audio track, leaving the player only the original — because the player
picks a track by interface language and ignores the server's "default" flags.
See [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md) for the full breakdown.

## Limitations

- On the first (hard) load of a dubbed video, the player may briefly
  re-initialize (~1-2s) — that's part of the fix, not a bug.
- Only works on `*.youtube.com`.
- YouTube occasionally changes the `/player` response format — if the fix
  stops working, see [`docs/HOW_IT_WORKS.md`](docs/HOW_IT_WORKS.md).
- Requires Chromium 111+ (uses a content script with `"world": "MAIN"`).

## Privacy

The extension **collects and sends no data**. All processing happens locally
in the browser. Permissions used: `storage` (to remember the selected mode)
and access to `*.youtube.com` (to intercept the player response).

## Debugging

`inject.js` has a `var DEBUG = false;` flag near the top. Set it to `true` to
expose `window.__undubDbg`, an object with counters for each hook/branch
(`calls`, `mode`, `afFrom`/`afTo`, `tracksFrom`/`tracksTo`, `reinit`, ...) —
useful if YouTube changes its response format and the fix needs updating.

## License

[GPL-3.0-or-later](LICENSE)
