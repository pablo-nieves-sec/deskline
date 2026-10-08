(function () {
  var D = DL, api = window.deskline;
  var esc = D.esc, SEV = D.SEV, SEV_LABEL = D.SEV_LABEL;
  var $ = function (s) { return document.querySelector(s); };
  var data = { companies: [] };
  var type = 'tasks', due = '', busy = false;
  var PH = { tasks: 'What needs doing', followups: 'Who or what are you following up on', vulns: 'Finding or CVE title' };
  var BTN = { tasks: 'Add task', followups: 'Add follow up', vulns: 'Add vulnerability' };
  var PICKH = 410;

  function baseHeight() { return $('#qcard').offsetHeight + 16; }
  function fit() { api.resizeQuick(baseHeight()); }

  function fill() {
    var cur = $('#q-co').value;
    $('#q-co').innerHTML = '<option value="">No company</option>' + data.companies.map(function (c) {
      return '<option value="' + c.id + '">' + esc(c.name) + '</option>';
    }).join('');
    $('#q-co').value = cur && data.companies.some(function (c) { return c.id === cur; }) ? cur : (data.companies[0] ? data.companies[0].id : '');
    $('#q-sev').innerHTML = SEV.map(function (s) { return '<option value="' + s + '"' + (s === 'high' ? ' selected' : '') + '>' + SEV_LABEL[s] + '</option>'; }).join('');
  }
  function dateLabel() {
    var empty = type === 'vulns' ? 'Due: from SLA' : 'No date';
    $('#q-date').innerHTML = D.icon('cal', 16) + '<span class="' + (due ? '' : 'ph') + '">' + (due ? D.fmtShort(due) : empty) + '</span>';
  }
  function setType(t) {
    type = t;
    document.querySelectorAll('#seg button').forEach(function (b) { b.classList.toggle('on', b.dataset.type === t); });
    $('#q-title').placeholder = PH[t];
    $('#q-add').textContent = BTN[t];
    $('#q-sev').hidden = t !== 'vulns';
    dateLabel();
    $('#q-title').focus();
  }
  function hint(msg, cls) {
    var h = $('#q-hint');
    h.textContent = msg || 'Return to add, Esc to close';
    h.className = 'qhint' + (cls ? ' ' + cls : '');
  }
  function reset() {
    D.closePopover();
    due = '';
    busy = false;
    $('#q-title').value = '';
    hint();
    setType(type);
    fit();
  }
  function add() {
    if (busy) return;
    var title = $('#q-title').value.trim();
    if (!title) { hint('Enter a title first', 'err'); $('#q-title').focus(); return; }
    var item = { id: D.uid(), title: title, companyId: $('#q-co').value, notes: '', created: Date.now() };
    if (type === 'vulns') {
      item.cve = ''; item.severity = $('#q-sev').value; item.discovered = D.today();
      item.dueOverride = due; item.status = 'open'; item.fixedOn = '';
    } else {
      item.due = due; item.done = false;
      if (type === 'followups') item.who = '';
    }
    busy = true;
    api.add(type, item).then(function () {
      hint('Added', 'ok');
      $('#q-title').value = '';
      setTimeout(function () { api.hideQuick(); }, 450);
    }).catch(function () {
      busy = false;
      hint('Could not save. Check your connection', 'err');
    });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('#seg button');
    if (b) return setType(b.dataset.type);
    if (e.target.closest('#q-add')) return add();
    var d = e.target.closest('#q-date');
    if (d) {
      api.resizeQuick(baseHeight() + PICKH).then(function () {
        D.openPicker(d, {
          value: due, clearable: true, noFlip: true, clearLabel: type === 'vulns' ? 'Use SLA' : 'Clear',
          onPick: function (v) { due = v; dateLabel(); },
          onClose: function () { fit(); $('#q-title').focus(); }
        });
      });
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'q-title') { e.preventDefault(); add(); }
    else if (e.key === 'Escape') api.hideQuick();
    else if ((e.metaKey || e.ctrlKey) && /^[1-3]$/.test(e.key)) { e.preventDefault(); setType(['tasks', 'followups', 'vulns'][+e.key - 1]); }
  });
  api.onChanged(function (d) { data = d; fill(); });
  api.onQuickShow(function () { api.load().then(function (d) { data = d; fill(); reset(); }); });
  api.load().then(function (d) { data = d; fill(); setType('tasks'); fit(); });
})();
