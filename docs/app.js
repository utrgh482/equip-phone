// 장비대장 — 화면
'use strict';

// ---------- 고정 목록 ----------
const CATEGORIES = ['', '전기·통신기기', '사무용기기', '사무용집기', '운반·건설기계·차량', '기계요소·공작기계',
  '산업기계', '의료·화학분석기기', '물리시험·측정기기', '기타 실험장비', '기타 잡기기']; // 물품관리대장 10품종
const STATUSES = ['신품', '중고품', '요정비품', '폐품']; // 여주시 물품관리 조례 별표 1
const USE_STATUSES = ['쓰는 중', '수리 중', '안 씀', '폐기']; // 랩관리 기기 관리와 같은 네 가지
const MOVE_TYPES = ['구입', '양수', '차용', '생산', '편입', '부생', '양도', '대여', '공유재산편입', '매각', '해체',
  '폐기', '망실', '반납', '관급', '자연감모', '관리전환', '분류전환', '사용전환', '공차', '무상양여', '기증', '잡건']; // 별표 2
const CAUSES = ['자연 고장', '훼손·망실(경위서 있음)', '정기 점검·정비'];
const BUDGETS = ['공공운영비', '시설비', '기타'];
const LOG_KINDS = ['점검', '소모품 교체', '기타'];

// ---------- 도우미 ----------
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const won = (n) => (n === null || n === undefined || n === '' ? '' : Number(n).toLocaleString('ko-KR'));
const todayStr = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const kb = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB');
const uniq = (arr) => [...new Set(arr.filter((v) => v !== null && v !== undefined && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'ko'));

// ---------- 로그인 정보 ----------
// ME = 로그인한 사람, MYROOMS = 내가 속한 방(관리자는 전부), ROOM = 지금 보는 방(0 = 모든 방)
let ME = null, MYROOMS = [], ROOM = 0;
const getMe = () => (ME ? ME.name : '');
const isAdmin = () => !!(ME && ME.isAdmin);
const roomById = (id) => MYROOMS.find((r) => r.id === id);
function loadRoomPick() { try { return Number(localStorage.getItem('eqRoom')) || 0; } catch (e) { return 0; } }
function saveRoomPick(v) { try { localStorage.setItem('eqRoom', String(v)); } catch (e) { /* 저장 못 해도 괜찮음 */ } }

// 핸드폰(우편함) 판에서는 window.EQ_PHONE 이 이 두 가지를 바꿔 끼웁니다
async function call(method, url, body) {
  if (window.EQ_PHONE) return window.EQ_PHONE.call(method, url, body);
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const res = await fetch(url, opt);
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !/\/api\/(login|me|setup)/.test(url)) { showGate(); throw new Error(data.error || '로그인해 주세요'); }
  if (!res.ok) throw new Error(data.error || '문제가 생겼어요');
  return data;
}
async function upload(url, file) {
  if (window.EQ_PHONE) return window.EQ_PHONE.upload(url, file);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  if (res.status === 401) { showGate(); throw new Error('로그인해 주세요'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${file.name}: ${data.error || '올리지 못했어요'}`);
  return data;
}
async function uploadFiles(owner, id, files) {
  for (const f of files) await upload(`/api/files?owner=${owner}&id=${id}`, f);
}
const PHONE = () => !!window.EQ_PHONE;
const QMSG = '보냈어요 · 사무실 서버가 1~3분 안에 반영해요';
// 적은 뒤 알림: 핸드폰이면 '보냈어요', PC 면 원래 문구
function saved(msg) { toast(PHONE() ? QMSG : msg); }
function toast(msg, err) {
  const t = $('#toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), 2800);
}
function modal(html, onReady) {
  const m = $('#modal');
  m.innerHTML = `<div class="box">${html}</div>`; m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  m.onclick = (e) => { if (e.target === m) close(); };
  onReady && onReady(m, close);
}
function askText(title, desc, label, cb) {
  modal(`<h2>${esc(title)}</h2><div class="sub">${esc(desc)}</div>
    <textarea id="mText" rows="3" placeholder="${esc(label)}"></textarea>
    <div class="actions"><button class="btn" id="mNo">닫기</button><button class="btn primary" id="mOk">확인</button></div>`,
  (m, close) => {
    $('#mText', m).focus();
    $('#mNo', m).onclick = close;
    $('#mOk', m).onclick = async () => {
      const v = $('#mText', m).value.trim();
      if (!v) return toast('내용을 적어 주세요', true);
      try { await cb(v); close(); } catch (e) { toast(e.message, true); }
    };
  });
}

function downloadCsv(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  if (PHONE()) { window.EQ_PHONE.saveBlob(url, name, 'text/csv').then(() => toast('내려받았어요 (다운로드 폴더)')); return; }
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- 작은 딱지 ----------
function lifePill(e, short) {
  if (!e.lifeEnd) return '<span class="muted">-</span>';
  if (short) return e.lifeDays < 0 ? `<span class="badge bad">${esc(e.lifeEnd)} 지남</span>` : e.lifeDays <= 365 ? `<span class="badge warn">${esc(e.lifeEnd)}</span>` : esc(e.lifeEnd);
  if (e.lifeDays < 0) {
    const y = Math.floor(-e.lifeDays / 365);
    return `<span class="badge bad">${esc(e.lifeEnd)} · 지남</span>${y ? ` <span class="muted">(${y}년째)</span>` : ''}`;
  }
  const y = Math.floor(e.lifeDays / 365), mo = Math.round((e.lifeDays % 365) / 30);
  const left = y ? `${y}년 ${mo}개월 남음` : `${Math.max(1, Math.round(e.lifeDays / 30))}개월 남음`;
  return `<span class="badge ${e.lifeDays <= 365 ? 'warn' : ''}">${esc(e.lifeEnd)} · ${left}</span>`;
}
function duePill(e, short) {
  if (!e.calMonths) return '<span class="muted">-</span>';
  if (!e.nextCheck) return '<span class="muted">기록 없음</span>';
  if (short && e.overdue) return `<span class="badge bad">${esc(e.nextCheck)} 지남</span>`;
  if (short && e.due) return `<span class="badge warn">${esc(e.nextCheck)}</span>`;
  if (e.overdue) return `<span class="badge bad">${esc(e.nextCheck)} · ${-e.dueDays}일 지남</span>`;
  if (e.due) return `<span class="badge warn">${esc(e.nextCheck)} · ${e.dueDays}일 남음</span>`;
  return `<span class="nowrap">${esc(e.nextCheck)}</span>`;
}
function warrantyPill(e) {
  if (!e.warrantyUntil) return '<span class="muted">-</span>';
  if (e.warrantyDays < 0) return `<span class="badge">${esc(e.warrantyUntil)} · 끝남</span>`;
  return `<span class="badge ok">${esc(e.warrantyUntil)} · ${e.warrantyDays}일 남음</span>`;
}
const useBadge = (s) => `<span class="badge u${USE_STATUSES.indexOf(s)}">${esc(s || '-')}</span>`;
const stBadge = (s) => `<span class="badge s-${esc(s)}">${esc(s)}</span>`;
function fileLinks(files, cancelable) {
  const live = (files || []).filter((f) => !f.canceled);
  if (!live.length) return '';
  return `<div class="files">${live.map((f) => `<span class="file"><a href="/api/files/${f.id}" target="_blank" data-fid="${f.id}" data-fname="${esc(f.name)}">📎 ${esc(f.name)}</a> <span class="muted">${kb(f.bytes)}</span>${cancelable ? ` <button type="button" class="link small" data-unfile="${f.id}">떼기</button>` : ''}</span>`).join('')}</div>`;
}
function bindUnfile(root, after) {
  $$('[data-unfile]', root).forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation();
    askText('문서 떼기', '파일은 서버에 남고, 목록에서만 빠져요.', '떼는 이유', async (reason) => {
      await call('POST', `/api/files/${b.dataset.unfile}/cancel`, { reason }); saved('뗐어요'); after();
    });
  }));
}

// ---------- 입력 양식 만들기 ----------
// groups: [{ title, hint, fields: [{ k, label, type, opts, req, help, ph, unit, list }] }]
function formHtml(groups, v = {}) {
  return groups.map((g) => `<fieldset><legend>${esc(g.title)}</legend>${g.hint ? `<div class="hint">${g.hint}</div>` : ''}
    ${g.fields.map((f) => fieldHtml(f, v[f.k])).join('')}</fieldset>`).join('');
}
function fieldHtml(f, val) {
  const id = 'f_' + f.k;
  let input;
  const common = `id="${id}" name="${f.k}" ${f.req ? 'required' : ''}`;
  if (f.type === 'select') {
    input = `<select ${common}>${f.opts.map((o) => {
      const [ov, ol] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(ov)}" ${String(val ?? '') === String(ov) ? 'selected' : ''}>${esc(ol || '선택 안 함')}</option>`;
    }).join('')}</select>`;
  } else if (f.type === 'textarea') {
    input = `<textarea ${common} placeholder="${esc(f.ph || '')}">${esc(val)}</textarea>`;
  } else if (f.type === 'money') {
    input = `<div class="inline"><input ${common} inputmode="numeric" value="${esc(val === null || val === undefined ? '' : won(val))}" placeholder="${esc(f.ph || '')}" data-money><span>원</span></div>`;
  } else if (f.type === 'files') {
    input = `<input ${common} type="file" multiple>`;
  } else {
    const t = f.type || 'text';
    input = `<input ${common} type="${t === 'number' ? 'text' : t}" ${t === 'number' ? 'inputmode="numeric"' : ''} ${t === 'date' ? 'min="1900-01-01" max="2099-12-31"' : ''} value="${esc(val)}" placeholder="${esc(f.ph || '')}" ${f.list ? `list="${f.list}"` : ''}>`;
    if (f.unit) input = `<div class="inline">${input}<span>${esc(f.unit)}</span></div>`;
  }
  return `<div class="row"><label for="${id}">${esc(f.label)}${f.req ? '<span class="req">*</span>' : ''}</label>
    <div>${input}${f.help ? `<div class="help">${f.help}</div>` : ''}</div></div>`;
}
function formValues(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => { if (el.type !== 'file') out[el.name] = el.value; });
  return out;
}
function bindMoney(root) {
  root.querySelectorAll('[data-money]').forEach((el) => {
    el.addEventListener('input', () => {
      const digits = el.value.replace(/[^\d]/g, '');
      el.value = digits ? Number(digits).toLocaleString('ko-KR') : '';
    });
  });
}

// ---------- 화면 전환 ----------
let settings = { orgName: '', kinds: [] };
const kindNames = () => (settings.kinds || []).map((k) => k.name);
const routes = [
  [/^#\/dash$/, viewDash],
  [/^#\/places$/, viewPlaces],
  [/^#\/calendar$/, viewCalendar],
  [/^#\/event\/new(?:\?(.*))?$/, (m) => viewEventForm(null, m[1] || '')],
  [/^#\/event\/(\d+)$/, (m) => viewEventForm(+m[1], '')],
  [/^#\/list$/, viewList],
  [/^#\/eq\/new$/, () => viewEquipForm(null)],
  [/^#\/eq\/(\d+)$/, (m) => viewEquip(+m[1])],
  [/^#\/eq\/(\d+)\/edit$/, (m) => viewEquipForm(+m[1])],
  [/^#\/eq\/(\d+)\/repair\/new$/, (m) => viewRepairForm(+m[1], null)],
  [/^#\/repair\/(\d+)$/, (m) => viewRepairForm(null, +m[1])],
  [/^#\/eq\/(\d+)\/log\/new$/, (m) => viewLogForm(+m[1])],
  [/^#\/eq\/(\d+)\/move\/new$/, (m) => viewMoveForm(+m[1])],
  [/^#\/eq\/(\d+)\/part\/new$/, (m) => viewPartForm(+m[1])],
  [/^#\/repairs$/, viewRepairs],
  [/^#\/settings$/, viewSettings],
  [/^#\/rooms$/, viewRooms],
  [/^#\/phone$/, viewPhone],
];
async function route() {
  const h = location.hash || '#/dash';
  const nav = h.startsWith('#/repairs') || h.startsWith('#/repair/') ? 'repairs' : h.startsWith('#/settings') ? 'settings' : h.startsWith('#/rooms') ? 'rooms' : h.startsWith('#/phone') ? 'phone'
    : h.startsWith('#/dash') ? 'dash' : h.startsWith('#/places') ? 'places' : h.startsWith('#/calendar') || h.startsWith('#/event') ? 'calendar' : 'list';
  $$('[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === nav));
  const app = $('#app');
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      try { await fn(m); } catch (e) { app.innerHTML = `<div class="note bad">${esc(e.message)}</div>`; }
      window.scrollTo(0, 0);
      return;
    }
  }
  location.hash = '#/dash';
}

// ---------- 장비 목록 ----------
// 거르는 항목 (랩관리 기기 관리에 적는 칸 기준)
// 글자로 거르는 칸 (일부만 적어도 찾아요)
const TEXT_FILTERS = [
  { k: 'code', label: '관리번호', val: (e) => e.code, ph: '예: 12' },
  { k: 'group', label: '분류', val: (e) => e.group },
  { k: 'name', label: '기기 이름', val: (e) => [e.name, e.nickname, e.goodsName].filter(Boolean).join(' ') , sug: (e) => e.name },
  { k: 'model', label: '모델', val: (e) => e.model },
  { k: 'maker', label: '제조사', val: (e) => e.maker },
];
const FILTERS = [
  { k: 'category', label: '품종', val: (e) => (e.category ? CATEGORIES[e.category] : '') },
  { k: 'useStatus', label: '사용 상태', val: (e) => e.useStatus, fixed: USE_STATUSES },
  { k: 'status', label: '물품 상태', val: (e) => e.status, fixed: STATUSES },
  { k: 'dept', label: '사용부서', val: (e) => e.dept },
  { k: 'manager', label: '사용 담당자', val: (e) => e.manager },
  { k: 'location', label: '놓인 자리', val: (e) => e.location },
  { k: 'year', label: '구입연도', val: (e) => (e.acquiredDate || '').slice(0, 4) },
  { k: 'life', label: '내구연한', val: (e) => (!e.lifeEnd ? '모름' : e.lifeDays < 0 ? '지남' : e.lifeDays <= 365 ? '1년 안에 끝남' : '남음'), fixed: ['지남', '1년 안에 끝남', '남음', '모름'] },
  { k: 'check', label: '점검', val: (e) => (!e.calMonths ? '대상 아님' : e.overdue ? '지남' : e.due ? '때가 됨' : '예정'), fixed: ['지남', '때가 됨', '예정', '대상 아님'] },
  { k: 'warranty', label: '워런티', val: (e) => (!e.warrantyUntil ? '모름' : e.warrantyDays < 0 ? '끝남' : '남음'), fixed: ['남음', '끝남', '모름'] },
  { k: 'repair', label: '수리', val: (e) => (e.openRepairs ? '진행 중' : e.repairCount ? '수리한 적 있음' : '수리한 적 없음'), fixed: ['진행 중', '수리한 적 있음', '수리한 적 없음'] },
];
const MAIN_FILTERS = ['useStatus', 'dept'];
const listState = { q: '', active: 'on', more: false, f: {}, t: {} };
const searchText = (e) => [e.code, e.name, e.nickname, e.group, e.model, e.maker, e.serial, e.spec, e.location, e.classNo, e.assetNo,
  e.buySeqNo, e.goodsName, e.dept, e.operator, e.manager, e.memo, e.calLabel, CATEGORIES[e.category] || '',
  ...(e.contacts || []).flatMap((c) => [c.company, c.person, c.role, c.phone, c.email, c.note])].join(' ').toLowerCase();

async function viewList() {
  const list = (await call('GET', '/api/equipment')).filter((e) => inRoom(e.roomId));
  const repairs = (await call('GET', '/api/repairs')).filter((r) => inRoom(r.roomId));
  const logs = (await call('GET', '/api/logs')).filter((l) => inRoom(l.roomId));
  const showRoom = !ROOM && MYROOMS.filter((r) => r.active).length > 1;
  const canAdd = MYROOMS.some((r) => r.active);
  const year = todayStr().slice(0, 4);
  const act = list.filter((e) => e.active !== false);
  const inYear = (d) => (d || '').startsWith(year);
  const yearCost = repairs.filter((r) => !r.canceled && inYear(r.inspectDate || r.endDate || r.requestDate)).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    + logs.filter((l) => !l.canceled && inYear(l.date)).reduce((s, l) => s + (Number(l.cost) || 0), 0);
  const selHtml = (F) => {
    const opts = F.fixed || uniq(list.map(F.val));
    const cur = listState.f[F.k] || '';
    return `<label class="flt"><span>${F.label}</span><select data-flt="${F.k}"><option value="">전체</option>${opts.map((o) => `<option ${cur === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}${F.fixed ? '' : `<option value="__none" ${cur === '__none' ? 'selected' : ''}>(비어 있음)</option>`}</select></label>`;
  };
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>장비 목록</h1><span class="grow"></span>
      <button class="btn no-print" id="csv">엑셀로 받기</button>
      ${canAdd ? '<a class="btn primary" href="#/eq/new">+ 장비 등록</a>' : ''}</div>
    ${!MYROOMS.length ? `<div class="note info">아직 들어간 방이 없어요. ${isAdmin() ? '<a href="#/rooms">방 · 구성원</a>에서 방을 만들어 주세요.' : '방장에게 구성원으로 넣어 달라고 해 주세요.'}</div>` : ''}
    <div class="stats">
      <div class="stat"><div class="k">운용 중인 장비</div><div class="v">${act.length}</div></div>
      <button class="stat ${act.some((e) => e.openRepairs) ? 'warn' : ''}" data-quick="repair=진행 중"><div class="k">수리 진행 중</div><div class="v">${act.filter((e) => e.openRepairs).length}</div></button>
      <button class="stat ${act.some((e) => e.due) ? 'warn' : ''}" data-quick="check=때가 됨|지남"><div class="k">점검 때가 된 장비</div><div class="v">${act.filter((e) => e.due).length}</div></button>
      <button class="stat ${act.some((e) => e.lifeExpired) ? 'warn' : ''}" data-quick="life=지남"><div class="k">내구연한 지난 장비</div><div class="v">${act.filter((e) => e.lifeExpired).length}</div></button>
      <div class="stat"><div class="k">${year}년 수리·관리비</div><div class="v">${won(yearCost)}<span class="unit">원</span></div></div>
    </div>
    <div class="filterbox no-print">
      <div class="filters textf">
        ${TEXT_FILTERS.map((F) => `<label class="flt"><span>${F.label}</span><input type="search" data-tf="${F.k}" list="tl_${F.k}" value="${esc(listState.t[F.k] || '')}" placeholder="${esc(F.ph || '일부만 적어도 돼요')}" title="일부만 적어도 찾아요"></label>`).join('')}
      </div>
      <div class="filters">
        ${FILTERS.filter((F) => MAIN_FILTERS.includes(F.k)).map(selHtml).join('')}
        <label class="flt"><span>운용</span><select id="ac"><option value="on" ${listState.active === 'on' ? 'selected' : ''}>운용 중만</option><option value="off" ${listState.active === 'off' ? 'selected' : ''}>처분된 것만</option><option value="all" ${listState.active === 'all' ? 'selected' : ''}>전부</option></select></label>
        <label class="flt grow"><span>모든 칸에서 찾기</span><input type="search" id="q" placeholder="일련번호·물품관리번호·장비대장 품명·연락처·메모 등" value="${esc(listState.q)}"></label>
      </div>
      ${TEXT_FILTERS.map((F) => `<datalist id="tl_${F.k}">${uniq(list.map(F.sug || F.val)).map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`).join('')}
      <div class="filters more" id="more" ${listState.more ? '' : 'hidden'}>
        ${FILTERS.filter((F) => !MAIN_FILTERS.includes(F.k)).map(selHtml).join('')}
      </div>
      <div class="filterfoot"><button class="link" id="moreBtn">${listState.more ? '자세히 거르기 접기 ▴' : '자세히 거르기 ▾'}</button>
        <span id="count" class="sub"></span><button class="link" id="clear">거르기 모두 풀기</button></div>
    </div>
    <div class="tablewrap"><table>
      <thead><tr><th></th><th>관리번호</th>${showRoom ? '<th>방</th>' : ''}<th>분류</th><th>기기 이름</th><th>모델 · 제조사</th><th>사용부서</th><th>구입일자</th><th>내구연한 끝</th><th>다음 점검</th><th>상태</th><th class="num">수리</th></tr></thead>
      <tbody id="rows"></tbody></table></div>`;
  let shown = [];
  const draw = () => {
    const q = listState.q.toLowerCase().trim();
    shown = list.filter((e) => {
      if (listState.active === 'on' && e.active === false) return false;
      if (listState.active === 'off' && e.active !== false) return false;
      for (const F of FILTERS) {
        const want = listState.f[F.k];
        if (!want) continue;
        const v = F.val(e) || '';
        if (want === '__none') { if (v) return false; continue; }
        if (!want.split('|').includes(v)) return false;
      }
      for (const F of TEXT_FILTERS) {
        const want = (listState.t[F.k] || '').toLowerCase().trim();
        if (want && !String(F.val(e) || '').toLowerCase().includes(want)) return false;
      }
      if (q && !q.split(/\s+/).every((w) => searchText(e).includes(w))) return false;
      return true;
    });
    const nf = Object.values(listState.f).filter(Boolean).length + Object.values(listState.t).filter((v) => v && v.trim()).length + (q ? 1 : 0);
    $('#count').textContent = `${shown.length}대${nf ? ` · 거르기 ${nf}개 적용 중` : ''}`;
    $('#clear').hidden = !nf;
    $('#rows').innerHTML = shown.length ? shown.map((e) => `
      <tr class="click ${e.active === false ? 'dim' : ''}" data-id="${e.id}">
        <td class="thumbcell">${thumbHtml(e, 'thumb')}</td>
        <td class="nowrap">${esc(e.code)}</td>
        ${showRoom ? `<td class="nowrap">${esc(e.roomName)}</td>` : ''}
        <td class="nowrap">${esc(e.group)}</td>
        <td class="name"><b>${esc(e.name)}</b>${e.nickname ? ` <span class="muted">(${esc(e.nickname)})</span>` : ''}${e.goodsName && e.goodsName !== e.name ? `<div class="sub">${esc(e.goodsName)}</div>` : ''}${e.assetNo ? `<div class="sub">No. ${esc(e.assetNo)}</div>` : ''}</td>
        <td>${esc(e.model)}${e.maker ? ` <span class="muted">${esc(e.maker)}</span>` : ''}</td>
        <td class="nowrap">${esc(e.dept)}</td>
        <td class="nowrap">${esc(e.acquiredDate)}</td>
        <td class="nowrap">${lifePill(e, true)}</td>
        <td class="nowrap">${duePill(e, true)}</td>
        <td class="nowrap">${useBadge(e.useStatus)} ${stBadge(e.status)}</td>
        <td class="num nowrap">${e.repairCount}건${e.repairTotal ? `<div class="sub">${won(e.repairTotal)}원</div>` : ''}</td>
      </tr>`).join('') : `<tr><td colspan="${showRoom ? 12 : 11}" class="empty">${list.length ? '조건에 맞는 장비가 없어요.' : '아직 등록된 장비가 없어요. 오른쪽 위 <b>+ 장비 등록</b>으로 시작하세요.'}</td></tr>`;
    $$('tr[data-id]', $('#rows')).forEach((tr) => (tr.onclick = () => (location.hash = '#/eq/' + tr.dataset.id)));
    fillThumbs($('#rows'));
  };
  draw();
  $('#q').oninput = (ev) => { listState.q = ev.target.value; draw(); };
  $$('[data-tf]').forEach((inp) => (inp.oninput = () => { listState.t[inp.dataset.tf] = inp.value; draw(); }));
  $('#ac').onchange = (ev) => { listState.active = ev.target.value; draw(); };
  $$('[data-flt]').forEach((s) => (s.onchange = () => { listState.f[s.dataset.flt] = s.value; draw(); }));
  $('#moreBtn').onclick = () => { listState.more = !listState.more; viewList(); };
  $('#clear').onclick = () => { listState.f = {}; listState.t = {}; listState.q = ''; viewList(); };
  $$('[data-quick]').forEach((b) => (b.onclick = () => {
    const [k, v] = b.dataset.quick.split('=');
    listState.f = { [k]: v }; listState.t = {}; listState.q = ''; listState.active = 'on';
    if (!MAIN_FILTERS.includes(k)) listState.more = true;
    viewList();
  }));
  $('#csv').onclick = () => downloadCsv(`장비목록_${todayStr()}.csv`, [
    ['관리번호', '기기 이름', '별칭', '분류', '품종', '모델명', '제조사', '일련번호', '규격', '놓인 자리',
      '물품분류번호', '물품관리번호', '구입일련번호', '장비대장 품명', '구입일자', '구입단가', '내구연한(년)', '내구연한 끝',
      '사용부서', '물품운용관', '사용 담당자', '사용 상태', '물품 상태', '워런티 만료일', '무슨 점검', '점검 주기(개월)', '마지막 점검', '다음 점검',
      '운용 여부', '수리 횟수', '누적 수리비', '관리 이력 비용', '연락처', '메모'],
    ...shown.map((e) => [e.code, e.name, e.nickname, e.group, CATEGORIES[e.category] || '', e.model, e.maker, e.serial, e.spec, e.location,
      e.classNo, e.assetNo, e.buySeqNo, e.goodsName, e.acquiredDate, e.acquiredPrice, e.usefulLife, e.lifeEnd,
      e.dept, e.operator, e.manager, e.useStatus, e.status, e.warrantyUntil, e.calLabel, e.calMonths, e.lastCheck, e.nextCheck,
      e.active === false ? '처분됨' : '운용', e.repairCount, e.repairTotal, e.logTotal,
      (e.contacts || []).map((c) => [c.company, c.person, c.role, c.phone, c.email].filter(Boolean).join(' ')).join(' / '), e.memo]),
  ]);
}

// ---------- 장비 등록·수정 (랩관리 기기 관리와 같은 세 묶음) ----------
const EQ_GROUPS = [
  { title: '① 무엇인지', hint: '고장났을 때 업체에 불러주는 것들이에요.', fields: [
    { k: 'roomId', label: '방', type: 'select', req: true, opts: [], help: '이 방의 구성원만 이 장비를 보고 적을 수 있어요.' },
    { k: 'name', label: '기기 이름', req: true, ph: '예: 동력 분무기' },
    { k: 'nickname', label: '별칭', ph: '예: 1호기 · 빨간 분무기', help: '대시보드 사진 아래에 보여요. 여럿일 때 서로 구분하는 짧은 이름.' },
    { k: 'group', label: '분류', list: 'dl_group', help: '자유롭게 정하는 분류 (예: 방제 · 측정 · 차량 · 사무). 한 번 적은 것은 다음부터 골라 쓸 수 있어요.' },
    { k: 'category', label: '품종', type: 'select', opts: CATEGORIES.map((c, i) => [i ? String(i) : '', c]), help: '물품관리대장 서식의 10품종 구분' },
    { k: 'model', label: '모델명' },
    { k: 'maker', label: '제조사', list: 'dl_maker' },
    { k: 'serial', label: '일련번호', help: 'S/N. 수리 맡길 때 불러주는 번호' },
    { k: 'spec', label: '규격', ph: '예: 1200×600×2000mm, 20L' },
    { k: 'location', label: '놓인 자리', list: 'dl_location', help: '바꾸면 위치 기록에도 남아요. 위치 목록은 <b>위치 기록</b> 탭에서 넣고 뺄 수 있어요.' },
  ] },
  { title: '② 장비대장', hint: '재물조사·물품관리에서 부르는 번호들이에요.', fields: [
    { k: 'classNo', label: '물품분류번호', help: '장비대장 분류번호 왼쪽' },
    { k: 'assetNo', label: '물품관리번호', help: '장비대장 분류번호 오른쪽' },
    { k: 'buySeqNo', label: '구입일련번호' },
    { k: 'goodsName', label: '장비대장 품명', help: '조달청 물품분류명' },
    { k: 'acquiredDate', label: '구입일자', type: 'date' },
    { k: 'acquiredPrice', label: '구입단가', type: 'money' },
    { k: 'usefulLife', label: '내구연한', type: 'number', unit: '년', help: '구입일자에 더해 교체 때를 알려줘요.' },
  ] },
  { title: '③ 관리', fields: [
    { k: 'dept', label: '사용부서', list: 'dl_dept' },
    { k: 'operator', label: '물품운용관', help: '보통 해당 과장', list: 'dl_operator' },
    { k: 'manager', label: '사용 담당자', help: '실제로 쓰고 관리하는 사람', list: 'dl_manager' },
    { k: 'useStatus', label: '사용 상태', type: 'select', opts: USE_STATUSES, help: '수리를 요청하면 "수리 중", 끝나면 "쓰는 중", 처분하면 "폐기"로 저절로 바뀌어요.' },
    { k: 'status', label: '물품 상태', type: 'select', opts: STATUSES, help: '신품 · 중고품(수리 필요 없음) · 요정비품(고쳐 쓰는 게 경제적) · 폐품(고쳐도 비경제적) — 여주시 물품관리 조례 별표 1' },
    { k: 'warrantyUntil', label: '워런티 만료일', type: 'date' },
    { k: 'calLabel', label: '무슨 점검', ph: '예: 검교정 · 정기점검 · 자동차 정기검사' },
    { k: 'calMonths', label: '점검 주기', type: 'number', unit: '개월마다', help: '비우면 알리지 않아요. 적으면 마지막 점검 이력에서 다음 때를 계산해요.' },
    { k: 'calNoticeDays', label: '알림', type: 'number', unit: '일 전부터', help: '다음 점검 며칠 전부터 "때가 됐다"고 표시할지' },
    { k: 'memo', label: '메모', type: 'textarea' },
  ] },
];
async function viewEquipForm(id) {
  const all = await call('GET', '/api/equipment');
  const e = id ? (await call('GET', '/api/equipment/' + id)).equipment : { status: '신품', useStatus: '쓰는 중', calNoticeDays: 30, roomId: ROOM || (MYROOMS.filter((r) => r.active)[0] || {}).id };
  // 방: 내가 속한 방만 고를 수 있어요 (지금 방이 목록에 없으면 그대로 보여 줌)
  const roomOpts = MYROOMS.filter((r) => r.active).map((r) => [String(r.id), r.name]);
  if (e.roomId && !roomOpts.some((o) => o[0] === String(e.roomId))) roomOpts.push([String(e.roomId), e.roomName || '(다른 방)']);
  EQ_GROUPS[0].fields.find((x) => x.k === 'roomId').opts = roomOpts;
  const dl = (key) => uniq(all.map((x) => x[key])).map((v) => `<option value="${esc(v)}">`).join('');
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>${id ? esc(e.code) + ' 정보 고치기' : '장비 등록'}</h1></div>
    <form class="form" id="f">${formHtml(EQ_GROUPS, e)}
      ${id ? '' : '<div class="note info">사진과 연락처는 저장한 뒤 장비 카드에서 넣을 수 있어요.</div>'}
      <div class="form-actions"><a class="btn" href="${id ? '#/eq/' + id : '#/list'}">취소</a><button class="btn primary">저장</button></div>
    </form>
    ${['group', 'maker', 'dept', 'operator', 'manager'].map((k) => `<datalist id="dl_${k}">${dl(k)}</datalist>`).join('')}
    <datalist id="dl_location">${uniq([...MYROOMS.flatMap((r) => r.places || []), ...all.map((x) => x.location)]).map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const f = $('#f'); bindMoney(f);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    try {
      const saved = id ? await call('PUT', '/api/equipment/' + id, formValues(f)) : await call('POST', '/api/equipment', formValues(f));
      if (saved._queued) { toast(QMSG); location.hash = id ? '#/eq/' + id : '#/list'; return; }
      toast('저장했어요'); location.hash = '#/eq/' + saved.id;
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- 장비 카드 ----------
let eqTab = 'repairs';
async function viewEquip(id) {
  const d = await call('GET', '/api/equipment/' + id);
  const e = d.equipment;
  const kv = (k, v) => `<div><dt>${k}</dt><dd>${v === '' || v === null || v === undefined ? '<span class="muted">-</span>' : v}</dd></div>`;
  const notes = [];
  if (e.active === false) notes.push('<div class="note info">이 장비는 <b>처분됨</b> 상태예요(정리 기록 참고). 기록은 5년 보관 대상이라 지우지 않고 남겨 둬요.</div>');
  if (e.lifeExpired && e.active !== false) notes.push(`<div class="note warn">내구연한이 <b>${esc(e.lifeEnd)}</b>에 끝났어요. 큰 수리가 필요하면 고치는 것보다 <b>불용(폐품) 처리</b>가 나은지 먼저 검토하세요. (여주시 물품관리 조례 제16조)</div>`);
  if (e.overdue) notes.push(`<div class="note bad"><b>${esc(e.calLabel || '점검')}</b> 날짜(${esc(e.nextCheck)})가 ${-e.dueDays}일 지났어요.</div>`);
  else if (e.due) notes.push(`<div class="note warn"><b>${esc(e.calLabel || '점검')}</b> 때가 됐어요 — ${esc(e.nextCheck)} (${e.dueDays}일 남음)</div>`);
  if (e.acquiredPrice && e.repairTotal >= e.acquiredPrice * 0.5 && e.active !== false) notes.push(`<div class="note warn">지금까지 수리비(${won(e.repairTotal)}원)가 구입단가의 <b>${Math.round(e.repairTotal / e.acquiredPrice * 100)}%</b>예요.</div>`);
  const liveLogs = d.logs.filter((l) => !l.canceled);
  const app = $('#app');
  app.innerHTML = `
    <div class="head">
      <div><div class="sub">${esc(e.code)} · <b>${esc(e.roomName)}</b>${e.group ? ` · ${esc(e.group)}` : ''}</div>
        <h1>${esc(e.name)} ${useBadge(e.useStatus)} ${stBadge(e.status)}${e.active === false ? ' <span class="badge out">처분됨</span>' : ''}</h1></div>
      <span class="grow"></span>
      ${PHONE() ? '' : '<button class="btn no-print" onclick="window.print()">인쇄</button>'}
      <a class="btn no-print" href="#/eq/${id}/edit">정보 고치기</a>
      ${e.active !== false ? `<a class="btn no-print" href="#/eq/${id}/log/new">+ 관리 이력</a><a class="btn primary no-print" href="#/eq/${id}/repair/new">+ 수리 요청</a>` : ''}
    </div>
    ${notes.join('')}
    <div class="card eqtop">
      <div class="eqinfo">
        <div class="sec">① 무엇인지</div>
        <dl class="kv">
          ${kv('모델명', esc(e.model))}${kv('제조사', esc(e.maker))}
          ${kv('일련번호', esc(e.serial))}${kv('규격', esc(e.spec))}
          ${kv('분류', esc(e.group))}${kv('품종', esc(CATEGORIES[e.category] || ''))}
          ${kv('별칭', esc(e.nickname))}${kv('놓인 자리', e.location ? `${esc(e.location)}${e.placeSince ? ` <span class="muted">· ${esc(e.placeSince)}부터</span>` : ''} <a class="link small no-print" href="#/places">위치 기록</a>` : '')}
        </dl>
        <div class="sec">② 장비대장</div>
        <dl class="kv">
          ${kv('물품분류번호', esc(e.classNo))}${kv('물품관리번호', esc(e.assetNo))}
          ${kv('구입일련번호', esc(e.buySeqNo))}${kv('장비대장 품명', esc(e.goodsName))}
          ${kv('구입일자', esc(e.acquiredDate))}${kv('구입단가', e.acquiredPrice ? won(e.acquiredPrice) + '원' : '')}
          ${kv('내구연한', e.usefulLife ? `${e.usefulLife}년 &nbsp;${lifePill(e)}` : '')}
        </dl>
        <div class="sec">③ 관리</div>
        <dl class="kv">
          ${kv('사용부서', esc(e.dept))}${kv('물품운용관', esc(e.operator))}
          ${kv('사용 담당자', esc(e.manager))}${kv('워런티 만료일', warrantyPill(e))}
          ${kv('무슨 점검', e.calLabel || e.calMonths ? `${esc(e.calLabel || '점검')}${e.calMonths ? ` <span class="muted">${e.calMonths}개월마다 · ${e.calNoticeDays ?? 30}일 전 알림</span>` : ''}` : '')}
          ${kv('다음 점검', e.calMonths ? `${duePill(e)}${e.lastCheck ? ` <span class="muted">· 마지막 ${esc(e.lastCheck)}</span>` : ''}` : '')}
          ${kv('수리', `${e.repairCount}건 · ${won(e.repairTotal)}원`)}${kv('관리 이력', `${e.logCount}건 · ${won(e.logTotal)}원`)}
        </dl>
        ${e.memo ? `<div class="sub" style="margin-top:10px">메모: ${esc(e.memo)}</div>` : ''}
      </div>
      <div class="eqphoto">
        <div class="photobox" id="photoBox">${e.hasPhoto ? (PHONE() ? '<button type="button" class="btn small" id="photoLoad">📷 사진 보기</button>' : `<img src="/api/equipment/${id}/photo?t=${Date.now()}" alt="기기 사진">`) : '<span class="muted">사진 없음</span>'}</div>
        <div class="no-print photobtns">
          <label class="btn small">사진 올리기<input type="file" id="photoFile" accept="image/*" hidden></label>
          ${e.hasPhoto ? '<button class="btn small" id="photoDel">떼기</button>' : ''}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="head" style="margin-bottom:8px"><h2 style="margin:0">연락처</h2><span class="sub">수리 맡길 때 여기를 보시면 돼요</span><span class="grow"></span>
        <button class="btn small no-print" id="addC">+ 줄 넣기</button><button class="btn small primary no-print" id="saveC" hidden>연락처 저장</button></div>
      <div class="tablewrap flat"><table class="contacts"><thead><tr><th>업체</th><th>이름</th><th>하는 일</th><th>전화</th><th>메일</th><th>메모</th><th class="no-print"></th></tr></thead><tbody id="cBody"></tbody></table></div>
    </div>

    <div class="tabs">
      <button data-tab="repairs">수리 이력 (${d.repairs.length})</button>
      <button data-tab="logs">관리 이력 (${d.logs.length})</button>
      <button data-tab="moves">정리(이동) 기록 (${d.moves.length})</button>
      <button data-tab="parts">부대품 (${d.parts.length})</button>
      <button data-tab="audit">변경 기록</button>
    </div>
    <div class="print-all">
    <div data-pane="repairs">
      <div class="head no-print"><span class="sub">고장 → 수리 요청 → 진행 → 검수</span><span class="grow"></span>${e.active !== false ? `<a class="btn small primary" href="#/eq/${id}/repair/new">+ 수리 요청</a>` : ''}</div>
      <div class="tablewrap"><table><thead><tr><th>번호</th><th>요청일</th><th>건명</th><th>업체</th><th>진행</th><th class="num">금액</th><th>검수일</th><th>하자담보 끝</th></tr></thead><tbody>
      ${d.repairs.length ? d.repairs.slice().reverse().map((r) => `
        <tr class="click ${r.canceled ? 'canceled' : ''}" data-rid="${r.id}">
          <td>${r.no}</td><td class="nowrap">${esc(r.requestDate)}</td><td><b>${esc(r.title)}</b>${r.canceled ? `<div class="sub">취소: ${esc(r.canceled.reason)}</div>` : ''}${fileLinks(r.files)}</td>
          <td>${esc(r.vendor)}</td><td><span class="badge r-${r.status}">${r.status}</span></td>
          <td class="num">${won(r.amount)}</td><td class="nowrap">${esc(r.inspectDate)}</td><td class="nowrap">${esc(r.warrantyEnd || '')}</td>
        </tr>`).join('') : '<tr><td colspan="8" class="empty">수리 기록이 없어요.</td></tr>'}
      </tbody></table></div>
    </div>
    <div data-pane="logs">
      <div class="head no-print"><span class="sub">점검(검교정) · 소모품 교체 · 기타. 점검을 적으면 다음 점검 날짜가 새로 계산돼요.</span><span class="grow"></span>${e.active !== false ? `<a class="btn small primary" href="#/eq/${id}/log/new">+ 관리 이력</a>` : ''}</div>
      <div class="tablewrap"><table><thead><tr><th>날짜</th><th>구분</th><th>내용</th><th>업체</th><th class="num">비용</th><th>소모품</th><th>다음 예정일</th><th>적은 사람</th><th class="no-print"></th></tr></thead><tbody>
      ${d.logs.length ? d.logs.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id).map((l) => `
        <tr class="${l.canceled ? 'canceled' : ''}"><td class="nowrap">${esc(l.date)}</td><td class="nowrap"><b>${esc(l.kind)}</b></td>
        <td>${esc(l.content)}${l.canceled ? `<div class="sub">취소: ${esc(l.canceled.reason)}</div>` : ''}${fileLinks(l.files, !l.canceled)}</td>
        <td>${esc(l.vendor)}</td><td class="num">${won(l.cost)}</td><td>${esc(l.supplyName)}${l.supplyQty ? ` × ${esc(l.supplyQty)}` : ''}</td>
        <td class="nowrap">${esc(l.nextOn)}</td><td>${esc(l.createdBy)}</td>
        <td class="no-print">${l.canceled ? '' : `<button class="btn small danger" data-cancel="logs/${l.id}">취소</button>`}</td></tr>`).join('') : '<tr><td colspan="9" class="empty">관리 이력이 없어요.</td></tr>'}
      </tbody></table></div>
    </div>
    <div data-pane="moves">
      <div class="head no-print"><span class="sub">구입·사용전환(부서 이동)·반납·폐기·매각 등 (여주시 물품관리 조례 별표 2)</span><span class="grow"></span><a class="btn small primary" href="#/eq/${id}/move/new">+ 정리 기록</a></div>
      <div class="tablewrap"><table><thead><tr><th>날짜</th><th>정리구분</th><th>보낸 곳</th><th>받은 곳</th><th>증명서 번호</th><th>내용</th><th>적은 사람</th><th class="no-print"></th></tr></thead><tbody>
      ${d.moves.length ? d.moves.slice().reverse().map((r) => `
        <tr class="${r.canceled ? 'canceled' : ''}"><td class="nowrap">${esc(r.date)}</td><td><b>${esc(r.type)}</b></td><td>${esc(r.fromDept)}</td><td>${esc(r.toDept)}</td><td>${esc(r.docNo)}</td>
        <td>${esc(r.memo)}${r.canceled ? `<div class="sub">취소: ${esc(r.canceled.reason)}</div>` : ''}</td><td>${esc(r.createdBy)}</td>
        <td class="no-print">${r.canceled ? '' : `<button class="btn small danger" data-cancel="moves/${r.id}">취소</button>`}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">정리 기록이 없어요.</td></tr>'}
      </tbody></table></div>
    </div>
    <div data-pane="parts">
      <div class="head no-print"><span class="sub">본체에 딸린 부속품 (물품관리대장 뒤쪽 '부대품 명세')</span><span class="grow"></span><a class="btn small primary" href="#/eq/${id}/part/new">+ 부대품</a></div>
      <div class="tablewrap"><table><thead><tr><th>날짜</th><th>품명</th><th>물품분류번호</th><th class="num">수량</th><th class="num">단가</th><th class="num">금액</th><th>비고</th><th class="no-print"></th></tr></thead><tbody>
      ${d.parts.length ? d.parts.map((r) => `
        <tr class="${r.canceled ? 'canceled' : ''}"><td class="nowrap">${esc(r.date)}</td><td><b>${esc(r.name)}</b></td><td>${esc(r.classNo)}</td><td class="num">${esc(r.qty)}</td>
        <td class="num">${won(r.price)}</td><td class="num">${r.qty && r.price ? won(r.qty * r.price) : ''}</td><td>${esc(r.memo)}${r.canceled ? `<div class="sub">취소: ${esc(r.canceled.reason)}</div>` : ''}</td>
        <td class="no-print">${r.canceled ? '' : `<button class="btn small danger" data-cancel="parts/${r.id}">취소</button>`}</td></tr>`).join('') : '<tr><td colspan="8" class="empty">부대품이 없어요.</td></tr>'}
      </tbody></table></div>
    </div>
    <div data-pane="audit"><div class="card audit"><ul>
      ${d.audit.length ? d.audit.slice().reverse().map((a) => `<li><span class="muted">${esc(a.at.replace('T', ' '))}</span> · <b>${esc(a.who)}</b> · ${esc(a.action)}${a.detail ? ` — <span class="muted">${esc(a.detail)}</span>` : ''}</li>`).join('') : '<li class="muted">기록 없음</li>'}
    </ul></div></div>
    </div>`;

  // 탭
  const tabs = $$('.tabs button', app);
  const show = (t) => {
    eqTab = t;
    tabs.forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    $$('[data-pane]', app).forEach((p) => (p.style.display = p.dataset.pane === t ? '' : 'none'));
  };
  tabs.forEach((b) => (b.onclick = () => show(b.dataset.tab)));
  show(eqTab);
  $$('tr[data-rid]', app).forEach((tr) => (tr.onclick = () => (location.hash = '#/repair/' + tr.dataset.rid)));
  $$('tr[data-rid] a', app).forEach((a) => a.addEventListener('click', (ev) => ev.stopPropagation()));
  $$('[data-cancel]', app).forEach((b) => (b.onclick = () => askText('기록 취소', '기록은 지워지지 않고 취소선과 사유가 남아요.', '취소 사유', async (reason) => {
    await call('POST', `/api/${b.dataset.cancel}/cancel`, { reason }); saved('취소했어요'); route();
  })));
  bindUnfile(app, route);

  // 사진 (핸드폰: 우편함에서 가져옴)
  if ($('#photoLoad')) $('#photoLoad').onclick = async () => {
    const b = $('#photoLoad'); b.disabled = true; b.textContent = '가져오는 중…';
    try {
      const u = await window.EQ_PHONE.photoUrl(id);
      if (u) $('#photoBox').innerHTML = `<img src="${u}" alt="기기 사진">`;
      else { b.disabled = false; b.textContent = '📷 다시 보기'; toast('사무실 서버에 사진을 달라고 했어요. 1~2분 뒤 다시 눌러 주세요.'); }
    } catch (err) { b.disabled = false; b.textContent = '📷 사진 보기'; toast(err.message, true); }
  };
  $('#photoFile').onchange = async (ev) => {
    const file = ev.target.files[0]; if (!file) return;
    try {
      const th = await makeThumb(file);
      await upload(`/api/equipment/${id}/photo`, file);
      if (th) await upload(`/api/equipment/${id}/thumb`, th);
      saved('사진을 올렸어요'); route();
    } catch (err) { toast(err.message, true); }
  };
  if ($('#photoDel')) $('#photoDel').onclick = async () => {
    try { await call('DELETE', `/api/equipment/${id}/photo`); saved('사진을 뗐어요'); route(); } catch (err) { toast(err.message, true); }
  };

  // 연락처 (표 안에서 바로 고치고 저장)
  let contacts = (e.contacts || []).map((c) => ({ ...c }));
  const CK = ['company', 'person', 'role', 'phone', 'email', 'note'];
  const CPH = { company: '업체', person: '이름', role: '엔지니어 · 영업 · AS접수', phone: '전화', email: '메일', note: '메모' };
  const dirty = () => ($('#saveC').hidden = false);
  const drawC = () => {
    $('#cBody').innerHTML = contacts.length ? contacts.map((c, i) => `<tr>${CK.map((k) => `<td><input class="cin" data-i="${i}" data-k="${k}" value="${esc(c[k] || '')}" placeholder="${CPH[k]}"></td>`).join('')}
      <td class="no-print"><button class="btn small" data-cx="${i}">빼기</button></td></tr>`).join('')
      : '<tr><td colspan="7" class="empty">아직 없어요. <b>+ 줄 넣기</b>를 누르세요.</td></tr>';
    $$('.cin').forEach((inp) => (inp.oninput = () => { contacts[inp.dataset.i][inp.dataset.k] = inp.value; dirty(); }));
    $$('[data-cx]').forEach((b) => (b.onclick = () => { contacts.splice(+b.dataset.cx, 1); drawC(); dirty(); }));
  };
  drawC();
  $('#addC').onclick = () => { contacts.push({}); drawC(); dirty(); $$('.cin')[$$('.cin').length - 6].focus(); };
  $('#saveC').onclick = async () => {
    try { await call('PUT', `/api/equipment/${id}/contacts`, { rows: contacts }); saved('연락처를 저장했어요'); route(); } catch (err) { toast(err.message, true); }
  };
}

// ---------- 수리 요청·진행·검수 ----------
const REPAIR_GROUPS = [
  { title: '① 수리 요청', hint: '품의요구서(여주시 물품관리 조례 시행규칙 별지 제1호, "수리")에 들어가는 내용이에요.', fields: [
    { k: 'requestDate', label: '요청일', type: 'date' },
    { k: 'title', label: '건명', req: true, ph: '예: 분무기 펌프 누수 수리' },
    { k: 'symptom', label: '고장 내용', type: 'textarea', ph: '언제부터 어떤 증상이 있는지' },
    { k: 'cause', label: '고장 원인', type: 'select', opts: ['', ...CAUSES], help: '잃어버리거나 망가뜨린 경우는 경위서를 써서 보고해야 해요 (조례 제22조).' },
    { k: 'kind', label: '수리 종류', type: 'select', opts: [], help: '회계과 계약의뢰 기준을 가를 때 써요. 종류는 <a href="#/settings">설정</a>에서 고칠 수 있어요.' },
    { k: 'estimate', label: '추정가격', type: 'money' },
    { k: 'budget', label: '예산 과목', type: 'select', opts: BUDGETS, help: '거의 모든 수리는 공공운영비예요. 내용연수를 크게 늘리는 대규모 수리만 시설비.' },
  ] },
  { title: '② 수리 진행', hint: '업체와 지출 정보 (회계관리 훈령 별지 제41호 지출결의서·제41-1호 승낙사항).', fields: [
    { k: 'vendor', label: '업체(거래처)', list: 'dl_vendor' },
    { k: 'vendorContact', label: '업체 연락처' },
    { k: 'startDate', label: '착수일', type: 'date' },
    { k: 'endDate', label: '완료일', type: 'date' },
    { k: 'amount', label: '실제 수리비', type: 'money', help: '부가세 포함 합계' },
    { k: 'expenseNo', label: '지출결의 번호' },
    { k: 'warrantyMonths', label: '하자담보 기간', type: 'number', unit: '개월', help: '적으면 무상수리가 언제까지인지 계산해 줘요.' },
  ] },
  { title: '③ 검수', hint: '검수일을 적으면 이 수리는 "완료"가 돼요 (조례 제28조: 물품출납원이 검수, 회계과 공무원 입회).', fields: [
    { k: 'inspectDate', label: '검수일', type: 'date' },
    { k: 'inspector', label: '검수자' },
    { k: 'witness', label: '입회자' },
  ] },
  { title: '④ 수리 명세', hint: '물품관리대장 뒤쪽 "수리 명세"에 해당해요.', fields: [
    { k: 'detail', label: '무엇을 고쳤나', type: 'textarea', ph: '교체한 부품, 작업 내용 등' },
    { k: 'memo', label: '비고', type: 'textarea' },
  ] },
];
async function viewRepairForm(eqId, rid) {
  let r = { requestDate: todayStr(), budget: '공공운영비', files: [] };
  if (rid) { r = await call('GET', '/api/repairs/' + rid); eqId = r.equipmentId; }
  const d = await call('GET', '/api/equipment/' + eqId);
  const e = d.equipment;
  settings = await call('GET', '/api/settings');
  const allRepairs = await call('GET', '/api/repairs');
  const vendors = uniq([...allRepairs.map((x) => x.vendor), ...(e.contacts || []).map((c) => c.company)]);
  const locked = !!r.canceled;
  const steps = ['요청', '수리중', '완료'];
  const idx = r.canceled ? -1 : steps.indexOf(r.status || '요청');
  // 수리 종류는 설정에서 불러와요. 예전에 쓰던 종류가 목록에서 빠졌어도 그 기록에는 그대로 보여요.
  const kindOpts = kindNames();
  if (!rid) r.kind = kindOpts[0] || '';
  else if (r.kind && !kindOpts.includes(r.kind)) kindOpts.push(r.kind);
  REPAIR_GROUPS[0].fields.find((x) => x.k === 'kind').opts = ['', ...kindOpts];
  const groups = rid ? REPAIR_GROUPS : REPAIR_GROUPS.slice(0, 1).concat(REPAIR_GROUPS.slice(3));
  const fileGroup = { title: '첨부 문서', hint: '견적서 · 수리 성적서 · 경위서 · 지출결의서 스캔 등. 여러 개 한 번에 올릴 수 있어요.', fields: [{ k: '_files', label: '파일 올리기', type: 'files' }] };
  const app = $('#app');
  app.innerHTML = `
    <div class="head">
      <div><div class="sub"><a href="#/eq/${e.id}">${esc(e.code)} ${esc(e.name)}</a></div>
      <h1>${rid ? `수리 ${r.no} — ${esc(r.title)}` : '수리 요청'}</h1></div><span class="grow"></span>
      ${rid && !locked ? '<button class="btn danger" id="cancelBtn">이 기록 취소</button>' : ''}
    </div>
    ${r.canceled ? `<div class="note bad"><b>취소된 기록</b> · ${esc(r.canceled.at.replace('T', ' '))} ${esc(r.canceled.by)} — ${esc(r.canceled.reason)}</div>` : ''}
    ${rid && !locked ? `<div class="steps">${steps.map((s, i) => `<span class="${i <= idx ? 'done' : ''}">${s}</span>`).join('')}</div>` : ''}
    ${e.lifeExpired ? `<div class="note warn">이 장비는 내구연한(${esc(e.lifeEnd)})이 지났어요. 고치는 것보다 불용 처리가 나은지 먼저 검토하세요.</div>` : ''}
    ${e.warrantyUntil && e.warrantyDays >= 0 ? `<div class="note info">이 장비는 <b>워런티</b>가 ${esc(e.warrantyUntil)}까지 남아 있어요. 무상수리가 되는지 먼저 업체에 확인하세요.</div>` : ''}
    <div id="warnBox"></div>
    ${r.warrantyEnd ? `<div class="note info">하자담보(무상수리) 기간: <b>${esc(r.warrantyEnd)}</b>까지${r.warrantyEnd >= todayStr() ? ' — 아직 남아 있어요' : ' — 끝났어요'}</div>` : ''}
    <form class="form" id="f">${formHtml(groups, r)}
      <fieldset><legend>${fileGroup.title}</legend><div class="hint">${fileGroup.hint}</div>
        ${fileLinks(r.files, !locked) || (rid ? '<div class="sub" style="padding:6px 0">아직 붙인 문서가 없어요.</div>' : '')}
        ${locked ? '' : fieldHtml(fileGroup.fields[0])}</fieldset>
      ${!rid ? '<div class="note info">② 진행·③ 검수 칸은 저장한 뒤 이 기록을 다시 열어 이어서 적으면 돼요.</div>' : ''}
      <div class="form-actions"><a class="btn" href="#/eq/${e.id}">${locked ? '돌아가기' : '취소'}</a>${locked ? '' : '<button class="btn primary">저장</button>'}</div>
    </form>
    <datalist id="dl_vendor">${vendors.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const f = $('#f'); bindMoney(f);
  bindUnfile(f, route);
  if (locked) $$('input,select,textarea', f).forEach((el) => (el.disabled = true));
  const check = () => {
    const v = formValues(f);
    const est = Number(String(v.estimate || '').replace(/,/g, '')) || 0;
    const amt = Number(String(v.amount || '').replace(/,/g, '')) || 0;
    const base = Math.max(est, amt);
    const kd = (settings.kinds || []).find((k) => k.name === v.kind);
    const lim = kd && kd.limit;
    const out = [];
    if (lim && base > lim) out.push(`<div class="note warn"><b>회계과 계약의뢰 대상</b>이에요 — ${esc(v.kind)}는 추정가격 ${won(lim)}원을 넘으면 부서에서 직접 집행하지 않고 회계과에 계약을 의뢰해요. (여주시 2026년도 일상경비 운영계획)</div>`);
    if (v.budget === '시설비') out.push('<div class="note info">예산 과목을 <b>시설비</b>로 골랐어요. 경리팀과 과목을 한 번 확인하세요.</div>');
    if (String(v.cause || '').startsWith('훼손')) out.push('<div class="note info">훼손·망실은 <b>경위서</b>를 작성해 물품출납원에게 보고해야 해요 (조례 제22조).</div>');
    $('#warnBox').innerHTML = out.join('');
  };
  f.addEventListener('input', check); f.addEventListener('change', check); check();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = $('.form-actions .primary', f); btn.disabled = true;
    try {
      const saved = rid ? await call('PUT', '/api/repairs/' + rid, formValues(f)) : await call('POST', `/api/equipment/${eqId}/repairs`, formValues(f));
      const files = $('#f__files') ? [...$('#f__files').files] : [];
      if (files.length) await uploadFiles('repair', saved.id, files);
      if (saved._queued) { toast(QMSG); location.hash = '#/eq/' + eqId; return; }
      toast('저장했어요');
      if (!rid) location.hash = '#/repair/' + saved.id; else route();
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
  const cb = $('#cancelBtn');
  if (cb) cb.onclick = () => askText('수리 기록 취소', '기록은 지워지지 않고 취소선과 사유가 남아요 (증빙·장부 5년 보관).', '취소 사유', async (reason) => {
    await call('POST', `/api/repairs/${rid}/cancel`, { reason }); saved('취소했어요'); route();
  });
}

// ---------- 관리 이력 (점검 · 소모품 교체 · 기타) ----------
async function viewLogForm(eqId) {
  const d = await call('GET', '/api/equipment/' + eqId);
  const e = d.equipment;
  const vendors = uniq([...d.logs.map((l) => l.vendor), ...(e.contacts || []).map((c) => c.company)]);
  const groups = [{ title: '관리 이력 남기기', hint: '고장 수리는 <b>수리 요청</b>으로, 그 밖의 점검·검교정·소모품 교체 등은 여기에 적어요. 지워지지 않고, 잘못 적으면 취소 표시만 해요.', fields: [
    { k: 'date', label: '날짜', type: 'date' },
    { k: 'kind', label: '구분', type: 'select', opts: LOG_KINDS },
    { k: 'content', label: '내용', req: true, ph: '무슨 일이 있었는지' },
    { k: 'vendor', label: '업체', list: 'dl_vendor', ph: '점검·교체를 해 준 곳' },
    { k: 'cost', label: '비용', type: 'money' },
    { k: 'supplyName', label: '쓴 소모품', ph: '예: 필터, 램프' },
    { k: 'supplyQty', label: '몇 개', type: 'number', unit: '개' },
    { k: 'nextOn', label: '다음 예정일', type: 'date', help: '비우면 점검 주기로 계산해요.' },
    { k: '_files', label: '문서', type: 'files', help: '성적서 · 견적서 (여러 장 됩니다)' },
  ] }];
  $('#app').innerHTML = `<div class="head"><div><div class="sub"><a href="#/eq/${e.id}">${esc(e.code)} ${esc(e.name)}</a></div><h1>관리 이력 추가</h1></div></div>
    <form class="form" id="f">${formHtml(groups, { date: todayStr(), kind: e.calMonths ? '점검' : '기타' })}
    <div class="note info" id="nextHint" hidden></div>
    <div class="form-actions"><a class="btn" href="#/eq/${e.id}">취소</a><button class="btn primary">이력 남기기</button></div></form>
    <datalist id="dl_vendor">${vendors.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const f = $('#f'); bindMoney(f);
  const hint = () => {
    const v = formValues(f);
    const box = $('#nextHint');
    if (v.kind !== '점검' || !e.calMonths || v.nextOn || !v.date) { box.hidden = true; return; }
    const dd = new Date(v.date + 'T00:00:00Z'); dd.setUTCMonth(dd.getUTCMonth() + Number(e.calMonths));
    box.hidden = false; box.textContent = `다음 ${e.calLabel || '점검'}은 ${dd.toISOString().slice(0, 10)} 이에요 (${e.calMonths}개월 뒤).`;
  };
  f.addEventListener('input', hint); f.addEventListener('change', hint); hint();
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = $('.form-actions .primary', f); btn.disabled = true;
    try {
      const l = await call('POST', `/api/equipment/${eqId}/logs`, formValues(f));
      const files = [...$('#f__files').files];
      if (files.length) await uploadFiles('log', l.id, files);
      eqTab = 'logs'; saved('저장했어요'); location.hash = '#/eq/' + eqId;
    } catch (err) { toast(err.message, true); btn.disabled = false; }
  };
}

// ---------- 정리(이동) 기록 / 부대품 ----------
async function viewMoveForm(eqId) {
  const d = await call('GET', '/api/equipment/' + eqId);
  const e = d.equipment;
  const groups = [{ title: '정리(이동) 기록', hint: '매각·폐기·망실·관리전환·양도 등을 적으면 장비가 <b>처분됨</b>으로 바뀌어요. 사용전환·반납은 받은 곳이 사용부서로 바뀌어요.', fields: [
    { k: 'date', label: '날짜', type: 'date' },
    { k: 'type', label: '정리구분', type: 'select', req: true, opts: ['', ...MOVE_TYPES], help: '여주시 물품관리 조례 별표 2' },
    { k: 'fromDept', label: '보낸 곳' },
    { k: 'toDept', label: '받은 곳' },
    { k: 'docNo', label: '증명서 번호', help: '청구 및 출급증, 불용결정통보서 등 관련 문서 번호' },
    { k: 'memo', label: '내용', type: 'textarea' },
  ] }];
  $('#app').innerHTML = `<div class="head"><div><div class="sub"><a href="#/eq/${e.id}">${esc(e.code)} ${esc(e.name)}</a></div><h1>정리 기록 추가</h1></div></div>
    <form class="form" id="f">${formHtml(groups, { date: todayStr(), fromDept: e.dept })}
    <div class="form-actions"><a class="btn" href="#/eq/${e.id}">취소</a><button class="btn primary">저장</button></div></form>`;
  const f = $('#f');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await call('POST', `/api/equipment/${eqId}/moves`, formValues(f)); eqTab = 'moves'; saved('저장했어요'); location.hash = '#/eq/' + eqId; } catch (err) { toast(err.message, true); }
  };
}
async function viewPartForm(eqId) {
  const d = await call('GET', '/api/equipment/' + eqId);
  const e = d.equipment;
  const groups = [{ title: '부대품', fields: [
    { k: 'date', label: '날짜', type: 'date' },
    { k: 'name', label: '품명', req: true, ph: '예: 예비 노즐 세트' },
    { k: 'classNo', label: '물품분류번호' },
    { k: 'qty', label: '수량', type: 'number' },
    { k: 'price', label: '단가', type: 'money' },
    { k: 'memo', label: '비고', type: 'textarea' },
  ] }];
  $('#app').innerHTML = `<div class="head"><div><div class="sub"><a href="#/eq/${e.id}">${esc(e.code)} ${esc(e.name)}</a></div><h1>부대품 추가</h1></div></div>
    <form class="form" id="f">${formHtml(groups, { date: todayStr(), qty: 1 })}
    <div class="form-actions"><a class="btn" href="#/eq/${e.id}">취소</a><button class="btn primary">저장</button></div></form>`;
  const f = $('#f'); bindMoney(f);
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    try { await call('POST', `/api/equipment/${eqId}/parts`, formValues(f)); eqTab = 'parts'; saved('저장했어요'); location.hash = '#/eq/' + eqId; } catch (err) { toast(err.message, true); }
  };
}

// ---------- 수리·관리 이력 모아 보기 ----------
const repState = { year: '', status: '', q: '', type: 'repair' };
async function viewRepairs() {
  const repairs = (await call('GET', '/api/repairs')).filter((r) => inRoom(r.roomId));
  const logs = (await call('GET', '/api/logs')).filter((l) => inRoom(l.roomId));
  const rows = [
    ...repairs.map((r) => ({ t: 'repair', id: r.id, date: r.requestDate, eq: `${r.equipmentCode} ${r.equipmentName}`, kind: '수리', title: r.title, vendor: r.vendor, status: r.status, budget: r.budget, cost: r.amount, end: r.inspectDate, canceled: r.canceled, raw: r })),
    ...logs.map((l) => ({ t: 'log', id: l.id, eqId: l.equipmentId, date: l.date, eq: `${l.equipmentCode} ${l.equipmentName}`, kind: l.kind, title: l.content, vendor: l.vendor, status: l.canceled ? '취소' : '기록', budget: '', cost: l.cost, end: l.nextOn, canceled: l.canceled, raw: l })),
  ];
  const years = uniq(rows.map((r) => (r.date || '').slice(0, 4))).reverse();
  if (!repState.year) repState.year = todayStr().slice(0, 4);
  if (!years.includes(repState.year) && repState.year !== 'all') years.unshift(repState.year);
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>수리 기록</h1><span class="grow"></span><button class="btn" id="csv">엑셀로 받기</button></div>
    <div class="filters">
      <select id="tp"><option value="repair" ${repState.type === 'repair' ? 'selected' : ''}>수리만</option><option value="log" ${repState.type === 'log' ? 'selected' : ''}>관리 이력만 (점검·소모품·기타)</option><option value="all" ${repState.type === 'all' ? 'selected' : ''}>수리 + 관리 이력</option></select>
      <select id="yr">${years.map((y) => `<option ${repState.year === y ? 'selected' : ''}>${y}</option>`).join('')}<option value="all" ${repState.year === 'all' ? 'selected' : ''}>전체 연도</option></select>
      <select id="st"><option value="">진행 전체</option>${['요청', '수리중', '완료', '취소'].map((s) => `<option ${repState.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <input type="search" id="q" placeholder="건명·내용·장비·업체로 찾기" value="${esc(repState.q)}">
    </div>
    <div id="sum" class="sub" style="margin-bottom:8px"></div>
    <div class="tablewrap"><table><thead><tr><th>날짜</th><th>장비</th><th>구분</th><th>건명 · 내용</th><th>업체</th><th>진행</th><th>과목</th><th class="num">금액</th><th>검수일 · 다음 예정</th></tr></thead><tbody id="rows"></tbody></table></div>`;
  let shown = [];
  const draw = () => {
    const q = repState.q.toLowerCase();
    shown = rows.filter((r) => (repState.type === 'all' || r.t === repState.type)
      && (repState.year === 'all' || (r.date || '').startsWith(repState.year))
      && (!repState.status || r.status === repState.status)
      && (!q || [r.title, r.eq, r.vendor, r.kind].join(' ').toLowerCase().includes(q)))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));
    const live = shown.filter((r) => !r.canceled);
    $('#sum').textContent = `${shown.length}건 · 비용 합계 ${won(live.reduce((s, r) => s + (Number(r.cost) || 0), 0))}원 (취소 제외)`;
    $('#rows').innerHTML = shown.length ? shown.map((r) => `
      <tr class="click ${r.canceled ? 'canceled' : ''}" data-t="${r.t}" data-id="${r.id}" data-eq="${r.eqId || ''}">
        <td class="nowrap">${esc(r.date)}</td><td class="nowrap">${esc(r.eq)}</td><td class="nowrap">${esc(r.kind)}</td>
        <td><b>${esc(r.title)}</b>${fileLinks(r.raw.files)}</td><td>${esc(r.vendor)}</td>
        <td><span class="badge r-${r.status}">${r.status}</span></td>
        <td>${esc(r.budget)}</td><td class="num">${won(r.cost)}</td><td class="nowrap">${esc(r.end)}</td></tr>`).join('')
      : '<tr><td colspan="9" class="empty">해당하는 기록이 없어요.</td></tr>';
    $$('tr[data-t]', $('#rows')).forEach((tr) => (tr.onclick = () => {
      if (tr.dataset.t === 'repair') location.hash = '#/repair/' + tr.dataset.id;
      else { eqTab = 'logs'; location.hash = '#/eq/' + tr.dataset.eq; }
    }));
    $$('#rows a').forEach((a) => a.addEventListener('click', (ev) => ev.stopPropagation()));
  };
  draw();
  $('#tp').onchange = (e) => { repState.type = e.target.value; draw(); };
  $('#yr').onchange = (e) => { repState.year = e.target.value; draw(); };
  $('#st').onchange = (e) => { repState.status = e.target.value; draw(); };
  $('#q').oninput = (e) => { repState.q = e.target.value; draw(); };
  $('#csv').onclick = () => downloadCsv(`수리기록_${repState.year}_${todayStr()}.csv`, [
    ['구분', '장비', '날짜', '건명·내용', '고장 내용', '원인', '수리 종류', '추정가격', '예산 과목', '업체', '업체 연락처', '착수일', '완료일', '금액', '지출결의 번호', '하자담보(개월)', '하자담보 끝', '검수일', '검수자', '입회자', '수리 명세', '쓴 소모품', '다음 예정일', '비고', '진행', '취소 사유', '첨부 문서', '적은 사람'],
    ...shown.map(({ t, raw: r, eq, kind }) => (t === 'repair'
      ? [kind, eq, r.requestDate, r.title, r.symptom, r.cause, r.kind, r.estimate, r.budget, r.vendor, r.vendorContact, r.startDate, r.endDate, r.amount, r.expenseNo, r.warrantyMonths, r.warrantyEnd, r.inspectDate, r.inspector, r.witness, r.detail, '', '', r.memo, r.status, r.canceled ? r.canceled.reason : '', (r.files || []).filter((x) => !x.canceled).map((x) => x.name).join(' / '), r.createdBy]
      : [kind, eq, r.date, r.content, '', '', '', '', '', r.vendor, '', '', '', r.cost, '', '', '', '', '', '', '', [r.supplyName, r.supplyQty].filter(Boolean).join(' × '), r.nextOn, '', r.canceled ? '취소' : '기록', r.canceled ? r.canceled.reason : '', (r.files || []).filter((x) => !x.canceled).map((x) => x.name).join(' / '), r.createdBy])),
  ]);
}

// ---------- 방 · 구성원 · 계정 ----------
function tempPw() {
  const c = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = ''; const r = new Uint32Array(8); (window.crypto || window.msCrypto).getRandomValues(r);
  for (const x of r) out += c[x % c.length];
  return out;
}
async function viewRooms() {
  const rooms = await call('GET', '/api/rooms');
  const users = await call('GET', '/api/users');
  const uname = (id) => (users.find((u) => u.id === id) || {}).name || `(${id})`;
  const activeUsers = users.filter((u) => u.active !== false);
  const chip = (u, canX, kind, roomId) => `<span class="chip">${esc(u.name)}${canX ? ` <button type="button" class="chipx" data-x="${kind}" data-room="${roomId}" data-uid="${u.id}" title="빼기">×</button>` : ''}</span>`;
  const addSel = (kind, r, exclude) => {
    const opts = activeUsers.filter((u) => !exclude.includes(u.id));
    if (!opts.length) return '';
    return `<select class="addsel" data-add="${kind}" data-room="${r.id}"><option value="">+ ${kind === 'owners' ? '방장' : '구성원'} 넣기</option>${opts.map((u) => `<option value="${u.id}">${esc(u.name)} (${esc(u.loginId)})</option>`).join('')}</select>`;
  };
  const roomCard = (r) => {
    const canEdit = r.role === 'owner' || isAdmin();
    const ownerIds = r.owners.map((o) => o.id), memberIds = r.members.map((m) => m.id);
    return `<div class="card room ${r.active ? '' : 'dim'}">
      <div class="head" style="margin-bottom:6px">
        <h2 style="margin:0">${esc(r.name)}</h2>
        ${r.role === 'owner' ? '<span class="badge ok">내가 방장</span>' : r.role === 'member' ? '<span class="badge">구성원</span>' : '<span class="badge">관리자로 보는 중</span>'}
        ${r.active ? '' : '<span class="badge out">닫힌 방</span>'}
        <span class="sub">장비 ${r.eqCount}대</span><span class="grow"></span>
        ${canEdit ? `<button class="btn small" data-rename="${r.id}">이름 바꾸기</button>` : ''}
        ${isAdmin() ? `<button class="btn small ${r.active ? 'danger' : ''}" data-toggle="${r.id}" data-on="${r.active ? 0 : 1}">${r.active ? '방 닫기' : '다시 열기'}</button>` : ''}
      </div>
      ${r.memo ? `<div class="sub">${esc(r.memo)}</div>` : ''}
      <div class="rrow"><span class="rlabel">방장</span><div class="chips">${r.owners.map((o) => chip(o, isAdmin() && r.owners.length > 1, 'owners', r.id)).join('')}${isAdmin() ? addSel('owners', r, ownerIds) : ''}</div></div>
      <div class="rrow"><span class="rlabel">구성원</span><div class="chips">${r.members.map((mm) => chip(mm, canEdit, 'members', r.id)).join('') || '<span class="muted">아직 없어요</span>'}${canEdit ? addSel('members', r, [...ownerIds, ...memberIds]) : ''}</div></div>
    </div>`;
  };
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>방 · 구성원</h1><span class="grow"></span>${isAdmin() ? '<button class="btn primary" id="newRoom">+ 방 만들기</button>' : ''}</div>
    <div class="note info">방마다 <b>방장</b>이 구성원을 넣고 빼요. 구성원은 그 방의 장비를 모두 보고 적을 수 있어요. ${isAdmin() ? '방을 만들고 방장을 정하는 건 관리자예요. 관리자는 모든 방을 볼 수 있어요.' : ''}</div>
    ${rooms.length ? rooms.map(roomCard).join('') : '<div class="card empty">아직 방이 없어요.</div>'}
    ${isAdmin() ? `<h2 style="margin-top:28px">계정</h2>
    <div class="note info">계정은 관리자가 만들어 나눠 줘요. 처음 로그인하면 임시 비밀번호를 자기 비밀번호로 바꾸게 돼요.</div>
    <div class="head"><span class="grow"></span><button class="btn primary" id="newUser">+ 계정 만들기</button></div>
    <div class="tablewrap"><table><thead><tr><th>아이디</th><th>이름</th><th>역할</th><th>속한 방</th><th>상태</th><th></th></tr></thead><tbody>
      ${users.map((u) => {
        const myRooms = rooms.filter((r) => r.owners.some((o) => o.id === u.id) || r.members.some((m) => m.id === u.id));
        return `<tr class="${u.active === false ? 'dim' : ''}"><td class="nowrap">${esc(u.loginId)}</td><td class="nowrap"><b>${esc(u.name)}</b></td>
        <td class="nowrap">${u.isAdmin ? '<span class="badge ok">관리자</span>' : '일반'}</td>
        <td>${myRooms.map((r) => `${esc(r.name)}${r.owners.some((o) => o.id === u.id) ? ' ★' : ''}`).join(', ') || '<span class="muted">없음</span>'}</td>
        <td class="nowrap">${u.active === false ? '<span class="badge out">쓰지 않음</span>' : u.mustChange ? '<span class="badge warn">첫 로그인 전</span>' : '쓰는 중'}</td>
        <td class="nowrap"><button class="btn small" data-uedit="${u.id}">고치기</button></td></tr>`;
      }).join('')}
    </tbody></table></div>` : ''}`;

  const saveRoom = async (rid, body, msg) => {
    try { await call('PUT', `/api/rooms/${rid}`, body); saved(msg || '저장했어요'); await refreshMe(); viewRooms(); } catch (err) { toast(err.message, true); }
  };
  $$('[data-x]', app).forEach((b) => (b.onclick = () => {
    const r = rooms.find((x) => x.id === +b.dataset.room); const kind = b.dataset.x; const uid = +b.dataset.uid;
    const list = r[kind].map((x) => x.id).filter((x) => x !== uid);
    saveRoom(r.id, { [kind]: list }, `${uname(uid)} 님을 뺐어요`);
  }));
  $$('[data-add]', app).forEach((sel) => (sel.onchange = () => {
    if (!sel.value) return;
    const r = rooms.find((x) => x.id === +sel.dataset.room); const kind = sel.dataset.add; const uid = +sel.value;
    const body = { [kind]: [...r[kind].map((x) => x.id), uid] };
    if (kind === 'owners') body.members = r.members.map((x) => x.id).filter((x) => x !== uid);
    saveRoom(r.id, body, `${uname(uid)} 님을 넣었어요`);
  }));
  $$('[data-rename]', app).forEach((b) => (b.onclick = () => {
    const r = rooms.find((x) => x.id === +b.dataset.rename);
    askText('방 이름 바꾸기', `지금 이름: ${r.name}`, '새 이름', async (v) => saveRoom(r.id, { name: v }));
  }));
  $$('[data-toggle]', app).forEach((b) => (b.onclick = () => {
    const r = rooms.find((x) => x.id === +b.dataset.toggle);
    if (b.dataset.on === '0' && !confirm(`'${r.name}' 방을 닫을까요?\n닫으면 관리자 말고는 아무도 이 방 장비를 못 봐요. 기록은 지워지지 않고, 다시 열 수 있어요.`)) return;
    saveRoom(r.id, { active: b.dataset.on === '1' }, b.dataset.on === '1' ? '방을 다시 열었어요' : '방을 닫았어요');
  }));
  const nr = $('#newRoom');
  if (nr) nr.onclick = () => modal(`<h2>방 만들기</h2>
      <div class="sub">예: 농약실, 토양실, 기술보급과 …</div>
      <input id="rName" placeholder="방 이름">
      <label class="sub">방장 (나중에 더 넣을 수 있어요)</label>
      <select id="rOwner" style="width:100%;margin:6px 0 14px;padding:9px;border:1px solid var(--line);border-radius:8px">${activeUsers.map((u) => `<option value="${u.id}" ${u.id === ME.id ? 'selected' : ''}>${esc(u.name)} (${esc(u.loginId)})</option>`).join('')}</select>
      <div class="actions"><button class="btn" id="mNo">닫기</button><button class="btn primary" id="mOk">만들기</button></div>`, (m, close) => {
    $('#rName', m).focus();
    $('#mNo', m).onclick = close;
    $('#mOk', m).onclick = async () => {
      try { await call('POST', '/api/rooms', { name: $('#rName', m).value.trim(), owners: [+$('#rOwner', m).value] }); close(); saved('방을 만들었어요'); await refreshMe(); viewRooms(); }
      catch (err) { toast(err.message, true); }
    };
  });
  const nu = $('#newUser');
  if (nu) nu.onclick = () => {
    const pw = tempPw();
    modal(`<h2>계정 만들기</h2>
      <label class="sub">아이디 (영문·숫자)</label><input id="uId" placeholder="예: kimjs">
      <label class="sub">이름 (기록에 남는 이름)</label><input id="uName" placeholder="예: 김주무관">
      <label class="sub">임시 비밀번호 — 받는 사람에게 알려 주세요. 처음 로그인하면 바꾸게 돼요.</label><input id="uPw" value="${pw}">
      <label class="chk"><input type="checkbox" id="uAdmin"> 관리자 (방·계정·설정을 모두 관리)</label>
      <div class="actions"><button class="btn" id="mNo">닫기</button><button class="btn primary" id="mOk">만들기</button></div>`, (m, close) => {
      $('#uId', m).focus();
      $('#mNo', m).onclick = close;
      $('#mOk', m).onclick = async () => {
        try {
          const u = await call('POST', '/api/users', { loginId: $('#uId', m).value.trim(), name: $('#uName', m).value.trim(), pw: $('#uPw', m).value, isAdmin: $('#uAdmin', m).checked });
          close();
          modal(`<h2>계정을 만들었어요</h2><div class="note info">아이디 <b>${esc(u.loginId)}</b> · 임시 비밀번호 <b>${esc(pwShown)}</b><br>이 두 가지를 ${esc(u.name)} 님께 알려 주세요. 이 창을 닫으면 비밀번호는 다시 볼 수 없어요.</div>
            <div class="sub">방에 넣으려면 그 방의 방장이 '구성원 넣기'에서 고르면 돼요.</div>
            <div class="actions"><button class="btn primary" id="mOk2">확인</button></div>`, (m2, close2) => { $('#mOk2', m2).onclick = () => { close2(); viewRooms(); }; });
        } catch (err) { toast(err.message, true); }
      };
      let pwShown = pw; $('#uPw', m).oninput = (ev) => { pwShown = ev.target.value; };
    });
  };
  $$('[data-uedit]', app).forEach((b) => (b.onclick = () => {
    const u = users.find((x) => x.id === +b.dataset.uedit);
    modal(`<h2>${esc(u.name)} (${esc(u.loginId)})</h2>
      <label class="sub">이름</label><input id="eName" value="${esc(u.name)}">
      <label class="chk"><input type="checkbox" id="eAdmin" ${u.isAdmin ? 'checked' : ''}> 관리자</label>
      <label class="chk"><input type="checkbox" id="eOff" ${u.active === false ? 'checked' : ''} ${u.id === ME.id ? 'disabled' : ''}> 쓰지 않음 (로그인 막기 — 적은 기록은 그대로 남아요)</label>
      <label class="sub">비밀번호를 잊었으면 — 새 임시 비밀번호 (비워 두면 그대로)</label>
      <div class="inline"><input id="ePw" placeholder="비워 두면 안 바뀜"><button type="button" class="btn small" id="eGen">만들기</button></div>
      <div class="actions" style="margin-top:14px"><button class="btn" id="mNo">닫기</button><button class="btn primary" id="mOk">저장</button></div>`, (m, close) => {
      $('#mNo', m).onclick = close;
      $('#eGen', m).onclick = () => { $('#ePw', m).value = tempPw(); };
      $('#mOk', m).onclick = async () => {
        const body = { name: $('#eName', m).value.trim(), isAdmin: $('#eAdmin', m).checked, active: !$('#eOff', m).checked };
        const npw = $('#ePw', m).value.trim(); if (npw) body.pw = npw;
        try {
          await call('PUT', `/api/users/${u.id}`, body); close();
          if (npw) modal(`<h2>임시 비밀번호</h2><div class="note info">${esc(u.name)} 님의 새 임시 비밀번호는 <b>${esc(npw)}</b> 예요. 알려 주세요.<br>다음 로그인 때 자기 비밀번호로 바꾸게 돼요.</div><div class="actions"><button class="btn primary" id="mOk2">확인</button></div>`, (m2, c2) => { $('#mOk2', m2).onclick = () => { c2(); viewRooms(); }; });
          else { saved('저장했어요'); viewRooms(); }
          if (u.id === ME.id) await boot();
        } catch (err) { toast(err.message, true); }
      };
    });
  }));
}

// ---------- 핸드폰 (우편함) ----------
async function viewPhone() {
  const mine = await call('GET', '/api/mailbox/mine');
  const st = isAdmin() && !PHONE() ? await call('GET', '/api/mailbox') : null;
  const t = (x) => (x ? x.replace('T', ' ').slice(0, 16) : '-');
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>핸드폰</h1></div>
    <div class="card">
      <h2>내 핸드폰에서 쓰기</h2>
      ${!mine.enabled ? '<div class="note warn">아직 관리자가 GitHub 우편함을 켜지 않았어요.</div>' : `
      <ol class="steps-list">
        <li><b>안드로이드 앱 설치</b> — 핸드폰 크롬에서 <a href="${esc(mine.releasesUrl)}" target="_blank">${esc(mine.releasesUrl)}</a> 를 열고 맨 위 <b>equip.apk</b> 를 눌러 설치해요. ("출처를 알 수 없는 앱" 허용을 한 번 켜 달라고 하면 켜요)</li>
        <li>또는 앱 없이 — 크롬에서 <a href="${esc(mine.pagesUrl)}" target="_blank">${esc(mine.pagesUrl)}</a> 를 열고 메뉴(⋮) → <b>홈 화면에 추가</b></li>
        <li>PC 와 <b>같은 아이디·비밀번호</b>로 들어가요. 자료는 내 비밀번호로 잠겨서 오고, 내가 속한 방의 장비만 보여요.</li>
        <li>핸드폰에서 적은 것은 사무실 서버가 <b>1~3분 안에</b> 반영해요. 사진·문서는 눌렀을 때 서버에 달라고 해서 1~2분 뒤에 볼 수 있어요.</li>
      </ol>
      ${mine.ready ? '<div class="note info">내 핸드폰 열쇠가 준비돼 있어요.</div>' : '<div class="note warn">내 핸드폰 열쇠가 아직 없어요. <b>로그아웃했다가 다시 로그인</b>하면 만들어져요 (1~2분 뒤 핸드폰에서 들어갈 수 있어요).</div>'}
      ${mine.err ? `<div class="note bad">지금 우편함에 문제가 있어요: ${esc(mine.err)}</div>` : ''}`}
    </div>
    ${st ? `
    <h2 style="margin-top:26px">우편함 설정 <span class="sub">(관리자)</span></h2>
    <div class="note info">GitHub 에 저장소 두 개와 토큰 두 개가 필요해요. 만드는 순서는 서버 폴더의 <b>핸드폰_안내.txt</b> 를 보세요.<br>
      · <b>우편함</b>(비공개): 잠긴 자료가 오가는 곳 · <b>핸드폰 페이지</b>(공개): 핸드폰 화면과 apk 가 있는 곳 (자료는 없음)<br>
      · <b>서버용 토큰</b>: 두 저장소 모두 Contents 읽기·쓰기 (+ Workflows, Pages 쓰기) · <b>핸드폰용 토큰</b>: 우편함만 Contents 읽기·쓰기</div>
    <form class="form" id="mf">
      <fieldset><legend>저장소</legend>
        ${fieldHtml({ k: 'owner', label: 'GitHub 계정', ph: '예: utrgh482' }, st.owner)}
        ${fieldHtml({ k: 'repo', label: '우편함 (비공개)', ph: 'equip-mailbox' }, st.repo)}
        ${fieldHtml({ k: 'pagesRepo', label: '핸드폰 페이지 (공개)', ph: 'equip-phone' }, st.pagesRepo)}
      </fieldset>
      <fieldset><legend>토큰</legend>
        ${fieldHtml({ k: 'serverToken', label: '서버용 토큰', ph: 'github_pat_… (바꿀 때만 붙여 넣기)', help: st.serverToken ? `지금: ${esc(st.serverToken)}` : '' }, '')}
        ${fieldHtml({ k: 'phoneToken', label: '핸드폰용 토큰', ph: 'github_pat_… (바꿀 때만 붙여 넣기)', help: st.phoneToken ? `지금: ${esc(st.phoneToken)}` : '' }, '')}
      </fieldset>
      <fieldset><legend>켜기</legend>
        <div class="row"><label>우편함</label><div><label class="chk"><input type="checkbox" name="enabled" id="mEn" ${st.enabled ? 'checked' : ''}> 켜기 — 서버가 1분마다 주고받아요</label></div></div>
      </fieldset>
      <div class="form-actions" style="position:static">
        <button type="button" class="btn" id="mTest">연결 시험</button>
        <button type="button" class="btn" id="mRun">지금 주고받기</button>
        <button type="button" class="btn" id="mPub">핸드폰 화면 올리기</button>
        <button class="btn primary">저장</button>
      </div>
    </form>
    <div id="mOut"></div>
    <div class="card">
      <h2>지금 상태</h2>
      <dl class="kv">
        <div><dt>마지막 시도</dt><dd>${t(st.lastRun)}</dd></div><div><dt>마지막 성공</dt><dd>${t(st.lastOk)}</dd></div>
        <div><dt>핸드폰 화면 올림</dt><dd>${t(st.published)}</dd></div><div><dt>핸드폰 주소</dt><dd>${st.pagesUrl ? `<a href="${esc(st.pagesUrl)}" target="_blank">${esc(st.pagesUrl)}</a>` : '-'}</dd></div>
      </dl>
      ${st.err ? `<div class="note bad" style="margin-top:10px">오류 (${t(st.errAt)}): ${esc(st.err)}</div>` : ''}
      <div class="sub" style="margin-top:10px">핸드폰 열쇠: ${st.users.map((u) => `${esc(u.name)} ${u.ready ? '○' : '<span style="color:var(--bad)">✕</span>'}`).join(' · ')} <span class="muted">(✕ 는 우편함을 켠 뒤 PC 에서 한 번 로그인하면 ○ 가 돼요)</span></div>
      <div class="audit" style="margin-top:10px"><ul>${(st.log || []).slice(0, 15).map((e) => `<li><span class="muted">${esc(t(e.t))}</span> · ${e.dir === 'in' ? `받음 — ${esc(e.who || '')} ${e.n || 0}건${e.err ? ` <span style="color:var(--bad)">${esc(e.err)}</span>` : ''}` : e.dir === 'out' ? `보냄 — 반영 ${e.got}건 · 자료 ${e.wrote}개 · 지움 ${e.removed}개` : e.dir === 'squash' ? '우편함 역사 정리' : e.dir === 'publish' ? `핸드폰 화면 다시 올림 (${e.n}개)` : esc(JSON.stringify(e))}</li>`).join('') || '<li class="muted">아직 없어요</li>'}</ul></div>
    </div>` : ''}`;
  if (!st) return;
  const f = $('#mf');
  const out = (html) => { $('#mOut').innerHTML = html; };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const v = formValues(f); v.enabled = $('#mEn').checked;
    try { await call('PUT', '/api/mailbox', v); toast('저장했어요'); viewPhone(); } catch (err) { toast(err.message, true); }
  };
  $('#mTest').onclick = async () => { out('<div class="note info">시험하는 중…</div>'); try { const r = await call('POST', '/api/mailbox/test', {}); out(`<div class="note info">${r.lines.map(esc).join('<br>')}</div>`); } catch (err) { out(`<div class="note bad">${esc(err.message)}</div>`); } };
  $('#mRun').onclick = async () => { out('<div class="note info">주고받는 중…</div>'); try { const r = await call('POST', '/api/mailbox/run', {}); if (r.err) out(`<div class="note bad">${esc(r.err)}</div>`); else { toast(r.off ? '우편함이 꺼져 있어요' : `반영 ${r.got || 0}건 · 자료 ${r.wrote || 0}개 보냄`); viewPhone(); } } catch (err) { out(`<div class="note bad">${esc(err.message)}</div>`); } };
  $('#mPub').onclick = async () => { out('<div class="note info">핸드폰 화면을 올리는 중… (처음엔 1분쯤)</div>'); try { const r = await call('POST', '/api/mailbox/publish', {}); out(`<div class="note info">올린 파일 ${r.uploaded}개${r.notes.length ? '<br>' + r.notes.map(esc).join('<br>') : ''}</div>`); } catch (err) { out(`<div class="note bad">${esc(err.message)}</div>`); } };
}

// ---------- 설정 ----------
async function viewSettings() {
  if (!isAdmin()) { $('#app').innerHTML = '<div class="note info">설정은 관리자만 고칠 수 있어요.</div>'; return; }
  settings = await call('GET', '/api/settings');
  const log = await call('GET', '/api/audit');
  let kinds = (settings.kinds || []).map((k) => ({ ...k }));
  $('#app').innerHTML = `
    <div class="head"><h1>설정</h1></div>
    <form class="form" id="f">
      <fieldset><legend>기관</legend>${fieldHtml({ k: 'orgName', label: '기관 이름' }, settings.orgName)}</fieldset>
      <fieldset><legend>수리 종류 · 회계과 계약의뢰 기준</legend>
        <div class="hint">수리 요청 때 고르는 <b>수리 종류</b> 목록이에요. 이름을 고치거나 줄을 넣고 뺄 수 있어요.<br>
          기준 금액을 적으면, 추정가격(또는 실제 수리비)이 그 금액을 <b>넘을 때</b> "회계과 계약의뢰 대상" 경고를 띄워요. 비우면 경고하지 않아요.<br>
          이미 적은 수리 기록의 종류는 이름을 고치거나 빼도 바뀌지 않고 그대로 남아요.</div>
        <div class="tablewrap flat"><table class="kinds"><thead><tr><th style="width:44px">순서</th><th>수리 종류</th><th style="width:210px">기준 금액 (초과 시 경고)</th><th>설명</th><th></th></tr></thead><tbody id="kBody"></tbody></table></div>
        <div style="padding-top:8px"><button type="button" class="btn small" id="addK">+ 종류 넣기</button></div>
      </fieldset>
      <div class="form-actions"><button class="btn primary">저장</button></div>
    </form>
    <h2 style="margin-top:28px">최근 변경 기록</h2>
    <div class="card audit"><ul>${log.length ? log.slice(0, 100).map((a) => `<li><span class="muted">${esc(a.at.replace('T', ' '))}</span> · <b>${esc(a.who)}</b> · ${esc(a.action)} · ${esc(a.target)}${a.detail ? ` — <span class="muted">${esc(a.detail)}</span>` : ''}</li>`).join('') : '<li class="muted">기록 없음</li>'}</ul></div>`;
  const f = $('#f');
  const drawK = () => {
    $('#kBody').innerHTML = kinds.map((k, i) => `<tr>
      <td class="nowrap"><button type="button" class="btn small" data-up="${i}" ${i ? '' : 'disabled'} title="위로">▲</button></td>
      <td><input data-ki="${i}" data-kk="name" value="${esc(k.name)}" placeholder="예: 차량 정비"></td>
      <td><div class="inline"><input data-ki="${i}" data-kk="limit" data-money inputmode="numeric" value="${esc(k.limit ? won(k.limit) : '')}" placeholder="비우면 경고 안 함"><span>원</span></div></td>
      <td><input data-ki="${i}" data-kk="note" value="${esc(k.note || '')}" placeholder="어떤 수리인지"></td>
      <td><button type="button" class="btn small danger" data-kx="${i}">빼기</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="empty">종류가 없어요. <b>+ 종류 넣기</b>를 누르세요.</td></tr>';
    bindMoney($('#kBody'));
    $$('[data-ki]').forEach((inp) => (inp.oninput = () => { kinds[inp.dataset.ki][inp.dataset.kk] = inp.value; }));
    $$('[data-kx]').forEach((b) => (b.onclick = () => { kinds.splice(+b.dataset.kx, 1); drawK(); }));
    $$('[data-up]').forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [kinds[i - 1], kinds[i]] = [kinds[i], kinds[i - 1]]; drawK(); }));
  };
  drawK();
  $('#addK').onclick = () => { kinds.push({ name: '', limit: null, note: '' }); drawK(); $$('[data-kk="name"]').pop().focus(); };
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const v = formValues(f);
    const clean = kinds.map((k) => ({ ...k, name: String(k.name || '').trim() })).filter((k) => k.name);
    const names = clean.map((k) => k.name);
    if (!clean.length) return toast('수리 종류는 하나 이상 있어야 해요', true);
    if (new Set(names).size !== names.length) return toast('같은 이름의 수리 종류가 두 개 있어요', true);
    try {
      settings = await call('PUT', '/api/settings', { orgName: v.orgName, kinds: clean.map((k) => ({ name: k.name, limit: String(k.limit ?? '').replace(/,/g, ''), note: k.note })) });
      $('#orgName').textContent = settings.orgName; saved('저장했어요'); route();
    } catch (err) { toast(err.message, true); }
  };
}

// ---------- 로그인 · 첫 설정 · 비밀번호 ----------
function gate(html, onReady) {
  $('#shell').hidden = true;
  const g = $('#gate'); g.hidden = false;
  g.innerHTML = `<div class="gatebox"><div class="org">${esc(settings.orgName || '여주시농업기술센터')}</div><div class="gtitle">장비대장</div>${html}</div>`;
  onReady && onReady(g);
}
function showGate() {
  ME = null;
  const note = PHONE() ? `${window.EQ_PHONE.gateNote ? `<div class="note warn" style="margin-top:14px">${esc(window.EQ_PHONE.gateNote)}</div>` : ''}<div class="note info" style="margin-top:14px">핸드폰 판이에요. PC 와 같은 아이디·비밀번호로 들어가요.<br>처음이면 <b>PC 에서 한 번 로그인</b>한 뒤 1~2분 기다렸다가 들어와 주세요.</div>` : '';
  gate(`${note}<form id="gf" class="gform">
      <label>아이디<input id="gId" autocomplete="username" required></label>
      <label>비밀번호<input id="gPw" type="password" autocomplete="current-password" required></label>
      <div id="gMsg" class="gmsg"></div>
      <button class="btn primary big">로그인</button>
      <div class="sub" style="text-align:center">계정은 관리자에게 받아요.</div>
    </form>`, (g) => {
    $('#gId', g).focus();
    $('#gf', g).onsubmit = async (ev) => {
      ev.preventDefault();
      const btn = $('#gf button', g); btn.disabled = true; if (PHONE()) { $('#gMsg', g).textContent = '열쇠를 만들고 자료를 받는 중… (몇 초 걸려요)'; }
      try { await call('POST', '/api/login', { loginId: $('#gId', g).value.trim(), pw: $('#gPw', g).value }); await boot(); }
      catch (err) { $('#gMsg', g).textContent = err.message; btn.disabled = false; }
    };
  });
}
function showSetup() {
  gate(`<div class="note info" style="margin-top:14px">처음 켜셨네요. <b>관리자 계정</b>을 하나 만들어 주세요.<br>이 계정으로 다른 사람 계정과 방을 만들어요.</div>
    <form id="gf" class="gform">
      <label>아이디<input id="gId" placeholder="영문·숫자" required></label>
      <label>이름<input id="gName" placeholder="기록에 남을 이름" required></label>
      <label>비밀번호<input id="gPw" type="password" placeholder="6글자 이상" required></label>
      <label>비밀번호 한 번 더<input id="gPw2" type="password" required></label>
      <div id="gMsg" class="gmsg"></div>
      <button class="btn primary big">관리자 만들기</button>
    </form>`, (g) => {
    $('#gId', g).focus();
    $('#gf', g).onsubmit = async (ev) => {
      ev.preventDefault();
      if ($('#gPw', g).value !== $('#gPw2', g).value) { $('#gMsg', g).textContent = '두 비밀번호가 달라요'; return; }
      try { await call('POST', '/api/setup', { loginId: $('#gId', g).value.trim(), name: $('#gName', g).value.trim(), pw: $('#gPw', g).value }); await boot(); }
      catch (err) { $('#gMsg', g).textContent = err.message; }
    };
  });
}
function pwForm(forced) {
  const html = `${forced ? '<div class="note warn" style="margin-top:14px">관리자가 정해 준 <b>임시 비밀번호</b>예요. 나만 아는 비밀번호로 바꿔 주세요.</div>' : ''}
    <form id="pf" class="gform">
      ${forced ? '' : '<label>지금 비밀번호<input id="pOld" type="password" autocomplete="current-password" required></label>'}
      <label>새 비밀번호<input id="pNew" type="password" placeholder="6글자 이상" autocomplete="new-password" required></label>
      <label>새 비밀번호 한 번 더<input id="pNew2" type="password" autocomplete="new-password" required></label>
      <div class="sub">핸드폰에서도 이 비밀번호로 들어가요. 핸드폰 자료도 이 비밀번호로 잠겨요.</div>
      <div id="pMsg" class="gmsg"></div>
      <div class="actions">${forced ? '' : '<button type="button" class="btn" id="pNo">닫기</button>'}<button class="btn primary">바꾸기</button></div>
    </form>`;
  const wire = (root, done) => {
    root.querySelector('#pf').onsubmit = async (ev) => {
      ev.preventDefault();
      if ($('#pNew', root).value !== $('#pNew2', root).value) { $('#pMsg', root).textContent = '두 새 비밀번호가 달라요'; return; }
      try {
        await call('POST', '/api/me/password', { old: forced ? '' : $('#pOld', root).value, pw: $('#pNew', root).value });
        toast('비밀번호를 바꿨어요'); done();
      } catch (err) { $('#pMsg', root).textContent = err.message; }
    };
    const no = root.querySelector('#pNo'); if (no) no.onclick = done;
  };
  if (forced) gate(`<h2 style="margin-top:14px">${esc(ME.name)} 님, 비밀번호 바꾸기</h2>${html}`, (g) => wire(g, boot));
  else modal(`<h2>비밀번호 바꾸기</h2>${html}`, (m, close) => wire(m, close));
}

// 방 고르개 (왼쪽 위) — 0 = 내가 속한 모든 방
function drawRoomPick() {
  const sel = $('#roomSel');
  const live = MYROOMS.filter((r) => r.active);
  sel.innerHTML = (live.length > 1 ? '<option value="0">모든 방</option>' : '') + live.map((r) => `<option value="${r.id}">${esc(r.name)}${r.role === 'owner' ? ' ★' : ''}</option>`).join('');
  if (!live.some((r) => r.id === ROOM)) ROOM = live.length === 1 ? live[0].id : 0;
  sel.value = String(ROOM);
  sel.parentElement.hidden = !live.length;
  sel.onchange = () => { ROOM = Number(sel.value); saveRoomPick(ROOM); drawRoomTitle(); route(); };
  drawRoomTitle();
}
// 방을 고르면 '장비대장' 아래에 방 이름을 크게
function drawRoomTitle() {
  const r = ROOM ? roomById(ROOM) : null;
  const t = $('#roomTitle');
  if (t) { t.textContent = r ? r.name : ''; t.hidden = !r; }
  document.title = r ? `${r.name} · 장비대장` : '장비대장';
}
const inRoom = (roomId) => !ROOM || roomId === ROOM;

async function boot() {
  if (PHONE()) await window.EQ_PHONE.whenReady();
  const me = await call('GET', '/api/me');
  if (me.orgName) settings.orgName = me.orgName;
  if (me.setup) return showSetup();
  if (!me.user) return showGate();
  ME = me.user; MYROOMS = me.rooms || [];
  if (ME.mustChange) return pwForm(true);
  try { settings = await call('GET', '/api/settings'); } catch (e) { /* 아래에서 다시 */ }
  $('#gate').hidden = true; $('#shell').hidden = false;
  $('#orgName').textContent = settings.orgName;
  $('#meName').textContent = `${ME.name}${ME.isAdmin ? ' (관리자)' : ''}`;
  $('#navSettings').hidden = !ME.isAdmin;
  document.body.classList.toggle('phone', PHONE());
  ROOM = loadRoomPick();
  drawRoomPick();
  await route();
}
async function refreshMe() {
  const me = await call('GET', '/api/me');
  if (me.user) { ME = me.user; MYROOMS = me.rooms || []; drawRoomPick(); }
}

// ---------- 작은 사진 ----------
// 사진을 올릴 때 대시보드용 작은 사진(긴 변 480px)도 같이 만들어 보냄
async function makeThumb(fileOrBlob) {
  try {
    const img = await createImageBitmap(fileOrBlob);
    const k = Math.min(1, 480 / Math.max(img.width, img.height));
    const cv = document.createElement('canvas');
    cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
    cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
    const blob = await new Promise((res) => cv.toBlob(res, 'image/jpeg', 0.75));
    return blob ? new File([blob], 'thumb.jpg', { type: 'image/jpeg' }) : null;
  } catch (e) { return null; }
}
function thumbHtml(e, cls) {
  if (!e.hasPhoto) return `<span class="${cls} none">${cls === 'thumb' ? '' : `<span class="noimg">${esc((e.nickname || e.name || '?').slice(0, 1))}</span>`}</span>`;
  if (!PHONE()) return `<img class="${cls}" src="/api/equipment/${e.id}/${e.hasThumb ? 'thumb?v=' + encodeURIComponent(e.thumbVer) : 'photo?v=' + encodeURIComponent(e.photoVer || '')}" alt="" loading="lazy">`;
  return `<img class="${cls} wait" data-thumb="${e.id}" alt="">`;
}
// 핸드폰: 우편함에서 작은 사진을 가져와 채움
function fillThumbs(root) {
  if (!PHONE() || !window.EQ_PHONE.thumbUrl) return;
  $$('img[data-thumb]', root).forEach(async (img) => {
    const u = await window.EQ_PHONE.thumbUrl(Number(img.dataset.thumb));
    if (u) { img.src = u; img.classList.remove('wait'); } else img.classList.add('miss');
  });
}
// PC: 작은 사진이 아직 없는 장비(예전에 올린 사진)는 화면이 대신 만들어 보냄 — 한 번만
const healed = new Set();
async function healThumbs(list) {
  if (PHONE()) return;
  for (const e of list.filter((x) => x.hasPhoto && !x.hasThumb && !healed.has(x.id))) {
    healed.add(e.id);
    try {
      const blob = await (await fetch(`/api/equipment/${e.id}/photo`)).blob();
      const th = await makeThumb(blob);
      if (th) await upload(`/api/equipment/${e.id}/thumb`, th);
    } catch (err) { /* 다음에 */ }
  }
}

// ---------- 공용: 알약 ----------
const placePill = (e) => `<span class="pill place">📍 ${e.location ? esc(e.location) : '<span class="muted">위치 없음</span>'}</span>`;
const usePill = (s) => `<span class="pill u${USE_STATUSES.indexOf(s)}">${esc(s || '-')}</span>`;
const eqLabel = (e) => (e.nickname ? `${esc(e.nickname)} <span class="muted">${esc(e.name)}</span>` : esc(e.name));

// 위치 바꾸기 창 (대시보드·위치 기록에서 같이 씀)
function placeModal(e, after) {
  const room = roomById(e.roomId);
  const places = uniq([...(room ? room.places || [] : []), e.location].filter(Boolean));
  const keep = (room && room.places) || [];
  const ordered = [...keep, ...places.filter((p) => !keep.includes(p))];
  modal(`<h2>${eqLabel(e)} — 어디 있나요?</h2>
    <div class="sub">지금: ${e.location ? `<b>${esc(e.location)}</b>${e.placeSince ? ` (${esc(e.placeSince)}부터)` : ''}` : '기록 없음'}</div>
    <div class="placebtns">${ordered.length ? ordered.map((p) => `<button type="button" class="pbtn ${p === e.location ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('') : '<span class="muted">정해 둔 위치가 없어요. 위치 기록 탭에서 위치를 넣어 주세요.</span>'}</div>
    <div class="row2"><label>날짜 <input type="date" id="pDate" value="${todayStr()}" min="1900-01-01" max="2099-12-31"></label>
      <label class="grow">메모 <input id="pMemo" placeholder="(적지 않아도 돼요)"></label></div>
    <div class="actions"><button class="btn" id="pNo">닫기</button></div>`, (m, close) => {
    $('#pNo', m).onclick = close;
    $$('.pbtn', m).forEach((b) => (b.onclick = async () => {
      if (b.dataset.p === e.location && !confirm('지금 위치와 같아요. 그래도 기록할까요?')) return;
      try {
        await call('POST', `/api/equipment/${e.id}/locs`, { place: b.dataset.p, date: $('#pDate', m).value, memo: $('#pMemo', m).value });
        close(); saved(`${b.dataset.p}(으)로 기록했어요`); after && after();
      } catch (err) { toast(err.message, true); }
    }));
  });
}

// ---------- 대시보드 ----------
const dashState = { use: '', place: '' };
async function viewDash() {
  const all = (await call('GET', '/api/equipment')).filter((e) => inRoom(e.roomId) && e.active !== false);
  const events = (await call('GET', '/api/events')).filter((v) => inRoom(v.roomId) && !v.canceled);
  const t = todayStr();
  const todays = events.filter((v) => v.from <= t && v.to >= t).sort(evOrder);
  const fieldToday = new Map();
  for (const v of todays) if (v.kind === '현장 작업') for (const x of v.equipmentIds || []) fieldToday.set(x, v);
  const showRoom = !ROOM && MYROOMS.filter((r) => r.active).length > 1;
  const count = (s) => all.filter((e) => e.useStatus === s).length;
  const placesInUse = uniq(all.map((e) => e.location));
  const list = all.filter((e) => (!dashState.use || e.useStatus === dashState.use) && (!dashState.place || (dashState.place === '__none' ? !e.location : e.location === dashState.place)));
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>대시보드</h1><span class="sub">${esc(t)} (${'일월화수목금토'[new Date(t + 'T00:00:00').getDay()]})</span><span class="grow"></span>
      <a class="btn hide-m" href="#/places">위치 기록</a><a class="btn hide-m" href="#/calendar">작업 일정</a></div>
    ${!MYROOMS.length ? `<div class="note info">아직 들어간 방이 없어요. ${isAdmin() ? '<a href="#/rooms">방 · 구성원</a>에서 방을 만들어 주세요.' : '방장에게 구성원으로 넣어 달라고 해 주세요.'}</div>` : ''}
    <div class="card today">
      <div class="head" style="margin-bottom:6px"><h2 style="margin:0">오늘 일정</h2><span class="grow"></span><a class="btn small" href="#/event/new?d=${t}">+ 일정</a></div>
      ${todays.length ? `<div class="evlist">${todays.map((v) => evRow(v, showRoom)).join('')}</div>` : '<div class="muted">오늘 적힌 일정이 없어요.</div>'}
    </div>
    <div class="dashbar">
      <div class="chips">
        <button class="fchip ${!dashState.use ? 'on' : ''}" data-use="">전체 ${all.length}</button>
        ${USE_STATUSES.slice(0, 3).map((s, i) => `<button class="fchip u${i} ${dashState.use === s ? 'on' : ''}" data-use="${s}">${s} ${count(s)}</button>`).join('')}
      </div>
      <label class="flt"><span>위치</span><select id="dPlace"><option value="">모든 위치</option>${placesInUse.map((p) => `<option ${dashState.place === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}<option value="__none" ${dashState.place === '__none' ? 'selected' : ''}>(위치 없음)</option></select></label>
    </div>
    <div class="dashgrid">
      ${list.length ? list.map((e) => {
        const fw = fieldToday.get(e.id);
        return `<div class="dcard" data-id="${e.id}">
          <div class="dphoto">${thumbHtml(e, 'dimg')}</div>
          <div class="dname">${esc(e.nickname || e.name)}${e.nickname ? `<div class="dsub">${esc(e.name)}</div>` : ''}${showRoom ? `<div class="dsub">${esc(e.roomName)}</div>` : ''}</div>
          <div class="pills">
            <button type="button" class="pill place" data-place="${e.id}" title="위치 바꾸기">📍 ${e.location ? esc(e.location) : '위치 없음'}</button>
            ${usePill(e.useStatus)}
            ${fw ? `<span class="pill field" title="${esc(fw.title)}">🚜 현장 작업</span>` : ''}
            ${e.overdue ? '<span class="pill bad">점검 지남</span>' : e.due ? '<span class="pill warn">점검 때</span>' : ''}
          </div>
        </div>`;
      }).join('') : `<div class="empty">${all.length ? '조건에 맞는 장비가 없어요.' : '아직 등록된 장비가 없어요. <a href="#/eq/new">+ 장비 등록</a>'}</div>`}
    </div>`;
  $$('[data-use]', app).forEach((b) => (b.onclick = () => { dashState.use = b.dataset.use; viewDash(); }));
  $('#dPlace').onchange = (ev) => { dashState.place = ev.target.value; viewDash(); };
  $$('.dcard', app).forEach((c) => (c.onclick = (ev) => {
    const pb = ev.target.closest('[data-place]');
    if (pb) { ev.stopPropagation(); placeModal(all.find((e) => e.id === Number(pb.dataset.place)), route); return; }
    location.hash = '#/eq/' + c.dataset.id;
  }));
  bindEvRows(app);
  fillThumbs(app);
  healThumbs(all).then(() => {});
}

// ---------- 위치 기록 ----------
async function viewPlaces() {
  const eqs = (await call('GET', '/api/equipment')).filter((e) => inRoom(e.roomId) && e.active !== false);
  const locs = (await call('GET', '/api/locs')).filter((l) => inRoom(l.roomId)).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
  const rooms = MYROOMS.filter((r) => r.active && inRoom(r.id));
  const showRoom = rooms.length > 1;
  const app = $('#app');
  const boardOf = (r) => {
    const mine = eqs.filter((e) => e.roomId === r.id);
    const cols = uniq([...(r.places || []), ...mine.map((e) => e.location)]);
    const ordered = [...(r.places || []), ...cols.filter((p) => !(r.places || []).includes(p))];
    const col = (name, items, extra) => `<div class="pcol ${extra || ''}"><div class="ptitle">${esc(name)} <span class="muted">${items.length}</span></div>
      ${items.map((e) => `<button type="button" class="pitem" data-eq="${e.id}">${thumbHtml(e, 'thumb')}<span>${eqLabel(e)}${e.placeSince ? `<span class="dsub">${esc(e.placeSince)}부터</span>` : ''}</span></button>`).join('') || '<div class="muted small">없음</div>'}</div>`;
    const none = mine.filter((e) => !e.location);
    return `<div class="card">
      <div class="head" style="margin-bottom:10px"><h2 style="margin:0">${showRoom ? esc(r.name) + ' — ' : ''}지금 어디 있나요</h2><span class="sub">장비를 누르면 위치를 바꿔 기록해요</span></div>
      <div class="pboard">${ordered.map((p) => col(p, mine.filter((e) => e.location === p), (r.places || []).includes(p) ? '' : 'extra')).join('')}${none.length ? col('위치 없음', none, 'extra') : ''}</div>
      <div class="plist">
        <span class="sub">정해 둔 위치</span>
        <div class="chips">${(r.places || []).map((p, i) => `<span class="chip">${esc(p)}<button class="chipx" data-room="${r.id}" data-del="${i}" title="빼기">×</button></span>`).join('') || '<span class="muted">없음</span>'}</div>
        <form class="inline addplace" data-room="${r.id}"><input placeholder="새 위치 이름 (예: 1번 창고)" maxlength="40"><button class="btn small">넣기</button></form>
      </div>
    </div>`;
  };
  app.innerHTML = `
    <div class="head"><h1>위치 기록</h1><span class="sub">장비가 지금 어느 위치에 있는지만 간단하게 남겨요</span></div>
    ${rooms.length ? rooms.map(boardOf).join('') : '<div class="note info">들어간 방이 없어요.</div>'}
    <div class="card">
      <div class="head" style="margin-bottom:8px"><h2 style="margin:0">지난 기록</h2><span class="grow"></span><span class="sub">${locs.length}건</span></div>
      <div class="tablewrap flat"><table>
        <thead><tr><th>날짜</th><th>장비</th><th>위치</th><th>메모</th><th>적은 사람</th><th class="no-print"></th></tr></thead>
        <tbody>${locs.length ? locs.slice(0, placesMore ? 1000 : 50).map((l) => `<tr class="${l.canceled ? 'dim' : ''}">
          <td class="nowrap">${esc(l.date)}</td>
          <td><a href="#/eq/${l.equipmentId}">${l.nickname ? esc(l.nickname) + ' ' : ''}<span class="muted">${esc(l.equipmentName)}</span></a></td>
          <td class="nowrap">${l.prev ? `<span class="muted">${esc(l.prev)} → </span>` : ''}<b>${esc(l.place)}</b>${l.canceled ? ` <span class="badge r-취소">취소됨</span>` : ''}</td>
          <td>${esc(l.memo)}${l.canceled ? `<div class="sub">취소: ${esc(l.canceled.reason)} (${esc(l.canceled.by)})</div>` : ''}</td>
          <td class="nowrap">${esc(l.createdBy)}${l.via === 'phone' ? ' <span class="muted">📱</span>' : ''}</td>
          <td class="no-print">${l.canceled ? '' : `<button class="btn small" data-lcancel="${l.id}">취소</button>`}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">아직 기록이 없어요.</td></tr>'}</tbody>
      </table></div>
      ${locs.length > 50 && !placesMore ? '<button class="link" id="lMore">더 보기</button>' : ''}
    </div>`;
  $$('.pitem', app).forEach((b) => (b.onclick = () => placeModal(eqs.find((e) => e.id === Number(b.dataset.eq)), route)));
  const savePlaces = async (roomId, places) => {
    try { await call('PUT', `/api/rooms/${roomId}/places`, { places }); saved('위치 목록을 고쳤어요'); await refreshMe(); route(); } catch (err) { toast(err.message, true); }
  };
  $$('[data-del]', app).forEach((b) => (b.onclick = () => {
    const r = roomById(Number(b.dataset.room));
    const places = (r.places || []).slice(); const [gone] = places.splice(Number(b.dataset.del), 1);
    if (!confirm(`'${gone}' 위치를 목록에서 뺄까요?\n(이미 남긴 기록과 지금 그 위치에 있는 장비는 그대로예요)`)) return;
    savePlaces(r.id, places);
  }));
  $$('.addplace', app).forEach((f) => (f.onsubmit = (ev) => {
    ev.preventDefault();
    const v = f.querySelector('input').value.trim(); if (!v) return;
    const r = roomById(Number(f.dataset.room));
    if ((r.places || []).includes(v)) return toast('이미 있는 위치예요', true);
    savePlaces(r.id, [...(r.places || []), v]);
  }));
  $$('[data-lcancel]', app).forEach((b) => (b.onclick = () => askText('위치 기록 취소', '기록은 지우지 않고 "취소됨"으로 남아요. 가장 최근 기록이면 장비 위치가 그 전으로 돌아가요.', '취소 사유', async (reason) => {
    await call('POST', `/api/locs/${b.dataset.lcancel}/cancel`, { reason }); saved('취소했어요'); route();
  })));
  if ($('#lMore')) $('#lMore').onclick = () => { placesMore = true; route(); };
  fillThumbs(app);
}
let placesMore = false;

// ---------- 작업 일정 ----------
const EV_TAGS = ['연가', '반가', '출장', '교육', '외근', '당직', '회의', '기타'];
const evOrder = (a, b) => String(a.from).localeCompare(String(b.from)) || String(a.timeFrom || '').localeCompare(String(b.timeFrom || '')) || a.id - b.id;
const calState = { month: todayStr().slice(0, 7), sel: todayStr(), kinds: { '직원 일정': true, '현장 작업': true } };
function evWhen(v) {
  const d = v.from === v.to ? v.from.slice(5).replace('-', '/') : `${v.from.slice(5).replace('-', '/')}~${v.to.slice(5).replace('-', '/')}`;
  const tm = v.timeFrom ? ` ${v.timeFrom}${v.timeTo ? '~' + v.timeTo : ''}` : '';
  return d + tm;
}
function evRow(v, showRoom) {
  const who = (v.people || []).map((p) => p.name).join(', ');
  const eq = (v.equipment || []).map((e) => e.nickname || e.name).join(', ');
  return `<div class="evrow ${v.kind === '현장 작업' ? 'k-field' : 'k-staff'} ${v.canceled ? 'dim' : ''}" data-ev="${v.id}">
    <span class="evk">${v.kind === '현장 작업' ? '현장' : esc(v.tag || '직원')}</span>
    <span class="evbody"><b>${esc(v.title)}</b>${v.canceled ? ' <span class="badge r-취소">취소됨</span>' : ''}
      <span class="evmeta">${esc(evWhen(v))}${who ? ' · 👤 ' + esc(who) : ''}${v.place ? ' · 📍 ' + esc(v.place) : ''}${eq ? ' · 🚜 ' + esc(eq) : ''}${showRoom ? ' · ' + esc(v.roomName) : ''}</span></span>
  </div>`;
}
function bindEvRows(root) { $$('[data-ev]', root).forEach((r) => (r.onclick = () => (location.hash = '#/event/' + r.dataset.ev))); }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
async function viewCalendar() {
  const all = (await call('GET', '/api/events')).filter((v) => inRoom(v.roomId));
  const showRoom = !ROOM && MYROOMS.filter((r) => r.active).length > 1;
  const live = all.filter((v) => !v.canceled && calState.kinds[v.kind]);
  const [yy, mm] = calState.month.split('-').map(Number);
  const first = new Date(yy, mm - 1, 1);
  const start = new Date(yy, mm - 1, 1 - first.getDay());
  const days = [];
  for (let i = 0; i < 42; i++) { const d = new Date(start); d.setDate(start.getDate() + i); days.push(d); if (i >= 34 && d.getMonth() !== mm - 1 && d.getDay() === 6) break; }
  const t = todayStr();
  const on = (ds) => live.filter((v) => v.from <= ds && v.to >= ds).sort(evOrder);
  const selList = all.filter((v) => calState.kinds[v.kind] && v.from <= calState.sel && v.to >= calState.sel).sort(evOrder);
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><h1>작업 일정</h1><span class="grow"></span>
      <a class="btn primary" href="#/event/new?d=${calState.sel}">+ 일정 넣기</a></div>
    <div class="calbar">
      <button class="btn" id="cPrev">◀</button><b class="calmonth">${yy}년 ${mm}월</b><button class="btn" id="cNext">▶</button>
      <button class="btn small" id="cToday">오늘</button><span class="grow"></span>
      <label class="kchk k-staff"><input type="checkbox" data-kind="직원 일정" ${calState.kinds['직원 일정'] ? 'checked' : ''}> 직원 일정</label>
      <label class="kchk k-field"><input type="checkbox" data-kind="현장 작업" ${calState.kinds['현장 작업'] ? 'checked' : ''}> 현장 작업</label>
    </div>
    <div class="cal">
      ${'일월화수목금토'.split('').map((w, i) => `<div class="cw ${i === 0 ? 'sun' : i === 6 ? 'sat' : ''}">${w}</div>`).join('')}
      ${days.map((d) => {
        const ds = ymd(d); const evs = on(ds);
        return `<div class="cd ${d.getMonth() !== mm - 1 ? 'out' : ''} ${ds === t ? 'today' : ''} ${ds === calState.sel ? 'sel' : ''} ${d.getDay() === 0 ? 'sun' : d.getDay() === 6 ? 'sat' : ''}" data-d="${ds}">
          <div class="cn">${d.getDate()}</div>
          ${evs.slice(0, 3).map((v) => `<div class="ce ${v.kind === '현장 작업' ? 'k-field' : 'k-staff'}" title="${esc(v.title)}">${v.kind === '직원 일정' && v.people && v.people.length ? esc(v.people.map((p) => p.name).join(',')) + ' ' : ''}${esc(v.title)}</div>`).join('')}
          ${evs.length > 3 ? `<div class="cmore">+${evs.length - 3}</div>` : ''}
          ${evs.length ? `<div class="cdots">${evs.slice(0, 4).map((v) => `<i class="${v.kind === '현장 작업' ? 'k-field' : 'k-staff'}"></i>`).join('')}</div>` : ''}
        </div>`;
      }).join('')}
    </div>
    <div class="card dayp">
      <div class="head" style="margin-bottom:8px"><h2 style="margin:0">${esc(calState.sel)} (${'일월화수목금토'[new Date(calState.sel + 'T00:00:00').getDay()]})</h2><span class="grow"></span>
        <a class="btn small" href="#/event/new?d=${calState.sel}&k=직원 일정">+ 직원 일정</a><a class="btn small primary" href="#/event/new?d=${calState.sel}&k=현장 작업">+ 현장 작업</a></div>
      ${selList.length ? `<div class="evlist">${selList.map((v) => evRow(v, showRoom)).join('')}</div>` : '<div class="muted">이 날 적힌 일정이 없어요.</div>'}
    </div>`;
  const move = (n) => { const d = new Date(yy, mm - 1 + n, 1); calState.month = ymd(d).slice(0, 7); viewCalendar(); };
  $('#cPrev').onclick = () => move(-1);
  $('#cNext').onclick = () => move(1);
  $('#cToday').onclick = () => { calState.month = t.slice(0, 7); calState.sel = t; viewCalendar(); };
  $$('[data-kind]', app).forEach((c) => (c.onchange = () => { calState.kinds[c.dataset.kind] = c.checked; viewCalendar(); }));
  $$('.cd', app).forEach((c) => (c.onclick = () => {
    calState.sel = c.dataset.d;
    if (c.dataset.d.slice(0, 7) !== calState.month) calState.month = c.dataset.d.slice(0, 7);
    viewCalendar();
  }));
  bindEvRows(app);
}
async function viewEventForm(id, qs) {
  const q = new URLSearchParams(qs);
  const eqs = (await call('GET', '/api/equipment')).filter((e) => e.active !== false);
  let v;
  if (id) v = await call('GET', '/api/events/' + id);
  else {
    const d = q.get('d') || todayStr();
    const kind = q.get('k') === '현장 작업' ? '현장 작업' : q.get('k') === '직원 일정' ? '직원 일정' : '현장 작업';
    v = { roomId: ROOM || (MYROOMS.filter((r) => r.active)[0] || {}).id, kind, tag: kind === '직원 일정' ? '출장' : '', title: '', from: d, to: d, timeFrom: '', timeTo: '', place: '', memo: '', personIds: kind === '직원 일정' && ME ? [ME.id] : [], equipmentIds: [] };
  }
  const locked = !!(v && v.canceled);
  const rooms = MYROOMS.filter((r) => r.active);
  const app = $('#app');
  app.innerHTML = `
    <div class="head"><div><div class="sub"><a href="#/calendar">작업 일정</a></div><h1>${id ? '일정 보기 · 고치기' : '일정 넣기'}</h1></div></div>
    ${locked ? `<div class="note info">취소된 일정이에요 — ${esc(v.canceled.reason)} (${esc(v.canceled.by)}, ${esc(v.canceled.at)})</div>` : ''}
    <form class="form" id="f">
      <fieldset><legend>무슨 일정</legend>
        <div class="row"><label>종류<span class="req">*</span></label><div class="seg">${['직원 일정', '현장 작업'].map((k) => `<label class="segb ${k === '현장 작업' ? 'k-field' : 'k-staff'}"><input type="radio" name="kind" value="${k}" ${v.kind === k ? 'checked' : ''}> ${k}</label>`).join('')}</div></div>
        <div class="row" id="tagRow"><label for="f_tag">구분</label><div><input id="f_tag" name="tag" list="dl_tag" value="${esc(v.tag)}" placeholder="연가 · 출장 · 교육 …"><datalist id="dl_tag">${EV_TAGS.map((x) => `<option value="${x}">`).join('')}</datalist></div></div>
        <div class="row"><label for="f_title">내용<span class="req">*</span></label><div><input id="f_title" name="title" required value="${esc(v.title)}" placeholder=""></div></div>
        ${rooms.length > 1 ? `<div class="row"><label for="f_roomId">방</label><div><select id="f_roomId" name="roomId">${rooms.map((r) => `<option value="${r.id}" ${r.id === v.roomId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select><div class="help">이 방 구성원이 이 일정을 봐요.</div></div></div>` : `<input type="hidden" name="roomId" value="${esc(v.roomId)}">`}
      </fieldset>
      <fieldset><legend>언제 · 어디서</legend>
        <div class="row"><label for="f_from">날짜<span class="req">*</span></label><div class="inline wrap"><input type="date" id="f_from" name="from" required value="${esc(v.from)}" min="1900-01-01" max="2099-12-31"><span>부터</span><input type="date" id="f_to" name="to" value="${esc(v.to)}" min="1900-01-01" max="2099-12-31"><span>까지</span></div></div>
        <div class="row"><label for="f_timeFrom">시각</label><div class="inline wrap"><input type="time" id="f_timeFrom" name="timeFrom" value="${esc(v.timeFrom)}"><span>~</span><input type="time" id="f_timeTo" name="timeTo" value="${esc(v.timeTo)}"><span class="muted">(하루 종일이면 비워 두세요)</span></div></div>
        <div class="row"><label for="f_place">장소</label><div><input id="f_place" name="place" list="dl_place" value="${esc(v.place)}" placeholder="예: 북내면 ○○리 논 · 본청"><datalist id="dl_place"></datalist></div></div>
      </fieldset>
      <fieldset><legend>누가 · 무엇으로</legend>
        <div class="row"><label>사람</label><div><div class="checks" id="ppl"></div></div></div>
        <div class="row" id="eqRow"><label>쓰는 장비</label><div><div class="checks" id="eqs"></div><div class="help">고른 장비는 그날 대시보드에 <b>🚜 현장 작업</b>으로 떠요.</div></div></div>
        <div class="row"><label for="f_memo">메모</label><div><textarea id="f_memo" name="memo">${esc(v.memo)}</textarea></div></div>
      </fieldset>
      ${id ? `<div class="sub">적은 사람: ${esc(v.createdBy)} (${esc(v.createdAt)})${v.via === 'phone' ? ' 📱' : ''}${v.updatedBy ? ` · 마지막으로 고친 사람: ${esc(v.updatedBy)} (${esc(v.updatedAt)})` : ''}</div>` : ''}
      <div class="form-actions">
        ${id && !locked ? '<button type="button" class="btn danger" id="evCancel">일정 취소</button><span class="grow"></span>' : ''}
        <a class="btn" href="#/calendar">${locked ? '돌아가기' : '닫기'}</a>${locked ? '' : '<button class="btn primary">저장</button>'}
      </div>
    </form>`;
  const f = $('#f');
  let pickedP = new Set(v.personIds || []), pickedE = new Set(v.equipmentIds || []);
  const roomNow = () => Number((f.querySelector('[name=roomId]') || {}).value) || v.roomId;
  const kindNow = () => (f.querySelector('[name=kind]:checked') || {}).value;
  const drawPicks = () => {
    const r = roomById(roomNow()) || { people: [], places: [] };
    const people = r.people || [];
    const extra = (v.people || []).filter((p) => !people.some((x) => x.id === p.id));
    $('#ppl').innerHTML = [...people, ...extra].map((p) => `<label class="ck"><input type="checkbox" data-p="${p.id}" ${pickedP.has(p.id) ? 'checked' : ''}> ${esc(p.name)}</label>`).join('') || '<span class="muted">이 방에 사람이 없어요</span>';
    const reqs = eqs.filter((e) => e.roomId === roomNow());
    $('#eqs').innerHTML = reqs.map((e) => `<label class="ck"><input type="checkbox" data-e="${e.id}" ${pickedE.has(e.id) ? 'checked' : ''}> ${e.nickname ? esc(e.nickname) + ' <span class="muted">' + esc(e.name) + '</span>' : esc(e.name)}</label>`).join('') || '<span class="muted">이 방에 장비가 없어요</span>';
    $('#dl_place').innerHTML = (r.places || []).map((p) => `<option value="${esc(p)}">`).join('');
    $$('[data-p]', f).forEach((c) => (c.onchange = () => (c.checked ? pickedP.add(+c.dataset.p) : pickedP.delete(+c.dataset.p))));
    $$('[data-e]', f).forEach((c) => (c.onchange = () => (c.checked ? pickedE.add(+c.dataset.e) : pickedE.delete(+c.dataset.e))));
    $('#tagRow').hidden = kindNow() !== '직원 일정';
    $('#f_title').placeholder = kindNow() === '직원 일정' ? '예: 도 농업기술원 교육' : '예: 벼 병해충 공동방제';
  };
  drawPicks();
  $$('[name=kind]', f).forEach((r) => (r.onchange = drawPicks));
  if (f.querySelector('select[name=roomId]')) f.querySelector('select[name=roomId]').onchange = () => { pickedE = new Set(); drawPicks(); };
  $('#f_from').onchange = () => { if (!$('#f_to').value || $('#f_to').value < $('#f_from').value) $('#f_to').value = $('#f_from').value; };
  if (locked) $$('input,select,textarea', f).forEach((el) => (el.disabled = true));
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const body = formValues(f);
    body.kind = kindNow();
    if (body.kind !== '직원 일정') body.tag = '';
    body.personIds = [...pickedP];
    body.equipmentIds = [...pickedE].filter((x) => eqs.some((e) => e.id === x && e.roomId === roomNow()));
    try {
      const out = id ? await call('PUT', '/api/events/' + id, body) : await call('POST', '/api/events', body);
      calState.sel = body.from; calState.month = body.from.slice(0, 7);
      saved('저장했어요'); location.hash = '#/calendar';
      void out;
    } catch (err) { toast(err.message, true); }
  };
  if ($('#evCancel')) $('#evCancel').onclick = () => askText('일정 취소', '일정은 지우지 않고 "취소됨"으로 남아요.', '취소 사유', async (reason) => {
    await call('POST', `/api/events/${id}/cancel`, { reason }); saved('취소했어요'); location.hash = '#/calendar';
  });
}

// ---------- 시작 ----------
(async function start() {
  window.showGate = showGate; window.toast = toast;
  $('#pwBtn').onclick = () => pwForm(false);
  if (PHONE()) {
    // 우편함에서 새 자료가 오면 — 적는 중이 아니면 화면을 새로 그림
    window.EQ_PHONE.onSnap(async () => {
      if (!ME) return;
      const h = location.hash || '';
      const editing = /\/(new|edit)$/.test(h) || /^#\/repair\//.test(h) || !$('#modal').hidden || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
      try { await refreshMe(); } catch (e) { return; }
      if (!editing) route();
    });
    // 문서 링크: 우편함에서 가져와서 열기
    document.addEventListener('click', async (ev) => {
      const a = ev.target.closest('a[data-fid]');
      if (!a) return;
      ev.preventDefault(); ev.stopPropagation();
      try {
        const u = await window.EQ_PHONE.fileUrl(Number(a.dataset.fid), a.dataset.fname);
        if (!u) { toast('사무실 서버에 이 문서를 달라고 했어요. 1~2분 뒤 다시 눌러 주세요.'); return; }
        if (/\.(jpe?g|png|gif|webp)$/i.test(a.dataset.fname)) modal(`<h2>${esc(a.dataset.fname)}</h2><img src="${u}" style="width:100%;border-radius:8px"><div class="actions" style="margin-top:10px"><button class="btn" id="mSave">내려받기</button><button class="btn primary" id="mNo">닫기</button></div>`, (m, close) => { $('#mNo', m).onclick = close; $('#mSave', m).onclick = () => window.EQ_PHONE.saveBlob(u, a.dataset.fname); });
        else { await window.EQ_PHONE.saveBlob(u, a.dataset.fname); toast('내려받았어요 (다운로드 폴더)'); }
      } catch (err) { toast(err.message, true); }
    }, true);
  }
  $('#logoutBtn').onclick = async () => { try { await call('POST', '/api/logout', {}); } catch (e) { /* 이미 나감 */ } showGate(); };
  window.addEventListener('hashchange', () => { if (ME) route(); });
  try { await boot(); } catch (e) { document.body.insertAdjacentHTML('afterbegin', `<div class="note bad" style="margin:16px">서버에 닿지 못했어요: ${esc(e.message)}</div>`); }
})();
