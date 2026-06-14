# How it works

## Root cause

YouTube rolled out automatic AI dubbing: for many videos the server adds
extra audio tracks to the `/youtubei/v1/player` response (a dub matching the
user's interface language).

You'd expect track selection to be controlled by these response fields:

- `streamingData.adaptiveFormats[].audioTrack.audioIsDefault`
- `captions.playerCaptionsTracklistRenderer.defaultAudioTrackIndex`

**It isn't.** The player picks the active audio track **client-side**, by
matching the track's language to the account's interface language (`hl=ru` →
the Russian track is picked), and **ignores both of these fields**. Verified
live via `movie_player`: even with both flags pointing at the original track
(`en.4`), the player still played the Russian dub (`ru.3`).

The player's own track switch (`movie_player.setAudioTrack(...)`) is also
broken on these videos: the call returns `true`, but the active track doesn't
change, and the next reload picks the dub by interface language again.

Also: `audioTrack.isAutoDubbed` is useless for finding the original — it's
`false` on every track, including the original.

## The fix: strip, not flags

Since the player ignores the "default" flags and picks a track from the list
itself, the only reliable approach is to **leave it no choice**: strip every
track except the original from the `/player` response before the player
reads the list.

The original track is identified language-independently, via the `xtags`
field (base64/protobuf), which decodes to a string containing
`acont=...original` for the original and `acont=...dubbed` for dubbed tracks.

In `original` mode, `inject.js`:

1. In `streamingData.adaptiveFormats`, keeps video formats (no `audioTrack`)
   and only the audio format whose `xtags` indicates `acont=original`; sets
   `audioIsDefault = true` on the remaining audio formats (for completeness,
   even though the player doesn't require it).
2. In `captions.playerCaptionsTracklistRenderer.audioTracks`, keeps only the
   entry with the same `audioTrackId` and sets `defaultAudioTrackIndex = 0`.

After this, the player has nothing else to pick from — it initializes with
the original track only.

## Two delivery paths for `/player`, two interceptors

1. **SPA navigation / `loadVideoById`.** YouTube requests `/player` via
   `XMLHttpRequest` with `responseType: "text"`. `inject.js` shadows the
   `responseText`/`response` descriptors on the XHR instance so the body is
   run through `processResponse` when read (cached — the rewrite happens once,
   lazily, on first read after `readyState === 4`). This path is in time, so
   SPA navigations to dubbed videos open with the original audio right away.

   There's also a `window.fetch` interceptor (a safety net for clients that
   use `fetch` instead of XHR) and a branch for `responseType: "json"` (not
   used by YouTube, but cheap and idempotent, so kept as insurance).

2. **Hard page load.** Here the player reads the track list from the inline
   `var ytInitialPlayerResponse = {...}` script, which runs **before** our
   `document_start` script in `world: "MAIN"`. The strip does mutate the
   object in place (it's created under the same reference the player reads
   later from `base.js`), but the player may already have picked the dubbed
   track from the original data before our mutation landed.

   The fix is a `setInterval(..., 500)` watcher: it checks whether the player
   is currently on a dubbed track while the (already-fixed)
   `getPlayerResponse()` has an original available, and calls
   `movie_player.loadVideoById({videoId, startSeconds})` once. This forces a
   fresh `/player` XHR, which our interceptor processes in time — and the
   player rebuilds its track list from the stripped response. `reinitDone`
   (keyed by `videoId`) prevents repeat calls.

## "off" mode

`processResponse` returns `false` immediately if `data-undub-mode === "off"`
— the extension doesn't touch the `/player` response at all, and behavior is
identical to stock YouTube. The mode is stored in `chrome.storage.local` and
kept in sync between the popup, the ORIG/DUB player button, and the
`data-undub-mode` attribute on `<html>` (which is how the MAIN-world script
reads the current mode without access to `chrome.storage`).

## If YouTube changes the response format

If the fix stops working, check in DevTools (Network → the
`/youtubei/v1/player` response) that these are still present:

- `streamingData.adaptiveFormats[].audioTrack.id` and `.audioTrack.audioIsDefault`;
- `streamingData.adaptiveFormats[].xtags` — should still decode (base64url) to
  a string containing `acont...original` / `acont...dubbed`;
- `captions.playerCaptionsTracklistRenderer.audioTracks` and
  `.defaultAudioTrackIndex`.

Set `DEBUG = true` in `inject.js` to get `window.__undubDbg`, with counters
for each branch (`noAf`, `noAudio`, `noOriginal`, `afFrom`/`afTo`,
`tracksFrom`/`tracksTo`, `reinit`, etc.) to help pinpoint where things stopped
matching.
