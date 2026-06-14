// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * inject.js — runs in the page's MAIN world at document_start.
 *
 * Root cause of the bug this fixes:
 *   The YouTube player picks its audio track CLIENT-SIDE by matching the
 *   account/interface language (e.g. a Russian interface selects the Russian
 *   auto-dub track). It IGNORES the server-provided default flags
 *   (`audioTrack.audioIsDefault`, `captions...defaultAudioTrackIndex`) — setting
 *   those on the original track has no effect. The in-player switch
 *   (movie_player.setAudioTrack) is also non-functional on these videos: it
 *   returns true but never changes the active track, and every reload re-applies
 *   the same language-based pick.
 *
 * What we do: intercept the /youtubei/v1/player response (XHR, fetch, and the
 *   embedded window.ytInitialPlayerResponse) and STRIP every non-original audio
 *   track from `streamingData.adaptiveFormats` and
 *   `captions.playerCaptionsTracklistRenderer.audioTracks`, leaving the player
 *   nothing to pick but the original (identified by `acont=original` in its
 *   xtags, which is language-independent).
 *
 *   On a hard page load the inline `ytInitialPlayerResponse` is read by the
 *   player before this document_start script can strip it in time, so a 500ms
 *   watcher detects "stuck on a dubbed track while an original exists" and
 *   triggers one `loadVideoById` to re-fetch /player, which we do strip in time.
 */
(function () {
  'use strict';

  var ATTR = 'data-undub-mode'; // "original" | "off", set by content.js from storage

  // Set to true to enable window.__undubDbg (counters for each hook/branch).
  // Leave false for normal use — no extra object is created and no counters
  // are written, so processResponse and the interceptors run at full speed.
  var DEBUG = false;

  function getMode() {
    try {
      return document.documentElement.getAttribute(ATTR) || 'original';
    } catch (e) {
      return 'original';
    }
  }

  function decodeXtags(xtags) {
    if (!xtags) return '';
    try {
      return atob(String(xtags).replace(/-/g, '+').replace(/_/g, '/'));
    } catch (e) {
      return '';
    }
  }

  // The original track's xtags protobuf decodes to a blob containing
  // "acont" ... "original". Dubbed tracks contain "acont" ... "dubbed".
  function isOriginalFormat(fmt) {
    return /acont.{0,6}original/.test(decodeXtags(fmt && fmt.xtags));
  }

  // Debug surface — readable as plain data (window.__undubDbg). Only created
  // when DEBUG is true; otherwise this is null and __undubDbg never exists.
  var DBG = DEBUG ? (window.__undubDbg = {
    calls: 0, mode: '', noAf: 0, noAudio: 0, noOriginal: 0, changedTotal: 0,
    lastChanged: -1, existingSeen: 0, setterFired: 0, xhrHits: 0, xhrJson: 0,
    lastSource: '', afFrom: 0, afTo: 0, tracksFrom: 0, tracksTo: 0, reinit: 0
  }) : null;

  // Mutate a parsed player-response object in place. Returns true if changed.
  //
  // Why we *remove* dubbed tracks instead of just flipping default flags:
  // the player ignores `audioIsDefault` / `defaultAudioTrackIndex` and selects
  // the audio track that matches the UI language (ru) on the client side. The
  // only reliable way to get the original is to leave the player nothing else to
  // pick — so in "original" mode we strip every non-original audio track from
  // both the format list and the audio-track list.
  function processResponse(obj, source) {
    if (DBG) { DBG.calls++; DBG.mode = getMode(); DBG.lastSource = source || ''; }
    if (getMode() === 'off') return false;
    var af;
    try {
      af = obj && obj.streamingData && obj.streamingData.adaptiveFormats;
    } catch (e) {
      return false;
    }
    if (!Array.isArray(af)) { if (DBG) DBG.noAf++; return false; }

    var audio = af.filter(function (f) { return f && f.audioTrack; });
    if (!audio.length) { if (DBG) DBG.noAudio++; return false; }

    // Identify the original track (acont=original in its xtags).
    var origFmt = audio.find(isOriginalFormat);
    if (!origFmt) { if (DBG) DBG.noOriginal++; return false; }
    var oid = origFmt.audioTrack.id; // e.g. "en.4"

    var changed = 0;

    // (a) Keep video formats (no audioTrack) and the original audio only.
    var beforeAf = af.length;
    obj.streamingData.adaptiveFormats = af.filter(function (f) {
      return !f.audioTrack || f.audioTrack.id === oid;
    });
    obj.streamingData.adaptiveFormats.forEach(function (f) {
      if (f.audioTrack) f.audioTrack.audioIsDefault = true;
    });
    if (obj.streamingData.adaptiveFormats.length !== beforeAf) changed++;
    if (DBG) { DBG.afFrom = beforeAf; DBG.afTo = obj.streamingData.adaptiveFormats.length; }

    // (b) Collapse the audio-track list to just the original.
    try {
      var tl = obj.captions && obj.captions.playerCaptionsTracklistRenderer;
      if (tl && Array.isArray(tl.audioTracks)) {
        var keep = tl.audioTracks.find(function (a) { return a && a.audioTrackId === oid; });
        if (DBG) DBG.tracksFrom = tl.audioTracks.length;
        if (keep) {
          tl.audioTracks = [keep];
          tl.defaultAudioTrackIndex = 0;
          changed++;
        }
        if (DBG) DBG.tracksTo = tl.audioTracks.length;
      }
    } catch (e) {}

    if (DBG) { DBG.changedTotal += changed; DBG.lastChanged = changed; }
    return changed > 0;
  }

  // Cheap pre-check before paying for JSON.parse on every player response.
  function rewriteJSONString(text) {
    if (typeof text !== 'string') return text;
    if (text.indexOf('adaptiveFormats') === -1 || text.indexOf('audioTrack') === -1) return text;
    if (DBG) DBG.xhrHits++;
    try {
      var obj = JSON.parse(text);
      if (processResponse(obj, 'network')) return JSON.stringify(obj);
    } catch (e) {}
    return text;
  }

  function isPlayerUrl(url) {
    return typeof url === 'string' &&
      url.indexOf('/youtubei/v1/player') !== -1 &&
      url.indexOf('heartbeat') === -1;
  }

  /* ---------------- XHR (this is what YouTube actually uses) ---------------- */
  var XP = XMLHttpRequest.prototype;
  var realText = Object.getOwnPropertyDescriptor(XP, 'responseText');
  var realResp = Object.getOwnPropertyDescriptor(XP, 'response');
  var origOpen = XP.open;
  var origSend = XP.send;

  XP.open = function (method, url) {
    try { this.__undubPlayer = isPlayerUrl(url); } catch (e) { this.__undubPlayer = false; }
    return origOpen.apply(this, arguments);
  };

  XP.send = function () {
    if (this.__undubPlayer && realText && realText.get) {
      var xhr = this;
      var cache; // computed lazily on first read — order-independent w.r.t. YT handlers
      var modify = function (raw) {
        if (cache !== undefined) return cache;
        if (xhr.readyState !== 4) return raw; // not final yet, don't cache
        cache = rewriteJSONString(raw);
        return cache;
      };
      try {
        Object.defineProperty(xhr, 'responseText', {
          configurable: true,
          get: function () { return modify(realText.get.call(xhr)); }
        });
        Object.defineProperty(xhr, 'response', {
          configurable: true,
          get: function () {
            var r = realResp.get.call(xhr);
            // String path covers responseType:''/'text', which is what
            // YouTube's /player request actually uses.
            if (typeof r === 'string') return modify(r);
            // Fallback for clients that use responseType=json: responseType:'json'
            // returns a parsed object, so we mutate it in place (same reference
            // the player reads). Rarely fires on YouTube itself, but processing
            // is idempotent and cheap, so keep it as insurance.
            if (r && typeof r === 'object' && xhr.readyState === 4) {
              if (DBG) DBG.xhrJson = (DBG.xhrJson || 0) + 1;
              try { processResponse(r, 'xhr-json'); } catch (e) {}
            }
            return r;
          }
        });
      } catch (e) {}
    }
    return origSend.apply(this, arguments);
  };

  /* ---------------- fetch (safety net for other clients) ---------------- */
  var origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input) {
      var url = (typeof input === 'string') ? input : (input && input.url) || '';
      var p = origFetch.apply(this, arguments);
      if (!isPlayerUrl(url)) return p;
      return p.then(function (res) {
        return res.clone().text().then(function (text) {
          var fixed = rewriteJSONString(text);
          if (fixed === text) return res;
          return new Response(fixed, {
            status: res.status,
            statusText: res.statusText,
            headers: res.headers
          });
        }).catch(function () { return res; });
      });
    };
  }

  /* ---------------- Embedded first-load response ---------------- */
  // On a hard page load the player reads window.ytInitialPlayerResponse straight
  // from the HTML (no network request). Two cases must be covered:
  //   1) An early inline script already assigned it BEFORE this script ran — we
  //      must process the existing value in place (same object reference the
  //      player reads later, since base.js loads much later).
  //   2) It gets assigned AFTER us — the setter catches it.
  function processSafe(v, source) {
    try { if (v && typeof v === 'object') processResponse(v, source); } catch (e) {}
  }
  try {
    var _ipr;
    var preDesc = Object.getOwnPropertyDescriptor(window, 'ytInitialPlayerResponse');
    if (preDesc && 'value' in preDesc) {
      if (DBG) DBG.existingSeen++;
      _ipr = preDesc.value;
      processSafe(_ipr, 'embedded-existing'); // case 1: mutate the already-present object in place
    }
    Object.defineProperty(window, 'ytInitialPlayerResponse', {
      configurable: true,
      get: function () { return _ipr; },
      set: function (v) { if (DBG) DBG.setterFired++; processSafe(v, 'embedded-setter'); _ipr = v; } // case 2
    });
  } catch (e) {}

  // Hard-load fallback.
  // On the FIRST page load the player reads the audio-track list from the inline
  // `var ytInitialPlayerResponse = {...}` script, which executes before this
  // content script — so our strip lands too late and the player still picks the
  // dubbed track. (SPA navigations fetch /player via XHR, which we DO strip in
  // time, so they're already correct.) The reliable recovery is to re-init the
  // player once via loadVideoById: that triggers a fresh /player XHR, which our
  // hook strips, so the player rebuilds its list with the original only.
  function findOriginalId(pr) {
    try {
      var af = pr.streamingData.adaptiveFormats.filter(function (f) { return f && f.audioTrack; });
      var o = af.find(isOriginalFormat);
      return o ? o.audioTrack.id : null;
    } catch (e) { return null; }
  }

  var reinitDone = {}; // videoId -> handled (prevents loops)
  function maybeReinit() {
    if (getMode() === 'off') return;
    var p = document.getElementById('movie_player');
    if (!p || !p.getAudioTrack || !p.getPlayerResponse || !p.getVideoData || !p.getAvailableAudioTracks) return;
    var vid;
    try { vid = p.getVideoData().video_id; } catch (e) { return; }
    if (!vid || reinitDone[vid]) return;

    var pr, cur, tracks;
    try {
      pr = p.getPlayerResponse();
      cur = p.getAudioTrack().TI.id;
      tracks = p.getAvailableAudioTracks();
    } catch (e) { return; } // player not ready yet — try again next tick

    if (!tracks || tracks.length <= 1) { reinitDone[vid] = true; return; } // nothing to switch
    var oid = findOriginalId(pr);
    if (!oid) { reinitDone[vid] = true; return; }   // not an auto-dubbed video
    if (cur === oid) { reinitDone[vid] = true; return; } // already on the original

    // On a dubbed track with an original available → re-init through the strip.
    reinitDone[vid] = true; // mark before acting so we never loop
    if (DBG) DBG.reinit = (DBG.reinit || 0) + 1;
    try {
      var t = p.getCurrentTime() || 0;
      var wasPaused = p.getPlayerState && p.getPlayerState() === 2;
      p.loadVideoById({ videoId: vid, startSeconds: t });
      if (wasPaused) setTimeout(function () { try { p.pauseVideo(); } catch (e) {} }, 1500);
    } catch (e) {}
  }
  setInterval(maybeReinit, 500);

  /* ---------------- In-player toggle button ---------------- */
  // The native audio-track menu is broken on these videos, so we give a working
  // switch: it flips the mode and reloads (the only reliable way to re-pick).
  var BTN_ID = 'undub-toggle-btn';

  function setMode(mode) {
    // Ask content.js (ISOLATED world) to persist + reload.
    window.dispatchEvent(new CustomEvent('undub:set-mode', { detail: { mode: mode } }));
  }

  function renderButton(btn) {
    var on = getMode() !== 'off';
    btn.textContent = on ? 'ORIG' : 'DUB';
    btn.style.color = on ? '#3ea6ff' : '#aaa';
    btn.title = on
      ? 'Звук: оригинал (авто-дубляж отключён). Нажми, чтобы вернуть дубляж.'
      : 'Звук: как у YouTube (дубляж). Нажми, чтобы включить оригинал.';
  }

  function addButton() {
    var controls = document.querySelector('.ytp-right-controls');
    if (!controls || document.getElementById(BTN_ID)) return;
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.className = 'ytp-button';
    btn.style.cssText =
      'width:auto;min-width:46px;padding:0 8px;font-size:12px;font-weight:700;' +
      'line-height:48px;vertical-align:top;opacity:.9;';
    renderButton(btn);
    btn.addEventListener('click', function () {
      var next = getMode() === 'off' ? 'original' : 'off';
      // Switching to "off" disables the whole fix (dubbed-by-default again) —
      // confirm so a stray click doesn't silently turn it off.
      if (next === 'off' && !window.confirm(
        'Отключить возврат оригинальной аудиодорожки?\n\n' +
        'Видео с авто-дубляжом снова будут открываться с дубляжом ' +
        '(поведение YouTube по умолчанию). Включить обратно можно этой же кнопкой.'
      )) return;
      setMode(next);
    });
    controls.insertBefore(btn, controls.firstChild);
  }

  // Player controls come and go across SPA navigations — keep re-attaching.
  var obs = new MutationObserver(function () { addButton(); });
  function start() {
    obs.observe(document.documentElement, { childList: true, subtree: true });
    addButton();
  }
  if (document.body) start();
  else document.addEventListener('DOMContentLoaded', start);

  // Live mode changes from the popup: refresh the button label.
  window.addEventListener('undub:mode-changed', function () {
    var btn = document.getElementById(BTN_ID);
    if (btn) renderButton(btn);
  });
})();
