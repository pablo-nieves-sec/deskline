(function () {
  var pad = function (n) { return String(n).padStart(2, '0'); };
  var iso = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var parse = function (s) { var p = s.split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
  var today = function () { return iso(new Date()); };
  var addDays = function (s, n) { var d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  var diffDays = function (a, b) { return Math.round((parse(a) - parse(b)) / 864e5); };
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  function fmtShort(s) {
    if (!s) return '';
    var d = parse(s);
    var o = { month: 'short', day: 'numeric' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString(undefined, o);
  }
  function fmtFull(s) {
    return s ? parse(s).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }
  function relDue(s) {
    if (!s) return 'No date';
    var d = diffDays(s, today());
    if (d === 0) return 'Today';
    if (d === 1) return 'Tomorrow';
    if (d === -1) return 'Yesterday';
    if (d < 0) return (-d) + ' days overdue';
    if (d < 7) return parse(s).toLocaleDateString(undefined, { weekday: 'long' });
    return fmtShort(s);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var SEV = ['critical', 'high', 'medium', 'low'];
  var SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
  var DEFAULT_SLA = { critical: 7, high: 30, medium: 60, low: 90 };

  var ICON = {
    dash: '<rect x="3" y="3" width="7" height="9" rx="2"/><rect x="14" y="3" width="7" height="5" rx="2"/><rect x="14" y="12" width="7" height="9" rx="2"/><rect x="3" y="16" width="7" height="5" rx="2"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6l8-3z"/><path d="M12 8.5v4M12 16v.01"/>',
    timer: '<circle cx="12" cy="13" r="8"/><path d="M12 13l3-3M9 2.5h6"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    reply: '<path d="M9 14L4 9l5-5"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/>',
    left: '<path d="M15 6l-6 6 6 6"/>',
    right: '<path d="M9 6l6 6-6 6"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    tick: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    down: '<path d="M6 9l6 6 6-6"/>',
    download: '<path d="M12 4v12M7 11l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'
  };
  function icon(name, size) {
    var s = size || 16;
    return '<svg class="ic" width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>';
  }

  function calHTML(y, m, o) {
    o = o || {};
    var t = today();
    var start = new Date(y, m, 1).getDay();
    var h = '<div class="cal-head"><button type="button" class="cal-nav" data-cal="prev" aria-label="Previous month">' + icon('left', 16) +
      '</button><div class="cal-title">' + MONTHS[m] + ' ' + y + '</div><button type="button" class="cal-nav" data-cal="next" aria-label="Next month">' + icon('right', 16) + '</button></div>';
    h += '<div class="cal-grid">' + DOW.map(function (d) { return '<span class="cal-dow">' + d + '</span>'; }).join('');
    for (var i = 0; i < 42; i++) {
      var d = new Date(y, m, 1 - start + i);
      var s = iso(d);
      var cls = ['cal-day'];
      if (d.getMonth() !== m) cls.push('out');
      if (s === t) cls.push('today');
      if (s === o.sel) cls.push('sel');
      var mk = o.marks && o.marks[s];
      h += '<button type="button" class="' + cls.join(' ') + '" data-date="' + s + '">' + d.getDate() +
        (mk ? '<i class="dot' + (s < t ? ' late' : '') + '"></i>' : '') + '</button>';
    }
    return h + '</div>';
  }

  var cur = null;
  function closePopover() {
    if (!cur) return;
    var c = cur;
    cur = null;
    document.removeEventListener('mousedown', c.md, true);
    document.removeEventListener('keydown', c.kd, true);
    c.el.remove();
    if (c.onClose) c.onClose();
  }
  function showPopover(anchor, el, o) {
    closePopover();
    o = o || {};
    el.style.visibility = 'hidden';
    document.body.appendChild(el);
    function position() {
      var r = anchor.getBoundingClientRect();
      var w = el.offsetWidth, h = el.offsetHeight;
      var top = r.bottom + 6, left = r.left;
      if (o.alignRight) left = r.right - w;
      if (!o.noFlip && top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
      if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
      el.style.top = top + 'px';
      el.style.left = Math.max(8, left) + 'px';
    }
    position();
    el.style.visibility = '';
    var md = function (e) { if (!el.contains(e.target) && !anchor.contains(e.target)) closePopover(); };
    var kd = function (e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closePopover(); } };
    document.addEventListener('mousedown', md, true);
    document.addEventListener('keydown', kd, true);
    cur = { el: el, md: md, kd: kd, onClose: o.onClose };
    return { reposition: position };
  }

  function openPicker(anchor, o) {
    o = o || {};
    var base = o.value ? parse(o.value) : new Date();
    var vy = base.getFullYear(), vm = base.getMonth();
    var el = document.createElement('div');
    el.className = 'popover datepicker';
    function render() {
      el.innerHTML = calHTML(vy, vm, { sel: o.value }) +
        '<div class="cal-quick"><button type="button" data-quick="today">Today</button><button type="button" data-quick="tomorrow">Tomorrow</button><button type="button" data-quick="week">Next week</button>' +
        (o.clearable ? '<button type="button" data-quick="clear" class="muted">' + (o.clearLabel || 'Clear') + '</button>' : '') + '</div>';
    }
    el.addEventListener('click', function (e) {
      var t = e.target.closest('[data-cal],[data-date],[data-quick]');
      if (!t) return;
      if (t.dataset.cal) {
        vm += t.dataset.cal === 'next' ? 1 : -1;
        if (vm > 11) { vm = 0; vy++; }
        if (vm < 0) { vm = 11; vy--; }
        render();
        return;
      }
      var pick;
      if (t.dataset.date) pick = t.dataset.date;
      else if (t.dataset.quick === 'clear') pick = '';
      else if (t.dataset.quick === 'today') pick = today();
      else if (t.dataset.quick === 'tomorrow') pick = addDays(today(), 1);
      else pick = addDays(today(), 7);
      closePopover();
      if (o.onPick) o.onPick(pick);
    });
    render();
    showPopover(anchor, el, { noFlip: o.noFlip, onClose: o.onClose });
  }

  window.DL = {
    iso: iso, parse: parse, today: today, addDays: addDays, diffDays: diffDays,
    fmtShort: fmtShort, fmtFull: fmtFull, relDue: relDue, esc: esc, uid: uid,
    SEV: SEV, SEV_LABEL: SEV_LABEL, DEFAULT_SLA: DEFAULT_SLA, MONTHS: MONTHS,
    icon: icon, calHTML: calHTML, showPopover: showPopover, closePopover: closePopover, openPicker: openPicker
  };
})();
