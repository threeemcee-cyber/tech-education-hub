/* Tech Education Hub - phone version. Same catalogue as the TV and PC app, same per-person progress,
   synced through the household sync code shown on the TV (Your profile > Use on your phone). */
(function () {
  'use strict';
  var D = window.CL_DATA, LS = window.localStorage;
  function load(k, d) { try { var v = LS.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function save(k, v) { try { LS.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (x < 10 ? '0' : '') + x; }
  function hours(s) { var x = s / 3600; return x >= 10 ? Math.round(x) + ' h' : x >= 1 ? x.toFixed(1).replace('.0', '') + ' h' : Math.round(s / 60) + ' min'; }
  function thumb(id) { return 'https://i.ytimg.com/vi/' + id + '/mqdefault.jpg'; }
  function bar(f) { return '<div class="bar"><i style="width:' + Math.round(f * 100) + '%"></i></div>'; }
  var page = document.getElementById('page'), backBtn = document.getElementById('back'), chip = document.getElementById('chip'), toastEl = document.getElementById('toast');
  var toastT; function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('on'); }, 2600); }

  /* ---------- people and progress (same format as the TV app) ---------- */
  var COLORS = ['#f5b83d', '#3ecf8e', '#5aa9ff', '#ff7a7a', '#c08bff', '#ff9f43', '#2ed3c6', '#f78fb3'];
  var users = load('cl_users', []), me = null, prog = {}, last = null, gone = load('cl_gone', []);
  function setUser(u) { me = u; prog = load('cl_prog_' + u.id, {}); last = load('cl_last_' + u.id, null); save('cl_me', u.id); }
  function saveProg() { if (me) { save('cl_prog_' + me.id, prog); syncSoon(20000); } }
  function saveLast() { if (me) { if (last) last.at = Date.now(); save('cl_last_' + me.id, last); syncSoon(20000); } }
  function isDone(id) { var p = prog[id]; return !!(p && p[2]); }
  function frac(id) { var p = prog[id]; if (!p) return 0; if (p[2]) return 1; return p[1] ? Math.min(1, p[0] / p[1]) : 0; }
  var saveT = 0;
  function setProg(id, pos, dur, done) {
    var p = prog[id] || [0, 0, 0, 0];
    p[0] = Math.round(pos); if (dur) p[1] = Math.round(dur);
    if (done || (p[1] && pos / p[1] > 0.9)) p[2] = 1;
    p[3] = Date.now(); prog[id] = p;
    if (Date.now() - saveT > 4000 || done) { saveT = Date.now(); saveProg(); }
  }
  function userStats(u) { var p = load('cl_prog_' + u.id, {}), n = 0, st = 0; for (var k in p) { st++; if (p[k][2]) n++; } return n ? n + (n > 1 ? ' videos' : ' video') + ' watched' : (st ? 'In progress' : 'Not started yet'); }
  function courseStats(cid) { var c = D.courses[cid], n = c.v.length, done = 0, secs = 0, f = 0; c.v.forEach(function (x) { secs += x[2]; f += frac(x[0]); if (isDone(x[0])) done++; }); return { n: n, done: done, secs: secs, f: n ? f / n : 0 }; }
  function topicStats(tid) { var n = 0, f = 0, secs = 0; D.topics[tid].c.forEach(function (cid) { var s = courseStats(cid); n += s.n; f += s.f * s.n; secs += s.secs; }); return { n: n, f: n ? f / n : 0, secs: secs }; }
  function careerStats(car) { var seen = {}, n = 0, f = 0; car.tp.forEach(function (t) { D.topics[t].c.forEach(function (cid) { if (seen[cid]) return; seen[cid] = 1; var s = courseStats(cid); n += s.n; f += s.f * s.n; }); }); return { f: n ? f / n : 0 }; }
  function ctxItems(ctx) { if (ctx.kind === 'course') { var c = D.courses[ctx.id]; return c ? c.v.map(function (x) { return [x[0], x[1], x[2], x[3] || D.channels[c.ch] || '']; }) : []; } return ctx.items || []; }
  function careerById(id) { for (var i = 0; i < D.careers.length; i++) if (D.careers[i].id === id) return D.careers[i]; return null; }

  /* ---------- household sync (same store and format as the TV and PC app) ---------- */
  var SYNC_API = 'https://jsonblob.com/api/jsonBlob';
  var syncId = load('cl_sync', null), syncBusy = false, syncPending = false, syncT = 0, syncState = syncId ? 'wait' : 'off';
  function req(method, url, body) {
    var o = { method: method, headers: { Accept: 'application/json' }, cache: 'no-store' };
    if (body) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(body); if (body && method === 'PUT') o.keepalive = o.body.length < 60000; }
    return fetch(url, o).then(function (r) { return r.text().then(function (t) { var j = null; try { j = JSON.parse(t); } catch (e) {} return { st: r.status, j: j, r: r }; }); }, function () { return { st: 0, j: null }; });
  }
  function myProg(id) { return me && me.id === id ? prog : load('cl_prog_' + id, {}); }
  function myLast(id) { return me && me.id === id ? last : load('cl_last_' + id, null); }
  function localSnap() { var p = {}, l = {}; users.forEach(function (u) { p[u.id] = myProg(u.id); l[u.id] = myLast(u.id); }); return { v: 1, app: 'Tech Education Hub', users: users, gone: gone, prog: p, last: l, at: Date.now() }; }
  function mergeProg(a, b) {
    var out = {}, k; for (k in a) out[k] = a[k];
    for (k in b) { var x = out[k], y = b[k]; if (!y || !y.length) continue; if (!x) { out[k] = y; continue; }
      var m = ((y[3] || 0) > (x[3] || 0) ? y : x).slice(); m[2] = (x[2] || y[2]) ? 1 : 0; m[1] = m[1] || x[1] || y[1]; m[3] = Math.max(x[3] || 0, y[3] || 0); out[k] = m; }
    return out;
  }
  function applyRemote(r) {
    if (!r || r.v !== 1) return false;
    var changed = false;
    (r.gone || []).forEach(function (id) { if (gone.indexOf(id) < 0) { gone.push(id); changed = true; } });
    (r.users || []).forEach(function (ru) {
      if (gone.indexOf(ru.id) >= 0) return;
      var have = null, same = null;
      users.forEach(function (u) { if (u.id === ru.id) have = u; else if (u.name.toLowerCase() === String(ru.name).toLowerCase()) same = u; });
      if (have) return;
      if (same) {
        save('cl_prog_' + ru.id, myProg(same.id)); save('cl_last_' + ru.id, myLast(same.id));
        try { LS.removeItem('cl_prog_' + same.id); LS.removeItem('cl_last_' + same.id); } catch (e) {}
        if (load('cl_me', null) === same.id) save('cl_me', ru.id);
        if (me && me.id === same.id) me.id = ru.id;
        same.id = ru.id; changed = true; return;
      }
      if (users.length < 8) { users.push({ id: ru.id, name: String(ru.name).slice(0, 16), c: ru.c || COLORS[users.length % COLORS.length] }); changed = true; }
    });
    var keep = users.filter(function (u) { return gone.indexOf(u.id) < 0; });
    if (keep.length !== users.length) { users.forEach(function (u) { if (gone.indexOf(u.id) >= 0) try { LS.removeItem('cl_prog_' + u.id); LS.removeItem('cl_last_' + u.id); } catch (e) {} }); users = keep; changed = true; }
    users.forEach(function (u) {
      var rp = r.prog && r.prog[u.id];
      if (rp) { var lp = myProg(u.id), m = mergeProg(lp, rp); if (JSON.stringify(m) !== JSON.stringify(lp)) { changed = true; save('cl_prog_' + u.id, m); if (me && me.id === u.id) prog = m; } }
      var rl = r.last && r.last[u.id], ll = myLast(u.id);
      if (rl && rl.vid && (!ll || (rl.at || 0) > (ll.at || 0))) { changed = true; save('cl_last_' + u.id, rl); if (me && me.id === u.id) last = rl; }
    });
    save('cl_users', users); save('cl_gone', gone);
    return changed;
  }
  function syncSoon(ms) { if (!syncId) return; clearTimeout(syncT); syncT = setTimeout(function () { syncNow(); }, ms || 5000); }
  function syncNow(cb) {
    if (!syncId) { if (cb) cb(false); return; }
    if (syncBusy) { syncPending = true; if (cb) cb(false); return; }
    syncBusy = true; clearTimeout(syncT);
    req('GET', SYNC_API + '/' + syncId).then(function (a) {
      if (a.st !== 200 || !a.j) { syncBusy = false; syncState = a.st === 404 ? 'missing' : 'offline'; if (cb) cb(false); return; }
      var changed = applyRemote(a.j);
      return req('PUT', SYNC_API + '/' + syncId, localSnap()).then(function (b) {
        syncBusy = false; syncState = b.st === 200 ? 'ok' : 'offline';
        if (b.st === 200) save('cl_sync_at', Date.now());
        if (changed) refresh();
        if (cb) cb(b.st === 200);
        if (syncPending) { syncPending = false; syncSoon(3000); }
      });
    });
  }
  function syncLink(code, cb) {
    code = String(code || '').trim();
    if (!/^[A-Za-z0-9-]{8,64}$/.test(code)) { cb(false); return; }
    req('GET', SYNC_API + '/' + code).then(function (a) {
      if (a.st === 200 && a.j && a.j.v === 1) { syncId = code; save('cl_sync', code); applyRemote(a.j); syncState = 'wait'; syncNow(); cb(true); } else cb(false);
    });
  }
  function ago(t) { if (!t) return 'not yet'; var s = Math.round((Date.now() - t) / 1000); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 86400 ? Math.round(s / 3600) + ' h ago' : Math.round(s / 86400) + ' days ago'; }

  /* ---------- navigation ---------- */
  var stack = [], cur = null;
  function go(v) { if (cur) { cur.sy = window.scrollY; stack.push(cur); } cur = v; render(true); }
  function back() { if (cur && cur.v === 'play') stopPlayer(); if (!stack.length) return; cur = stack.pop(); render(false); }
  function toWho() { stopPlayer(); stack = []; cur = { v: 'who' }; render(true); }
  backBtn.onclick = function () { history.back(); };
  window.addEventListener('popstate', function () { if (stack.length) back(); else history.pushState({ teh: 1 }, ''); });
  function refresh() {
    if (!cur || cur.v === 'add' || cur.v === 'code') return;
    if (me && users.every(function (u) { return u.id !== me.id; })) { toWho(); return; }
    if (cur.v === 'play') { renderPlayList(); return; }
    var y = window.scrollY; render(false); window.scrollTo(0, y);
  }
  function render(fresh) {
    if (fresh) { try { history.pushState({ teh: 1 }, ''); } catch (e) {} }
    backBtn.classList.toggle('on', stack.length > 0);
    chip.textContent = me && cur.v !== 'who' ? me.name : '';
    if (cur.v !== 'play') hidePlayer();
    var v = cur.v;
    if (v === 'who') renderWho(); else if (v === 'add') renderAdd(); else if (v === 'code') renderCode();
    else if (v === 'home') renderHome(); else if (v === 'career') renderCareer(); else if (v === 'topic') renderTopic();
    else if (v === 'list') renderList(); else if (v === 'profile') renderProfile(); else if (v === 'play') renderPlay();
    window.scrollTo(0, fresh ? 0 : (cur.sy || 0));
  }
  function on(sel, fn) { page.querySelectorAll(sel).forEach(function (el) { el.addEventListener('click', function () { fn(el); }); }); }
  function avatar(u) { return '<span class="av" style="background:' + esc(u.c) + '">' + esc(u.name.charAt(0).toUpperCase()) + '</span>'; }

  function renderWho() {
    me = null; prog = {}; last = null;
    var h = '<h1>' + (users.length ? 'Who is learning?' : 'Welcome') + '</h1><h2>' + (users.length ? 'Pick your name. Everyone has their own progress.' : 'Scan the code on the TV (Your profile, then Use on your phone) to bring your progress here, or add your name to start fresh.') + '</h2><div class="grid">';
    users.forEach(function (u, i) { h += '<button class="card person" data-u="' + i + '">' + avatar(u) + '<div class="n">' + esc(u.name) + '</div><div class="m">' + userStats(u) + '</div></button>'; });
    if (users.length < 8) h += '<button class="card person" data-add="1"><span class="av add">+</span><div class="n">Add person</div><div class="m">Type your name</div></button>';
    if (!syncId) h += '<button class="card person" data-code="1"><span class="av add">&#8645;</span><div class="n">Have a code?</div><div class="m">Sync with the TV</div></button>';
    h += '</div>';
    if (syncId) h += '<p class="status">Synced with the TV and PC app &middot; last sync ' + ago(load('cl_sync_at', 0)) + (syncState === 'offline' ? ' (offline)' : syncState === 'missing' ? ' (code expired)' : '') + '</p>';
    page.innerHTML = h;
    on('[data-u]', function (el) { setUser(users[+el.getAttribute('data-u')]); go({ v: 'home' }); syncNow(); });
    on('[data-add]', function () { go({ v: 'add' }); });
    on('[data-code]', function () { go({ v: 'code' }); });
  }
  function renderAdd() {
    page.innerHTML = '<h1>What is your name?</h1><h2>Use the same name as on the TV so your progress joins up.</h2><div class="box"><input id="nm" maxlength="16" autocomplete="off" autocapitalize="words" placeholder="Your name"><div class="btnrow"><button class="pill" id="ok">Done</button></div></div>';
    var nm = document.getElementById('nm'); setTimeout(function () { nm.focus(); }, 50);
    function done() {
      var name = nm.value.trim().replace(/\s+/g, ' ').replace(/(^|\s)([a-z])/g, function (m, a, b) { return a + b.toUpperCase(); });
      if (!name) { toast('Type a name first'); return; }
      for (var i = 0; i < users.length; i++) if (users[i].name.toLowerCase() === name.toLowerCase()) { toast(name + ' is already here'); return; }
      var used = users.map(function (x) { return x.c; }), c = COLORS[users.length % COLORS.length];
      for (var j = 0; j < COLORS.length; j++) if (used.indexOf(COLORS[j]) < 0) { c = COLORS[j]; break; }
      var u = { id: 'u' + Date.now().toString(36), name: name, c: c };
      users.push(u); save('cl_users', users); setUser(u); syncSoon(1500);
      stack = []; cur = { v: 'who' }; go({ v: 'home' }); toast('Welcome, ' + name);
    }
    document.getElementById('ok').onclick = done;
    nm.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
  }
  function renderCode() {
    page.innerHTML = '<h1>Type the sync code</h1><h2>On the TV: Your profile, then Use on your phone. The code is under the QR code. Scanning the QR code with your camera is quicker.</h2><div class="box"><input id="cd" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Sync code"><div class="btnrow"><button class="pill" id="ok">Link</button></div></div>';
    var cd = document.getElementById('cd'); setTimeout(function () { cd.focus(); }, 50);
    function done() {
      toast('Linking...');
      syncLink(cd.value, function (ok) {
        if (!ok) { toast('That code did not work. Check it and try again'); return; }
        toast('Linked. Your progress is now shared'); stack = []; cur = { v: 'who' }; render(true);
      });
    }
    document.getElementById('ok').onclick = done;
    cd.addEventListener('keydown', function (e) { if (e.key === 'Enter') done(); });
  }
  function renderHome() {
    var h = '';
    if (last && last.vid) {
      var list = ctxItems(last.ctx), title = last.vid; list.forEach(function (x) { if (x[0] === last.vid) title = x[1]; });
      var p = prog[last.vid] || [0, 0];
      h += '<button class="card cont" id="cont"><img src="' + thumb(last.vid) + '" alt=""><div><div class="k">Continue watching</div><div class="n">' + esc(title) + '</div><div class="m">' + esc(last.ctx.title || '') + (p[1] ? ' &middot; ' + fmt(p[0]) + ' of ' + fmt(p[1]) : '') + '</div>' + bar(frac(last.vid)) + '</div></button><h3>Choose a career</h3>';
    } else h += '<h1>Choose a career</h1><h2>Pick where you want to work, then a topic to study.</h2>';
    h += '<div class="grid">';
    D.careers.forEach(function (car, i) {
      var st = careerStats(car);
      h += '<button class="card" data-car="' + i + '"><div class="n">' + esc(car.t) + '</div><div class="s">' + esc(car.s) + '</div><div class="m">' + car.tp.length + ' topics' + (st.f >= 0.005 ? ' &middot; ' + Math.round(st.f * 100) + '% done' : '') + '</div>' + bar(st.f) + '</button>';
    });
    h += '</div><h3>Your profile</h3><button class="card cont" id="prof">' + avatar(me) + '<div><div class="n">' + esc(me.name) + '</div><div class="m">' + userStats(me) + ' &middot; switch person or sync</div></div></button>';
    page.innerHTML = h;
    var c = document.getElementById('cont');
    if (c) c.onclick = function () { var list = ctxItems(last.ctx), idx = 0; list.forEach(function (x, i) { if (x[0] === last.vid) idx = i; }); if (list.length) go({ v: 'play', ctx: last.ctx, list: list, idx: idx }); };
    on('[data-car]', function (el) { var car = D.careers[+el.getAttribute('data-car')]; go({ v: 'career', id: car.id }); });
    document.getElementById('prof').onclick = function () { go({ v: 'profile' }); };
  }
  function renderCareer() {
    var car = careerById(cur.id), h = '<h1>' + esc(car.t) + '</h1><h2>' + esc(car.s) + '. Pick a topic.</h2><div class="grid">';
    car.tp.forEach(function (tid) { var t = D.topics[tid], st = topicStats(tid); h += '<button class="card" data-t="' + tid + '"><div class="n">' + esc(t.t) + '</div><div class="m">' + t.c.length + (t.c.length > 1 ? ' courses' : ' course') + ' &middot; ' + hours(st.secs) + (st.f >= 0.005 ? ' &middot; ' + Math.round(st.f * 100) + '% done' : '') + '</div>' + bar(st.f) + '</button>'; });
    page.innerHTML = h + '</div>';
    on('[data-t]', function (el) { go({ v: 'topic', id: el.getAttribute('data-t'), from: car.t }); });
  }
  function renderTopic() {
    var t = D.topics[cur.id], h = '<h1>' + esc(t.t) + '</h1><h2>' + esc(cur.from || '') + '</h2><div class="grid">';
    t.c.forEach(function (cid) { var c = D.courses[cid], st = courseStats(cid); h += '<button class="card" data-c="' + cid + '"><div class="n">' + esc(c.t) + '</div><div class="s">' + esc(c.ch ? (D.channels[c.ch] || '') : 'Several channels') + '</div><div class="m">' + st.n + ' videos &middot; ' + hours(st.secs) + (st.done ? ' &middot; ' + st.done + ' watched' : '') + '</div>' + bar(st.f) + '</button>'; });
    page.innerHTML = h + '</div>';
    on('[data-c]', function (el) { var cid = el.getAttribute('data-c'); go({ v: 'list', ctx: { kind: 'course', id: cid, title: D.courses[cid].t } }); });
  }
  function rowsHTML(list, nowIdx) {
    var h = '<div class="list">';
    list.forEach(function (x, i) {
      var p = prog[x[0]], d = isDone(x[0]);
      h += '<button class="row' + (i === nowIdx ? ' now' : '') + '" data-i="' + i + '"><div class="th"><img loading="lazy" src="' + thumb(x[0]) + '" alt=""><span class="num">' + (i + 1) + '</span>' + (frac(x[0]) > 0 ? bar(frac(x[0])) : '') + '</div><div class="tx"><div class="n">' + esc(x[1]) + '</div><div class="m">' + (x[2] ? fmt(x[2]) : '') + (x[3] ? ' &middot; ' + esc(x[3]) : '') + (d ? ' &middot; <span class="ok">&#10003; watched</span>' : (p && p[0] > 15 ? ' &middot; stopped at ' + fmt(p[0]) : '')) + '</div></div></button>';
    });
    return h + '</div>';
  }
  function renderList() {
    var list = ctxItems(cur.ctx), secs = 0, done = 0, resume = -1;
    list.forEach(function (x, i) { secs += x[2] || 0; if (isDone(x[0])) done++; if (resume < 0 && !isDone(x[0])) resume = i; });
    if (resume < 0) resume = 0;
    page.innerHTML = '<h1>' + esc(cur.ctx.title) + '</h1><h2>' + list.length + ' videos &middot; ' + hours(secs) + ' &middot; ' + done + ' watched</h2><div class="head"><button class="pill" id="go">' + (done ? 'Carry on: video ' + (resume + 1) : 'Start video 1') + '</button></div>' + rowsHTML(list, -1);
    document.getElementById('go').onclick = function () { go({ v: 'play', ctx: cur.ctx, list: list, idx: resume }); };
    on('.row', function (el) { go({ v: 'play', ctx: cur.ctx, list: list, idx: +el.getAttribute('data-i') }); });
  }
  function renderProfile() {
    var h = '<h1>' + avatar(me) + ' &nbsp;' + esc(me.name) + '</h1><h2>' + userStats(me) + '</h2>';
    h += '<div class="box"><p><b>Sync with the TV and PC app</b></p>' + (syncId ? '<p>On. Progress for everyone in the house is shared. Last sync ' + ago(load('cl_sync_at', 0)) + (syncState === 'offline' ? ' (offline)' : syncState === 'missing' ? ' (this code has expired: turn sync on again on the TV and rescan)' : '') + '.</p><div class="btnrow"><button class="pill" id="sn">Sync now</button><button class="pill ghost" id="lk">Use a different code</button><button class="pill ghost" id="off">Stop syncing</button></div>'
      : '<p>Off. On the TV, open Your profile and choose Use on your phone, then scan the QR code with your camera.</p><div class="btnrow"><button class="pill" id="lk">Type a code instead</button></div>') + '</div>';
    h += '<div class="btnrow"><button class="pill ghost" id="sw">Switch person</button><button class="pill ghost danger" id="rm">Remove my profile</button></div>';
    page.innerHTML = h;
    var $ = function (id) { return document.getElementById(id); };
    $('sw').onclick = toWho;
    if ($('sn')) $('sn').onclick = function () { toast('Syncing...'); syncNow(function (ok) { toast(ok ? 'Synced' : 'Could not sync. Check the internet'); refresh(); }); };
    $('lk').onclick = function () { go({ v: 'code' }); };
    if ($('off')) $('off').onclick = function () { syncId = null; syncState = 'off'; try { LS.removeItem('cl_sync'); } catch (e) {} toast('Sync is off on this phone'); refresh(); };
    $('rm').onclick = function () {
      if (!cur.armed) { cur.armed = true; $('rm').textContent = 'Tap again to remove ' + me.name + ' everywhere'; return; }
      var u = me; users = users.filter(function (x) { return x.id !== u.id; }); save('cl_users', users);
      if (gone.indexOf(u.id) < 0) gone.push(u.id); save('cl_gone', gone);
      try { LS.removeItem('cl_prog_' + u.id); LS.removeItem('cl_last_' + u.id); } catch (e) {}
      syncSoon(500); toast(u.name + ' has been removed'); toWho();
    };
  }

  /* ---------- player: YouTube's own embedded player (Brave blocks its ads) ---------- */
  var pw = document.getElementById('pw'), YTP = null, ytReady = false, ytQueue = null, tick = 0, P = null;
  function loadYT() {
    if (window.YT && window.YT.Player) { ytReady = true; return; }
    if (document.getElementById('ytapi')) return;
    window.onYouTubeIframeAPIReady = function () { ytReady = true; if (ytQueue) { var q = ytQueue; ytQueue = null; q(); } };
    var s = document.createElement('script'); s.id = 'ytapi'; s.src = 'https://www.youtube.com/iframe_api'; document.head.appendChild(s);
  }
  function hidePlayer() { pw.hidden = true; if (YTP && YTP.pauseVideo) try { YTP.pauseVideo(); } catch (e) {} }
  function stopPlayer() { if (!P) return; recordNow(); saveProg(); hidePlayer(); P = null; clearInterval(tick); syncSoon(1500); }
  function recordNow() { if (!P || !YTP || !YTP.getCurrentTime) return; try { var t = YTP.getCurrentTime(), d = YTP.getDuration(); if (d > 0 && t > 0.5 && YTP.getVideoData && YTP.getVideoData().video_id === P.vid) setProg(P.vid, t, d, false); } catch (e) {} }
  function renderPlay() { P = { ctx: cur.ctx, list: cur.list, idx: cur.idx }; startVideo(); }
  function startVideo() {
    var x = P.list[P.idx]; P.vid = x[0];
    var p = prog[x[0]], start = (p && !p[2] && p[0] > 15) ? Math.max(0, p[0] - 3) : 0;
    last = { ctx: P.ctx.kind === 'course' ? { kind: 'course', id: P.ctx.id, title: P.ctx.title } : { kind: P.ctx.kind, id: P.ctx.id, title: P.ctx.title, items: P.list.slice(0, 60) }, vid: x[0] }; saveLast();
    pw.hidden = false;
    page.innerHTML = '<div class="pinfo"><div class="n">' + esc(x[1]) + '</div><div class="c">' + esc(P.ctx.title || '') + ' &middot; video ' + (P.idx + 1) + ' of ' + P.list.length + '</div></div>' +
      '<div class="ctl"><button id="pv">&#9664;&#9664; Prev</button><button id="rw">&#8634; 10s</button><button id="ff">10s &#8635;</button><button id="nx">Next &#9654;&#9654;</button><button id="dn"' + (isDone(x[0]) ? ' class="on"' : '') + '>' + (isDone(x[0]) ? '&#10003; Watched' : 'Mark watched') + '</button></div>' +
      (start ? '<p class="status">Carrying on from ' + fmt(start) + '</p>' : '') + '<div id="perr"></div><h3>In this list</h3><div id="pl"></div>';
    P.start = start;
    renderPlayList();
    var play = function () {
      if (!YTP) {
        YTP = new YT.Player('ytp', { width: '100%', height: '100%', videoId: x[0], host: 'https://www.youtube-nocookie.com',
          playerVars: { start: start, playsinline: 1, rel: 0, modestbranding: 1, autoplay: 1, origin: location.origin },
          events: { onReady: function () { try { YTP.playVideo(); } catch (e) {} }, onStateChange: onState, onError: onErr } });
      } else YTP.loadVideoById({ videoId: x[0], startSeconds: start });
    };
    if (ytReady) play(); else { ytQueue = play; loadYT(); }
    clearInterval(tick); tick = setInterval(recordNow, 3000);
    var $ = function (id) { return document.getElementById(id); };
    $('pv').onclick = function () { if (P.idx > 0) { recordNow(); P.idx--; cur.idx = P.idx; startVideo(); } };
    $('nx').onclick = function () { nextVideo(); };
    $('rw').onclick = function () { try { YTP.seekTo(Math.max(0, YTP.getCurrentTime() - 10), true); } catch (e) {} };
    $('ff').onclick = function () { try { YTP.seekTo(YTP.getCurrentTime() + 10, true); } catch (e) {} };
    $('dn').onclick = function () { var d = 0; try { d = YTP.getDuration(); } catch (e) {} setProg(P.vid, d || 1, d || 1, true); toast('Marked as watched'); this.classList.add('on'); this.innerHTML = '&#10003; Watched'; renderPlayList(); };
  }
  function renderPlayList() {
    var pl = document.getElementById('pl'); if (!pl || !P) return;
    pl.innerHTML = rowsHTML(P.list, P.idx);
    pl.querySelectorAll('.row').forEach(function (el) { el.onclick = function () { recordNow(); P.idx = +el.getAttribute('data-i'); cur.idx = P.idx; startVideo(); window.scrollTo(0, 0); }; });
  }
  function nextVideo() {
    recordNow();
    if (P.idx + 1 >= P.list.length) { toast('That was the last video in this list'); return; }
    P.idx++; cur.idx = P.idx; startVideo(); window.scrollTo(0, 0);
  }
  function onErr() {
    var el = document.getElementById('perr'); if (!el || !P) return;
    el.innerHTML = '<div class="box"><p>This video will not play inside the app. Open it on YouTube instead (Brave still blocks the ads), then come back and tap Mark watched.</p><div class="btnrow"><a class="pill" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=' + encodeURIComponent(P.vid) + (P.start ? '&t=' + P.start + 's' : '') + '">Open on YouTube</a></div></div>';
  }
  function onState(e) {
    if (!P) return;
    if (e.data === 0) { var d = YTP.getDuration(); setProg(P.vid, d, d, true); syncSoon(1000); nextVideo(); }
    else if (e.data === 2) { recordNow(); saveProg(); }
    else if (e.data === 1) { var el = document.getElementById('perr'); if (el) el.innerHTML = ''; }
  }

  /* ---------- start ---------- */
  document.addEventListener('visibilitychange', function () { if (document.hidden) { recordNow(); saveProg(); syncNow(); } else syncNow(); });
  setInterval(function () { if (!document.hidden && syncId && !syncBusy) syncNow(); }, 60000);
  window.__teh = { syncNow: syncNow, info: function () { return { id: syncId, state: syncState, users: users.map(function (u) { return u.name; }), me: me && me.name, prog: Object.keys(prog).length }; } };
  var m = /[#&]s=([A-Za-z0-9-]{8,64})/.exec(location.hash);
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  cur = { v: 'who' }; render(true);
  var lastMe = load('cl_me', null);
  if (m && m[1] !== syncId) {
    toast('Linking to your TV...');
    syncLink(m[1], function (ok) { toast(ok ? 'Linked. Progress from the TV is here' : 'That sync link did not work. Rescan the code on the TV'); render(false); });
  } else if (syncId) syncNow(function () { render(false); });
  users.forEach(function (u) { if (u.id === lastMe && !m) { setUser(u); go({ v: 'home' }); } });
})();
