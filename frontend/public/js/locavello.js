/*!
 * locavello.js — Mode B serving snippet.
 *
 *   <script src="https://locavello.forjio.com/js/locavello.js"
 *           data-project="prj_..." defer></script>
 *
 * Translates the page's visible text using the project's latest
 * PUBLISHED release, adds a small locale switcher, and remembers the
 * visitor's choice. FAIL-OPEN BY DESIGN: any error — network, missing
 * release, bad JSON — leaves the page exactly as the server rendered
 * it, in its source language. Never a blank page, never a spinner.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  if (!script) return;
  var projectId = script.getAttribute('data-project');
  if (!projectId) return;
  var apiBase = script.getAttribute('data-api') || 'https://locavello.forjio.com';
  var STORAGE_KEY = 'locavello:locale:' + projectId;

  function chosenLocale() {
    try {
      var q = new URLSearchParams(location.search).get('lv_locale');
      if (q) return q;
      return localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function normalize(t) {
    return t.replace(/\s+/g, ' ').trim();
  }

  var SKIP = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, TEXTAREA: 1, svg: 1 };

  function translateDom(catalog, root) {
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentNode;
        if (!p || SKIP[p.nodeName]) return NodeFilter.FILTER_REJECT;
        if (p.closest && p.closest('[data-locavello-skip],[data-locavello-widget]')) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var node;
    var nodes = [];
    while ((node = walker.nextNode())) nodes.push(node);
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      var key = normalize(n.nodeValue || '');
      if (!key) continue;
      var t = catalog[key];
      if (t && n.nodeValue !== null) {
        // Preserve the original's surrounding whitespace.
        n.nodeValue = n.nodeValue.replace(key.length ? /\S[\s\S]*\S|\S/ : /^/, t);
      }
    }
    // Visible copy carried in attributes.
    var attrs = ['placeholder', 'title', 'alt', 'aria-label'];
    for (var a = 0; a < attrs.length; a++) {
      var attr = attrs[a];
      var els = (root || document).querySelectorAll('[' + attr + ']');
      for (var e = 0; e < els.length; e++) {
        var v = normalize(els[e].getAttribute(attr) || '');
        if (v && catalog[v]) els[e].setAttribute(attr, catalog[v]);
      }
    }
  }

  function renderSwitcher(locales, active, sourceLocale) {
    if (document.querySelector('[data-locavello-widget]')) return;
    var box = document.createElement('div');
    box.setAttribute('data-locavello-widget', '');
    box.style.cssText =
      'position:fixed;bottom:16px;right:16px;z-index:99999;background:#1c2333;color:#f5f7fa;' +
      'border:1px solid #39415a;border-radius:8px;padding:6px 10px;font:13px/1.4 system-ui,sans-serif;' +
      'display:flex;gap:8px;align-items:center;box-shadow:0 2px 12px rgba(0,0,0,.35)';
    var label = document.createElement('span');
    label.textContent = '🌐';
    box.appendChild(label);
    var all = [sourceLocale].concat(locales.filter(function (l) { return l !== sourceLocale; }));
    all.forEach(function (tag) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = tag;
      b.style.cssText =
        'background:none;border:none;cursor:pointer;color:' +
        (tag === active ? '#f59e0b' : '#f5f7fa') +
        ';font:inherit;padding:0 2px;text-decoration:' + (tag === active ? 'underline' : 'none');
      b.onclick = function () {
        try {
          localStorage.setItem(STORAGE_KEY, tag);
        } catch (e) { /* private mode */ }
        location.reload();
      };
      box.appendChild(b);
    });
    document.body.appendChild(box);
  }

  function boot() {
    var locale = chosenLocale();
    // Always fetch once (even with no chosen locale) to learn the
    // enabled locales for the switcher; use a locale that exists.
    var wanted = locale || (navigator.language || '').split('-')[0];
    fetch(apiBase + '/api/v1/public/projects/' + encodeURIComponent(projectId) + '/catalog?locale=' + encodeURIComponent(wanted || 'id'), { mode: 'cors' })
      .then(function (r) { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then(function (body) {
        var data = body && body.data;
        if (!data) return;
        var enabled = data.enabledLocales || [];
        var active = locale && enabled.indexOf(locale) !== -1 ? locale
          : locale === data.sourceLocale ? data.sourceLocale
          : !locale && enabled.indexOf(wanted) !== -1 ? wanted
          : data.sourceLocale;
        if (active !== data.sourceLocale && data.catalog) {
          translateDom(data.catalog);
          try { document.documentElement.lang = active; } catch (e) { /* readonly? never */ }
          // Light dynamic-content pass: re-translate on DOM additions.
          if (window.MutationObserver) {
            var pending = false;
            new MutationObserver(function () {
              if (pending) return;
              pending = true;
              setTimeout(function () {
                pending = false;
                try { translateDom(data.catalog); } catch (e) { /* fail open */ }
              }, 250);
            }).observe(document.body, { childList: true, subtree: true });
          }
        }
        renderSwitcher(enabled, active, data.sourceLocale);
      })
      .catch(function () { /* FAIL OPEN — leave the page untouched */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
