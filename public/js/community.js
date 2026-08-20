/* ============================================================
   community.js — Smokers' Corner
   ------------------------------------------------------------
   Talks to /api/threads. No framework, no build step, no deps.

   EVERY POST IS RENDERED AS TEXT. textContent, never innerHTML, for
   anything a stranger typed. The API strips angle brackets too, so this
   is the second of two locks on the same door — on a board with no
   accounts, a stored-XSS bug would be the whole ballgame.

   No accounts by design, so identity is: a handle you type, remembered
   in localStorage for convenience. It is not authentication and the UI
   never implies it is.
   ============================================================ */
(function () {
  'use strict';

  var API = '/api/threads';
  var LS_HANDLE = 'nm.handle';
  var LS_AGE = 'nm.age21';

  var el = {
    state:  document.getElementById('cmState'),
    list:   document.getElementById('cmList'),
    wrapAll:document.getElementById('cmThreads'),
    wrapOne:document.getElementById('cmThread'),
    posts:  document.getElementById('cmPosts'),
    title:  document.getElementById('cmThreadTitle'),
    locked: document.getElementById('cmLocked'),
    reply:  document.getElementById('cmReplyWrap'),
    newBtn: document.getElementById('cmNew'),
    refresh:document.getElementById('cmRefresh'),
    back:   document.getElementById('cmBack')
  };

  var current = null;   /* thread id, or null on the index */

  /* ---- tiny helpers ---- */

  function node(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;    /* never innerHTML */
    return n;
  }

  function say(msg, kind) {
    el.state.hidden = false;
    el.state.className = 'cm-state' + (kind ? ' is-' + kind : '');
    el.state.textContent = msg;
  }
  function quiet() { el.state.hidden = true; }

  function ago(ms) {
    var s = Math.max(0, (Date.now() - ms) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 2592000) return Math.floor(s / 86400) + 'd ago';
    return new Date(ms).toLocaleDateString();
  }

  /* Same handle, same colour, every time — so a thread is readable at a
     glance without anybody having an account. */
  function hue(handle) {
    var h = 0;
    for (var i = 0; i < handle.length; i++) h = (h * 31 + handle.charCodeAt(i)) % 360;
    return h;
  }

  function api(opts) {
    opts = opts || {};
    var url = API + (opts.query || '');
    var init = { method: opts.method || 'GET', headers: {} };
    if (opts.body) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    return fetch(url, init).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: 'bad response' }; })
              .then(function (j) { j.status = r.status; return j; });
    });
  }

  /* ---- the 21+ gate ---- */

  function confirmed() { return localStorage.getItem(LS_AGE) === 'yes'; }

  function gate(then) {
    if (confirmed()) { then(); return; }
    var box = node('div', 'cm-gate');
    box.appendChild(node('p', 'cm-gate-h', 'Before you post'));
    box.appendChild(node('p', null,
      'This board is for adults who already use nicotine. Confirm you are 21 or over. ' +
      'We do not check ID, we are asking you straight.'));
    var row = node('div', 'cm-gate-acts');
    var yes = node('button', 'sh-btn sh-primary', 'I am 21 or over');
    var no  = node('button', 'sh-btn', 'I am not');
    yes.type = no.type = 'button';
    yes.addEventListener('click', function () {
      localStorage.setItem(LS_AGE, 'yes');
      box.remove();
      then();
    });
    no.addEventListener('click', function () {
      box.replaceChildren(node('p', 'cm-gate-h', 'That is fine.'),
        node('p', null, 'Come back when you are. Nothing here is for you yet.'));
    });
    row.appendChild(yes); row.appendChild(no);
    box.appendChild(row);
    return box;
  }

  /* ---- composer ---- */

  function composer(opts) {
    var form = node('form', 'cm-form');
    var handle = node('input', 'cm-in');
    handle.type = 'text';
    handle.maxLength = 24;
    handle.placeholder = 'A name (anything, it is not an account)';
    handle.value = localStorage.getItem(LS_HANDLE) || '';

    var title = null;
    if (opts.withTitle) {
      title = node('input', 'cm-in');
      title.type = 'text';
      title.maxLength = 120;
      title.placeholder = 'Thread title';
      form.appendChild(title);
    }

    var body = node('textarea', 'cm-ta');
    body.rows = opts.withTitle ? 7 : 5;
    body.maxLength = 4000;
    body.placeholder = opts.withTitle
      ? 'Say the thing. No sales, no meetups, no contact details.'
      : 'Reply…';

    var acts = node('div', 'cm-form-acts');
    var send = node('button', 'sh-btn sh-primary', opts.withTitle ? 'Post thread' : 'Reply');
    send.type = 'submit';
    var note = node('span', 'cm-note', '');
    acts.appendChild(send);
    acts.appendChild(note);

    form.appendChild(handle);
    form.appendChild(body);
    form.appendChild(acts);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!body.value.trim()) { note.textContent = 'Say something first.'; return; }
      if (title && !title.value.trim()) { note.textContent = 'Threads need a title.'; return; }

      send.disabled = true;
      note.className = 'cm-note';
      note.textContent = 'Posting…';
      localStorage.setItem(LS_HANDLE, handle.value.trim());

      var payload = {
        handle: handle.value.trim() || 'anon',
        body: body.value,
        age: true
      };
      if (title) payload.title = title.value;
      if (opts.thread) payload.thread = opts.thread;

      api({ method: 'POST', body: payload }).then(function (j) {
        send.disabled = false;
        if (j.held) {
          note.className = 'cm-note is-held';
          note.textContent = j.message || 'Held for review.';
          body.value = '';
          return;
        }
        if (!j.ok) {
          note.className = 'cm-note is-bad';
          note.textContent = j.message || j.error || 'That did not go through.';
          return;
        }
        body.value = '';
        note.textContent = '';
        if (title) { title.value = ''; openThread(j.thread); }
        else openThread(opts.thread);
      });
    });

    return form;
  }

  /* ---- index ---- */

  function loadIndex() {
    current = null;
    el.wrapOne.hidden = true;
    el.wrapAll.hidden = false;
    el.list.replaceChildren(node('p', 'cm-empty', 'Loading…'));

    api({}).then(function (j) {
      /* The board is dark until storage exists. Keep "Start a thread"
         disabled rather than letting somebody type a post that has
         nowhere to go — a composer that accepts text and then fails is
         worse than a button that admits it is not ready. */
      if (j.reason === 'no-store') {
        el.list.replaceChildren();
        el.newBtn.disabled = true;
        el.newBtn.textContent = 'Opening soon';
        say(j.message || 'Smokers\' Corner is still being built. It is not open yet.', 'warn');
        return;
      }
      if (!j.ok) {
        el.list.replaceChildren();
        el.newBtn.disabled = true;
        say(j.message || 'Could not load threads.', 'bad');
        return;
      }
      /* Live. Turn posting on and drop the construction notice. */
      el.newBtn.disabled = false;
      el.newBtn.textContent = 'Start a thread';
      var band = document.querySelector('.soonband');
      if (band) band.remove();
      quiet();

      if (!j.threads.length) {
        el.list.replaceChildren(node('p', 'cm-empty',
          'Nothing here yet. Somebody has to go first, it might as well be you.'));
        return;
      }

      var frag = document.createDocumentFragment();
      j.threads.forEach(function (t) {
        var row = node('button', 'cm-row');
        row.type = 'button';
        var dot = node('span', 'cm-dot');
        dot.style.background = 'hsl(' + hue(t.handle || 'anon') + ' 62% 58%)';
        var main = node('span', 'cm-row-main');
        main.appendChild(node('span', 'cm-row-title', t.title));
        main.appendChild(node('span', 'cm-row-meta',
          (t.handle || 'anon') + ' · ' + (t.posts || 0) +
          (t.posts === 1 ? ' post' : ' posts') + ' · ' + ago(t.bumped || t.created)));
        row.appendChild(dot);
        row.appendChild(main);
        if (t.locked) row.appendChild(node('span', 'cm-lock', 'Locked'));
        row.addEventListener('click', function () { openThread(t.id); });
        frag.appendChild(row);
      });
      el.list.replaceChildren(frag);
    });
  }

  /* ---- one thread ---- */

  function openThread(tid) {
    if (!tid) return loadIndex();
    current = tid;
    el.wrapAll.hidden = true;
    el.wrapOne.hidden = false;
    el.posts.replaceChildren(node('p', 'cm-empty', 'Loading…'));
    el.reply.replaceChildren();
    if (location.hash !== '#t=' + tid) history.replaceState(null, '', '#t=' + tid);

    api({ query: '?id=' + encodeURIComponent(tid) }).then(function (j) {
      if (!j.ok) { say(j.message || 'Could not load that thread.', 'bad'); return; }
      quiet();
      el.title.textContent = j.thread.title;
      el.locked.hidden = !j.thread.locked;

      var frag = document.createDocumentFragment();
      j.posts.forEach(function (p, i) {
        frag.appendChild(postNode(p, i, tid));
      });
      el.posts.replaceChildren(frag);

      if (j.thread.locked) {
        el.reply.replaceChildren(node('p', 'cm-empty',
          'This thread is locked. You can still read it.'));
        return;
      }
      var g = gate(function () { el.reply.replaceChildren(composer({ thread: tid })); });
      el.reply.replaceChildren(g || composer({ thread: tid }));
    });
  }

  function postNode(p, i, tid) {
    var wrap = node('article', 'cm-post' + (p.op ? ' is-op' : ''));

    if (p.deleted) {
      wrap.appendChild(node('p', 'cm-deleted', 'Removed by a moderator.'));
      return wrap;
    }

    var head = node('div', 'cm-post-head');
    var dot = node('span', 'cm-dot');
    dot.style.background = 'hsl(' + hue(p.handle || 'anon') + ' 62% 58%)';
    head.appendChild(dot);
    head.appendChild(node('span', 'cm-handle', p.handle || 'anon'));
    if (p.op) head.appendChild(node('span', 'cm-op', 'OP'));
    head.appendChild(node('span', 'cm-when', ago(p.at)));
    head.appendChild(node('span', 'cm-nth', '#' + (i + 1)));

    var report = node('button', 'cm-report', 'Report');
    report.type = 'button';
    report.addEventListener('click', function () { doReport(p, tid, report); });
    head.appendChild(report);

    /* Paragraph-per-blank-line. textContent throughout, so a post can
       never inject markup no matter what it contains. */
    var bodyWrap = node('div', 'cm-body');
    String(p.body).split(/\n{2,}/).forEach(function (para) {
      var pEl = node('p', null, para.replace(/\n/g, ' '));
      bodyWrap.appendChild(pEl);
    });

    wrap.appendChild(head);
    wrap.appendChild(bodyWrap);
    return wrap;
  }

  function doReport(p, tid, btn) {
    var why = window.prompt('What is wrong with this post? (optional)') ;
    if (why === null) return;
    btn.disabled = true;
    btn.textContent = 'Reporting…';
    api({ method: 'POST', query: '?action=report',
          body: { post: p.id, thread: tid, why: why || '' } })
      .then(function () {
        btn.textContent = 'Reported';
        btn.classList.add('is-done');
      });
  }

  /* ---- wiring ---- */

  el.refresh.addEventListener('click', function () {
    if (current) openThread(current); else loadIndex();
  });
  el.back.addEventListener('click', function () {
    history.replaceState(null, '', location.pathname);
    loadIndex();
  });
  el.newBtn.addEventListener('click', function () {
    var existing = document.querySelector('.cm-form, .cm-gate');
    if (existing) { existing.remove(); return; }
    var mount = node('div', 'cm-newwrap');
    var g = gate(function () {
      mount.replaceChildren(composer({ withTitle: true }));
    });
    mount.appendChild(g || composer({ withTitle: true }));
    el.list.parentNode.insertBefore(mount, el.list);
  });

  window.addEventListener('hashchange', route);

  function route() {
    var m = /^#t=(.+)$/.exec(location.hash || '');
    if (m) openThread(decodeURIComponent(m[1])); else loadIndex();
  }

  route();
})();
