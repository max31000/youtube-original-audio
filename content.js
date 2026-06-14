// SPDX-License-Identifier: GPL-3.0-or-later
/*
 * content.js — runs in the ISOLATED world at document_start.
 *
 * Bridges chrome.storage <-> the page. It owns persistence and reloads, because
 * the MAIN-world inject.js can't touch chrome.storage. Communication happens via
 * the shared DOM (an attribute on <html> and CustomEvents on window).
 */
(function () {
  'use strict';

  var ATTR = 'data-undub-mode';
  var DEFAULT_MODE = 'original';

  // Set an optimistic default synchronously so the very first /player request
  // (which fires before async storage resolves) is already handled.
  try { document.documentElement.setAttribute(ATTR, DEFAULT_MODE); } catch (e) {}

  function applyMode(mode) {
    try { document.documentElement.setAttribute(ATTR, mode || DEFAULT_MODE); } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('undub:mode-changed')); } catch (e) {}
  }

  // Load the real saved mode and apply it.
  chrome.storage.local.get({ mode: DEFAULT_MODE }, function (s) {
    applyMode(s && s.mode);
  });

  // The in-player toggle (fired from inject.js) — persist, then hard reload so
  // the player re-reads the response and re-picks the audio track.
  window.addEventListener('undub:set-mode', function (ev) {
    var mode = (ev && ev.detail && ev.detail.mode) || DEFAULT_MODE;
    chrome.storage.local.set({ mode: mode }, function () {
      applyMode(mode);
      location.reload();
    });
  });

  // Popup changes the setting -> reflect into the page (no auto-reload here; the
  // popup decides whether to reload the active tab).
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area === 'local' && changes.mode) {
      applyMode(changes.mode.newValue);
    }
  });
})();
