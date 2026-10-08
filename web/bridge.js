(function () {
  var CFG_KEY = 'deskline.connection';
  var KINDS = ['vulns', 'tasks', 'followups'];
  var EMPTY = function () { return { version: 1, companies: [], vulns: [], tasks: [], followups: [] }; };
  var isQuick = /quick\.html/.test(location.pathname);
  var bc = null;
  try { bc = new BroadcastChannel('deskline'); } catch (e) { bc = null; }
  var listeners = [];
  var cache = EMPTY(), sha = null, lastSync = 0, dirty = false, saving = false, timer = null, pill = null;

  document.body.classList.add('web');

  function normalize(d) {
    var b = EMPTY();
    if (!d || typeof d !== 'object') return b;
    ['companies'].concat(KINDS).forEach(function (k) { b[k] = Array.isArray(d[k]) ? d[k] : []; });
    return b;
  }
  function getCfg() { try { return JSON.parse(localStorage.getItem(CFG_KEY)); } catch (e) { return null; } }
  function setCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c)); }
  function enc(str) {
    var b = new TextEncoder().encode(str), s = '';
    for (var i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
    return btoa(s);
  }
  function dec(b64) {
    var bin = atob(b64.replace(/\s/g, '')), b = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(b);
  }

  function gh(method, path, body, cfg, accept) {
    cfg = cfg || getCfg();
    var headers = { Accept: accept || 'application/vnd.github+json', Authorization: 'Bearer ' + cfg.token, 'X-GitHub-Api-Version': '2022-11-28' };
    if (body) headers['Content-Type'] = 'application/json';
    return fetch('https://api.github.com' + path, { method: method, cache: 'no-store', headers: headers, body: body ? JSON.stringify(body) : undefined });
  }
  function filePath(cfg) {
    return '/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + encodeURIComponent(cfg.path || 'deskline.json');
  }
  function fail(res, what) {
    var msg = res.status === 401 ? 'GitHub rejected the token. Create a new one and reconnect.' :
      res.status === 403 ? 'GitHub refused the request. Check the token permissions or the rate limit.' :
      res.status === 404 ? 'Repository or file not found. Check the names and the token access.' :
      what + ' failed with status ' + res.status + '.';
    var e = new Error(msg);
    e.status = res.status;
    return e;
  }

  function getRemote(cfg) {
    cfg = cfg || getCfg();
    return gh('GET', filePath(cfg), null, cfg).then(function (res) {
      if (res.status === 404) return { data: EMPTY(), sha: null, missing: true };
      if (!res.ok) throw fail(res, 'Loading');
      return res.json().then(function (j) {
        if (j.content) return { data: normalize(JSON.parse(dec(j.content))), sha: j.sha };
        return gh('GET', filePath(cfg), null, cfg, 'application/vnd.github.raw+json').then(function (r2) {
          if (!r2.ok) throw fail(r2, 'Loading');
          return r2.text().then(function (t) { return { data: normalize(JSON.parse(t)), sha: j.sha }; });
        });
      });
    });
  }
  function putRemote(data, baseSha, cfg) {
    cfg = cfg || getCfg();
    var body = { message: 'Deskline update', content: enc(JSON.stringify(data, null, 2)) };
    if (baseSha) body.sha = baseSha;
    return gh('PUT', filePath(cfg), body, cfg).then(function (res) {
      if (res.status === 409 || res.status === 422) { var e = new Error('conflict'); e.conflict = true; throw e; }
      if (!res.ok) throw fail(res, 'Saving');
      return res.json().then(function (j) { return j.content.sha; });
    });
  }

  function setStatus(kind, msg) {
    if (isQuick) return;
    if (!pill) { pill = document.createElement('div'); pill.className = 'dl-pill'; document.body.appendChild(pill); }
    pill.dataset.kind = kind;
    pill.textContent = kind === 'saving' ? 'Saving…' : kind === 'saved' ? 'Saved to GitHub' : 'Not saved yet, retrying. ' + (msg || '');
  }
  function emit(d) { listeners.forEach(function (cb) { cb(d); }); }
  function share(d) { if (bc) bc.postMessage({ data: d, sha: sha }); }

  function merge(local, remote) {
    var out = normalize(local);
    ['companies'].concat(KINDS).forEach(function (k) {
      var have = {};
      out[k].forEach(function (x) { have[x.id] = true; });
      remote[k].forEach(function (x) { if (!have[x.id] && x.created && x.created > lastSync) out[k].push(x); });
    });
    return out;
  }

  function attemptPut(snap) {
    return putRemote(snap, sha).then(function (s) { sha = s; share(snap); }, function (e) {
      if (!e.conflict) throw e;
      return getRemote().then(function (r) {
        var merged = merge(snap, r.data);
        return putRemote(merged, r.sha).then(function (s) { sha = s; cache = merged; share(merged); emit(merged); });
      });
    });
  }
  function flush() {
    timer = null;
    if (saving) { timer = setTimeout(flush, 400); return; }
    if (!dirty) return;
    saving = true;
    dirty = false;
    attemptPut(cache).then(function () {
      lastSync = Date.now();
      saving = false;
      if (dirty) { setStatus('saving'); timer = setTimeout(flush, 300); } else setStatus('saved');
    }).catch(function (e) {
      saving = false;
      dirty = true;
      setStatus('error', e.message);
      timer = setTimeout(flush, 8000);
    });
  }
  function save(d) {
    cache = normalize(d);
    dirty = true;
    setStatus('saving');
    clearTimeout(timer);
    timer = setTimeout(flush, 700);
    return Promise.resolve(true);
  }
  function add(type, item) {
    if (KINDS.indexOf(type) < 0 || !item) return Promise.resolve(false);
    setStatus('saving');
    function attempt(n) {
      return getRemote().then(function (r) {
        r.data[type].push(item);
        return putRemote(r.data, r.sha).then(function (s) {
          sha = s; cache = r.data; lastSync = Date.now();
          share(r.data); emit(r.data); setStatus('saved');
          return true;
        }, function (e) {
          if (e.conflict && n < 2) return attempt(n + 1);
          throw e;
        });
      });
    }
    return attempt(0).catch(function (e) { setStatus('error', e.message); throw e; });
  }

  if (bc) {
    bc.onmessage = function (e) {
      var m = e.data;
      if (!m || !m.data) return;
      var incoming = normalize(m.data);
      cache = dirty ? merge(cache, incoming) : incoming;
      sha = m.sha;
      emit(cache);
    };
  }
  function poll() {
    if (saving || dirty || document.hidden || !getCfg()) return;
    getRemote().then(function (r) {
      if (r.sha !== sha && !dirty && !saving) { sha = r.sha; cache = r.data; lastSync = Date.now(); emit(cache); }
    }).catch(function () {});
  }
  setInterval(poll, 45000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });

  function overlay(html) {
    var o = document.createElement('div');
    o.className = 'dl-overlay';
    o.innerHTML = '<div class="dl-box">' + html + '</div>';
    document.body.appendChild(o);
    return o;
  }
  function testConnection(cfg) {
    return gh('GET', '/repos/' + cfg.owner + '/' + cfg.repo, null, cfg).then(function (res) {
      if (res.status === 401) throw new Error('GitHub rejected that token.');
      if (res.status === 404) throw new Error('Repository not found. Check the names, and that the token can access it.');
      if (!res.ok) throw fail(res, 'Connecting');
      return getRemote(cfg);
    }).then(function (r) {
      if (r.missing) return putRemote(EMPTY(), null, cfg);
    });
  }
  function setup() {
    return new Promise(function (resolve) {
      var o = overlay(
        '<h2>Connect to GitHub</h2>' +
        '<p class="dl-p">Deskline saves your data as one JSON file in a private GitHub repository that only you can open.</p>' +
        '<ol class="dl-steps"><li>Create a <b>private</b> repository, for example <b>deskline_data</b>, with a README so it is not empty.</li>' +
        '<li>On GitHub open Settings, Developer settings, Personal access tokens, Fine grained tokens, Generate new token.</li>' +
        '<li>Set Repository access to <b>Only select repositories</b> and choose that repository.</li>' +
        '<li>Under Repository permissions set <b>Contents</b> to <b>Read and write</b>.</li></ol>' +
        '<label>GitHub username<input type="text" id="dl-owner" autocomplete="off" spellcheck="false"></label>' +
        '<label>Repository name<input type="text" id="dl-repo" value="deskline_data" autocomplete="off" spellcheck="false"></label>' +
        '<label>Token<input type="password" id="dl-token" autocomplete="off" spellcheck="false"></label>' +
        '<div class="dl-err" id="dl-err"></div><button class="btn primary" id="dl-go">Connect</button>' +
        '<p class="dl-note">The token stays in this browser only. It can reach just the one repository.</p>');
      var go = o.querySelector('#dl-go'), err = o.querySelector('#dl-err');
      function submit() {
        var cfg = { owner: o.querySelector('#dl-owner').value.trim(), repo: o.querySelector('#dl-repo').value.trim(), token: o.querySelector('#dl-token').value.trim(), path: 'deskline.json' };
        if (!cfg.owner || !cfg.repo || !cfg.token) { err.textContent = 'Fill in all three fields.'; return; }
        err.textContent = '';
        go.disabled = true;
        go.textContent = 'Connecting…';
        testConnection(cfg).then(function () {
          setCfg(cfg);
          o.remove();
          resolve(cfg);
        }).catch(function (e) {
          err.textContent = e.message || 'Could not connect.';
          go.disabled = false;
          go.textContent = 'Connect';
        });
      }
      go.addEventListener('click', submit);
      o.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      o.querySelector('#dl-owner').focus();
    });
  }
  function problem(msg) {
    return new Promise(function (resolve) {
      var o = overlay('<h2>Could not reach your data</h2><p class="dl-p" id="dl-msg"></p><div class="dl-row"><button class="btn primary" id="dl-retry">Try again</button><button class="btn" id="dl-reset">Change connection</button></div>');
      o.querySelector('#dl-msg').textContent = msg;
      o.querySelector('#dl-retry').addEventListener('click', function () { o.remove(); resolve(); });
      o.querySelector('#dl-reset').addEventListener('click', function () { localStorage.removeItem(CFG_KEY); o.remove(); resolve(); });
    });
  }
  function load() {
    var cfg = getCfg();
    var ready = cfg ? Promise.resolve(cfg) : setup();
    return ready.then(function () { return getRemote(); }).then(function (r) {
      sha = r.sha; cache = r.data; lastSync = Date.now();
      setStatus('saved');
      return cache;
    }).catch(function (e) {
      return problem(e.message || 'Something went wrong.').then(load);
    });
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(cache, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'deskline_backup_' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    return Promise.resolve(true);
  }
  function importData() {
    return new Promise(function (resolve) {
      var inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = 'application/json,.json';
      inp.addEventListener('cancel', function () { resolve(null); });
      inp.addEventListener('change', function () {
        var f = inp.files && inp.files[0];
        if (!f) return resolve(null);
        f.text().then(function (t) {
          var next = normalize(JSON.parse(t));
          if (!confirm('Replace current data with this backup? This overwrites everything in Deskline.')) return resolve(null);
          cache = next;
          dirty = true;
          setStatus('saving');
          clearTimeout(timer);
          timer = setTimeout(flush, 300);
          resolve(cache);
        }).catch(function () { alert('That file is not a valid Deskline backup.'); resolve(null); });
      });
      inp.click();
    });
  }
  function resizeQuick(h) {
    try { window.resizeTo(500 + (window.outerWidth - window.innerWidth), Math.round(h) + (window.outerHeight - window.innerHeight)); } catch (e) {}
    return Promise.resolve();
  }

  window.deskline = {
    platform: 'web',
    web: true,
    load: load,
    save: save,
    add: add,
    exportData: exportData,
    importData: importData,
    hideQuick: function () { window.close(); return Promise.resolve(); },
    resizeQuick: resizeQuick,
    openQuick: function () { window.open('quick.html', 'deskline_quick', 'popup=yes,width=500,height=290'); },
    disconnect: function () { localStorage.removeItem(CFG_KEY); location.reload(); },
    onChanged: function (cb) { listeners.push(cb); },
    onQuickShow: function () {}
  };
})();
