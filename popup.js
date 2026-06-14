// SPDX-License-Identifier: GPL-3.0-or-later
'use strict';

var DEFAULT_MODE = 'original';

function highlight(mode) {
  document.getElementById('lbl-original').classList.toggle('active', mode === 'original');
  document.getElementById('lbl-off').classList.toggle('active', mode === 'off');
}

// Initialise UI from storage.
chrome.storage.local.get({ mode: DEFAULT_MODE }, function (s) {
  var mode = (s && s.mode) || DEFAULT_MODE;
  var input = document.querySelector('input[value="' + mode + '"]');
  if (input) input.checked = true;
  highlight(mode);
});

// Save on change and reload the active YouTube tab so the change takes effect.
document.querySelectorAll('input[name="mode"]').forEach(function (input) {
  input.addEventListener('change', function () {
    var mode = input.value;
    chrome.storage.local.set({ mode: mode }, function () {
      highlight(mode);
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var tab = tabs && tabs[0];
        if (tab && tab.id != null && /:\/\/[^/]*youtube\.com\//.test(tab.url || '')) {
          chrome.tabs.reload(tab.id);
        }
      });
    });
  });
});
