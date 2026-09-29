/* =====================================================================
 *  장비 수리 대장 — 핸드폰 판 (phone.js)
 *  PC 화면(app.js)을 그대로 쓰고, 서버에 묻던 것을 GitHub 우편함으로 바꿔 끼웁니다.
 *   - 보기: 우편함의 내 자료(u/<사람표>.bin)를 받아 내 비밀번호로 열어서 보여 줌
 *   - 적기: 요청을 잠가 우편함(in/<사람표>/…)에 넣으면, 사무실 서버가 1분 안에 반영
 *   - 사진·문서: 달라고 하면 서버가 1분 안에 우편함에 넣어 줌
 *  잠금 방식은 서버의 lib/crypt.js 와 똑같아야 합니다.
 * ===================================================================== */
(function () {
  'use strict';
  const CFG = Object.assign({
    // github.io 주소에서 계정·저장소 이름을 알아냄 (예: https://utrgh482.github.io/equip-phone/)
    owner: location.hostname.endsWith('.github.io') ? location.hostname.split('.')[0] : '',
    pagesRepo: location.hostname.endsWith('.github.io') ? location.pathname.split('/')[1] : '',
    branch: 'main',
    rawBase: 'https://raw.githubusercontent.com',
    pullEvery: 60e3,
    sessionHours: 12,
  }, window.EQ_CONFIG || {});

  const te = new TextEncoder(), td = new TextDecoder();
  const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
  const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = (s) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
  const iso = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 19);
  const cat = (...parts) => { const n = parts.reduce((s, p) => s + p.length, 0); const o = new Uint8Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };

  // ---------------- 잠금 ----------------
  async function sha256hex(s) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', te.encode(s)))); }
  async function derive(pw, saltU8) {
    const base = await crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveBits']);
    return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: saltU8, iterations: 200000 }, base, 256));
  }
  const aes = (raw) => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function gunzip(u8) { const ds = new DecompressionStream('gzip'); const w = ds.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(ds.readable).arrayBuffer()); }
  async function gzip(u8) { const cs = new CompressionStream('gzip'); const w = cs.writable.getWriter(); w.write(u8); w.close(); return new Uint8Array(await new Response(cs.readable).arrayBuffer()); }
  async function unlock(keyRaw, u8) {
    if (td.decode(u8.subarray(0, 3)) !== 'EQ1') throw new Error('모르는 덩어리');
    const kind = u8[3];
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u8.subarray(4, 16) }, await aes(keyRaw), u8.subarray(16)));
    return kind === 1 ? JSON.parse(td.decode(await gunzip(plain))) : plain;
  }
  async function lockJson(keyRaw, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aes(keyRaw), await gzip(te.encode(JSON.stringify(obj)))));
    return cat(te.encode('EQ1'), new Uint8Array([1]), iv, ct);
  }
  async function openConnect(pw, u8) {
    if (td.decode(u8.subarray(0, 3)) !== 'EQC') throw new Error('모르는 연결 파일');
    const salt = u8.subarray(3, 19), iv = u8.subarray(19, 31);
    const key = await derive(pw, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, await aes(key), u8.subarray(31)); // 비밀번호가 틀리면 여기서 실패
    return { conn: JSON.parse(td.decode(new Uint8Array(plain))), key };
  }

  // ---------------- 핸드폰 안 저장 (IndexedDB) ----------------
  const idb = (() => {
    let dbp = null;
    const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('equip-phone', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
    const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const t = d.transaction('kv', mode); const st = t.objectStore('kv'); const q = fn(st); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); };
    return { get: (k) => tx('readonly', (s) => s.get(k)), set: (k, v) => tx('readwrite', (s) => s.put(v, k)), del: (k) => tx('readwrite', (s) => s.delete(k)) };
  })();

  // ---------------- 상태 ----------------
  const S = {
    sess: null,        // { loginId, key(hex), conn, until }
    snap: null, snapSha: null, snapAt: '',
    batch: [], hold: 0, flushT: null,
    outbox: [],        // 아직 우편함에 못 넣은 요청 (인터넷 끊김 등)
    sent: [],          // 우편함에 넣었고 서버 반영을 기다리는 요청 { id, at, n, what }
    etag: null, head: null, tree: null,
    lastPull: '', err: '', busy: false,
  };
  function loadSess() {
    try { const s = JSON.parse(localStorage.getItem('eqSess') || 'null'); if (s && s.until > Date.now()) return s; } catch (e) { /* 없음 */ }
    return null;
  }
  function saveSess() { try { if (S.sess) localStorage.setItem('eqSess', JSON.stringify(S.sess)); else localStorage.removeItem('eqSess'); } catch (e) { /* 저장 불가 */ } }
  const keyRaw = () => unhex(S.sess.key);
  const conn = () => S.sess.conn;

  // ---------------- GitHub ----------------
  async function gh(method, p, body, o) {
    o = o || {};
    const c = conn();
    const h = { Accept: o.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', Authorization: 'Bearer ' + c.token };
    if (body) h['Content-Type'] = 'application/json';
    if (o.etag) h['If-None-Match'] = o.etag;
    let r;
    try { r = await fetch(`${c.api.replace(/\/$/, '')}/repos/${c.owner}/${c.repo}${p}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' }); }
    catch (e) { throw new Error('인터넷에 연결되지 않았어요'); }
    if (r.status === 304) return { status: 304 };
    if ((r.status === 404 || r.status === 409) && o.allow404) return { status: 404 };
    if (r.status === 422 && o.allow422) return { status: 422 };
    if (!r.ok) { let t = ''; try { t = (await r.json()).message || ''; } catch (e) { /* 없음 */ } if (r.status === 401) t = '우편함 토큰이 만료됐어요 — 관리자에게 알려 주세요'; throw new Error(`깃허브 ${r.status} ${t}`); }
    if (o.raw) return { status: r.status, bytes: new Uint8Array(await r.arrayBuffer()) };
    return { status: r.status, json: await r.json(), etag: r.headers.get('etag') };
  }
  async function headOf(useEtag) {
    const r = await gh('GET', `/git/ref/heads/${conn().branch}`, null, { allow404: true, etag: useEtag ? S.etag : null });
    if (r.status === 304) return { same: true };
    if (r.status === 404) return { sha: null };
    S.etag = r.etag;
    return { sha: r.json.object.sha };
  }
  async function filesAt(head) {
    if (S.head === head && S.tree) return S.tree;
    const c = await gh('GET', `/git/commits/${head}`);
    const t = await gh('GET', `/git/trees/${c.json.tree.sha}?recursive=1`);
    const files = {}; for (const e of t.json.tree || []) if (e.type === 'blob') files[e.path] = e.sha;
    S.head = head; S.tree = { tree: c.json.tree.sha, files };
    return S.tree;
  }
  async function putFile(p, u8) {
    const b = await gh('POST', '/git/blobs', { content: b64(u8), encoding: 'base64' });
    for (let i = 0; i < 4; i++) {
      const h = await headOf(false);
      let base = null; if (h.sha) base = (await filesAt(h.sha)).tree;
      const t = await gh('POST', '/git/trees', base ? { base_tree: base, tree: [{ path: p, mode: '100644', type: 'blob', sha: b.json.sha }] } : { tree: [{ path: p, mode: '100644', type: 'blob', sha: b.json.sha }] });
      const c = await gh('POST', '/git/commits', { message: `핸드폰 ${iso()}`, tree: t.json.sha, parents: h.sha ? [h.sha] : [] });
      if (!h.sha) { await gh('POST', '/git/refs', { ref: 'refs/heads/' + conn().branch, sha: c.json.sha }); return; }
      const u = await gh('PATCH', `/git/refs/heads/${conn().branch}`, { sha: c.json.sha, force: false }, { allow422: true });
      if (u.status !== 422) { S.etag = null; return; }
      await new Promise((r) => setTimeout(r, 800 + Math.random() * 1500)); // 서버와 겹침 — 잠깐 쉬고 다시
    }
    throw new Error('우편함이 바빠서 넣지 못했어요 — 잠시 뒤 다시 해요');
  }

  // ---------------- 받기 ----------------
  let onSnap = [];
  async function pull(force) {
    if (!S.sess || S.busy) return;
    S.busy = true;
    try {
      const h = await headOf(!force && !!S.snap);
      if (!h.same && h.sha) {
        const files = (await filesAt(h.sha)).files;
        const sha = files[`u/${conn().uh}.bin`];
        if (!sha) throw new Error('서버가 아직 내 자료를 만들지 않았어요 (서버 PC 가 켜져 있는지, 1~2분 뒤 다시)');
        if (sha !== S.snapSha) {
          const bytes = (await gh('GET', `/git/blobs/${sha}`, null, { raw: true })).bytes;
          let snap;
          try { snap = await unlock(keyRaw(), bytes); }
          catch (e) { throw new Error('내 자료를 열지 못했어요 — 비밀번호를 바꿨다면 다시 로그인해 주세요'); }
          S.snap = snap; S.snapSha = sha; S.snapAt = snap.made || '';
          await idb.set('snap:' + conn().uh, { sha, b64: b64(bytes) });
          settleSent();
          onSnap.forEach((fn) => { try { fn(); } catch (e) { /* 무시 */ } });
        }
      }
      S.lastPull = iso(); S.err = '';
    } catch (e) { S.err = e.message; }
    finally { S.busy = false; badge(); }
    await retryOutbox();
  }
  // 서버가 처리한 요청 확인
  function settleSent() {
    const done = (S.snap && S.snap.done) || {};
    const errs = [];
    S.sent = S.sent.filter((r) => {
      const d = done[r.id];
      if (!d) return true;
      (d.results || []).forEach((x, i) => { if (!x.ok) errs.push(`${r.what[i] || '기록'}: ${x.error}`); });
      return false;
    });
    saveQueues();
    if (errs.length && window.toast) window.toast('반영하지 못한 것이 있어요 — ' + errs.join(' / '), true);
  }

  // ---------------- 보내기 ----------------
  function describe(op) {
    if (op.need) return op.need.kind === 'photo' ? '사진 가져오기' : '문서 가져오기';
    const u = op.url || '';
    if (/\/repairs$/.test(u)) return '수리 요청';
    if (/\/repairs\/\d+\/cancel/.test(u)) return '수리 기록 취소';
    if (/\/repairs\//.test(u)) return '수리 기록 고치기';
    if (/\/logs$/.test(u)) return '관리 이력';
    if (/\/moves$/.test(u)) return '정리 기록';
    if (/\/parts$/.test(u)) return '부대품';
    if (/\/photo/.test(u)) return '사진 올리기';
    if (/\/files/.test(u)) return '문서 첨부';
    if (/\/contacts/.test(u)) return '연락처';
    if (/^\/api\/equipment$/.test(u)) return '장비 등록';
    if (/^\/api\/equipment\/\d+$/.test(u)) return '장비 정보 고치기';
    if (/rooms/.test(u)) return '방·구성원';
    if (/password/.test(u)) return '비밀번호 바꾸기';
    return '기록';
  }
  function enqueue(op) {
    S.batch.push(op);
    const idx = S.batch.length - 1;
    clearTimeout(S.flushT); S.flushT = setTimeout(flush, 2500);
    badge();
    return idx;
  }
  async function flush() {
    if (S.hold > 0) { S.flushT = setTimeout(flush, 800); return; }
    if (!S.batch.length || !S.sess) return;
    const ops = S.batch; S.batch = [];
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const item = { id, at: iso(), ops, what: ops.map(describe) };
    S.outbox.push(item); saveQueues(); badge();
    await retryOutbox();
  }
  async function retryOutbox() {
    if (!S.sess || S.pushing) return;
    S.pushing = true;
    try {
      while (S.outbox.length) {
        const item = S.outbox[0];
        const u8 = await lockJson(keyRaw(), { v: 1, id: item.id, made: item.at, ops: item.ops });
        await putFile(`in/${conn().uh}/${item.id}.bin`, u8);
        S.outbox.shift();
        S.sent.push({ id: item.id, at: item.at, n: item.ops.length, what: item.what });
        saveQueues();
      }
    } catch (e) { S.err = e.message; }
    finally { S.pushing = false; badge(); }
  }
  async function saveQueues() { if (S.sess) await idb.set('q:' + conn().uh, { outbox: S.outbox, sent: S.sent }); }
  async function loadQueues() { const q = S.sess ? await idb.get('q:' + conn().uh) : null; S.outbox = (q && q.outbox) || []; S.sent = (q && q.sent) || []; }

  // ---------------- 표시 ----------------
  function badge() {
    const el = document.getElementById('syncBadge');
    if (!el) return;
    el.hidden = !S.sess;
    const wait = S.batch.length + S.outbox.reduce((s, x) => s + x.ops.length, 0);
    const sent = S.sent.reduce((s, x) => s + x.n, 0);
    const t = (x) => (x ? x.slice(11, 16) : '-');
    el.innerHTML = `<span class="dot ${S.err ? 'bad' : 'ok'}"></span> 받음 ${t(S.lastPull)}${S.snapAt ? ` · 자료 ${t(S.snapAt)}` : ''}`
      + (wait ? ` · <b>보낼 것 ${wait}</b>` : '') + (sent ? ` · <b>반영 기다림 ${sent}</b>` : '')
      + (S.err ? `<div class="bad">${S.err}</div>` : '')
      + ' <button class="link" id="syncNow">지금 주고받기</button>';
    const b = document.getElementById('syncNow');
    if (b) b.onclick = async () => { b.disabled = true; await flush(); await pull(true); };
  }

  // ---------------- 로그인 ----------------
  async function login(loginId, pw) {
    if (!CFG.owner || !CFG.pagesRepo) throw new Error('이 주소에서는 핸드폰 판을 열 수 없어요 (github.io 주소로 열어 주세요)');
    const cid = (await sha256hex('eqc:' + String(loginId).trim().toLowerCase())).slice(0, 24);
    let r;
    try { r = await fetch(`${CFG.rawBase}/${CFG.owner}/${CFG.pagesRepo}/${CFG.branch}/c/${cid}.bin?t=${Date.now()}`, { cache: 'no-store' }); }
    catch (e) { throw new Error('인터넷에 연결되지 않았어요'); }
    if (r.status === 404) throw new Error('이 아이디의 핸드폰 연결이 아직 없어요. PC 에서 한 번 로그인했는지, 관리자가 우편함을 켰는지 확인해 주세요. (켠 뒤 1~2분 걸려요)');
    if (!r.ok) throw new Error('연결 파일을 받지 못했어요 (' + r.status + ')');
    let got;
    try { got = await openConnect(pw, new Uint8Array(await r.arrayBuffer())); }
    catch (e) { throw new Error('아이디나 비밀번호가 맞지 않아요. (PC 에서 비밀번호를 막 바꿨다면 1~2분 뒤 다시)'); }
    S.sess = { loginId, key: hex(got.key), conn: got.conn, until: Date.now() + CFG.sessionHours * 3600e3 };
    saveSess();
    S.snap = null; S.snapSha = null; S.etag = null; S.head = null; S.tree = null;
    await loadQueues();
    const cached = await idb.get('snap:' + got.conn.uh);
    if (cached) { try { S.snap = await unlock(keyRaw(), unb64(cached.b64)); S.snapSha = cached.sha; S.snapAt = S.snap.made || ''; } catch (e) { S.snap = null; } }
    await pull(true);
    if (!S.snap) throw new Error(S.err || '내 자료를 아직 받지 못했어요');
    return { ok: true, mustChange: !!S.snap.user.mustChange };
  }
  function logout(note) {
    S.sess = null; S.snap = null; S.snapSha = null; S.batch = []; saveSess(); badge();
    api.gateNote = note || '';
  }

  // ---------------- PC 서버 대신 대답하기 ----------------
  const E = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
  function need() { if (!S.sess || !S.snap) { if (window.showGate) setTimeout(window.showGate, 0); throw E(401, '로그인해 주세요'); } return S.snap; }
  async function call(method, url, body) {
    const u = new URL(url, 'http://x'); const p = u.pathname.split('/').filter(Boolean).slice(1);
    const id = p[1] && /^\d+$/.test(p[1]) ? Number(p[1]) : null;
    if (method === 'GET') {
      if (p[0] === 'me') {
        if (!S.sess || !S.snap) return { user: null, orgName: (S.snap && S.snap.orgName) || '여주시농업기술센터' };
        const s = S.snap;
        return { user: s.user, rooms: s.rooms.filter((r) => r.active && r.role), orgName: s.orgName };
      }
      const s = need();
      if (p[0] === 'settings') return s.settings;
      if (p[0] === 'rooms') return s.rooms;
      if (p[0] === 'users') return s.users;
      if (p[0] === 'audit') return s.audit.slice().reverse();
      if (p[0] === 'logs') return s.logs;
      if (p[0] === 'locs') return s.locs || [];
      if (p[0] === 'events') {
        if (!id) return s.events || [];
        const v = (s.events || []).find((x) => x.id === id); if (!v) throw E(404, '일정을 찾을 수 없어요'); return v;
      }
      if (p[0] === 'repairs') {
        if (!id) return s.repairs;
        const r = s.repairs.find((x) => x.id === id); if (!r) throw E(404, '수리 기록을 찾을 수 없어요'); return r;
      }
      if (p[0] === 'equipment') {
        if (!id) return s.equipment;
        const e = s.equipment.find((x) => x.id === id); if (!e) throw E(404, '장비를 찾을 수 없어요');
        return {
          equipment: e,
          repairs: s.repairs.filter((r) => r.equipmentId === id),
          logs: s.logs.filter((l) => l.equipmentId === id),
          moves: s.moves.filter((r) => r.equipmentId === id),
          parts: s.parts.filter((r) => r.equipmentId === id),
          locs: (s.locs || []).filter((r) => r.equipmentId === id),
          audit: s.audit.filter((a) => a.target === e.code || String(a.target || '').startsWith(e.code + ' ')),
        };
      }
      if (p[0] === 'mailbox' && p[1] === 'mine') return { enabled: true, phone: true };
      if (p[0] === 'mailbox') throw E(400, '우편함 설정은 PC 에서 해 주세요');
      throw E(404, '없는 주소예요');
    }
    // 적기
    if (p[0] === 'login') return login(body.loginId, body.pw);
    if (p[0] === 'logout') { logout(); return { ok: true }; }
    if (p[0] === 'setup' || p[0] === 'mailbox') throw E(400, '이건 PC 에서 해 주세요');
    need();
    if (p[0] === 'me' && p[1] === 'password') {
      enqueue({ m: 'POST', url, body });
      await flush();
      logout('비밀번호 바꾸기를 보냈어요. 1~3분 뒤 새 비밀번호로 로그인해 주세요.');
      return { ok: true, _queued: true };
    }
    const idx = enqueue({ m: method, url, body: body || {} });
    return { _queued: true, id: '@' + idx };
  }
  // 사진은 핸드폰에서 줄여서 보냄 (긴 변 1600px)
  async function shrink(file) {
    if (!/^image\//.test(file.type) || /gif/.test(file.type)) return file;
    try {
      const img = await createImageBitmap(file);
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      if (k === 1 && file.size < 1.5e6) return file;
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.85));
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch (e) { return file; }
  }
  async function upload(url, file) {
    need();
    S.hold += 1;
    try {
      const f = await shrink(file);
      if (f.size > 20 * 1024 * 1024) throw new Error(`${file.name}: 핸드폰에서는 20MB 까지 올릴 수 있어요`);
      const u8 = new Uint8Array(await f.arrayBuffer());
      const idx = enqueue({ m: 'POST', url, file: { name: f.name, b64: b64(u8) } });
      return { _queued: true, id: '@' + idx, name: f.name };
    } finally { S.hold -= 1; }
  }
  // 사진·문서 보기: 우편함에 있으면 바로, 없으면 서버에 달라고 함
  const blobCache = {};
  async function fetchRef(ref, mime) {
    if (blobCache[ref]) return blobCache[ref];
    const p = S.snap.files && S.snap.files[ref];
    if (!p) return null;
    const h = await headOf(false);
    const files = (await filesAt(h.sha)).files;
    if (!files[p]) return null;
    const bytes = (await gh('GET', `/git/blobs/${files[p]}`, null, { raw: true })).bytes;
    const plain = await unlock(keyRaw(), bytes);
    const url = URL.createObjectURL(new Blob([plain], { type: mime || 'application/octet-stream' }));
    blobCache[ref] = url;
    return url;
  }
  function refOf(prefix) { const f = (S.snap && S.snap.files) || {}; return Object.keys(f).find((k) => k === prefix || k.startsWith(prefix + '-')); }
  async function ask(kind, id) {
    const key = kind + id;
    if (S.asked && S.asked[key] && Date.now() - S.asked[key] < 5 * 60e3) return;
    S.asked = S.asked || {}; S.asked[key] = Date.now();
    enqueue({ need: { kind, id } }); await flush();
  }
  async function photoUrl(eqId) {
    need();
    const ref = refOf('p' + eqId);
    if (ref) { const u = await fetchRef(ref, 'image/jpeg'); if (u) return u; }
    await ask('photo', eqId);
    return null;
  }
  // 대시보드 작은 사진: 서버가 미리 올려 둠 (달라고 하지 않음). 한 번 받은 것은 핸드폰에 (잠긴 채로) 보관
  const thumbWait = {};
  async function thumbUrl(eqId) {
    if (!S.sess || !S.snap) return null;
    const ref = refOf('t' + eqId);
    if (!ref) return null;
    if (blobCache[ref]) return blobCache[ref];
    if (thumbWait[ref]) return thumbWait[ref];
    thumbWait[ref] = (async () => {
      try {
        let locked = await idb.get('th:' + ref).catch(() => null);
        if (!locked) {
          const p = S.snap.files[ref];
          let tree = S.tree && S.tree.files[p] ? S.tree : null;
          if (!tree) { const h = await headOf(false); if (!h.sha) return null; tree = await filesAt(h.sha); }
          if (!tree.files[p]) return null;
          locked = (await gh('GET', `/git/blobs/${tree.files[p]}`, null, { raw: true })).bytes;
          idb.set('th:' + ref, locked).catch(() => {});
        }
        const plain = await unlock(keyRaw(), locked);
        return (blobCache[ref] = URL.createObjectURL(new Blob([plain], { type: 'image/jpeg' })));
      } catch (e) { return null; } finally { delete thumbWait[ref]; }
    })();
    return thumbWait[ref];
  }
  async function fileUrl(fid, name) {
    need();
    const ref = refOf('d' + fid);
    const mime = /\.pdf$/i.test(name) ? 'application/pdf' : /\.(jpe?g)$/i.test(name) ? 'image/jpeg' : /\.png$/i.test(name) ? 'image/png' : 'application/octet-stream';
    if (ref) { const u = await fetchRef(ref, mime); if (u) return u; }
    await ask('doc', fid);
    return null;
  }
  // 파일 내려받기 — apk 안이면 안드로이드에 맡김
  async function saveBlob(url, name, mime) {
    if (window.EquipApp && window.EquipApp.saveFile) {
      const u8 = new Uint8Array(await (await fetch(url)).arrayBuffer());
      window.EquipApp.saveFile(b64(u8), name, mime || 'application/octet-stream');
      return true;
    }
    const a = document.createElement('a'); a.href = url; a.download = name; a.click();
    return true;
  }

  // ---------------- 시작 ----------------
  const api = {
    phone: true, call, upload, photoUrl, thumbUrl, fileUrl, saveBlob, gateNote: '',
    onSnap: (fn) => onSnap.push(fn),
    pending: () => S.batch.length + S.outbox.length + S.sent.length,
    flush,
  };
  window.EQ_PHONE = api;
  (async function init() {
    S.sess = loadSess();
    if (S.sess) {
      await loadQueues();
      const cached = await idb.get('snap:' + conn().uh).catch(() => null);
      if (cached) { try { S.snap = await unlock(keyRaw(), unb64(cached.b64)); S.snapSha = cached.sha; S.snapAt = S.snap.made || ''; } catch (e) { S.snap = null; } }
    }
    api.ready = true;
    (api._readyFns || []).forEach((fn) => fn());
    setInterval(() => { if (S.sess && !document.hidden) pull(false); }, CFG.pullEvery);
    setInterval(() => { if (S.sess && S.outbox.length) retryOutbox(); }, 30e3);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && S.sess) setTimeout(() => pull(false), 800); });
    if (S.sess) setTimeout(() => pull(false), 500);
    badge();
  })();
  api.whenReady = () => new Promise((res) => { if (api.ready) res(); else (api._readyFns = api._readyFns || []).push(res); });
})();
