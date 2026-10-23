(function () {
  var D = DL;
  var esc = D.esc, today = D.today, addDays = D.addDays, diffDays = D.diffDays, relDue = D.relDue, fmtShort = D.fmtShort, fmtFull = D.fmtFull;
  var icon = D.icon, SEV = D.SEV, SEV_LABEL = D.SEV_LABEL;
  var api = window.deskline;

  document.body.classList.add(api.platform === 'darwin' ? 'mac' : api.platform === 'win32' ? 'win' : 'other');

  var S = {
    data: { companies: [], vulns: [], tasks: [], followups: [] },
    tab: 'dashboard', company: 'all', vf: 'open', showDone: false, weekOff: 0,
    draft: { title: '', co: null, due: '' }
  };
  var M = null;
  var SR = { rows: [], idx: -1 };
  var topSig = null;
  var $ = function (s) { return document.querySelector(s); };

  var PAL = ['#b283ff', '#6cc8ff', '#ffa05c', '#5ee08a', '#ff6fa0', '#ffd75e', '#7c8cff', '#c9a27a'];
  var SEVCOL = { critical: '#ff7468', high: '#ffa05c', medium: '#ffd75e', low: '#6cc8ff' };
  var TITLES = { dashboard: 'Dashboard', vulns: 'Vulnerabilities', slas: 'SLAs', tasks: 'Tasks', followups: 'Follow ups' };
  var KIND = { vulns: 'Vuln', tasks: 'Task', followups: 'Follow up' };
  var NEWLABEL = { vulns: 'Vulnerability added', tasks: 'Task added', followups: 'Follow up added', company: 'Company added' };

  function co(id) { return S.data.companies.find(function (c) { return c.id === id; }); }
  function coName(id) { var c = co(id); return c ? c.name : 'No company'; }
  function coColor(id) {
    var i = S.data.companies.findIndex(function (c) { return c.id === id; });
    return i < 0 ? '#8a8d9c' : PAL[i % PAL.length];
  }
  function coChip(id) {
    return '<span class="co"><i style="background:' + coColor(id) + '"></i>' + esc(coName(id)) + '</span>';
  }
  function inScope(x) { return S.company === 'all' || x.companyId === S.company; }
  function isOpen(v) { return v.status === 'open'; }
  function notDone(x) { return !x.done; }
  function hasAnyData() { return ['companies', 'vulns', 'tasks', 'followups'].some(function (k) { return S.data[k].length > 0; }); }

  function slaDays(v) {
    var c = co(v.companyId);
    return c && c.sla ? Number(c.sla[v.severity]) || 0 : 0;
  }
  function effDue(v) {
    if (v.dueOverride) return v.dueOverride;
    var d = slaDays(v);
    return d && v.discovered ? addDays(v.discovered, d) : '';
  }
  function vStatus(v) {
    if (v.status === 'fixed') return { k: 'fixed', t: 'Fixed' };
    if (v.status === 'accepted') return { k: 'accepted', t: 'Accepted risk' };
    var due = effDue(v);
    if (!due) return { k: 'nosla', t: 'No SLA' };
    var d = diffDays(due, today());
    if (d < 0) return { k: 'breached', t: 'Breached', d: d };
    if (d <= 3) return { k: 'soon', t: 'Due soon', d: d };
    return { k: 'ok', t: 'On track', d: d };
  }
  function isBreached(v) { return vStatus(v).k === 'breached'; }
  function sevChip(s) { return '<span class="chip sev-' + s + '">' + SEV_LABEL[s] + '</span>'; }
  function stChip(v) { var s = vStatus(v); return '<span class="chip st-' + s.k + '">' + s.t + '</span>'; }
  function vSort(a, b) {
    var ao = a.status === 'open' ? 0 : 1, bo = b.status === 'open' ? 0 : 1;
    if (ao !== bo) return ao - bo;
    var ad = effDue(a) || '9999', bd = effDue(b) || '9999';
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  }
  function dueSort(a, b) {
    var ad = a.due || '9999', bd = b.due || '9999';
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  }
  function scoped() {
    return {
      v: S.data.vulns.filter(inScope),
      t: S.data.tasks.filter(inScope),
      f: S.data.followups.filter(inScope)
    };
  }

  function persist() { api.save(S.data); render(); }
  function saveQuiet() { api.save(S.data); }

  var SHELL = '<div class="dragbar"></div><div class="shell"><header class="top" id="top"></header><div class="subnav" id="subnav"></div><main id="page"></main></div>';

  function render() {
    if (!$('#page')) { $('#app').innerHTML = SHELL; topSig = null; }
    var ae = document.activeElement;
    var keep = ae && ae.id && $('#page').contains(ae) ? { id: ae.id, s: ae.selectionStart, e: ae.selectionEnd } : null;
    var sig = [S.tab, S.company, S.data.companies.map(function (c) { return c.id + ':' + c.name; }).join('|')].join('~');
    if (sig !== topSig) { topSig = sig; $('#top').innerHTML = topHTML(); }
    $('#subnav').innerHTML = subnavHTML();
    var se = document.scrollingElement;
    var st = se ? se.scrollTop : 0;
    $('#page').innerHTML = pageHTML();
    if (se) se.scrollTop = st;
    if (keep) {
      var el = document.getElementById(keep.id);
      if (el) { el.focus(); try { el.setSelectionRange(keep.s, keep.e); } catch (err) {} }
    }
  }

  function go(tab) {
    S.tab = tab;
    S.draft = { title: '', co: null, due: '' };
    D.closePopover();
    render();
    window.scrollTo(0, 0);
  }

  function topHTML() {
    var opts = '<option value="all">All companies</option>' + S.data.companies.map(function (c) {
      return '<option value="' + c.id + '"' + (S.company === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var sel = S.tab === 'slas' ? '' : '<select class="pill" data-act="company" aria-label="Company filter">' + opts + '</select>';
    return '<button class="brand" data-act="menu" aria-label="Open the Deskline menu"><span class="mark">' + icon('check', 17) + '</span><span>Deskline</span></button>' +
      '<div class="search" id="search"><div class="field">' + icon('search', 17) + '<input type="text" id="q" placeholder="Search or add anything" autocomplete="off" spellcheck="false" aria-label="Search or add anything"></div><div class="search-pop" id="search-pop" hidden></div></div>' +
      '<div class="top-right">' + sel + '<button class="btn white" data-act="new" aria-label="Create something new">New</button></div>';
  }

  function subnavHTML() {
    if (S.tab === 'dashboard') return '';
    var sc = scoped();
    var openV = sc.v.filter(isOpen);
    var br = openV.filter(isBreached).length;
    var cnt = {
      vulns: br ? '<span class="cnt warn">' + br + '</span>' : (openV.length ? '<span class="cnt">' + openV.length + '</span>' : ''),
      tasks: sc.t.filter(notDone).length ? '<span class="cnt">' + sc.t.filter(notDone).length + '</span>' : '',
      followups: sc.f.filter(notDone).length ? '<span class="cnt">' + sc.f.filter(notDone).length + '</span>' : ''
    };
    return '<div class="seg" role="tablist">' + ['dashboard', 'vulns', 'slas', 'tasks', 'followups'].map(function (k) {
      return '<button role="tab" data-go="' + k + '" class="' + (S.tab === k ? 'on' : '') + '">' + TITLES[k] + (cnt[k] || '') + '</button>';
    }).join('') + '</div>';
  }

  function pageHTML() {
    if (S.tab === 'dashboard') return dashboardPage();
    if (S.tab === 'vulns') return vulnsPage();
    if (S.tab === 'slas') return slasPage();
    return listPage(S.tab);
  }

  function emptyState(h, p, btns) {
    return '<div class="empty"><h2>' + h + '</h2><p>' + p + '</p><div class="btns">' + btns + '</div></div>';
  }

  function checkRow(kind, x) {
    var late = !x.done && x.due && x.due < today();
    var who = kind === 'followups' && x.who ? '<span>With ' + esc(x.who) + '</span>' : '';
    return '<div class="row' + (x.done ? ' done' : '') + '" data-open="' + kind + ':' + x.id + '">' +
      '<button class="check' + (x.done ? ' on' : '') + '" data-toggle="' + kind + ':' + x.id + '" aria-label="Mark ' + (x.done ? 'not done' : 'done') + '">' + (x.done ? icon('tick', 13) : '') + '</button>' +
      '<div class="row-main"><div class="row-title">' + esc(x.title) + '</div><div class="row-sub">' + who + coChip(x.companyId) + '</div></div>' +
      '<span class="due' + (late ? ' late' : '') + '">' + (x.due ? relDue(x.due) : '') + '</span></div>';
  }

  function tile(go, label, n, cls, sub, vf) {
    return '<button class="tile" data-go="' + go + '"' + (vf ? ' data-vf="' + vf + '"' : '') + '><span class="t-label">' + label + '</span><span class="t-num ' + cls + '">' + n + '</span><span class="t-sub">' + sub + '</span></button>';
  }

  function dashboardPage() {
    var sc = scoped(), t = today();
    var openV = sc.v.filter(isOpen);
    var breached = openV.filter(isBreached);
    var openT = sc.t.filter(notDone);
    var openF = sc.f.filter(notDone);
    var late = function (x) { return x.due && x.due < t; };
    var odT = openT.filter(late).length, odF = openF.filter(late).length;
    var overdue = odT + odF;
    var banner = S.data.companies.length ? '' :
      '<div class="card banner"><p><b>Start with a company.</b> Add its SLA targets and Deskline works out every vulnerability due date for you.</p><div class="btns"><button class="btn white" data-act="newco">Add company</button>' +
      (hasAnyData() ? '' : '<button class="btn" data-act="sample">Load sample data</button>') + '</div></div>';
    var tiles = '<div class="tiles">' +
      tile('vulns', 'Vulnerabilities', openV.length, '', 'open', 'open') +
      tile('vulns', 'SLA breached', breached.length, breached.length ? 'red' : '', breached.length ? 'past due' : 'nothing past due', 'breached') +
      tile(odF > odT ? 'followups' : 'tasks', 'Overdue', overdue, overdue ? 'amber' : '', 'tasks, follow ups') +
      tile('tasks', 'Tasks', openT.length, '', 'open') + '</div>';
    return '<div class="dash">' + banner + heroCard(openF) + calCard(openV, openT, openF) + tiles + slaCard() + '</div>';
  }

  function heroCard(openF) {
    var t = today();
    var f = openF.slice().sort(dueSort)[0];
    var top = '<div class="card-top"><span class="eyebrow">Next follow up</span><span class="r">' + D.fmtDay(t) + '</span></div>';
    if (!f) {
      return '<section class="card hero" data-go="followups">' + top +
        '<div class="hero-main"><div class="big"><span class="n">0</span><span class="u">open</span></div><div class="hero-text"><div class="hero-title">Nothing to follow up on</div><div class="hero-sub">Add one and its due date shows up here.</div></div></div>' +
        '<div class="hero-actions"><button class="btn white" data-act="new-followup">Add follow up</button></div></section>';
    }
    var days = f.due ? diffDays(f.due, t) : null;
    var big;
    if (days === null) big = '<span class="n word">Open</span>';
    else if (days === 0) big = '<span class="n word">Today</span>';
    else if (days > 0) big = '<span class="n">' + days + '</span><span class="u">' + (days === 1 ? 'day' : 'days') + '</span>';
    else big = '<span class="n late">' + (-days) + '</span><span class="u late">' + (days === -1 ? 'day overdue' : 'days overdue') + '</span>';
    var parts = [];
    if (f.companyId) parts.push(esc(coName(f.companyId)));
    if (f.who) parts.push('with ' + esc(f.who));
    parts.push(f.due ? (days < 0 ? 'was due ' : 'until ') + fmtShort(f.due) : 'no date');
    return '<section class="card hero" data-open="followups:' + f.id + '">' + top +
      '<div class="hero-main"><div class="big">' + big + '</div><div class="hero-text"><div class="hero-title">' + esc(f.title) + '</div><div class="hero-sub">' + parts.join(' · ') + '</div></div></div>' +
      '<div class="hero-actions"><button class="btn white" data-act="hero-done" data-id="' + f.id + '">Mark done</button><button class="btn soft" data-act="hero-snooze" data-id="' + f.id + '">Snooze</button></div></section>';
  }

  function monthLabel(a, b) {
    var da = D.parse(a), db = D.parse(b);
    var ma = D.MONTHS[da.getMonth()], mb = D.MONTHS[db.getMonth()];
    if (da.getMonth() === db.getMonth() && da.getFullYear() === db.getFullYear()) return ma + ' ' + da.getFullYear();
    if (da.getFullYear() === db.getFullYear()) return ma.slice(0, 3) + ' to ' + mb.slice(0, 3) + ' ' + da.getFullYear();
    return ma.slice(0, 3) + ' ' + da.getFullYear() + ' to ' + mb.slice(0, 3) + ' ' + db.getFullYear();
  }

  function calCard(openV, openT, openF) {
    var t = today();
    var start = addDays(D.weekStart(t), 7 * S.weekOff);
    var end = addDays(start, 13);
    var marks = {};
    function mk(d) {
      if (!d) return;
      var m = marks[d] || (marks[d] = { n: 0, late: false });
      m.n++;
      if (d < t) m.late = true;
    }
    openT.forEach(function (x) { mk(x.due); });
    openF.forEach(function (x) { mk(x.due); });
    openV.forEach(function (v) { mk(effDue(v)); });
    var letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    var h = '<section class="card cal' + (S.weekOff ? ' shifted' : '') + '"><div class="card-top"><span class="eyebrow">Two weeks</span><span class="cal-r">' +
      (S.weekOff ? '<button class="cal-today" data-act="week-today">Today</button>' : '') +
      '<button class="cal-arrow" data-act="week-prev" aria-label="Previous week">' + icon('left', 15) + '</button>' + monthLabel(start, end) +
      '<button class="cal-arrow" data-act="week-next" aria-label="Next week">' + icon('right', 15) + '</button></span></div><div class="strip">';
    letters.forEach(function (l) { h += '<div class="dw">' + l + '</div>'; });
    for (var i = 0; i < 14; i++) {
      var s = addDays(start, i);
      var m = marks[s];
      h += '<button class="sd' + (s === t ? ' today' : '') + '" data-day="' + s + '" aria-label="' + esc(fmtFull(s)) + '">' + D.parse(s).getDate() +
        (m ? '<i class="dot' + (m.late ? ' late' : '') + '"></i>' : '') + '</button>';
    }
    return h + '</div></section>';
  }

  function dayPopover(btn, day) {
    var items = [];
    S.data.vulns.filter(inScope).forEach(function (v) { if (isOpen(v) && effDue(v) === day) items.push({ k: 'Vuln', ref: 'vulns:' + v.id, title: v.title }); });
    S.data.tasks.filter(inScope).forEach(function (x) { if (!x.done && x.due === day) items.push({ k: 'Task', ref: 'tasks:' + x.id, title: x.title }); });
    S.data.followups.filter(inScope).forEach(function (x) { if (!x.done && x.due === day) items.push({ k: 'Follow up', ref: 'followups:' + x.id, title: x.title }); });
    var el = document.createElement('div');
    el.className = 'popover daypop';
    el.innerHTML = '<div class="dp-h">' + esc(fmtFull(day)) + '</div>' +
      (items.length ? items.map(function (i) {
        return '<div class="dp-row" data-dpopen="' + i.ref + '"><span class="k">' + i.k + '</span><span class="t">' + esc(i.title) + '</span></div>';
      }).join('') : '<div class="dp-empty">Nothing due.</div>') +
      '<div class="dp-add"><button class="btn sm" data-dpadd="tasks">Add task</button><button class="btn sm" data-dpadd="followups">Add follow up</button></div>';
    el.addEventListener('click', function (e) {
      var o = e.target.closest('[data-dpopen]');
      if (o) { D.closePopover(); var r = splitRef(o.dataset.dpopen); return openModal(r.kind, r.id); }
      var a = e.target.closest('[data-dpadd]');
      if (a) { D.closePopover(); openModal(a.dataset.dpadd, null, { due: day }); }
    });
    D.showPopover(btn, el);
  }

  function ringSVG(frac, color) {
    var c = 2 * Math.PI * 24;
    var on = frac !== null && frac > 0;
    return '<svg viewBox="0 0 56 56" width="58" height="58" aria-hidden="true"><circle cx="28" cy="28" r="24" fill="none" stroke="' + color + '" stroke-opacity="0.3" stroke-width="4.5"/>' +
      (on ? '<circle cx="28" cy="28" r="24" fill="none" stroke="' + color + '" stroke-width="4.5" stroke-linecap="round" stroke-dasharray="' + (c * frac).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 28 28)"/>' :
        '<circle cx="28" cy="4" r="2.8" fill="' + color + '"/>') + '</svg>';
  }

  function slaCard() {
    var cos = S.data.companies.filter(function (c) { return S.company === 'all' || c.id === S.company; });
    var items = SEV.map(function (s) {
      var vs = S.data.vulns.filter(function (v) { return inScope(v) && v.severity === s && (v.status === 'open' || v.status === 'fixed'); });
      var open = vs.filter(isOpen);
      var br = open.filter(isBreached).length;
      var tracked = vs.filter(function (v) { return effDue(v); });
      var ok = tracked.filter(function (v) {
        var due = effDue(v);
        return v.status === 'fixed' ? (!v.fixedOn || v.fixedOn <= due) : due >= today();
      }).length;
      var frac = tracked.length ? ok / tracked.length : null;
      var days = cos.map(function (c) { return c.sla ? Number(c.sla[s]) || 0 : 0; }).filter(Boolean);
      var mn = Math.min.apply(null, days), mx = Math.max.apply(null, days);
      var label = !days.length ? 'Not set' : (mn === mx ? mn + ' day SLA' : mn + ' to ' + mx + ' day SLA');
      return '<div class="ring-item"><div class="ring">' + ringSVG(frac, SEVCOL[s]) + '<span class="ring-n">' + open.length + '</span></div>' +
        '<div class="ring-txt"><b>' + SEV_LABEL[s] + '</b><span>' + label + '</span>' + (br ? '<span class="red">' + br + ' breached</span>' : '') + '</div></div>';
    }).join('');
    return '<section class="card sla" data-go="slas"><div class="card-top"><span class="eyebrow">SLA health</span></div><div class="rings">' + items + '</div></section>';
  }

  function vulnsPage() {
    var all = S.data.vulns.filter(inScope);
    var F = {
      open: isOpen,
      breached: isBreached,
      soon: function (v) { return vStatus(v).k === 'soon'; },
      fixed: function (v) { return v.status === 'fixed'; },
      all: function () { return true; }
    };
    var L = { open: 'Open', breached: 'Breached', soon: 'Due soon', fixed: 'Fixed', all: 'All' };
    var chips = Object.keys(L).map(function (k) {
      return '<button data-vf="' + k + '" class="' + (S.vf === k ? 'on' : '') + '">' + L[k] + '<span class="n">' + all.filter(F[k]).length + '</span></button>';
    }).join('');
    var list = all.filter(F[S.vf]).sort(vSort);
    var head = '<div class="vrow head"><span>Severity</span><span>Finding</span><span>Company</span><span>Found</span><span>SLA due</span><span>Status</span><span></span></div>';
    var rows = list.map(function (v) {
      var due = effDue(v), st = vStatus(v);
      var rel = due && v.status === 'open' ? relDue(due) : '';
      var sub = rel && rel !== fmtShort(due) ? '<small class="' + (st.k === 'breached' ? 'late' : '') + '">' + rel + '</small>' : '';
      return '<div class="vrow" data-open="vulns:' + v.id + '"><span>' + sevChip(v.severity) + '</span>' +
        '<span><div class="ttl">' + esc(v.title) + '</div>' + (v.cve ? '<div class="cve">' + esc(v.cve) + '</div>' : '') + '</span>' +
        '<span>' + coChip(v.companyId) + '</span><span class="dd">' + fmtShort(v.discovered) + '</span>' +
        '<span class="dd">' + (due ? fmtShort(due) : 'No SLA') + sub + '</span><span>' + stChip(v) + '</span>' +
        '<button class="icon-btn" data-fix="' + v.id + '" aria-label="' + (v.status === 'fixed' ? 'Reopen' : 'Mark fixed') + '" title="' + (v.status === 'fixed' ? 'Reopen' : 'Mark fixed') + '">' + icon(v.status === 'fixed' ? 'undo' : 'tick', 16) + '</button></div>';
    }).join('');
    var body = list.length ? '<div class="card vtable">' + head + rows + '</div>' :
      emptyState(all.length ? 'Nothing in this view' : 'Log your first vulnerability', all.length ? 'Try another filter above.' : 'Add a finding and Deskline sets its due date from the company SLA.', all.length ? '' : '<button class="btn white" data-act="new">New vulnerability</button>');
    return '<div class="filters">' + chips + '</div>' + body;
  }

  function slasPage() {
    var cs = S.data.companies;
    if (!cs.length) return emptyState('Add your first company', 'Every company gets its own SLA targets in days for each severity. Vulnerability due dates are calculated from them.',
      '<button class="btn white" data-act="newco">Add company</button>');
    var cards = cs.map(function (c) {
      var vs = S.data.vulns.filter(function (v) { return v.companyId === c.id && v.status === 'open'; });
      var br = vs.filter(isBreached).length;
      var ins = SEV.map(function (s) {
        return '<div class="sla-in"><label><i style="background:' + SEVCOL[s] + '"></i>' + SEV_LABEL[s] + '</label><div class="wrap"><input type="number" min="1" max="3650" value="' + (c.sla ? c.sla[s] : '') + '" data-sla="' + c.id + ':' + s + '" aria-label="' + SEV_LABEL[s] + ' SLA in days"><span class="u">days</span></div></div>';
      }).join('');
      return '<div class="card"><div class="co-head"><span class="dotc" style="background:' + coColor(c.id) + '"></span><input type="text" value="' + esc(c.name) + '" data-coname="' + c.id + '" aria-label="Company name">' +
        '<button class="icon-btn del" data-delco="' + c.id + '" aria-label="Delete company" title="Delete company">' + icon('trash', 16) + '</button></div>' +
        '<div class="sla-inputs">' + ins + '</div><div class="co-foot"><span>' + vs.length + ' open</span><span style="color:' + (br ? 'var(--red)' : 'inherit') + '">' + br + ' breached</span></div></div>';
    }).join('');
    return '<p class="note-line">A vulnerability is due its discovery date plus the days below for its severity. Change a number and every open finding for that company recalculates.</p><div class="sla-cards">' + cards + '</div>';
  }

  function groupItems(items) {
    var t = today(), week = addDays(t, 7);
    var g = [['Overdue', [], 'late'], ['Today', []], ['This week', []], ['Later', []], ['No date', []]];
    items.slice().sort(dueSort).forEach(function (x) {
      var i = !x.due ? 4 : x.due < t ? 0 : x.due === t ? 1 : x.due <= week ? 2 : 3;
      g[i][1].push(x);
    });
    return g.filter(function (x) { return x[1].length; });
  }

  function listPage(kind) {
    var all = S.data[kind].filter(inScope);
    var open = all.filter(notDone);
    var done = all.filter(function (x) { return x.done; });
    var one = kind === 'tasks' ? 'task' : 'follow up';
    var defCo = S.company !== 'all' ? S.company : '';
    var selCo = S.draft.co === null ? defCo : S.draft.co;
    var copts = '<option value="">No company</option>' + S.data.companies.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === selCo ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var composer = '<div class="card composer"><input type="text" id="comp-title" value="' + esc(S.draft.title) + '" placeholder="' + (kind === 'tasks' ? 'Add a task and press Return' : 'Who or what are you following up on') + '" aria-label="New ' + one + '">' +
      '<select id="comp-co" aria-label="Company">' + copts + '</select>' +
      '<button type="button" class="datefield" id="comp-due">' + icon('cal', 16) + '<span class="' + (S.draft.due ? '' : 'ph') + '">' + (S.draft.due ? fmtShort(S.draft.due) : 'Due date') + '</span></button>' +
      '<button class="btn white" data-act="comp-add">Add</button></div>';
    var groups = groupItems(open).map(function (g) {
      return '<div class="group-h' + (g[2] ? ' ' + g[2] : '') + '">' + g[0] + '<span class="n">' + g[1].length + '</span></div><div class="card listcard"><div class="rows">' +
        g[1].map(function (x) { return checkRow(kind, x); }).join('') + '</div></div>';
    }).join('');
    if (!open.length) groups = '<div class="empty-line">' + (all.length ? 'Everything is done.' : 'Nothing here yet. Add your first ' + one + ' above.') + '</div>';
    var doneHtml = '';
    if (done.length) {
      doneHtml = '<div class="group-h" style="cursor:pointer" data-act="toggle-done">' + icon('down', 14) + 'Completed<span class="n">' + done.length + '</span></div>';
      if (S.showDone) doneHtml += '<div class="card listcard"><div class="rows">' + done.sort(function (a, b) { return (b.doneOn || '') < (a.doneOn || '') ? -1 : 1; }).map(function (x) { return checkRow(kind, x); }).join('') + '</div></div>';
    }
    return composer + groups + doneHtml;
  }

  function blank(type) {
    var defCo = S.company !== 'all' ? S.company : (S.data.companies[0] ? S.data.companies[0].id : '');
    if (type === 'tasks') return { title: '', companyId: defCo, due: '', notes: '', done: false };
    if (type === 'followups') return { title: '', who: '', companyId: defCo, due: '', notes: '', done: false };
    if (type === 'vulns') return { title: '', cve: '', severity: 'high', companyId: defCo, discovered: today(), dueOverride: '', status: 'open', fixedOn: '', notes: '' };
    return { name: '', sla: Object.assign({}, D.DEFAULT_SLA) };
  }

  function openModal(type, id, preset) {
    var item = id && type !== 'company' ? S.data[type].find(function (x) { return x.id === id; }) : null;
    M = { type: type, id: item ? item.id : null, v: item ? JSON.parse(JSON.stringify(item)) : Object.assign(blank(type), preset || {}) };
    renderModal();
    var f = $('#f-title') || $('#f-name');
    if (f) { f.focus(); try { f.setSelectionRange(f.value.length, f.value.length); } catch (err) {} }
  }
  function closeModal() { M = null; D.closePopover(); $('#modal-root').innerHTML = ''; }

  function dateBtn(key, val, placeholder) {
    return '<button type="button" class="datefield" data-pick="' + key + '">' + icon('cal', 16) + '<span class="' + (val ? '' : 'ph') + '">' + (val ? fmtFull(val) : placeholder) + '</span></button>';
  }
  function fld(label, html, cls) { return '<div class="fld' + (cls ? ' ' + cls : '') + '"><label>' + label + '</label>' + html + '</div>'; }
  function coSelect(sel) {
    return '<select id="f-company"><option value="">No company</option>' + S.data.companies.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('') + '</select>';
  }

  function renderModal() {
    var v = M.v, t = M.type, isNew = !M.id, h = '';
    if (t === 'company') {
      h = '<h2>New company</h2>' + fld('Name', '<input type="text" id="f-name" placeholder="Acme Corp">') +
        '<div class="fld"><label>SLA targets in days</label><div class="sla-inputs">' + SEV.map(function (s) {
          return '<div class="sla-in"><label><i style="background:' + SEVCOL[s] + '"></i>' + SEV_LABEL[s] + '</label><div class="wrap"><input type="number" min="1" max="3650" id="f-sla-' + s + '" value="' + v.sla[s] + '"><span class="u">days</span></div></div>';
        }).join('') + '</div></div>';
    } else if (t === 'tasks') {
      h = '<h2>' + (isNew ? 'New task' : 'Edit task') + '</h2>' + fld('Task', '<input type="text" id="f-title" value="' + esc(v.title) + '" placeholder="Patch review with IT">') +
        '<div class="frow">' + fld('Company', coSelect(v.companyId)) + fld('Due date', dateBtn('due', v.due, 'No date')) + '</div>' +
        fld('Notes', '<textarea id="f-notes" placeholder="Details, links, context">' + esc(v.notes) + '</textarea>');
    } else if (t === 'followups') {
      h = '<h2>' + (isNew ? 'New follow up' : 'Edit follow up') + '</h2>' + fld('What are you following up on', '<input type="text" id="f-title" value="' + esc(v.title) + '" placeholder="Remediation status on the Exchange patch">') +
        '<div class="frow">' + fld('Waiting on', '<input type="text" id="f-who" value="' + esc(v.who) + '" placeholder="Name or team">') + fld('Company', coSelect(v.companyId)) + '</div>' +
        fld('Follow up date', dateBtn('due', v.due, 'No date')) + fld('Notes', '<textarea id="f-notes" placeholder="What was said, what you need back">' + esc(v.notes) + '</textarea>');
    } else {
      h = '<h2>' + (isNew ? 'New vulnerability' : 'Edit vulnerability') + '</h2>' + fld('Finding', '<input type="text" id="f-title" value="' + esc(v.title) + '" placeholder="Outdated OpenSSL on web tier">') +
        '<div class="frow">' + fld('CVE or plugin ID', '<input type="text" id="f-cve" value="' + esc(v.cve) + '" placeholder="CVE-2026-12345">') +
        fld('Severity', '<select id="f-sev">' + SEV.map(function (s) { return '<option value="' + s + '"' + (v.severity === s ? ' selected' : '') + '>' + SEV_LABEL[s] + '</option>'; }).join('') + '</select>') + '</div>' +
        '<div class="frow">' + fld('Company', coSelect(v.companyId)) + fld('Status', '<select id="f-status"><option value="open"' + (v.status === 'open' ? ' selected' : '') + '>Open</option><option value="fixed"' + (v.status === 'fixed' ? ' selected' : '') + '>Fixed</option><option value="accepted"' + (v.status === 'accepted' ? ' selected' : '') + '>Accepted risk</option></select>') + '</div>' +
        '<div class="frow">' + fld('Discovered', dateBtn('discovered', v.discovered, 'Pick a date')) + fld('Due date', dateBtn('dueOverride', v.dueOverride, 'Auto from SLA')) + '</div>' +
        '<div class="hint" id="sla-hint" style="margin:-6px 0 14px"></div>' + fld('Notes', '<textarea id="f-notes" placeholder="Affected hosts, ticket link, remediation plan">' + esc(v.notes) + '</textarea>');
    }
    h += '<div class="form-err" id="form-err"></div><div class="modal-actions">' +
      (!isNew && t !== 'company' ? '<button class="btn ghost danger" data-m="delete">Delete</button>' : '') + '<span class="sp"></span><button class="btn" data-m="cancel">Cancel</button><button class="btn white" data-m="save">' + (isNew ? 'Add' : 'Save') + '</button></div>';
    $('#modal-root').innerHTML = '<div class="scrim" data-m="scrim"><div class="modal" role="dialog" aria-modal="true">' + h + '</div></div>';
    if (t === 'vulns') updateHint();
  }

  function updateHint() {
    var el = $('#sla-hint');
    if (!el || !M) return;
    var tmp = Object.assign({}, M.v, { companyId: ($('#f-company') || {}).value, severity: ($('#f-sev') || {}).value });
    var d = effDue(tmp);
    var days = slaDays(tmp);
    el.textContent = tmp.dueOverride ? 'Custom due date. Clear it to use the company SLA.' :
      d ? 'SLA due ' + fmtFull(d) + ' (' + days + ' days from discovery).' : 'Pick a company with an SLA to calculate the due date.';
  }

  function saveModal() {
    var v = M.v, t = M.type;
    var g = function (id) { var e = document.getElementById(id); return e ? e.value.trim() : ''; };
    var err = function (m) { $('#form-err').textContent = m; };
    if (t === 'company') {
      var name = g('f-name');
      if (!name) return err('Enter a company name.');
      var sla = {};
      SEV.forEach(function (s) { sla[s] = Math.max(1, parseInt(g('f-sla-' + s), 10) || D.DEFAULT_SLA[s]); });
      S.data.companies.push({ id: D.uid(), name: name, sla: sla, created: Date.now() });
      S.company = 'all';
      closeModal();
      persist();
      return D.toast(NEWLABEL.company);
    }
    v.title = g('f-title');
    if (!v.title) return err('Enter a title.');
    v.companyId = g('f-company');
    v.notes = g('f-notes');
    if (t === 'followups') v.who = g('f-who');
    if (t === 'vulns') {
      v.cve = g('f-cve'); v.severity = g('f-sev'); v.status = g('f-status');
      if (!v.discovered) v.discovered = today();
      if (v.status === 'fixed' && !v.fixedOn) v.fixedOn = today();
      if (v.status !== 'fixed') v.fixedOn = '';
    }
    var isNew = !M.id;
    if (M.id) {
      var i = S.data[t].findIndex(function (x) { return x.id === M.id; });
      if (i >= 0) S.data[t][i] = Object.assign({}, S.data[t][i], v);
    } else {
      v.id = D.uid(); v.created = Date.now();
      S.data[t].push(v);
    }
    closeModal();
    persist();
    if (isNew) D.toast(NEWLABEL[t]);
  }

  function hasSample() {
    return ['companies', 'vulns', 'tasks', 'followups'].some(function (k) { return S.data[k].some(function (x) { return x.sample; }); });
  }
  function loadSample() {
    var t = today();
    var a = { id: D.uid(), name: 'Acme Corp', sla: { critical: 7, high: 30, medium: 60, low: 90 }, sample: true };
    var n = { id: D.uid(), name: 'Northwind Health', sla: { critical: 5, high: 21, medium: 45, low: 90 }, sample: true };
    var gl = { id: D.uid(), name: 'Globex', sla: { critical: 14, high: 30, medium: 90, low: 180 }, sample: true };
    S.data.companies.push(a, n, gl);
    var V = function (title, cve, sev, c, ago, status, fixedAgo) {
      return { id: D.uid(), title: title, cve: cve, severity: sev, companyId: c.id, discovered: addDays(t, -ago), dueOverride: '', status: status || 'open', fixedOn: fixedAgo != null ? addDays(t, -fixedAgo) : '', notes: '', created: Date.now(), sample: true };
    };
    S.data.vulns.push(
      V('Exchange Server remote code execution', 'CVE-2026-10211', 'critical', a, 9),
      V('OpenSSL out of date on web tier', 'CVE-2026-20456', 'high', a, 26),
      V('SMB signing not required', 'Plugin 57608', 'medium', a, 12),
      V('TLS 1.0 enabled on VPN gateway', 'Plugin 104743', 'low', a, 40),
      V('Citrix ADC auth bypass', 'CVE-2026-31877', 'critical', n, 3),
      V('Unpatched Java runtime on EHR app server', 'CVE-2026-18002', 'high', n, 10),
      V('Outdated jQuery on patient portal', 'CVE-2026-04431', 'medium', n, 50),
      V('Log4j found in vendor appliance', 'CVE-2026-00977', 'critical', gl, 6, 'fixed', 2),
      V('Weak SSH ciphers on bastion host', 'Plugin 153953', 'low', gl, 20),
      V('Apache Struts update pending', 'CVE-2026-27700', 'high', gl, 33)
    );
    var T = function (title, c, due) { return { id: D.uid(), title: title, companyId: c.id, due: due == null ? '' : addDays(t, due), notes: '', done: false, created: Date.now(), sample: true }; };
    S.data.tasks.push(T('Send monthly scan report', a, 0), T('Patch review with IT', a, 2), T('Update Tenable scan credentials', n, -1), T('Rescan after Citrix hotfix', n, 3), T('Draft SLA exception request', gl, 8), T('Clean up stale assets in Tenable.io', gl, null));
    var F = function (title, who, c, due) { return { id: D.uid(), title: title, who: who, companyId: c.id, due: addDays(t, due), notes: '', done: false, created: Date.now(), sample: true }; };
    S.data.followups.push(F('Exchange patch window confirmation', 'Dana, Infrastructure', a, 1), F('Vendor fix date for Log4j appliance', 'Support desk', gl, -2), F('Exception sign off on legacy TLS', 'CISO office', n, 5));
    persist();
  }
  function clearSample() {
    ['companies', 'vulns', 'tasks', 'followups'].forEach(function (k) { S.data[k] = S.data[k].filter(function (x) { return !x.sample; }); });
    if (S.company !== 'all' && !co(S.company)) S.company = 'all';
    persist();
  }

  function menuEl(html, handler) {
    var el = document.createElement('div');
    el.className = 'popover menu';
    el.innerHTML = html;
    el.addEventListener('click', handler);
    return el;
  }
  function mbtn(attr, val, ic, label) { return '<button ' + attr + '="' + val + '">' + icon(ic, 16) + label + '</button>'; }

  function newMenu(btn) {
    var el = menuEl(
      mbtn('data-newmenu', 'tasks', 'check', 'Task') + mbtn('data-newmenu', 'followups', 'reply', 'Follow up') + mbtn('data-newmenu', 'vulns', 'shield', 'Vulnerability') + '<div class="sep"></div>' + mbtn('data-newmenu', 'company', 'timer', 'Company and SLAs'),
      function (e) {
        var b = e.target.closest('[data-newmenu]');
        if (!b) return;
        D.closePopover();
        openModal(b.dataset.newmenu);
      });
    D.showPopover(btn, el, { alignRight: true });
  }

  function newForTab(btn) {
    if (S.tab === 'dashboard') return newMenu(btn);
    if (S.tab === 'slas') return openModal('company');
    openModal(S.tab);
  }

  function brandMenu(btn) {
    var h = '';
    [['dashboard', 'dash'], ['vulns', 'shield'], ['slas', 'timer'], ['tasks', 'check'], ['followups', 'reply']].forEach(function (i) {
      h += mbtn('data-mgo', i[0], i[1], TITLES[i[0]]);
    });
    h += '<div class="sep"></div>';
    if (api.web) h += mbtn('data-mact', 'quick', 'plus', 'Quick add window');
    if (!hasAnyData()) h += mbtn('data-mact', 'sample', 'plus', 'Load sample data');
    if (hasSample()) h += mbtn('data-mact', 'clear-sample', 'trash', 'Remove sample data');
    h += mbtn('data-mact', 'export', 'download', 'Export backup') + mbtn('data-mact', 'import', 'upload', 'Import backup');
    if (api.web) h += mbtn('data-mact', 'disconnect', 'undo', 'Disconnect GitHub');
    h += '<div class="menu-tip">' + (api.web ? 'Open quick add in a small window with the menu or Alt+Shift+A.' : 'Quick add from anywhere with the tray icon or ' + (api.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+Shift+A.') + ' Search with ' + (api.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+K.</div>';
    var el = menuEl(h, function (e) {
      var g = e.target.closest('[data-mgo]');
      if (g) { D.closePopover(); return go(g.dataset.mgo); }
      var a = e.target.closest('[data-mact]');
      if (a) { D.closePopover(); doAct(a.dataset.mact, a); }
    });
    D.showPopover(btn, el);
  }

  function findF(id) { return S.data.followups.find(function (x) { return x.id === id; }); }
  function heroDone(id) {
    var f = findF(id);
    if (!f) return;
    f.done = true; f.doneOn = today();
    persist();
    D.toast('Follow up marked done', 'Undo', function () {
      var g = findF(id);
      if (g) { g.done = false; g.doneOn = ''; persist(); }
    });
  }
  function snoozeTo(id, d) {
    var f = findF(id);
    if (!f) return;
    var prev = f.due;
    f.due = d;
    persist();
    D.toast('Snoozed until ' + fmtShort(d), 'Undo', function () {
      var g = findF(id);
      if (g) { g.due = prev; persist(); }
    });
  }
  function snoozeMenu(btn, id) {
    var el = menuEl(
      mbtn('data-sn', '1', 'clock', 'Tomorrow') + mbtn('data-sn', '3', 'clock', 'In 3 days') + mbtn('data-sn', '7', 'clock', 'Next week') + '<div class="sep"></div>' + mbtn('data-sn', 'pick', 'cal', 'Pick a date'),
      function (e) {
        var b = e.target.closest('[data-sn]');
        if (!b) return;
        D.closePopover();
        if (b.dataset.sn === 'pick') {
          var f = findF(id);
          D.openPicker(btn, { value: f ? f.due : '', onPick: function (d) { if (d) snoozeTo(id, d); } });
        } else snoozeTo(id, addDays(today(), parseInt(b.dataset.sn, 10)));
      });
    D.showPopover(btn, el);
  }

  function pickInto(btn, key) {
    var clearable = key === 'dueOverride' || key === 'due';
    D.openPicker(btn, {
      value: M.v[key], clearable: clearable, clearLabel: key === 'dueOverride' ? 'Use SLA' : 'Clear',
      onPick: function (d) {
        M.v[key] = d;
        var ph = key === 'dueOverride' ? 'Auto from SLA' : key === 'discovered' ? 'Pick a date' : 'No date';
        var sp = btn.querySelector('span');
        sp.textContent = d ? fmtFull(d) : ph;
        sp.className = d ? '' : 'ph';
        updateHint();
      }
    });
  }

  function splitRef(s) { var p = s.split(':'); return { kind: p[0], id: p[1] }; }

  var KLABEL = { tasks: 'Add task', followups: 'Add follow up', vulns: 'Add vuln' };
  function srHay(x) {
    return ((x.title || '') + ' ' + (x.cve || '') + ' ' + (x.who || '') + ' ' + (x.notes || '') + ' ' + (x.companyId ? coName(x.companyId) : '')).toLowerCase();
  }
  function buildRows(q) {
    var toks = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!toks.length) return [];
    var hits = [];
    ['vulns', 'followups', 'tasks'].forEach(function (k) {
      S.data[k].forEach(function (x) {
        var h = srHay(x);
        if (toks.every(function (t) { return h.indexOf(t) >= 0; })) hits.push({ kind: 'item', type: k, item: x });
      });
    });
    S.data.companies.forEach(function (c) {
      var h = c.name.toLowerCase();
      if (toks.every(function (t) { return h.indexOf(t) >= 0; })) hits.push({ kind: 'company', item: c });
    });
    function rank(r) {
      if (r.kind === 'company') return 0;
      if (r.type === 'vulns') return r.item.status === 'open' ? 0 : 1;
      return r.item.done ? 1 : 0;
    }
    hits.sort(function (a, b) { return rank(a) - rank(b); });
    var rows = hits.slice(0, 6);
    rows.push({ kind: 'add', type: 'tasks' }, { kind: 'add', type: 'followups' }, { kind: 'add', type: 'vulns' });
    return rows;
  }
  function srRow(r, i, q) {
    var on = i === SR.idx ? ' on' : '';
    if (r.kind === 'add') {
      return '<div class="sr-row sr-add' + on + '" data-sr="' + i + '"><span class="sr-kind">' + KLABEL[r.type] + '</span><div class="sr-main"><div class="sr-title"><q>' + esc(q.trim()) + '</q></div></div></div>';
    }
    if (r.kind === 'company') {
      return '<div class="sr-row' + on + '" data-sr="' + i + '"><span class="sr-kind">Company</span><div class="sr-main"><div class="sr-title">' + esc(r.item.name) + '</div><div class="sr-sub">Open SLA targets</div></div></div>';
    }
    var x = r.item;
    var sub = [];
    if (x.companyId) sub.push(esc(coName(x.companyId)));
    if (r.type === 'vulns') { var d = effDue(x); sub.push(vStatus(x).t + (d ? ', due ' + fmtShort(d) : '')); }
    else sub.push(x.done ? 'Done' : (x.due ? 'Due ' + fmtShort(x.due) : 'No date'));
    return '<div class="sr-row' + on + '" data-sr="' + i + '"><span class="sr-kind">' + KIND[r.type] + '</span><div class="sr-main"><div class="sr-title">' + esc(x.title) + '</div><div class="sr-sub">' + sub.join(' · ') + '</div></div></div>';
  }
  function renderSearch() {
    var pop = $('#search-pop'), inp = $('#q');
    if (!pop || !inp) return;
    var q = inp.value;
    if (!q.trim()) {
      SR.rows = []; SR.idx = -1;
      pop.innerHTML = '<div class="sr-hint">Search tasks, follow ups, vulnerabilities, and companies. Or type something new and press Return to add it as a task.</div>';
      pop.hidden = document.activeElement !== inp;
      return;
    }
    SR.rows = buildRows(q);
    if (SR.idx >= SR.rows.length) SR.idx = -1;
    var firstAdd = SR.rows.findIndex(function (r) { return r.kind === 'add'; });
    var h = '', i;
    if (firstAdd > 0) {
      h += '<div class="sr-sec">Results</div>';
      for (i = 0; i < firstAdd; i++) h += srRow(SR.rows[i], i, q);
    }
    h += '<div class="sr-sec">Add new</div>';
    for (i = firstAdd; i < SR.rows.length; i++) h += srRow(SR.rows[i], i, q);
    h += '<div class="sr-foot">Return adds a task. Use the arrow keys to choose something else.</div>';
    pop.innerHTML = h;
    pop.hidden = false;
    var on = pop.querySelector('.sr-row.on');
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }
  function closeSearch(clear) {
    var inp = $('#q'), pop = $('#search-pop');
    if (pop) pop.hidden = true;
    if (inp) { if (clear) inp.value = ''; inp.blur(); }
    SR.idx = -1; SR.rows = [];
  }
  function activateRow(i) {
    var r = SR.rows[i];
    var inp = $('#q');
    if (!r || !inp) return;
    var q = inp.value.trim();
    closeSearch(true);
    if (r.kind === 'add') openModal(r.type, null, { title: q });
    else if (r.kind === 'company') go('slas');
    else openModal(r.type, r.item.id);
  }

  function addFromComposer() {
    var ti = $('#comp-title');
    if (!ti) return;
    var title = ti.value.trim();
    if (!title) { ti.focus(); return; }
    var kind = S.tab;
    var defCo = S.company !== 'all' ? S.company : '';
    var item = { id: D.uid(), title: title, companyId: S.draft.co === null ? defCo : S.draft.co, due: S.draft.due || '', notes: '', done: false, created: Date.now() };
    if (kind === 'followups') item.who = '';
    S.data[kind].push(item);
    S.draft = { title: '', co: S.draft.co, due: '' };
    persist();
    var again = $('#comp-title');
    if (again) again.focus();
  }

  function doAct(act, el) {
    if (act === 'menu') return brandMenu(el);
    if (act === 'new') return newForTab(el);
    if (act === 'new-followup') return openModal('followups');
    if (act === 'newco') return openModal('company');
    if (act === 'sample') return loadSample();
    if (act === 'clear-sample') { if (confirm('Remove all sample companies and items?')) clearSample(); return; }
    if (act === 'toggle-done') { S.showDone = !S.showDone; return render(); }
    if (act === 'comp-add') return addFromComposer();
    if (act === 'export') return api.exportData();
    if (act === 'import') return api.importData().then(function (d) { if (d) { S.data = d; render(); } });
    if (act === 'quick') return api.openQuick();
    if (act === 'disconnect') { if (confirm('Disconnect this browser from GitHub? Your data stays in the repository.')) api.disconnect(); return; }
    if (act === 'hero-done') return heroDone(el.dataset.id);
    if (act === 'hero-snooze') return snoozeMenu(el, el.dataset.id);
    if (act === 'week-prev') { S.weekOff--; return render(); }
    if (act === 'week-next') { S.weekOff++; return render(); }
    if (act === 'week-today') { S.weekOff = 0; return render(); }
  }

  document.addEventListener('click', function (e) {
    var t = e.target;
    var m = t.closest('[data-m]');
    if (m && M && !(m.dataset.m === 'scrim' && t !== m)) {
      var a = m.dataset.m;
      if (a === 'scrim') closeModal();
      else if (a === 'cancel') closeModal();
      else if (a === 'save') saveModal();
      else if (a === 'delete') {
        if (confirm('Delete this item? This cannot be undone.')) {
          S.data[M.type] = S.data[M.type].filter(function (x) { return x.id !== M.id; });
          closeModal(); persist();
        }
      }
      return;
    }
    var pk = t.closest('[data-pick]');
    if (pk && M) return pickInto(pk, pk.dataset.pick);
    if (M) return;

    var tg = t.closest('[data-toggle]');
    if (tg) {
      var r = splitRef(tg.dataset.toggle);
      var it = S.data[r.kind].find(function (x) { return x.id === r.id; });
      if (it) { it.done = !it.done; it.doneOn = it.done ? today() : ''; persist(); }
      return;
    }
    var fx = t.closest('[data-fix]');
    if (fx) {
      var v = S.data.vulns.find(function (x) { return x.id === fx.dataset.fix; });
      if (v) { v.status = v.status === 'fixed' ? 'open' : 'fixed'; v.fixedOn = v.status === 'fixed' ? today() : ''; persist(); }
      return;
    }
    var dc = t.closest('[data-delco]');
    if (dc) {
      var c = co(dc.dataset.delco);
      if (c && confirm('Delete ' + c.name + '? Its items stay but lose their company and SLA.')) {
        S.data.companies = S.data.companies.filter(function (x) { return x.id !== c.id; });
        ['vulns', 'tasks', 'followups'].forEach(function (k) { S.data[k].forEach(function (x) { if (x.companyId === c.id) x.companyId = ''; }); });
        if (S.company === c.id) S.company = 'all';
        persist();
      }
      return;
    }
    var ac = t.closest('[data-act]');
    if (ac && ac.dataset.act !== 'company') return doAct(ac.dataset.act, ac);
    var dy = t.closest('[data-day]');
    if (dy) return dayPopover(dy, dy.dataset.day);
    var sr = t.closest('[data-sr]');
    if (sr) return activateRow(parseInt(sr.dataset.sr, 10));
    var cd = t.closest('#comp-due');
    if (cd) {
      return D.openPicker(cd, {
        value: S.draft.due, clearable: true,
        onPick: function (d) {
          S.draft.due = d;
          var sp = cd.querySelector('span'); sp.textContent = d ? fmtShort(d) : 'Due date'; sp.className = d ? '' : 'ph';
          var ti = $('#comp-title'); if (ti) ti.focus();
        }
      });
    }
    var op = t.closest('[data-open]');
    if (op) { var rr = splitRef(op.dataset.open); return openModal(rr.kind, rr.id); }
    var vf = t.closest('[data-vf]');
    if (vf) { S.vf = vf.dataset.vf; if (vf.dataset.go) go(vf.dataset.go); else render(); return; }
    var gg = t.closest('[data-go]');
    if (gg) return go(gg.dataset.go);
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches && t.matches('[data-act=company]')) { S.company = t.value; render(); return; }
    if (t.id === 'comp-co') { S.draft.co = t.value; return; }
    if (M && (t.id === 'f-company' || t.id === 'f-sev')) updateHint();
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'q') { SR.idx = -1; return renderSearch(); }
    if (t.id === 'comp-title') { S.draft.title = t.value; return; }
    if (t.dataset && t.dataset.sla) {
      var p = t.dataset.sla.split(':');
      var c = co(p[0]);
      var n = parseInt(t.value, 10);
      if (c && n > 0) { c.sla = c.sla || {}; c.sla[p[1]] = n; saveQuiet(); }
    } else if (t.dataset && t.dataset.coname) {
      var c2 = co(t.dataset.coname);
      if (c2 && t.value.trim()) { c2.name = t.value.trim(); saveQuiet(); }
    }
  });
  document.addEventListener('focusin', function (e) { if (e.target.id === 'q') renderSearch(); });
  document.addEventListener('mousedown', function (e) {
    var pop = $('#search-pop');
    if (pop && !pop.hidden && !e.target.closest('#search')) pop.hidden = true;
  });
  document.addEventListener('keydown', function (e) {
    if (e.target && e.target.id === 'q' && !M) {
      if (e.key === 'ArrowDown') { e.preventDefault(); SR.idx = SR.rows.length ? (SR.idx + 1) % SR.rows.length : -1; renderSearch(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); SR.idx = SR.rows.length ? (SR.idx <= 0 ? SR.rows.length - 1 : SR.idx - 1) : -1; renderSearch(); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        if (e.isComposing || !e.target.value.trim()) return;
        activateRow(SR.idx >= 0 ? SR.idx : SR.rows.findIndex(function (r) { return r.kind === 'add'; }));
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (e.target.value) { e.target.value = ''; SR.idx = -1; renderSearch(); } else closeSearch(false);
      }
      return;
    }
    if (e.key === 'Escape' && M) { closeModal(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      if (M && e.target.tagName === 'INPUT') { e.preventDefault(); saveModal(); }
      else if (e.target.id === 'comp-title') { e.preventDefault(); addFromComposer(); }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && !M) { e.preventDefault(); var q = $('#q'); if (q) { q.focus(); q.select(); } return; }
    if (api.web && e.altKey && e.shiftKey && e.code === 'KeyA') { e.preventDefault(); api.openQuick(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !M) { e.preventDefault(); newForTab($('[data-act=new]')); }
  });

  api.onChanged(function (d) { S.data = normalize(d); render(); });

  function normalize(d) {
    d = d || {};
    return { version: 1, companies: d.companies || [], vulns: d.vulns || [], tasks: d.tasks || [], followups: d.followups || [] };
  }
  api.load().then(function (d) { S.data = normalize(d); render(); });
  render();
})();
