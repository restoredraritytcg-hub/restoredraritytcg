// Shiny Asset Exchange demo — admin portal (hash router).
import { store, money, money0, esc, fmtDate, stockState, quote, tierFor, slug, STATUSES, STATUS_LABEL, MOVE_REASONS, DEFAULT_CONTENT } from './data.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = $('#root');
const SITE = location.href.replace(/admin\.html.*$/, 'index.html');
const LOGO = 'https://shiny-asset-exchange.myshopify.com/cdn/shop/files/64F23902-BF59-4ECD-83AF-2698895120CB.png?height=96';
const toast = m => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = m; document.body.appendChild(t); setTimeout(() => t.remove(), 2400); };
const pill = (s, txt) => `<span class="pill ${{ paid: 'warn', fulfilled: 'ok', refunded: 'bad', cancelled: 'bad', submitted: 'info', invoiced: 'warn', completed: 'ok', shipped: 'ok', restored: 'ok', in: 'ok', low: 'warn', out: 'bad' }[s] || ''}">${esc(txt || STATUS_LABEL[s] || s)}</span>`;
const linkFor = c => `${SITE}#/my/${c.token}`;
const copy = t => navigator.clipboard ? navigator.clipboard.writeText(t).then(() => toast('Copied')) : prompt('Copy:', t);

// ---------------- login (demo) ----------------
function loggedIn() { try { return sessionStorage.getItem('sae-admin') === '1'; } catch { return true; } }
function login() {
  root.innerHTML = `<div class="panel login"><a class="logo" href="index.html" style="margin-bottom:18px"><img src="${LOGO}" alt="">Shiny Asset Exchange</a>
    <h2>Admin sign in</h2><p class="small muted">Demo: any password works. The live version uses Supabase email + password login, the same as the Restored Rarity portal.</p>
    <form id="lf"><div class="field"><label>Email</label><input id="le" type="email" value="${esc(store.content().contact.email)}" autocapitalize="off" autocorrect="off"></div>
    <div class="field"><label>Password</label><input id="lp" type="password" value="demo"></div><button class="btn red block">Sign in</button></form></div>`;
  $('#lf').onsubmit = e => { e.preventDefault(); try { sessionStorage.setItem('sae-admin', '1'); } catch {} router(); };
}

// ---------------- shell ----------------
function counts() {
  const vs = store.products({ all: true }).flatMap(p => p.status === 'active' ? p.variants : []);
  return {
    toShip: store.orders().filter(o => o.status === 'paid').length,
    low: vs.filter(v => stockState(v).key === 'low').length, out: vs.filter(v => stockState(v).key === 'out').length,
    newSubs: store.submissions().filter(s => s.status === 'submitted').length,
    needsEmail: store.submissions().filter(s => s.emailed_status !== s.status && s.status !== 'cancelled').length,
  };
}
function shell(active, title, actions, body) {
  const n = counts();
  const nl = (h, l, badge, key) => `<a class="nl ${active === key ? 'on' : ''}" href="#/${h}">${l}${badge ? `<span class="badge" style="position:static">${badge}</span>` : ''}</a>`;
  root.innerHTML = `<div class="adm"><nav class="side"><a class="logo" href="#/"><img src="${LOGO}" alt="">SAE Admin</a>
      ${nl('', 'Dashboard', 0, 'dash')}
      <div class="grp">Shop</div>${nl('orders', 'Orders', n.toShip, 'orders')}${nl('inventory', 'Inventory', n.low + n.out, 'inventory')}${nl('stock', 'Stock history', 0, 'stock')}
      <div class="grp">Restoration</div>${nl('submissions', 'Submissions', n.newSubs, 'subs')}${nl('new', '+ New submission', 0, 'new')}
      <div class="grp">People</div>${nl('customers', 'Customers', 0, 'customers')}
      <div class="grp">Website</div>${nl('site', 'Website & prices', 0, 'site')}<a class="nl" href="index.html" target="_blank">View store ↗</a>
      <div class="grp">Demo</div><a class="nl" href="#" id="signout">Sign out</a></nav>
    <main class="adm-main"><div class="demo-flag" style="margin-bottom:16px">Demo build — data is saved in this browser only. Orders placed on the <a href="index.html" target="_blank">store</a> show up here and reduce stock straight away.</div>
      <div class="adm-top"><h1>${title}</h1><div class="row">${actions || ''}<button class="btn ghost sm" id="refresh">↻ Refresh</button></div></div>${body}</main></div>`;
  $('#signout').onclick = e => { e.preventDefault(); try { sessionStorage.removeItem('sae-admin'); } catch {} login(); };
  $('#refresh').onclick = () => router();
}

// ---------------- router ----------------
const routes = { '': dash, orders, order, inventory, product, stock, submissions, submission, new: newSubmission, customers, customer, site };
function router() {
  if (!loggedIn()) return login();
  const [path, q] = location.hash.replace(/^#\/?/, '').split('?');
  const [r, ...a] = path.split('/');
  (routes[r] || dash)(a.map(decodeURIComponent), new URLSearchParams(q || ''));
}
window.addEventListener('hashchange', router);
let busy = false; // don't redraw under someone typing
store.onChange(() => { if (!busy && !document.activeElement?.matches('input,textarea,select')) router(); });

// ---------------- dashboard ----------------
function dash() {
  const os = store.orders(), d0 = new Date(); d0.setHours(0, 0, 0, 0); const d30 = Date.now() - 30 * 864e5;
  const live = os.filter(o => !['refunded', 'cancelled'].includes(o.status));
  const today = live.filter(o => new Date(o.created) >= d0), month = live.filter(o => new Date(o.created) >= d30);
  const n = counts(), c = store.content(), q = store.queueThisWeek();
  const vs = store.products({ all: true }).flatMap(p => p.variants.map(v => ({ p, v })));
  const alerts = vs.filter(({ p, v }) => p.status === 'active' && stockState(v).key !== 'in').sort((a, b) => a.v.stock - b.v.stock);
  const retail = vs.reduce((s, { v }) => s + v.stock * v.price, 0);
  const sold = {}; month.forEach(o => o.items.forEach(i => { sold[i.title] = (sold[i.title] || 0) + i.qty; }));
  shell('dash', 'Dashboard', `<a class="btn sm" href="#/inventory">Manage inventory</a>`, `
    <div class="stats">
      <div class="stat"><div class="v">${money0(today.reduce((s, o) => s + o.total, 0))}</div><div class="l">Sales today · ${today.length} order${today.length === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="v">${money0(month.reduce((s, o) => s + o.total, 0))}</div><div class="l">Last 30 days · ${month.length} orders</div></div>
      <div class="stat"><div class="v">${n.toShip}</div><div class="l">Orders to ship</div></div>
      <div class="stat"><div class="v">${q}/${c.capacity}</div><div class="l">Cards in this week's queue</div></div></div>
    <div class="cols2">
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Stock alerts</h3><a class="small link" href="#/inventory?f=alert">See all</a></div>
        ${alerts.length ? `<table style="margin-top:8px">${alerts.slice(0, 8).map(({ p, v }) => `<tr class="click" data-href="#/product/${p.id}"><td>${esc(p.title)}${v.title ? ` <span class="muted">· ${esc(v.title)}</span>` : ''}</td><td class="num">${v.stock}</td><td>${pill(stockState(v).key, stockState(v).key === 'out' ? 'Sold out' : 'Low')}</td></tr>`).join('')}</table>`
          : '<p class="muted">Everything is above its low-stock level.</p>'}
        <p class="small muted" style="margin:10px 0 0">Stock on hand at retail: <b>${money0(retail)}</b></p></div>
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Recent orders</h3><a class="small link" href="#/orders">All orders</a></div>
        <table style="margin-top:8px">${os.slice(0, 6).map(o => `<tr class="click" data-href="#/order/${o.id}"><td>${esc(o.number)}<br><span class="small muted">${fmtDate(o.created, true)}</span></td><td>${esc((store.customer(o.customer_id) || {}).name || '')}</td><td class="num">${money(o.total)}</td><td>${pill(o.status, o.status === 'paid' ? 'To ship' : null)}</td></tr>`).join('') || '<tr><td class="muted">No orders yet.</td></tr>'}</table></div>
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Restoration queue</h3><a class="small link" href="#/submissions">All submissions</a></div>
        <table style="margin-top:8px">${store.submissions().filter(s => !['completed', 'cancelled'].includes(s.status)).slice(0, 6).map(s => `<tr class="click" data-href="#/submission/${s.id}"><td>${esc(s.code)}${s.emailed_status !== s.status ? ' <span title="Customer not emailed about this status">✉</span>' : ''}</td><td>${esc((store.customer(s.customer_id) || {}).name || '')}</td><td>${s.cards.length} card${s.cards.length === 1 ? '' : 's'}</td><td>${pill(s.status)}</td></tr>`).join('') || '<tr><td class="muted">Nothing in the queue.</td></tr>'}</table></div>
      <div class="panel"><h3>Best sellers · 30 days</h3>${Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `<div class="sum"><span>${esc(t)}</span><span>${n} sold</span></div>`).join('') || '<p class="muted">No sales yet.</p>'}</div>
    </div>`);
  bindRows();
}
function bindRows() { $$('tr[data-href]').forEach(tr => tr.onclick = () => location.hash = tr.dataset.href); }

// ---------------- inventory ----------------
function inventory(a, params) {
  let f = params.get('f') || 'all', q = '';
  const draw = () => {
    const rows = store.products({ all: true }).flatMap(p => p.variants.map(v => ({ p, v, s: stockState(v) })))
      .filter(({ p, s }) => f === 'all' || (f === 'alert' ? s.key !== 'in' && p.status === 'active' : f === 'draft' ? p.status === 'draft' : s.key === f))
      .filter(({ p, v }) => !q || (p.title + ' ' + v.title + ' ' + v.sku).toLowerCase().includes(q));
    const units = rows.reduce((s, r) => s + r.v.stock, 0), retail = rows.reduce((s, r) => s + r.v.stock * r.v.price, 0), cost = rows.reduce((s, r) => s + r.v.stock * (+r.v.cost || 0), 0);
    $('#inv').innerHTML = `<div class="row" style="margin-bottom:12px"><div class="filters" style="margin:0">${[['all', 'All'], ['alert', 'Needs attention'], ['low', 'Low'], ['out', 'Sold out'], ['draft', 'Drafts']].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <input class="search" id="q" placeholder="Search name or SKU" value="${esc(q)}"></div>
      <div class="table-wrap"><table><tr><th></th><th>Product</th><th>SKU</th><th class="num">Price</th><th class="num">On hand</th><th>Status</th><th>Quick adjust</th></tr>
      ${rows.map(({ p, v, s }) => `<tr><td><img class="thumb" src="${esc(p.images[0] || '')}" alt=""></td>
        <td><a href="#/product/${p.id}"><b>${esc(p.title)}</b></a>${v.title ? `<br><span class="small muted">${esc(v.title)}</span>` : ''}${p.status === 'draft' ? ' <span class="pill">Draft</span>' : ''}</td>
        <td class="small">${esc(v.sku)}</td><td class="num">${money(v.price)}</td>
        <td class="num"><input class="stock-input" data-set="${v.id}" value="${v.stock}" inputmode="numeric" aria-label="On hand"><br><span class="small dim">low at ${v.low_at}</span></td>
        <td>${v.track ? pill(s.key, s.key === 'in' ? 'In stock' : s.key === 'low' ? 'Low' : 'Sold out') : '<span class="pill">Not tracked</span>'}</td>
        <td><div class="row" style="gap:6px"><button class="btn ghost sm" data-adj="${v.id}" data-d="-1">−1</button><button class="btn ghost sm" data-adj="${v.id}" data-d="1">+1</button><button class="btn sm" data-recv="${v.id}">Receive…</button></div></td></tr>`).join('') || '<tr><td colspan="7" class="muted">No matching items.</td></tr>'}
      </table></div>
      <p class="small muted">${rows.length} items · ${units} units on hand · ${money0(retail)} at retail${cost ? ` · ${money0(cost)} at cost` : ''}. Type a number in “On hand” and press Enter to record a count correction.</p>`;
    $$('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; draw(); });
    $('#q').oninput = e => { q = e.target.value.toLowerCase(); const pos = e.target.selectionStart; draw(); $('#q').focus(); $('#q').setSelectionRange(pos, pos); };
    $$('[data-set]').forEach(i => { i.onfocus = () => busy = true; i.onblur = () => busy = false;
      i.onkeydown = e => { if (e.key === 'Enter') { busy = false; store.setStock(i.dataset.set, i.value, 'Inventory count'); toast('Count saved'); } }; });
    $$('[data-adj]').forEach(b => b.onclick = () => { const d = +b.dataset.d; store.adjustStock(b.dataset.adj, d, d > 0 ? 'received' : 'damaged', 'Quick adjust'); });
    $$('[data-recv]').forEach(b => b.onclick = () => adjustDialog(b.dataset.recv));
  };
  shell('inventory', 'Inventory', `<button class="btn ghost sm" id="csv">Export CSV</button><a class="btn red sm" href="#/product/new">+ Add product</a>`, '<div id="inv"></div>');
  $('#csv').onclick = exportCsv;
  draw();
}
function adjustDialog(vid) {
  const v = store.variant(vid), p = store.productOfVariant(vid);
  const d = document.createElement('div'); d.className = 'scrim'; d.style.display = 'grid'; d.style.placeItems = 'center';
  d.innerHTML = `<div class="panel" style="width:min(420px,92vw)"><h3>${esc(p.title)}${v.title ? ' · ' + esc(v.title) : ''}</h3><p class="small muted">On hand now: <b>${v.stock}</b></p>
    <div class="grid2"><div class="field"><label>Change</label><select id="dir"><option value="1">Add (+)</option><option value="-1">Remove (−)</option></select></div>
    <div class="field"><label>Quantity</label><input id="qty" inputmode="numeric" value="12"></div></div>
    <div class="field"><label>Reason</label><select id="why">${['received', 'damaged', 'studio', 'count'].map(k => `<option value="${k}">${MOVE_REASONS[k]}</option>`).join('')}</select></div>
    <div class="field"><label>Note (PO #, batch, who)</label><input id="note"></div>
    <div class="row"><button class="btn red" id="ok">Save</button><button class="btn ghost" id="cancel">Cancel</button></div></div>`;
  document.body.appendChild(d); busy = true;
  $('#dir', d).onchange = () => { $('#why', d).value = $('#dir', d).value === '1' ? 'received' : 'damaged'; };
  const close = () => { busy = false; d.remove(); };
  $('#cancel', d).onclick = close; d.onclick = e => { if (e.target === d) close(); };
  $('#ok', d).onclick = () => { const n = Math.abs(parseInt($('#qty', d).value, 10) || 0); if (!n) return; close(); store.adjustStock(vid, n * +$('#dir', d).value, $('#why', d).value, $('#note', d).value.trim()); toast('Stock updated'); };
}
function exportCsv() {
  const rows = [['Product', 'Variant', 'SKU', 'Price', 'Cost', 'On hand', 'Low at', 'Status']];
  store.products({ all: true }).forEach(p => p.variants.forEach(v => rows.push([p.title, v.title, v.sku, v.price, v.cost ?? '', v.stock, v.low_at, p.status])));
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
}

function product([id]) {
  const isNew = id === 'new';
  const p = isNew ? { title: '', handle: '', tagline: '', body: '', images: [], collection: 'card-care', status: 'draft', featured: false, variants: [{ title: '', sku: '', price: 0, cost: null, stock: 0, low_at: 10, track: true }] }
    : JSON.parse(JSON.stringify(store.product(id) || {}));
  if (!isNew && !p.id) return shell('inventory', 'Not found', '', '<p>That product no longer exists.</p>');
  const varRow = (v, i) => `<div class="var-row" data-vi="${i}">
    <div><label>Option (e.g. 1 oz)</label><input data-k="title" value="${esc(v.title)}" placeholder="Leave blank if only one"></div>
    <div><label>SKU</label><input data-k="sku" value="${esc(v.sku)}"></div>
    <div><label>Price $</label><input data-k="price" inputmode="decimal" value="${v.price}"></div>
    <div><label>Cost $</label><input data-k="cost" inputmode="decimal" value="${v.cost ?? ''}" placeholder="—"></div>
    <div><label>Low at</label><input data-k="low_at" inputmode="numeric" value="${v.low_at}"></div>
    <div><label>${v.id ? 'On hand' : 'Opening stock'}</label>${v.id ? `<div class="row" style="gap:6px;min-height:46px"><b>${v.stock}</b><button type="button" class="btn ghost sm" data-adjv="${v.id}">Adjust</button></div>` : `<input data-k="stock" inputmode="numeric" value="${v.stock || 0}">`}</div>
    <label class="check" style="grid-column:1/-1;margin:0"><input type="checkbox" data-k="track" ${v.track ? 'checked' : ''}> Track inventory (stop selling at 0)
      ${p.variants.length > 1 ? `<button type="button" class="linkbtn" data-delv="${i}" style="margin-left:auto">Remove option</button>` : ''}</label></div>`;
  const draw = () => {
    shell('inventory', isNew ? 'Add product' : esc(p.title), `${!isNew && p.status === 'active' ? `<a class="btn ghost sm" href="index.html#/p/${esc(p.handle)}" target="_blank">View on store ↗</a>` : ''}<a class="btn ghost sm" href="#/inventory">← Inventory</a>`, `
      <form id="pf" class="cols-main"><div>
        <div class="panel"><div class="field"><label>Title</label><input id="title" value="${esc(p.title)}" required></div>
          <div class="field"><label>Short line (shown under the price)</label><input id="tagline" value="${esc(p.tagline)}"></div>
          <div class="field"><label>Description (HTML allowed: &lt;p&gt;, &lt;ul&gt;, &lt;strong&gt;)</label><textarea id="body" style="min-height:220px">${esc(p.body)}</textarea></div></div>
        <div class="panel" style="margin-top:16px"><h3>Options, prices & stock</h3><div id="vars">${p.variants.map(varRow).join('')}</div>
          <button type="button" class="btn ghost sm" id="addv">+ Add option (size, pack…)</button></div>
        ${!isNew ? `<div class="panel" style="margin-top:16px"><h3>Stock history</h3>${movesTable(store.movements().filter(m => p.variants.some(v => v.id === m.variant_id)).slice(0, 25), true)}</div>` : ''}
      </div><aside>
        <div class="panel"><div class="field"><label>Status</label><select id="status"><option value="active" ${p.status === 'active' ? 'selected' : ''}>Active — on the store</option><option value="draft" ${p.status === 'draft' ? 'selected' : ''}>Draft — hidden</option></select></div>
          <div class="field"><label>Collection</label><select id="collection"><option value="card-care" ${p.collection === 'card-care' ? 'selected' : ''}>Card care</option><option value="hydration" ${p.collection === 'hydration' ? 'selected' : ''}>Hydration Spray</option></select></div>
          <label class="check"><input type="checkbox" id="featured" ${p.featured ? 'checked' : ''}> Show on home page</label>
          <div class="field" style="margin-top:10px"><label>URL handle</label><input id="handle" value="${esc(p.handle)}" placeholder="made from the title"></div></div>
        <div class="panel" style="margin-top:16px"><h3>Photos</h3><div class="photos" id="imgs">${p.images.map((u, i) => `<div class="photo-slot" style="cursor:default"><img src="${esc(u)}" alt=""><button type="button" class="badge" data-delimg="${i}" style="top:4px;right:4px;border:0;cursor:pointer">×</button></div>`).join('')}
          <label class="photo-slot">＋<br>Upload<input type="file" accept="image/*" id="upimg" multiple></label></div>
          <div class="field" style="margin-top:10px"><label>…or paste an image URL</label><div class="row"><input id="imgurl" class="grow" placeholder="https://"><button type="button" class="btn ghost sm" id="addurl">Add</button></div></div></div>
        <button class="btn red block" style="margin-top:16px">Save product</button>
        ${!isNew ? '<button type="button" class="btn ghost block" style="margin-top:8px" id="del">Delete product</button>' : ''}
        <div class="err hidden" id="perr"></div></aside></form>`);
    $$('#vars .var-row').forEach(row => {
      const v = p.variants[+row.dataset.vi];
      $$('[data-k]', row).forEach(inp => inp.oninput = inp.onchange = () => {
        const k = inp.dataset.k; v[k] = k === 'track' ? inp.checked : ['price', 'low_at', 'stock'].includes(k) ? +inp.value || 0 : k === 'cost' ? (inp.value === '' ? null : +inp.value) : inp.value;
      });
    });
    $$('[data-adjv]').forEach(b => b.onclick = () => adjustDialog(b.dataset.adjv));
    $$('[data-delv]').forEach(b => b.onclick = () => { if (p.variants[+b.dataset.delv].id && !confirm('Remove this option? Its stock history stays in the log.')) return; p.variants.splice(+b.dataset.delv, 1); draw(); });
    $$('[data-delimg]').forEach(b => b.onclick = () => { p.images.splice(+b.dataset.delimg, 1); keep(); draw(); });
    $('#addv').onclick = () => { keep(); p.variants.push({ title: '', sku: '', price: p.variants[0]?.price || 0, cost: null, stock: 0, low_at: 10, track: true }); draw(); };
    $('#addurl').onclick = () => { const u = $('#imgurl').value.trim(); if (u) { keep(); p.images.push(u); draw(); } };
    $('#upimg').onchange = async e => { keep(); for (const f of e.target.files) p.images.push(await shrinkImg(f)); draw(); };
    if ($('#del')) $('#del').onclick = () => { if (confirm('Delete this product? Past orders keep their line items.')) { store.deleteProduct(p.id); location.hash = '#/inventory'; } };
    $('#pf').onsubmit = e => {
      e.preventDefault(); keep();
      const err = $('#perr');
      if (!p.title.trim()) { err.textContent = 'Add a title.'; err.classList.remove('hidden'); return; }
      if (p.variants.some(v => !(v.price > 0))) { err.textContent = 'Every option needs a price.'; err.classList.remove('hidden'); return; }
      p.variants.forEach((v, i) => { if (!v.sku) v.sku = 'SAE-' + slug(p.title).toUpperCase().slice(0, 12) + (v.title ? '-' + slug(v.title).toUpperCase() : '') + (i ? '' : ''); });
      busy = false; const saved = store.saveProduct(p); toast('Saved'); location.hash = '#/product/' + saved.id;
    };
    $$('#pf input, #pf textarea, #pf select').forEach(i => { i.addEventListener('focus', () => busy = true); i.addEventListener('blur', () => busy = false); });
  };
  const keep = () => { if (!$('#title')) return; p.title = $('#title').value; p.tagline = $('#tagline').value; p.body = $('#body').value; p.status = $('#status').value; p.collection = $('#collection').value; p.featured = $('#featured').checked; p.handle = slug($('#handle').value || p.title); };
  draw();
}
function shrinkImg(file, max = 1000) {
  return new Promise((res, rej) => { const img = new Image(); img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', .8)); }; img.onerror = rej; img.src = URL.createObjectURL(file); });
}
function movesTable(ms, compact) {
  if (!ms.length) return '<p class="muted">No stock changes yet.</p>';
  return `<div class="table-wrap"><table><tr><th>When</th>${compact ? '' : '<th>Item</th>'}<th>Reason</th><th class="num">Change</th><th class="num">After</th><th>Ref / note</th></tr>
    ${ms.map(m => { const v = store.variant(m.variant_id), p = store.productOfVariant(m.variant_id); const o = m.ref && store.order(m.ref);
      return `<tr><td class="small">${fmtDate(m.at, true)}</td>${compact ? '' : `<td>${p ? `<a href="#/product/${p.id}">${esc(p.title)}</a>` : '<span class="muted">Deleted item</span>'}${v && v.title ? ` <span class="muted">· ${esc(v.title)}</span>` : ''}</td>`}
        <td>${esc(MOVE_REASONS[m.reason] || m.reason)}</td><td class="num" style="color:${m.delta < 0 ? '#ff7070' : 'var(--ok)'}">${m.delta > 0 ? '+' : ''}${m.delta}</td><td class="num">${m.after ?? ''}</td>
        <td class="small">${o ? `<a href="#/order/${o.id}">${esc(m.ref)}</a>` : esc(m.ref || '')} ${esc(m.note || '')}</td></tr>`; }).join('')}</table></div>`;
}
function stock() {
  let why = 'all';
  const draw = () => {
    const ms = store.movements().filter(m => why === 'all' || m.reason === why);
    $('#mv').innerHTML = `<div class="filters">${['all', 'sale', 'received', 'damaged', 'studio', 'count', 'refund', 'cancel'].map(k => `<button data-w="${k}" class="${why === k ? 'on' : ''}">${k === 'all' ? 'All' : MOVE_REASONS[k]}</button>`).join('')}</div>${movesTable(ms.slice(0, 300))}`;
    $$('[data-w]').forEach(b => b.onclick = () => { why = b.dataset.w; draw(); });
  };
  shell('stock', 'Stock history', '', '<p class="muted">Every change to stock — sales, refunds, deliveries, damage and counts — with who/why.</p><div id="mv"></div>');
  draw();
}

// ---------------- orders ----------------
function orders(a, params) {
  let f = params.get('f') || 'paid';
  const draw = () => {
    const os = store.orders().filter(o => f === 'all' || o.status === f);
    $('#ol').innerHTML = `<div class="filters">${[['paid', 'To ship'], ['fulfilled', 'Shipped'], ['refunded', 'Refunded'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="table-wrap"><table><tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th class="num">Total</th><th>Status</th></tr>
      ${os.map(o => `<tr class="click" data-href="#/order/${o.id}"><td><b>${esc(o.number)}</b></td><td class="small">${fmtDate(o.created, true)}</td><td>${esc((store.customer(o.customer_id) || {}).name || o.email)}</td>
        <td class="small">${o.items.reduce((s, i) => s + i.qty, 0)} item(s)</td><td class="num">${money(o.total)}</td><td>${pill(o.status, o.status === 'paid' ? 'Paid · to ship' : null)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">No orders here.</td></tr>'}</table></div>`;
    $$('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; draw(); }); bindRows();
  };
  shell('orders', 'Orders', '', '<div id="ol"></div>'); draw();
}
function order([id]) {
  const o = store.order(id); if (!o) return shell('orders', 'Not found', '', '');
  const c = store.customer(o.customer_id) || {};
  const s = o.ship || {};
  shell('orders', 'Order ' + esc(o.number), `<a class="btn ghost sm" href="#/orders">← Orders</a>`, `
    <div class="cols-main"><div>
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">${pill(o.status, o.status === 'paid' ? 'Paid · to ship' : null)}</h3><span class="small muted">${fmtDate(o.created, true)}</span></div>
        <table style="margin-top:10px">${o.items.map(i => `<tr><td><img class="thumb" src="${esc(i.image || '')}" alt=""></td><td><b>${esc(i.title)}</b>${i.variant ? `<br><span class="small muted">${esc(i.variant)}</span>` : ''}<br><span class="small dim">${esc(i.sku || '')}</span></td><td class="num">${money(i.price)} × ${i.qty}</td><td class="num">${money(i.price * i.qty)}</td></tr>`).join('')}</table>
        <div style="max-width:300px;margin:12px 0 0 auto"><div class="sum"><span>Subtotal</span><span>${money(o.subtotal)}</span></div><div class="sum"><span>Shipping</span><span>${money(o.shipping)}</span></div><div class="sum"><span>Tax</span><span>${money(o.tax)}</span></div><div class="sum total"><span>Total</span><span>${money(o.total)}</span></div></div>
        ${o.payment ? `<p class="small muted">Payment: Stripe ${esc(o.payment.mode === 'demo' ? '(demo)' : '')} · card ending ${esc(o.payment.last4)} · <code>${esc(o.payment.id)}</code></p>` : ''}</div>
      ${o.status === 'paid' ? `<div class="panel" style="margin-top:16px"><h3>Ship this order</h3><div class="grid2"><div class="field"><label>Carrier</label><select id="carrier"><option>USPS</option><option>UPS</option><option>FedEx</option></select></div><div class="field"><label>Tracking number</label><input id="trk"></div></div>
        <label class="check"><input type="checkbox" id="notify" checked> Email the customer the tracking number</label><button class="btn red" id="ship" style="margin-top:8px">Mark as shipped</button></div>` : ''}
      ${!['refunded', 'cancelled'].includes(o.status) ? `<div class="panel" style="margin-top:16px"><h3>Refund or cancel</h3><label class="check"><input type="checkbox" id="restock" checked> Put the items back in stock</label>
        <div class="row" style="margin-top:8px"><button class="btn ghost" id="refund">Refund ${money(o.total)}</button>${o.status === 'paid' ? '<button class="btn ghost" id="cancel">Cancel order</button>' : ''}</div>
        <p class="small muted" style="margin-top:8px">Live: refunds go through Stripe automatically. Demo: recorded here only.</p></div>` : ''}
      <div class="panel" style="margin-top:16px"><h3>History</h3><ul class="timeline">${o.history.slice().reverse().map(h => `<li class="done">${esc(STATUS_LABEL[h.status] || h.status)} <span class="small dim">· ${fmtDate(h.at, true)}</span>${h.note ? `<br><span class="small muted">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul>
        <div class="field"><label>Add a note</label><div class="row"><input id="onote" class="grow"><button class="btn ghost sm" id="addnote">Add</button></div></div></div>
    </div><aside>
      <div class="panel"><h3>Customer</h3><p><a href="#/customer/${c.id}"><b>${esc(c.name || '')}</b></a><br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${c.phone ? '<br>' + esc(c.phone) : ''}</p>
        <h4>Ship to</h4><p class="muted">${esc(s.name || '')}<br>${esc(s.line1 || '')}${s.line2 ? '<br>' + esc(s.line2) : ''}<br>${esc(s.city || '')}, ${esc(s.state || '')} ${esc(s.zip || '')}</p>
        ${o.tracking ? `<h4>Tracking</h4><p>${esc(o.tracking)}</p>` : ''}
        <button class="btn ghost sm" id="link">Copy customer's private link</button></div></aside></div>`);
  const ask = () => $('#restock') && $('#restock').checked;
  if ($('#ship')) $('#ship').onclick = () => { const t = $('#trk').value.trim(); store.updateOrder(o.id, { status: 'fulfilled', tracking: t ? $('#carrier').value + ' ' + t : '' }, t ? `Shipped ${$('#carrier').value} ${t}${$('#notify').checked ? ' · customer emailed' : ''}` : 'Shipped'); toast('Marked as shipped'); };
  if ($('#refund')) $('#refund').onclick = () => { if (confirm(`Refund ${money(o.total)}?`)) store.updateOrder(o.id, { status: 'refunded', restock: ask() }, 'Refunded ' + money(o.total) + (ask() ? ' · restocked' : '')); };
  if ($('#cancel')) $('#cancel').onclick = () => { if (confirm('Cancel this order and refund the payment?')) store.updateOrder(o.id, { status: 'cancelled', restock: ask() }, 'Cancelled' + (ask() ? ' · restocked' : '')); };
  $('#addnote').onclick = () => { const n = $('#onote').value.trim(); if (n) store.updateOrder(o.id, {}, n); };
  $('#link').onclick = () => copy(linkFor(c));
}

// ---------------- submissions ----------------
const SUB_FLOW = STATUSES.submission;
function submissions(a, params) {
  let f = params.get('f') || 'open';
  const draw = () => {
    const ss = store.submissions().filter(s => f === 'all' || (f === 'open' ? !['completed', 'cancelled'].includes(s.status) : f === 'email' ? s.emailed_status !== s.status && s.status !== 'cancelled' : s.status === f));
    $('#sl').innerHTML = `<div class="filters">${[['open', 'Open'], ['email', '✉ Needs email'], ['submitted', 'New'], ['invoiced', 'Awaiting payment'], ['in_progress', 'In progress'], ['completed', 'Completed'], ['all', 'All']].map(([k, l]) => `<button data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="table-wrap"><table><tr><th>Code</th><th>Submitted</th><th>Customer</th><th>Cards</th><th class="num">Invoice</th><th>Status</th></tr>
      ${ss.map(s => `<tr class="click" data-href="#/submission/${s.id}"><td><b>${esc(s.code)}</b>${s.emailed_status !== s.status && s.status !== 'cancelled' ? ' <span title="Not emailed about this status">✉</span>' : ''}</td><td class="small">${fmtDate(s.created)}</td>
        <td>${esc((store.customer(s.customer_id) || {}).name || '')}</td><td>${s.cards.length}</td><td class="num">${money0(s.invoice.total)} ${s.invoice.status === 'paid' ? '<span class="pill ok">Paid</span>' : ''}</td><td>${pill(s.status)}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nothing here.</td></tr>'}</table></div>`;
    $$('[data-f]').forEach(b => b.onclick = () => { f = b.dataset.f; draw(); }); bindRows();
  };
  shell('subs', 'Restoration submissions', '<a class="btn red sm" href="#/new">+ New submission</a>', `<p class="muted">This week's queue: <b>${store.queueThisWeek()}</b> of ${store.content().capacity} cards.</p><div id="sl"></div>`);
  draw();
}
function emailText(s, c) {
  const st = STATUS_LABEL[s.status];
  const pay = s.status === 'invoiced' ? `\n\nYour invoice total is ${money0(s.invoice.total)}. Pay securely here: ${SITE}#/pay/${s.code}?t=${c.token}` : '';
  return { subject: `${s.code}: ${st}`, body: `Hi ${c.name.split(' ')[0]},\n\nUpdate on your submission ${s.code}: ${st}.${s.public_notes ? '\n\n' + s.public_notes : ''}${pay}\n\nSee every card, photo and update on your private page:\n${linkFor(c)}\n\nShiny Asset Exchange` };
}
function submission([id]) {
  const s = JSON.parse(JSON.stringify(store.submission(id) || null)); if (!s) return shell('subs', 'Not found', '', '');
  const c = store.customer(s.customer_id) || {}; const pr = store.content().prices;
  const draw = () => {
    const q = quote(pr, s.cards);
    shell('subs', 'Submission ' + esc(s.code), `<a class="btn ghost sm" href="#/submissions">← Submissions</a>`, `
      ${s.emailed_status !== s.status && s.status !== 'cancelled' ? `<div class="callout" style="border-color:var(--warn)"><b>✉ ${esc(c.name)} hasn't been emailed about “${esc(STATUS_LABEL[s.status])}”.</b>
        <div class="row" style="margin-top:8px"><a class="btn sm red" id="mail" href="#">Email the customer</a><button class="btn ghost sm" id="marked">Mark as emailed</button></div></div>` : ''}
      <div class="cols-main"><div>
        <div class="panel"><div class="grid2"><div class="field"><label>Status</label><select id="st">${SUB_FLOW.map(k => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}</select></div>
          <div class="field"><label>Delivery</label><select id="del"><option value="ship" ${s.delivery === 'ship' ? 'selected' : ''}>Shipped in</option><option value="dropoff" ${s.delivery === 'dropoff' ? 'selected' : ''}>Austin drop-off</option></select></div></div>
          <div class="field"><label>Note the customer sees</label><textarea id="pub">${esc(s.public_notes || '')}</textarea></div>
          <div class="field"><label>Internal note (never shown to the customer)</label><textarea id="int">${esc(s.internal_notes || '')}</textarea></div>
          ${s.customer_notes ? `<p class="small muted"><b>From the customer:</b><br>${esc(s.customer_notes).replace(/\n/g, '<br>')}</p>` : ''}</div>
        <div class="panel" style="margin-top:16px"><h3>Cards</h3>${s.cards.map((cd, i) => `<div class="card-entry" data-i="${i}">
          <div class="top"><b>Card ${i + 1}</b><span>${money0(q.lines[i].total)}</span></div>
          <div class="row" style="align-items:flex-start">${['front', 'back'].map(side => cd.photos && cd.photos[side] ? `<a href="${cd.photos[side]}" target="_blank"><img src="${cd.photos[side]}" alt="${side}" style="width:70px;height:98px;object-fit:cover;border-radius:4px"></a>` : '').join('')}
          <div class="grow"><div class="grid2"><div class="field"><label>Name</label><input data-k="name" value="${esc(cd.name)}"></div><div class="field"><label>Set · number · year</label><input data-k="details" value="${esc(cd.details || '')}"></div></div>
          <div class="grid3"><div class="field"><label>Value $</label><input data-k="value" inputmode="decimal" value="${cd.value || ''}"></div>
            <div class="field"><label>Service</label><select data-k="service"><option value="restoration" ${cd.service === 'restoration' ? 'selected' : ''}>Restoration${+cd.value ? ' · ' + tierFor(pr, cd.value).name : ''}</option><option value="cleaning" ${cd.service === 'cleaning' ? 'selected' : ''}>Cleaning</option></select></div>
            <div class="field"><label>Card status</label><select data-k="status">${SUB_FLOW.map(k => `<option value="${k}" ${cd.status === k ? 'selected' : ''}>${STATUS_LABEL[k]}</option>`).join('')}</select></div></div>
          <div class="row">${pr.addons.map(a => `<label class="check" style="margin:0 10px 0 0"><input type="checkbox" data-addon="${a.key}" ${(cd.addons || []).includes(a.key) ? 'checked' : ''}> ${esc(a.name)}</label>`).join('')}</div>
          ${cd.damage ? `<p class="small muted" style="margin:8px 0 0"><b>Customer says:</b> ${esc(cd.damage)}</p>` : ''}</div></div></div>`).join('')}</div>
        <button class="btn red" id="save" style="margin-top:16px">Save changes</button>
        <div class="panel" style="margin-top:16px"><h3>History</h3><ul class="timeline">${s.history.slice().reverse().map(h => `<li class="done">${esc(STATUS_LABEL[h.status] || h.status)} <span class="small dim">· ${fmtDate(h.at, true)}</span>${h.note ? `<br><span class="small muted">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul></div>
      </div><aside>
        <div class="panel"><h3>Invoice</h3>${q.lines.map((l, i) => `<div class="sum small"><span>${esc(l.card.name || 'Card ' + (i + 1))}</span><span>${money0(l.total)}</span></div>`).join('')}
          ${q.perSubmission.map(a => `<div class="sum small"><span>${esc(a.name)}</span><span>${money0(a.price)}</span></div>`).join('')}
          <div class="sum total"><span>Total</span><span>${money0(q.total)}</span></div>
          <p style="margin-top:10px">${s.invoice.status === 'paid' ? `<span class="pill ok">Paid</span> <span class="small muted">${fmtDate(s.invoice.paid_at, true)}${s.invoice.payment ? ' · card ' + esc(s.invoice.payment.last4) : s.invoice.method ? ' · ' + esc(s.invoice.method) : ''}</span>` : s.status === 'invoiced' ? '<span class="pill warn">Sent · awaiting payment</span>' : '<span class="pill">Not sent yet</span>'}</p>
          ${s.invoice.status !== 'paid' ? `<button class="btn red block" id="sendInv">${s.status === 'invoiced' ? 'Re-send invoice' : 'Send invoice'}</button>
            <div class="row" style="margin-top:8px"><select id="method" class="grow"><option>Cash</option><option>Trade (85% of card value)</option><option>Other</option></select><button class="btn ghost sm" id="paidMan">Mark paid</button></div>
            <p class="small muted" style="margin-top:8px">The customer pays by card on their private page (Stripe). Live: a Stripe payment link is created for the invoice.</p>` : ''}</div>
        <div class="panel" style="margin-top:16px"><h3>Customer</h3><p><a href="#/customer/${c.id}"><b>${esc(c.name)}</b></a><br><a href="mailto:${esc(c.email)}">${esc(c.email)}</a>${c.phone ? '<br>' + esc(c.phone) : ''}</p>
          <button class="btn ghost sm" id="link">Copy private link</button> <a class="btn ghost sm" href="${linkFor(c)}" target="_blank">Open ↗</a></div></aside></div>`);
    const st = () => store.updateSubmission(s.id, collect());
    $$('.card-entry').forEach(el => {
      const cd = s.cards[+el.dataset.i];
      $$('[data-k]', el).forEach(inp => inp.onchange = () => { cd[inp.dataset.k] = inp.dataset.k === 'value' ? +inp.value || 0 : inp.value; if (['value', 'service'].includes(inp.dataset.k)) { keep(); draw(); } });
      $$('[data-addon]', el).forEach(cb => cb.onchange = () => { cd.addons = cb.checked ? [...(cd.addons || []), cb.dataset.addon] : cd.addons.filter(k => k !== cb.dataset.addon); keep(); draw(); });
      if (window.RRCardSearch) RRCardSearch.attach($('[data-k=name]', el), { details: $('[data-k=details]', el), onPick: () => { cd.name = $('[data-k=name]', el).value; cd.details = $('[data-k=details]', el).value; } });
    });
    $$('input,textarea,select').forEach(i => { i.addEventListener('focus', () => busy = true); i.addEventListener('blur', () => busy = false); });
    $('#save').onclick = () => { busy = false; Object.assign(s, store.updateSubmission(s.id, collect())); toast('Saved'); };
    $('#link').onclick = () => copy(linkFor(c));
    if ($('#mail')) $('#mail').onclick = e => { e.preventDefault(); busy = false; const m = emailText(store.submission(s.id), c); location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`; store.updateSubmission(s.id, { emailed_status: store.submission(s.id).status }); };
    if ($('#marked')) $('#marked').onclick = () => { busy = false; store.updateSubmission(s.id, { emailed_status: s.status }); };
    if ($('#sendInv')) $('#sendInv').onclick = () => {
      busy = false; const saved = store.updateSubmission(s.id, { ...collect(), status: 'invoiced' });
      const m = emailText(saved, c); store.updateSubmission(s.id, { emailed_status: 'invoiced' });
      location.href = `mailto:${encodeURIComponent(c.email)}?subject=${encodeURIComponent(`Invoice for ${s.code} — ${money0(saved.invoice.total)}`)}&body=${encodeURIComponent(m.body)}`;
    };
    if ($('#paidMan')) $('#paidMan').onclick = () => { busy = false; const cur = store.submission(s.id); store.updateSubmission(s.id, { invoice: { ...cur.invoice, status: 'paid', paid_at: new Date().toISOString(), method: $('#method').value }, status: ['submitted', 'invoiced'].includes(cur.status) ? 'paid' : cur.status }); };
  };
  const keep = () => { if (!$('#st')) return; s.status = $('#st').value; s.delivery = $('#del').value; s.public_notes = $('#pub').value; s.internal_notes = $('#int').value; $$('.card-entry').forEach(el => { const cd = s.cards[+el.dataset.i]; $$('[data-k]', el).forEach(inp => cd[inp.dataset.k] = inp.dataset.k === 'value' ? +inp.value || 0 : inp.value); }); };
  const collect = () => { keep(); return { status: s.status, delivery: s.delivery, public_notes: s.public_notes, internal_notes: s.internal_notes, cards: s.cards }; };
  draw();
}
function newSubmission() {
  const custs = store.customers();
  shell('new', 'New submission', '', `<form id="nf" class="panel" style="max-width:720px">
    <div class="field"><label>Existing customer</label><select id="cu"><option value="">— New customer —</option>${custs.map(c => `<option value="${c.id}">${esc(c.name)} · ${esc(c.email)}</option>`).join('')}</select></div>
    <div class="grid3" id="nc"><div class="field"><label>Name</label><input id="n"></div><div class="field"><label>Email</label><input id="e" type="email"></div><div class="field"><label>Phone</label><input id="ph"></div></div>
    <div class="field"><label>Delivery</label><select id="d"><option value="dropoff">Austin drop-off (walk-in)</option><option value="ship">Shipped in</option></select></div>
    <div class="field"><label>Cards — one per line: name, value $, service (r = restoration, c = cleaning)</label><textarea id="cards" placeholder="Charizard Base Set, 420, r&#10;Blastoise, 180, c" style="min-height:120px"></textarea></div>
    <div class="err hidden" id="ne"></div><button class="btn red">Create submission</button></form>`);
  $('#cu').onchange = () => $('#nc').classList.toggle('hidden', !!$('#cu').value);
  $('#nf').onsubmit = e => {
    e.preventDefault(); const err = $('#ne');
    const ex = $('#cu').value && store.customer($('#cu').value);
    const cust = ex ? { name: ex.name, email: ex.email, phone: ex.phone } : { name: $('#n').value.trim(), email: $('#e').value.trim(), phone: $('#ph').value.trim() };
    const cards = $('#cards').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => { const [name, value, sv] = l.split(',').map(x => (x || '').trim()); return { name, details: '', value: +String(value).replace(/[^\d.]/g, '') || 0, service: /^c/i.test(sv || '') ? 'cleaning' : 'restoration', addons: [], damage: '', photos: {} }; });
    if (!cust.name || !cust.email) { err.textContent = 'Add the customer name and email.'; err.classList.remove('hidden'); return; }
    if (!cards.length) { err.textContent = 'Add at least one card.'; err.classList.remove('hidden'); return; }
    const r = store.submit({ customer: cust, delivery: $('#d').value, cards, notes: 'Entered by admin' });
    location.hash = '#/submission/' + r.submission.id;
  };
}

// ---------------- customers ----------------
function customers() {
  let q = '';
  const draw = () => {
    const cs = store.customers().filter(c => !q || (c.name + c.email + c.phone).toLowerCase().includes(q));
    $('#cl').innerHTML = `<div class="table-wrap"><table><tr><th>Name</th><th>Email</th><th class="num">Orders</th><th class="num">Spent</th><th class="num">Submissions</th></tr>
      ${cs.map(c => { const os = store.orders().filter(o => o.customer_id === c.id && o.status !== 'refunded' && o.status !== 'cancelled'); const ss = store.submissions().filter(s => s.customer_id === c.id);
        return `<tr class="click" data-href="#/customer/${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.email)}</td><td class="num">${os.length}</td><td class="num">${money0(os.reduce((s, o) => s + o.total, 0) + ss.filter(s => s.invoice.status === 'paid').reduce((t, s) => t + s.invoice.total, 0))}</td><td class="num">${ss.length}</td></tr>`; }).join('')}</table></div>`;
    bindRows();
  };
  shell('customers', 'Customers', '<input class="search" id="q" placeholder="Search">', '<div id="cl"></div>');
  $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  draw();
}
function customer([id]) {
  const c = store.customer(id); if (!c) return shell('customers', 'Not found', '', '');
  const os = store.orders().filter(o => o.customer_id === c.id), ss = store.submissions().filter(s => s.customer_id === c.id);
  shell('customers', esc(c.name), '<a class="btn ghost sm" href="#/customers">← Customers</a>', `<div class="cols-main"><div>
      <div class="panel"><h3>Restoration submissions</h3><table>${ss.map(s => `<tr class="click" data-href="#/submission/${s.id}"><td>${esc(s.code)}</td><td class="small">${fmtDate(s.created)}</td><td>${s.cards.length} cards</td><td>${pill(s.status)}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</table></div>
      <div class="panel" style="margin-top:16px"><h3>Product orders</h3><table>${os.map(o => `<tr class="click" data-href="#/order/${o.id}"><td>${esc(o.number)}</td><td class="small">${fmtDate(o.created)}</td><td class="num">${money(o.total)}</td><td>${pill(o.status, o.status === 'paid' ? 'To ship' : null)}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</table></div>
    </div><aside><form class="panel" id="cf"><div class="field"><label>Name</label><input id="n" value="${esc(c.name)}"></div><div class="field"><label>Email</label><input id="e" value="${esc(c.email)}"></div>
      <div class="field"><label>Phone</label><input id="p" value="${esc(c.phone)}"></div><div class="field"><label>Internal notes</label><textarea id="no">${esc(c.notes || '')}</textarea></div><button class="btn sm">Save</button></form>
      <div class="panel" style="margin-top:16px"><h3>Private link</h3><p class="small muted">The customer sees their submissions, invoices and orders here — no password.</p>
        <div class="row"><button class="btn ghost sm" id="cp">Copy link</button><a class="btn ghost sm" href="${linkFor(c)}" target="_blank">Open ↗</a><button class="btn ghost sm" id="nl">New link</button></div></div></aside></div>`);
  bindRows();
  $('#cf').onsubmit = e => { e.preventDefault(); store.saveCustomer(c.id, { name: $('#n').value.trim(), email: $('#e').value.trim().toLowerCase(), phone: $('#p').value.trim(), notes: $('#no').value }); toast('Saved'); };
  $('#cp').onclick = () => copy(linkFor(c));
  $('#nl').onclick = () => { if (confirm('Make a new link? The old one stops working.')) { store.newLink(c.id); toast('New link made'); } };
}

// ---------------- website & prices ----------------
function site() {
  const c = JSON.parse(JSON.stringify(store.content()));
  const draw = () => {
    shell('site', 'Website & prices', '', `<form id="sf"><div class="cols2">
      <div class="panel"><h3>Announcement bar</h3><div class="field"><input id="ann" value="${esc(c.announcement)}" placeholder="Leave blank to hide"></div>
        <h3 style="margin-top:12px">Home page</h3>${['kicker', 'title', 'sub', 'line'].map(k => `<div class="field"><label>${{ kicker: 'Small heading', title: 'Headline', sub: 'Line 1', line: 'Line 2' }[k]}</label><input data-hero="${k}" value="${esc(c.hero[k])}"></div>`).join('')}
        <div class="field"><label>Bestseller blurb</label><textarea id="best">${esc(c.bestseller)}</textarea></div></div>
      <div class="panel"><h3>Restoration prices</h3><table><tr><th>Tier</th><th>From $</th><th>To $</th><th>Price $ or %</th></tr>
        ${c.prices.tiers.map((t, i) => `<tr data-t="${i}"><td><input data-tk="name" value="${esc(t.name)}"></td><td><input data-tk="min" value="${t.min}"></td><td><input data-tk="max" value="${t.max ?? ''}" placeholder="and up"></td><td><input data-tk="amt" value="${t.pct ? t.pct + '%' : t.price}"></td></tr>`).join('')}</table>
        <div class="field" style="margin-top:12px"><label>Cleaning only, $ per card</label><input id="clean" value="${c.prices.cleaning}"></div>
        <h3>Add-ons</h3>${c.prices.addons.map((a, i) => `<div class="grid3" data-a="${i}"><div class="field"><label>Name</label><input data-ak="name" value="${esc(a.name)}"></div><div class="field"><label>Price $</label><input data-ak="price" value="${a.price}"></div><div class="field"><label>Per</label><select data-ak="unit">${['card', 'slab', 'submission'].map(u => `<option ${a.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>`).join('')}
        <p class="small muted">Prices update the Pricing page, the Free Card Review quiz, the submission form's quote and new invoices.</p></div>
      <div class="panel"><h3>Queue & shop</h3><div class="field"><label>Cards accepted per week</label><input id="cap" value="${c.capacity}"></div>
        <div class="grid3"><div class="field"><label>Shipping $</label><input id="ship" value="${c.shop.shipping}"></div><div class="field"><label>Free over $</label><input id="free" value="${c.shop.free_over || ''}" placeholder="never"></div><div class="field"><label>Sales tax %</label><input id="tax" value="${c.shop.tax_rate}"></div></div></div>
      <div class="panel"><h3>Payments</h3><div class="field"><label>Provider</label><select id="prov"><option value="stripe">Stripe</option></select></div>
        <div class="field"><label>Mode</label><select id="mode"><option value="demo" ${c.payments.mode === 'demo' ? 'selected' : ''}>Demo (no real charges)</option><option value="test" ${c.payments.mode === 'test' ? 'selected' : ''}>Stripe test mode</option><option value="live" ${c.payments.mode === 'live' ? 'selected' : ''}>Stripe live</option></select></div>
        <div class="field"><label>Stripe publishable key (pk_…)</label><input id="pk" value="${esc(c.payments.publishable_key)}" placeholder="pk_test_…"></div>
        <p class="small muted">The secret key never goes here — it lives in the server function that creates Stripe Checkout sessions (see README). In this demo every mode uses the built-in test card form.</p></div>
      <div class="panel"><h3>Contact & drop-off</h3><div class="grid2"><div class="field"><label>Email</label><input id="ce" value="${esc(c.contact.email)}"></div><div class="field"><label>Phone</label><input id="cph" value="${esc(c.contact.phone)}"></div></div>
        <div class="field"><label>Mailing address (one line each)</label><textarea id="caddr">${esc(c.contact.address.join('\n'))}</textarea></div>
        <div class="field"><label>Drop-off shop</label><input id="dn" value="${esc(c.dropoff.name)}"></div><div class="field"><label>Drop-off address (one line each)</label><textarea id="da">${esc(c.dropoff.address.join('\n'))}</textarea></div><div class="field"><label>Drop-off phone</label><input id="dp" value="${esc(c.dropoff.phone)}"></div></div>
      <div class="panel"><h3>Demo data</h3><p class="small muted">Start over with the original products, stock and sample orders. This only affects this browser.</p><button type="button" class="btn ghost" id="reset">Reset demo data</button>
        <button type="button" class="btn ghost" id="defaults" style="margin-left:6px">Restore built-in prices</button></div>
      </div><div style="position:sticky;bottom:0;padding:14px 0;background:var(--bg)"><button class="btn red">Save website settings</button> <span class="err hidden" id="serr"></span></div></form>`);
    $('#reset').onclick = () => { if (confirm('Reset all demo data in this browser?')) { store.reset(); toast('Demo data reset'); } };
    $('#defaults').onclick = () => { c.prices = JSON.parse(JSON.stringify(DEFAULT_CONTENT.prices)); draw(); toast('Built-in prices loaded — Save to keep them'); };
    $$('#sf input,#sf textarea,#sf select').forEach(i => { i.addEventListener('focus', () => busy = true); i.addEventListener('blur', () => busy = false); });
    $('#sf').onsubmit = e => {
      e.preventDefault(); busy = false; const v = id => $('#' + id).value.trim(), lines = id => v(id).split('\n').map(x => x.trim()).filter(Boolean);
      c.announcement = v('ann'); $$('[data-hero]').forEach(i => c.hero[i.dataset.hero] = i.value.trim()); c.bestseller = v('best');
      $$('[data-t]').forEach(tr => { const t = c.prices.tiers[+tr.dataset.t]; const g = k => $(`[data-tk=${k}]`, tr).value.trim();
        t.name = g('name'); t.min = +g('min') || 0; t.max = g('max') === '' ? null : +g('max'); const amt = g('amt');
        if (amt.endsWith('%')) { t.pct = +amt.replace('%', '') || 0; delete t.price; } else { t.price = +amt.replace(/[^\d.]/g, '') || 0; delete t.pct; } });
      c.prices.cleaning = +v('clean') || 0;
      $$('[data-a]').forEach(row => { const a = c.prices.addons[+row.dataset.a]; a.name = $('[data-ak=name]', row).value.trim(); a.price = +$('[data-ak=price]', row).value || 0; a.unit = $('[data-ak=unit]', row).value; });
      c.capacity = parseInt(v('cap'), 10) || 40; c.shop = { shipping: +v('ship') || 0, free_over: +v('free') || 0, tax_rate: +v('tax') || 0 };
      c.payments = { provider: 'stripe', mode: v('mode'), publishable_key: v('pk') };
      if (c.payments.publishable_key && !/^pk_(test|live)_/.test(c.payments.publishable_key)) { const er = $('#serr'); er.textContent = 'That doesn’t look like a publishable key (pk_test_… or pk_live_…). Never paste the secret sk_ key here.'; er.classList.remove('hidden'); return; }
      c.contact = { email: v('ce'), phone: v('cph'), address: lines('caddr') }; c.dropoff = { name: v('dn'), address: lines('da'), phone: v('dp') };
      store.saveContent(c); toast('Website updated');
    };
  };
  draw();
}

router();
