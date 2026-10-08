(function () {
  var D = DL;
  var esc = D.esc, today = D.today, addDays = D.addDays, diffDays = D.diffDays, relDue = D.relDue, fmtShort = D.fmtShort, fmtFull = D.fmtFull;
  var icon = D.icon, SEV = D.SEV, SEV_LABEL = D.SEV_LABEL;
  var api = window.deskline;

  document.body.classList.add(api.platform === 'darwin' ? 'mac' : api.platform === 'win32' ? 'win' : 'linux');

  var now = new Date();
  var S = {
    data: { companies: [], vulns: [], tasks: [], followups: [] },
    tab: 'dashboard', company: 'all', vf: 'open', showDone: false,
    calY: now.getFullYear(), calM: now.getMonth(), calSel: today()
  };
  var M = null;
  var $ = function (s) { return document.querySelector(s); };

  var PAL = ['#ff9f0a', '#64d2ff', '#bf5af2', '#30d158', '#ff375f', '#ffd60a', '#5e5ce6', '#ac8e68'];
  var TITLES = { dashboard: 'Dashboard', vulns: 'Vulnerabilities', slas: 'SLAs', tasks: 'Tasks', followups: 'Follow ups' };
  var KIND = { vulns: 'Vuln', tasks: 'Task', followups: 'Follow up' };

  function co(id) { return S.data.companies.find(function (c) { return c.id === id; }); }
  function coName(id) { var c = co(id); return c ? c.name : 'No company'; }
  function coColor(id) {
    var i = S.data.companies.findIndex(function (c) { return c.id === id; });
    return i < 0 ? '#67676f' : PAL[i % PAL.length];
  }
  function coChip(id) {
    return '<span class="co"><i style="background:' + coColor(id) + '"></i>' + esc(coName(id)) + '</span>';
  }
  function inScope(x) { return S.company === 'all' || x.companyId === S.company; }

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

  function render() {
    var main = '<aside class="side">' + sidebar() + '</aside><main class="main">' + topbar() + '<div class="page">' + page() + '</div></main>';
    var scroll = $('.main') ? $('.main').scrollTop : 0;
    $('#app').innerHTML = main;
    if ($('.main')) $('.main').scrollTop = scroll;
  }

  function sidebar() {
    var sc = scoped();
    var openV = sc.v.filter(function (v) { return v.status === 'open'; });
    var breached = openV.filter(function (v) { return vStatus(v).k === 'breached'; }).length;
    var counts = {
      vulns: breached ? '<span class="count warn">' + breached + '</span>' : (openV.length ? '<span class="count">' + openV.length + '</span>' : ''),
      tasks: sc.t.filter(function (x) { return !x.done; }).length,
      followups: sc.f.filter(function (x) { return !x.done; }).length
    };
    var items = [['dashboard', 'dash'], ['vulns', 'shield'], ['slas', 'timer'], ['tasks', 'check'], ['followups', 'reply']];
    var nav = items.map(function (it) {
      var c = it[0] === 'vulns' ? counts.vulns : (counts[it[0]] ? '<span class="count">' + counts[it[0]] + '</span>' : '');
      return '<button data-go="' + it[0] + '" class="' + (S.tab === it[0] ? 'on' : '') + '">' + icon(it[1], 18) + '<span>' + TITLES[it[0]] + '</span>' + c + '</button>';
    }).join('');
    var sample = hasSample() ? '<button data-act="clear-sample">' + icon('trash', 16) + 'Remove sample data</button>' : '';
    return '<div class="brand"><div class="mark">' + icon('check', 16) + '</div>Deskline</div><nav class="nav">' + nav + '</nav>' +
      '<div class="side-foot">' + sample + '<button data-act="export">' + icon('download', 16) + 'Export backup</button><button data-act="import">' + icon('upload', 16) + 'Import backup</button>' +
      '<div class="tip">Quick add from anywhere with the tray icon or ' + (api.platform === 'darwin' ? 'Cmd' : 'Ctrl') + '+Shift+A.</div></div>';
  }

  function topbar() {
    var opts = '<option value="all">All companies</option>' + S.data.companies.map(function (c) {
      return '<option value="' + c.id + '"' + (S.company === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var label = { dashboard: 'New', vulns: 'New vulnerability', slas: 'New company', tasks: 'New task', followups: 'New follow up' }[S.tab];
    var sel = S.tab === 'slas' ? '' : '<select data-act="company" aria-label="Company filter">' + opts + '</select>';
    return '<div class="topbar"><h1>' + TITLES[S.tab] + '</h1><div class="top-right">' + sel +
      '<button class="btn primary" data-act="new">' + icon('plus', 15) + label + '</button></div></div>';
  }

  function page() {
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
      '<button class="check' + (x.done ? ' on' : '') + '" data-toggle="' + kind + ':' + x.id + '" aria-label="Mark ' + (x.done ? 'not done' : 'done') + '">' + (x.done ? icon('tick', 12) : '') + '</button>' +
      '<div class="row-main"><div class="row-title">' + esc(x.title) + '</div><div class="row-sub">' + who + coChip(x.companyId) + '</div></div>' +
      '<span class="due' + (late ? ' late' : '') + '">' + (x.due ? relDue(x.due) : '') + '</span></div>';
  }

  function dashboardPage() {
    var sc = scoped(), t = today(), week = addDays(t, 7);
    if (!S.data.companies.length && !S.data.vulns.length && !S.data.tasks.length && !S.data.followups.length) {
      return emptyState('Set up your first company', 'Add a company and its SLA targets, then log vulnerabilities, tasks, and follow ups against it. Not ready to type anything in yet? Load sample data to look around.',
        '<button class="btn primary" data-act="newco">' + icon('plus', 15) + 'Add company</button><button class="btn" data-act="sample">Load sample data</button>');
    }
    var openV = sc.v.filter(function (v) { return v.status === 'open'; });
    var breached = openV.filter(function (v) { return vStatus(v).k === 'breached'; });
    var soon = openV.filter(function (v) { return vStatus(v).k === 'soon'; });
    var openT = sc.t.filter(function (x) { return !x.done; });
    var openF = sc.f.filter(function (x) { return !x.done; });
    var both = openT.concat(openF);
    var overdue = both.filter(function (x) { return x.due && x.due < t; }).length;
    var dueWeek = both.filter(function (x) { return x.due && x.due >= t && x.due <= week; }).length +
      openV.filter(function (v) { var d = effDue(v); return d && d >= t && d <= week; }).length;

    var tiles = '<div class="grid g-tiles">' +
      '<button class="tile" data-go="vulns"><div class="lbl">Open vulnerabilities</div><div class="num">' + openV.length + '</div><div class="note">' + soon.length + ' due within 3 days</div></button>' +
      '<button class="tile" data-go="vulns" data-vf="breached"><div class="lbl">SLA breached</div><div class="num' + (breached.length ? ' red' : '') + '">' + breached.length + '</div><div class="note">' + (breached.length ? 'Past their due date' : 'Nothing past due') + '</div></button>' +
      '<button class="tile" data-go="tasks"><div class="lbl">Overdue tasks and follow ups</div><div class="num' + (overdue ? ' amber' : '') + '">' + overdue + '</div><div class="note">' + openT.length + ' tasks, ' + openF.length + ' follow ups open</div></button>' +
      '<div class="tile"><div class="lbl">Due in the next 7 days</div><div class="num">' + dueWeek + '</div><div class="note">Across vulns, tasks, follow ups</div></div></div>';

    var cos = S.data.companies.filter(function (c) { return S.company === 'all' || c.id === S.company; });
    var slaHtml = cos.length ? '<div class="sla-list">' + cos.map(slaBlock).join('') + '</div>' :
      '<div class="empty-line">Add a company on the SLAs tab to see compliance here.</div>';
    var slaCard = '<div class="card"><div class="card-h"><h2>SLA health</h2><span class="sub">Open and fixed vulns, per company</span></div>' + slaHtml + '</div>';

    var marks = {};
    function mk(d) { if (d) marks[d] = (marks[d] || 0) + 1; }
    openT.forEach(function (x) { mk(x.due); });
    openF.forEach(function (x) { mk(x.due); });
    openV.forEach(function (v) { mk(effDue(v)); });
    var dayItems = [];
    openV.forEach(function (v) { if (effDue(v) === S.calSel) dayItems.push(['Vuln', v.title]); });
    openT.forEach(function (x) { if (x.due === S.calSel) dayItems.push(['Task', x.title]); });
    openF.forEach(function (x) { if (x.due === S.calSel) dayItems.push(['Follow up', x.title]); });
    var dayHtml = dayItems.length ? dayItems.slice(0, 6).map(function (i) {
      return '<div class="day-item"><span class="k">' + i[0] + '</span><span class="t">' + esc(i[1]) + '</span></div>';
    }).join('') + (dayItems.length > 6 ? '<div class="day-item"><span class="k"></span><span class="t">' + (dayItems.length - 6) + ' more</span></div>' : '') :
      '<div class="day-item"><span class="t" style="color:var(--tx3)">Nothing due</span></div>';
    var calCard = '<div class="card mini-cal">' + D.calHTML(S.calY, S.calM, { sel: S.calSel, marks: marks }) +
      '<div class="day-list"><div class="lbl">' + fmtFull(S.calSel) + '</div>' + dayHtml + '</div></div>';

    var attention = openV.filter(function (v) { var k = vStatus(v).k; return k === 'breached' || k === 'soon'; }).sort(vSort).slice(0, 6);
    var attHtml = attention.length ? '<div class="rows">' + attention.map(function (v) {
      var st = vStatus(v);
      var when = st.k === 'breached' ? (-st.d) + 'd over' : (st.d === 0 ? 'Today' : st.d + 'd left');
      return '<div class="row" data-open="vulns:' + v.id + '"><span class="sev-dot" style="background:var(--sev-' + v.severity + ')"></span>' +
        '<div class="row-main"><div class="row-title">' + esc(v.title) + '</div><div class="row-sub">' + coChip(v.companyId) + '</div></div>' +
        '<span class="due' + (st.k === 'breached' ? ' late' : '') + '">' + when + '</span></div>';
    }).join('') + '</div>' : '<div class="empty-line">No vulnerabilities are past due or close to it.</div>';

    function listHtml(kind, items) {
      var l = items.sort(dueSort).slice(0, 6);
      return l.length ? '<div class="rows">' + l.map(function (x) { return checkRow(kind, x); }).join('') + '</div>' : '<div class="empty-line">All clear.</div>';
    }
    var bottom = '<div class="grid g-bot">' +
      '<div class="card"><div class="card-h"><h2>Needs attention</h2><span class="sub">Vulns</span></div>' + attHtml + '</div>' +
      '<div class="card"><div class="card-h"><h2>Tasks</h2><span class="sub">' + openT.length + ' open</span></div>' + listHtml('tasks', openT.slice()) + '</div>' +
      '<div class="card"><div class="card-h"><h2>Follow ups</h2><span class="sub">' + openF.length + ' open</span></div>' + listHtml('followups', openF.slice()) + '</div></div>';

    return tiles + '<div class="grid g-mid">' + slaCard + calCard + '</div>' + bottom;
  }

  function slaBlock(c) {
    var vs = S.data.vulns.filter(function (v) { return v.companyId === c.id && (v.status === 'open' || v.status === 'fixed'); });
    var tracked = vs.filter(function (v) { return effDue(v); });
    var ok = tracked.filter(function (v) {
      var due = effDue(v);
      if (v.status === 'fixed') return !v.fixedOn || v.fixedOn <= due;
      return due >= today();
    }).length;
    var pct = tracked.length ? Math.round(ok / tracked.length * 100) : null;
    var pctHtml = pct === null ? '<div class="pct" style="color:var(--tx3)">None<small>tracked</small></div>' :
      '<div class="pct" style="color:' + (pct >= 90 ? 'var(--green)' : pct >= 70 ? 'var(--amber)' : 'var(--red)') + '">' + pct + '%<small>within SLA</small></div>';
    var cells = SEV.map(function (s) {
      var open = vs.filter(function (v) { return v.severity === s && v.status === 'open'; });
      var br = open.filter(function (v) { return vStatus(v).k === 'breached'; }).length;
      var days = c.sla ? c.sla[s] : '';
      return '<div class="sev-cell"><div class="t"><i style="background:var(--sev-' + s + ')"></i>' + SEV_LABEL[s] + '</div><div class="n">' + open.length +
        '</div><div class="b' + (br ? ' red' : '') + '">' + (br ? br + ' breached' : (days ? days + ' day SLA' : 'No SLA set')) + '</div></div>';
    }).join('');
    return '<div class="sla-co"><div><div class="nm">' + coChip(c.id).replace('class="co"', 'class="co" style="font-size:13.5px;color:var(--tx);font-weight:600"') + '</div>' + pctHtml + '</div><div class="sev-grid">' + cells + '</div></div>';
  }

  function vulnsPage() {
    var all = S.data.vulns.filter(inScope);
    var F = {
      open: function (v) { return v.status === 'open'; },
      breached: function (v) { return vStatus(v).k === 'breached'; },
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
      return '<div class="vrow" data-open="vulns:' + v.id + '">' + '<span>' + sevChip(v.severity) + '</span>' +
        '<span><div class="ttl">' + esc(v.title) + '</div>' + (v.cve ? '<div class="cve">' + esc(v.cve) + '</div>' : '') + '</span>' +
        '<span>' + coChip(v.companyId) + '</span><span class="dd">' + fmtShort(v.discovered) + '</span>' +
        '<span class="dd">' + (due ? fmtShort(due) : 'No SLA') + sub + '</span><span>' + stChip(v) + '</span>' +
        '<button class="icon-btn" data-fix="' + v.id + '" aria-label="' + (v.status === 'fixed' ? 'Reopen' : 'Mark fixed') + '" title="' + (v.status === 'fixed' ? 'Reopen' : 'Mark fixed') + '">' + icon(v.status === 'fixed' ? 'undo' : 'tick', 16) + '</button></div>';
    }).join('');
    var body = list.length ? '<div class="vtable">' + head + rows + '</div>' :
      emptyState(all.length ? 'Nothing in this view' : 'Log your first vulnerability', all.length ? 'Try another filter above.' : 'Add a finding and Deskline sets its due date from the company SLA.', all.length ? '' : '<button class="btn primary" data-act="new">' + icon('plus', 15) + 'New vulnerability</button>');
    return '<div class="filters">' + chips + '</div>' + body;
  }

  function slasPage() {
    var cs = S.data.companies;
    if (!cs.length) return emptyState('Add your first company', 'Every company gets its own SLA targets in days for each severity. Vulnerability due dates are calculated from them.',
      '<button class="btn primary" data-act="newco">' + icon('plus', 15) + 'Add company</button>');
    var cards = cs.map(function (c) {
      var vs = S.data.vulns.filter(function (v) { return v.companyId === c.id && v.status === 'open'; });
      var br = vs.filter(function (v) { return vStatus(v).k === 'breached'; }).length;
      var ins = SEV.map(function (s) {
        return '<div class="sla-in"><label><i style="background:var(--sev-' + s + ')"></i>' + SEV_LABEL[s] + '</label><div class="wrap"><input type="number" min="1" max="3650" value="' + (c.sla ? c.sla[s] : '') + '" data-sla="' + c.id + ':' + s + '" aria-label="' + SEV_LABEL[s] + ' SLA in days"><span class="u">days</span></div></div>';
      }).join('');
      return '<div class="card"><div class="co-head"><span class="dotc" style="background:' + coColor(c.id) + '"></span><input type="text" value="' + esc(c.name) + '" data-coname="' + c.id + '" aria-label="Company name">' +
        '<button class="icon-btn" data-delco="' + c.id + '" aria-label="Delete company" title="Delete company">' + icon('trash', 16) + '</button></div>' +
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
    var open = all.filter(function (x) { return !x.done; });
    var done = all.filter(function (x) { return x.done; });
    var one = kind === 'tasks' ? 'task' : 'follow up';
    var defCo = S.company !== 'all' ? S.company : '';
    var copts = '<option value="">No company</option>' + S.data.companies.map(function (c) {
      return '<option value="' + c.id + '"' + (c.id === defCo ? ' selected' : '') + '>' + esc(c.name) + '</option>';
    }).join('');
    var composer = '<div class="composer"><input type="text" id="comp-title" placeholder="' + (kind === 'tasks' ? 'Add a task and press Return' : 'Who or what are you following up on') + '" aria-label="New ' + one + '">' +
      '<select id="comp-co" aria-label="Company">' + copts + '</select>' +
      '<button type="button" class="datefield" id="comp-due" data-val="">' + icon('cal', 16) + '<span class="ph">Due date</span></button>' +
      '<button class="btn primary" data-act="comp-add">Add</button></div>';
    var groups = groupItems(open).map(function (g) {
      return '<div class="group-h' + (g[2] ? ' ' + g[2] : '') + '">' + g[0] + '<span class="n">' + g[1].length + '</span></div><div class="listcard"><div class="rows">' +
        g[1].map(function (x) { return checkRow(kind, x); }).join('') + '</div></div>';
    }).join('');
    if (!open.length) groups = '<div class="empty-line">' + (all.length ? 'Everything is done.' : 'Nothing here yet. Add your first ' + one + ' above.') + '</div>';
    var doneHtml = '';
    if (done.length) {
      doneHtml = '<div class="group-h" style="cursor:pointer" data-act="toggle-done">' + icon('down', 14) + 'Completed<span class="n">' + done.length + '</span></div>';
      if (S.showDone) doneHtml += '<div class="listcard"><div class="rows">' + done.sort(function (a, b) { return (b.doneOn || '') < (a.doneOn || '') ? -1 : 1; }).map(function (x) { return checkRow(kind, x); }).join('') + '</div></div>';
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

  function openModal(type, id) {
    var item = id && type !== 'company' ? S.data[type].find(function (x) { return x.id === id; }) : null;
    M = { type: type, id: item ? item.id : null, v: item ? JSON.parse(JSON.stringify(item)) : blank(type) };
    renderModal();
    var f = $('#f-title') || $('#f-name');
    if (f) f.focus();
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
          return '<div class="sla-in"><label><i style="background:var(--sev-' + s + ')"></i>' + SEV_LABEL[s] + '</label><div class="wrap"><input type="number" min="1" max="3650" id="f-sla-' + s + '" value="' + v.sla[s] + '"><span class="u">days</span></div></div>';
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
        '<div class="hint" id="sla-hint" style="margin:-6px 0 12px"></div>' + fld('Notes', '<textarea id="f-notes" placeholder="Affected hosts, ticket link, remediation plan">' + esc(v.notes) + '</textarea>');
    }
    h += '<div class="form-err" id="form-err"></div><div class="modal-actions">' +
      (!isNew && t !== 'company' ? '<button class="btn ghost danger" data-m="delete">Delete</button>' : '') + '<span class="sp"></span><button class="btn" data-m="cancel">Cancel</button><button class="btn primary" data-m="save">' + (isNew ? 'Add' : 'Save') + '</button></div>';
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
      var c = { id: D.uid(), name: name, sla: sla };
      S.data.companies.push(c);
      S.company = 'all';
      closeModal();
      return persist();
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
    if (M.id) {
      var i = S.data[t].findIndex(function (x) { return x.id === M.id; });
      if (i >= 0) S.data[t][i] = Object.assign({}, S.data[t][i], v);
    } else {
      v.id = D.uid(); v.created = Date.now();
      S.data[t].push(v);
    }
    closeModal();
    persist();
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

  function newMenu(btn) {
    var el = document.createElement('div');
    el.className = 'popover menu';
    el.innerHTML = [['tasks', 'check', 'Task'], ['followups', 'reply', 'Follow up'], ['vulns', 'shield', 'Vulnerability']].map(function (i) {
      return '<button data-newmenu="' + i[0] + '">' + icon(i[1], 16) + i[2] + '</button>';
    }).join('');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('[data-newmenu]');
      if (!b) return;
      D.closePopover();
      openModal(b.dataset.newmenu);
    });
    D.showPopover(btn, el, { alignRight: true });
  }

  function newForTab() {
    if (S.tab === 'dashboard') return newMenu($('[data-act=new]'));
    if (S.tab === 'slas') return openModal('company');
    openModal(S.tab);
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
    var op = t.closest('[data-open]');
    if (op) { var rr = splitRef(op.dataset.open); return openModal(rr.kind, rr.id); }
    var vf = t.closest('[data-vf]');
    if (vf) { S.vf = vf.dataset.vf; if (vf.dataset.go) S.tab = vf.dataset.go; return render(); }
    var go = t.closest('[data-go]');
    if (go) { S.tab = go.dataset.go; return render(); }
    var cal = t.closest('[data-cal]');
    if (cal) {
      S.calM += cal.dataset.cal === 'next' ? 1 : -1;
      if (S.calM > 11) { S.calM = 0; S.calY++; }
      if (S.calM < 0) { S.calM = 11; S.calY--; }
      return render();
    }
    var dd = t.closest('.mini-cal [data-date]');
    if (dd) { S.calSel = dd.dataset.date; return render(); }
    var cd = t.closest('#comp-due');
    if (cd) {
      return D.openPicker(cd, {
        value: cd.dataset.val, clearable: true,
        onPick: function (d) { cd.dataset.val = d; var sp = cd.querySelector('span'); sp.textContent = d ? fmtShort(d) : 'Due date'; sp.className = d ? '' : 'ph'; var ti = $('#comp-title'); if (ti) ti.focus(); }
      });
    }
    var ac = t.closest('[data-act]');
    if (!ac) return;
    var act = ac.dataset.act;
    if (act === 'new') newForTab();
    else if (act === 'newco') openModal('company');
    else if (act === 'sample') loadSample();
    else if (act === 'clear-sample') { if (confirm('Remove all sample companies and items?')) clearSample(); }
    else if (act === 'toggle-done') { S.showDone = !S.showDone; render(); }
    else if (act === 'comp-add') addFromComposer();
    else if (act === 'export') api.exportData();
    else if (act === 'import') api.importData().then(function (d) { if (d) { S.data = d; render(); } });
  });

  function addFromComposer() {
    var ti = $('#comp-title');
    if (!ti) return;
    var title = ti.value.trim();
    if (!title) { ti.focus(); return; }
    var kind = S.tab;
    var item = { id: D.uid(), title: title, companyId: $('#comp-co').value, due: $('#comp-due').dataset.val || '', notes: '', done: false, created: Date.now() };
    if (kind === 'followups') item.who = '';
    S.data[kind].push(item);
    persist();
    var again = $('#comp-title');
    if (again) again.focus();
  }

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.matches('[data-act=company]')) { S.company = t.value; render(); return; }
    if (M && (t.id === 'f-company' || t.id === 'f-sev')) updateHint();
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
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
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && M) { closeModal(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      if (M && e.target.tagName === 'INPUT') { e.preventDefault(); saveModal(); }
      else if (e.target.id === 'comp-title') { e.preventDefault(); addFromComposer(); }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n' && !M) { e.preventDefault(); newForTab(); }
  });

  api.onChanged(function (d) { S.data = normalize(d); render(); });

  function normalize(d) {
    d = d || {};
    return { version: 1, companies: d.companies || [], vulns: d.vulns || [], tasks: d.tasks || [], followups: d.followups || [] };
  }
  api.load().then(function (d) { S.data = normalize(d); render(); });
  render();
})();
