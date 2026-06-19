# Changelog

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.2] - 2026-06-19

### Fixed

- Restore the auto-reinitialize fallback that was silently dead on current
  YouTube player builds. It read the current audio track id via a hardcoded
  obfuscated property (`getAudioTrack().TI.id`); YouTube renamed that key, so
  the access threw and the fallback never ran, leaving hard-loaded pages stuck
  on the dubbed track. The current track id is now resolved by matching against
  the known track ids from the player response, independent of the property
  name.

## [1.0.1] - 2026-06-14

### Changed

- Translated the popup, in-player button, and documentation to English.

## [1.0.0] - 2026-06-14

### Added

- Intercept the `/youtubei/v1/player` response (XHR, fetch,
  `ytInitialPlayerResponse`) and strip dubbed audio tracks so the player
  always picks the original.
- Auto-reinitialize the player (`loadVideoById`) on hard load if it started
  on a dubbed track.
- **ORIG / DUB** button in the player controls, with a confirmation prompt
  when disabling the fix.
- Popup with an "Original" / "Don't intervene" mode switch, in sync with the
  player button.
- Debug mode (`DEBUG` in `inject.js`) exposing `window.__undubDbg`.

[1.0.2]: https://github.com/max31000/youtube-original-audio/releases/tag/v1.0.2
[1.0.1]: https://github.com/max31000/youtube-original-audio/releases/tag/v1.0.1
[1.0.0]: https://github.com/max31000/youtube-original-audio/releases/tag/v1.0.0
