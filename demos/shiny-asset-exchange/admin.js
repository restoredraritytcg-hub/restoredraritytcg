// Shiny Asset Exchange demo — admin portal (hash router).
import { store, money, money0, esc, fmtDate, stockState, slug, methodsOf, STATUS_LABEL, MOVE_REASONS, DEFAULT_CONTENT } from './data.js';
import * as PS from './portal/demostore.js';
import * as SHIP from './shipping.js';
const PORTAL = 'portal/admin.html';

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
    toShip: store.orders().filter(o => o.status === 'paid').length, labels: SHIP.queue().length,
    low: vs.filter(v => stockState(v).key === 'low').length, out: vs.filter(v => stockState(v).key === 'out').length,
    newSubs: PS.db().submissions.filter(s => s.status === 'submitted').length,
  };
}
function shell(active, title, actions, body) {
  const n = counts();
  const nl = (h, l, badge, key) => `<a class="nl ${active === key ? 'on' : ''}" href="#/${h}">${l}${badge ? `<span class="badge" style="position:static">${badge}</span>` : ''}</a>`;
  root.innerHTML = `<div class="adm"><nav class="side"><a class="logo" href="#/"><img src="${LOGO}" alt="">SAE Admin</a>
      ${nl('', 'Dashboard', 0, 'dash')}
      <div class="grp">Shop</div>${nl('orders', 'Orders', n.toShip, 'orders')}${nl('ship', 'Shipping · Shippo', n.labels, 'ship')}${nl('inventory', 'Inventory', n.low + n.out, 'inventory')}${nl('stock', 'Stock history', 0, 'stock')}
      <div class="grp">Restoration</div><a class="nl" href="${PORTAL}">Work portal ↗${n.newSubs ? `<span class="badge" style="position:static">${n.newSubs}</span>` : ''}</a>
      <a class="nl" href="${PORTAL}#/new">+ New submission ↗</a><a class="nl" href="portal/scan.html">Scan station ↗</a>
      <div class="grp">People</div>${nl('customers', 'Customers', 0, 'customers')}
      <div class="grp">Website</div>${nl('site', 'Prices & shop settings', 0, 'site')}<a class="nl" href="${PORTAL}#/site/announcement">Announcement, news, events, Instagram ↗</a><a class="nl" href="index.html" target="_blank">View store ↗</a>
      <div class="grp">Demo</div><a class="nl" href="#" id="signout">Sign out</a></nav>
    <main class="adm-main"><div class="demo-flag" style="margin-bottom:16px">Demo build — data is saved in this browser only. Orders placed on the <a href="index.html" target="_blank">store</a> show up here and reduce stock straight away. Restorations run in the <a href="${PORTAL}">work portal</a>.</div>
      <div class="adm-top"><h1>${title}</h1><div class="row">${actions || ''}<button class="btn ghost sm" id="refresh">↻ Refresh</button></div></div>${body}</main></div>`;
  $('#signout').onclick = e => { e.preventDefault(); try { sessionStorage.removeItem('sae-admin'); } catch {} login(); };
  $('#refresh').onclick = () => router();
}

// ---------------- router ----------------
const routes = { '': dash, orders, order, ship: shipping, inventory, product, stock, customers, customer, site };
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
  const n = counts(), c = store.content(), q = PS.queueThisWeek();
  const vs = store.products({ all: true }).flatMap(p => p.variants.map(v => ({ p, v })));
  const alerts = vs.filter(({ p, v }) => p.status === 'active' && stockState(v).key !== 'in').sort((a, b) => a.v.stock - b.v.stock);
  const retail = vs.reduce((s, { v }) => s + v.stock * v.price, 0);
  const sold = {}; month.forEach(o => o.items.forEach(i => { sold[i.title] = (sold[i.title] || 0) + i.qty; }));
  shell('dash', 'Dashboard', `<a class="btn sm" href="#/inventory">Manage inventory</a>`, `
    <div class="stats">
      <div class="stat"><div class="v">${money0(today.reduce((s, o) => s + o.total, 0))}</div><div class="l">Sales today · ${today.length} order${today.length === 1 ? '' : 's'}</div></div>
      <div class="stat"><div class="v">${money0(month.reduce((s, o) => s + o.total, 0))}</div><div class="l">Last 30 days · ${month.length} orders</div></div>
      <div class="stat click" onclick="location.hash='#/ship'" style="cursor:pointer"><div class="v">${n.labels}</div><div class="l">Labels to buy (orders + card returns)</div></div>
      <div class="stat"><div class="v">${q}/${c.capacity}</div><div class="l">Cards in this week's queue</div></div></div>
    <div class="cols2">
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Stock alerts</h3><a class="small link" href="#/inventory?f=alert">See all</a></div>
        ${alerts.length ? `<table style="margin-top:8px">${alerts.slice(0, 8).map(({ p, v }) => `<tr class="click" data-href="#/product/${p.id}"><td>${esc(p.title)}${v.title ? ` <span class="muted">· ${esc(v.title)}</span>` : ''}</td><td class="num">${v.stock}</td><td>${pill(stockState(v).key, stockState(v).key === 'out' ? 'Sold out' : 'Low')}</td></tr>`).join('')}</table>`
          : '<p class="muted">Everything is above its low-stock level.</p>'}
        <p class="small muted" style="margin:10px 0 0">Stock on hand at retail: <b>${money0(retail)}</b></p></div>
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Recent orders</h3><a class="small link" href="#/orders">All orders</a></div>
        <table style="margin-top:8px">${os.slice(0, 6).map(o => `<tr class="click" data-href="#/order/${o.id}"><td>${esc(o.number)}<br><span class="small muted">${fmtDate(o.created, true)}</span></td><td>${esc((store.customer(o.customer_id) || {}).name || '')}</td><td class="num">${money(o.total)}</td><td>${pill(o.status, o.status === 'paid' ? 'To ship' : null)}</td></tr>`).join('') || '<tr><td class="muted">No orders yet.</td></tr>'}</table></div>
      <div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Restoration queue</h3><a class="small link" href="${PORTAL}">Open the work portal ↗</a></div>
        <table style="margin-top:8px">${PS.db().submissions.filter(s => s.status !== 'completed').sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6).map(s => { const c = PS.db().customers.find(x => x.id === s.customer_id) || {}; const n = PS.db().cards.filter(k => k.submission_id === s.id).length;
          return `<tr class="click" data-href="${PORTAL}#/submission/${s.id}"><td>${esc(s.code)}${(s.emailed_status || 'submitted') !== s.status ? ' <span title="Customer not emailed about this status">✉</span>' : ''}</td><td>${esc(c.name || '')}</td><td>${n} card${n === 1 ? '' : 's'}</td><td>${pill(s.status)}</td></tr>`; }).join('') || '<tr><td class="muted">Nothing in the queue.</td></tr>'}</table></div>
      <div class="panel"><h3>Best sellers · 30 days</h3>${Object.entries(sold).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, n]) => `<div class="sum"><span>${esc(t)}</span><span>${n} sold</span></div>`).join('') || '<p class="muted">No sales yet.</p>'}</div>
    </div>`);
  bindRows();
}
function bindRows() { $$('tr[data-href]').forEach(tr => tr.onclick = () => { const h = tr.dataset.href; if (h.startsWith('#')) location.hash = h; else location.href = h; }); }

// ---------------- shipping (Shippo) ----------------
function shipping(a, params) {
  const cfg = SHIP.shipCfg();
  let rows = SHIP.queue(), picked = new Set(rows.map(r => r.kind + r.id)), open = null, tab = params.get('t') || 'queue', bulk = null;
  const kindPill = k => `<span class="pill ${k === 'return' ? 'warn' : 'info'}">${k === 'return' ? 'Card return' : 'Order'}</span>`;
  const link = r => r.kind === 'order' ? '#/order/' + r.id : PORTAL + '#/submission/' + r.id;
  const stPill = sh => `<span class="pill ${sh.status === 'DELIVERED' ? 'ok' : sh.status === 'PRE_TRANSIT' ? '' : 'info'}">${esc(SHIP.statusLabel(sh))}</span>`;
  const draw = () => {
    const sel = rows.filter(r => picked.has(r.kind + r.id)), all = SHIP.shipped(), moving = all.filter(x => x.sh.status !== 'DELIVERED');
    $('#shipq').innerHTML = `
      <div class="filters">${[['queue', `Needs a label (${rows.length})`], ['moving', `On the way (${moving.length})`], ['all', 'All labels']].map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${tab === 'queue' ? `
      <div class="row" style="justify-content:space-between;margin:6px 0 12px">
        <p class="small muted" style="margin:0">Paid product orders and restored cards going home. Check the box and weight, then buy the label — Shippo emails the customer their tracking. “Buy labels” uses each customer's chosen service (card returns: your preferred service), else the cheapest.</p>
        <div class="row"><button class="btn red sm" id="bulk" ${sel.length ? '' : 'disabled'}>Buy ${sel.length} label${sel.length === 1 ? '' : 's'}</button>
          <button class="btn ghost sm" id="csv" ${sel.length ? '' : 'disabled'} title="For Pirate Ship or another label tool">Spreadsheet</button></div></div>
      ${bulk ? `<div class="panel" style="margin-bottom:12px;border-color:var(--gold)">${bulk}</div>` : ''}
      <div class="table-wrap"><table><tr><th><input type="checkbox" id="all" ${sel.length === rows.length && rows.length ? 'checked' : ''} aria-label="Tick all"></th><th>Shipment</th><th>Ship to</th><th>Box</th><th class="num">Weight</th><th class="num">Insure $</th><th></th></tr>
      ${rows.map((r, i) => `<tr><td><input type="checkbox" data-pick="${i}" ${picked.has(r.kind + r.id) ? 'checked' : ''} aria-label="Tick ${esc(r.ref)}"></td>
        <td>${kindPill(r.kind)}<br><a href="${link(r)}"><b>${esc(r.ref)}</b></a><div class="small muted">${esc(r.contents)}</div></td>
        <td><b>${esc(r.name || '')}</b>${SHIP.addressOk(r.address) ? `<div class="small muted">${esc(r.address.line1)}${r.address.line2 ? ', ' + esc(r.address.line2) : ''}<br>${esc(r.address.city)}, ${esc(r.address.state)} ${esc(r.address.zip)}</div>` : `<div class="err small">Address missing — ${r.kind === 'return' ? 'add it on the submission' : 'check the order'}</div>`}
          <div class="small dim">Wants: ${esc(r.prefer)}</div></td>
        <td><select data-box="${i}" style="min-width:150px">${cfg.boxes.map(b => `<option value="${b.key}" ${b.key === r.box ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></td>
        <td class="num"><input class="stock-input" data-oz="${i}" value="${r.oz}" inputmode="decimal" aria-label="Weight (oz)"><div class="small dim">oz</div></td>
        <td class="num"><input class="stock-input" data-ins="${i}" value="${r.insured || ''}" placeholder="—" inputmode="decimal" aria-label="Insured value"></td>
        <td><button class="btn red sm" data-rates="${i}" ${SHIP.addressOk(r.address) ? '' : 'disabled'}>Get rates</button></td></tr>
        ${open === i ? `<tr><td></td><td colspan="6"><div id="rw"></div></td></tr>` : ''}`).join('') || '<tr><td colspan="7" class="muted">Nothing needs a label. Paid orders and restorations set to “Ready for pickup / shipping” (shipped back) show up here.</td></tr>'}
      </table></div>` : `
      <div class="table-wrap"><table><tr><th>Shipment</th><th>To</th><th>Label</th><th>Status</th><th></th></tr>
      ${(tab === 'moving' ? moving : all).map((x, i) => `<tr><td>${kindPill(x.kind)}<br><a href="${link(x)}"><b>${esc(x.ref)}</b></a></td><td>${esc(x.name || '')}<div class="small muted">${esc(x.sh.to?.city || '')}, ${esc(x.sh.to?.state || '')}</div></td>
        <td>${SHIP.trackingLink(x.sh)}<div class="small muted">${esc(x.sh.service)} · ${money(x.sh.cost)}${x.sh.test ? ' · test' : ''}</div></td>
        <td>${stPill(x.sh)}<div class="small muted">${esc(x.sh.status_details || '')}${x.sh.eta && x.sh.status !== 'DELIVERED' ? ` · ETA ${fmtDate(x.sh.eta)}` : ''}</div></td>
        <td><div class="row" style="gap:6px;flex-wrap:nowrap"><button class="btn ghost sm" data-label="${i}">Print label</button>
          ${x.sh.status === 'PRE_TRANSIT' ? `<button class="btn ghost sm" data-void="${i}">Void</button>` : ''}
          ${x.sh.status !== 'DELIVERED' && SHIP.shipCfg().shippo.mode === 'demo' ? `<button class="btn sm" data-scan="${i}" title="Demo: stands in for Shippo's tracking webhook">Simulate scan</button>` : ''}</div></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No labels here yet.</td></tr>'}
      </table></div>`}`;
    $$('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; open = null; draw(); });
    if (tab !== 'queue') {
      const list = tab === 'moving' ? moving : all;
      $$('[data-label]').forEach(b => b.onclick = () => SHIP.openLabel(list[+b.dataset.label].sh));
      $$('[data-void]').forEach(b => b.onclick = async () => { const x = list[+b.dataset.void]; if (!confirm(`Void label ${x.sh.tracking}? Shippo refunds unused labels.`)) return; busy = false; await SHIP.voidLabel(x.kind, x.id, x.sh); rows = SHIP.queue(); toast('Label voided'); draw(); });
      $$('[data-scan]').forEach(b => b.onclick = () => { const x = list[+b.dataset.scan]; busy = false; SHIP.applyTracking(x.kind, x.id, x.sh, SHIP.nextScan(x.sh)); draw(); });
      return;
    }
    $$('[data-pick]').forEach(cb => cb.onchange = () => { const r = rows[+cb.dataset.pick]; cb.checked ? picked.add(r.kind + r.id) : picked.delete(r.kind + r.id); draw(); });
    $('#all') && ($('#all').onchange = e => { picked = new Set(e.target.checked ? rows.map(r => r.kind + r.id) : []); draw(); });
    $$('[data-box]').forEach(s => s.onchange = () => { const r = rows[+s.dataset.box], ob = cfg.boxes.find(b => b.key === r.box), nb = cfg.boxes.find(b => b.key === s.value); r.oz = Math.max(1, r.oz - (ob ? ob.oz : 0) + nb.oz); r.box = s.value; draw(); });
    $$('[data-oz]').forEach(i => { i.onfocus = () => busy = true; i.onchange = () => { busy = false; rows[+i.dataset.oz].oz = Math.max(1, Math.ceil(+i.value || 1)); }; });
    $$('[data-ins]').forEach(i => { i.onfocus = () => busy = true; i.onchange = () => { busy = false; rows[+i.dataset.ins].insured = Math.round(+i.value || 0); }; });
    $$('[data-rates]').forEach(b => b.onclick = () => { open = +b.dataset.rates; draw(); busy = true;
      SHIP.rateWidget($('#rw'), rows[open], { btn: 'red', onDone: r => { busy = false; toast(`Label bought for ${r.ref}`); open = null; rows = SHIP.queue(); draw(); } }); });
    $('#csv') && ($('#csv').onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([SHIP.pirateShipCsv(sel)], { type: 'text/csv' })); a.download = `shipments-${new Date().toISOString().slice(0, 10)}.csv`; a.click(); });
    $('#bulk') && ($('#bulk').onclick = async () => {
      const go = sel.filter(r => SHIP.addressOk(r.address)); busy = true; let total = 0; const done = [];
      for (const r of go) { bulk = `Buying ${done.length + 1} of ${go.length}… (${esc(r.ref)})`; draw();
        try { const rates = await SHIP.shippo.rates(r), rate = rates.find(x => `${x.provider} ${x.service}` === r.prefer) || rates[0]; // the service the customer paid for, else the cheapest
          SHIP.recordLabel(r, rate, await SHIP.shippo.buy(r, rate)); total += rate.amount; done.push(`${esc(r.ref)}: ${esc(rate.provider)} ${esc(rate.service)} ${money(rate.amount)}`); }
        catch (e) { done.push(`${esc(r.ref)}: ⚠ ${esc(e.message)}`); } }
      busy = false; rows = SHIP.queue(); picked = new Set(rows.map(r => r.kind + r.id));
      bulk = `<b>${go.length} label${go.length === 1 ? '' : 's'} bought · ${money(total)}</b><div class="small muted" style="margin-top:6px">${done.join('<br>')}</div><p class="small" style="margin:8px 0 0">Print them from <a class="link" href="#/ship?t=all">All labels</a>.</p>`;
      draw();
    });
  };
  shell('ship', 'Shipping', `<span class="pill ${cfg.shippo.mode === 'live' ? 'ok' : 'warn'}">Shippo · ${cfg.shippo.mode === 'demo' ? 'demo (simulated)' : cfg.shippo.mode}</span>`, '<div id="shipq"></div>');
  draw();
}

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
  const p = isNew ? { title: '', handle: '', tagline: '', body: '', images: [], collection: 'card-care', status: 'draft', featured: false, variants: [{ title: '', sku: '', price: 0, cost: null, stock: 0, low_at: 10, track: true, weight_oz: 4 }] }
    : JSON.parse(JSON.stringify(store.product(id) || {}));
  if (!isNew && !p.id) return shell('inventory', 'Not found', '', '<p>That product no longer exists.</p>');
  const varRow = (v, i) => `<div class="var-row" data-vi="${i}">
    <div><label>Option (e.g. 1 oz)</label><input data-k="title" value="${esc(v.title)}" placeholder="Leave blank if only one"></div>
    <div><label>SKU</label><input data-k="sku" value="${esc(v.sku)}"></div>
    <div><label>Price $</label><input data-k="price" inputmode="decimal" value="${v.price}"></div>
    <div><label>Cost $</label><input data-k="cost" inputmode="decimal" value="${v.cost ?? ''}" placeholder="—"></div>
    <div><label>Low at</label><input data-k="low_at" inputmode="numeric" value="${v.low_at}"></div>
    <div><label>Ship weight (oz)</label><input data-k="weight_oz" inputmode="decimal" value="${v.weight_oz ?? ''}" placeholder="packed"></div>
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
        const k = inp.dataset.k; v[k] = k === 'track' ? inp.checked : ['price', 'low_at', 'stock', 'weight_oz'].includes(k) ? +inp.value || 0 : k === 'cost' ? (inp.value === '' ? null : +inp.value) : inp.value;
      });
    });
    $$('[data-adjv]').forEach(b => b.onclick = () => adjustDialog(b.dataset.adjv));
    $$('[data-delv]').forEach(b => b.onclick = () => { if (p.variants[+b.dataset.delv].id && !confirm('Remove this option? Its stock history stays in the log.')) return; p.variants.splice(+b.dataset.delv, 1); draw(); });
    $$('[data-delimg]').forEach(b => b.onclick = () => { p.images.splice(+b.dataset.delimg, 1); keep(); draw(); });
    $('#addv').onclick = () => { keep(); p.variants.push({ title: '', sku: '', price: p.variants[0]?.price || 0, cost: null, stock: 0, low_at: 10, track: true, weight_oz: p.variants[0]?.weight_oz || 4 }); draw(); };
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
      ${o.status === 'paid' ? `<div class="panel" style="margin-top:16px"><h3>Ship this order</h3><p class="small muted">Customer chose <b>${esc((o.ship || {}).method_name || 'standard shipping')}</b>. Buy the label with Shippo on the <a class="link" href="#/ship">Shipping page</a> — or, if you shipped it another way, type the tracking number here.</p><div class="grid2"><div class="field"><label>Carrier</label><select id="carrier"><option>USPS</option><option>UPS</option><option>FedEx</option></select></div><div class="field"><label>Tracking number</label><input id="trk"></div></div>
        <label class="check"><input type="checkbox" id="notify" checked> Email the customer the tracking number</label><button class="btn red" id="ship" style="margin-top:8px">Mark as shipped</button></div>` : ''}
      ${!['refunded', 'cancelled'].includes(o.status) ? `<div class="panel" style="margin-top:16px"><h3>Refund or cancel</h3><label class="check"><input type="checkbox" id="restock" checked> Put the items back in stock</label>
        <div class="row" style="margin-top:8px"><button class="btn ghost" id="refund">Refund ${money(o.total)}</button>${o.status === 'paid' ? '<button class="btn ghost" id="cancel">Cancel order</button>' : ''}</div>
        <p class="small muted" style="margin-top:8px">Live: refunds go through Stripe automatically. Demo: recorded here only.</p></div>` : ''}
      <div class="panel" style="margin-top:16px"><h3>History</h3><ul class="timeline">${o.history.slice().reverse().map(h => `<li class="done">${esc(STATUS_LABEL[h.status] || h.status)} <span class="small dim">· ${fmtDate(h.at, true)}</span>${h.note ? `<br><span class="small muted">${esc(h.note)}</span>` : ''}</li>`).join('')}</ul>
        <div class="field"><label>Add a note</label><div class="row"><input id="onote" class="grow"><button class="btn ghost sm" id="addnote">Add</button></div></div></div>
    </div><aside>
      <div class="panel"><h3>Customer</h3><p><a href="#/customer/${c.id}"><b>${esc(c.name || '')}</b></a><br><a href="mailto:${esc(o.email)}">${esc(o.email)}</a>${c.phone ? '<br>' + esc(c.phone) : ''}</p>
        <h4>Ship to</h4><p class="muted">${esc(s.name || '')}<br>${esc(s.line1 || '')}${s.line2 ? '<br>' + esc(s.line2) : ''}<br>${esc(s.city || '')}, ${esc(s.state || '')} ${esc(s.zip || '')}</p>
        ${o.shipment ? `<h4>Shipping</h4><p>${SHIP.trackingLink(o.shipment)}<br><span class="small muted">${esc(o.shipment.service || '')}${o.shipment.cost ? ' · label ' + money(o.shipment.cost) : ''} · ${esc(SHIP.statusLabel(o.shipment))}</span></p>${o.shipment.source === 'shippo' ? `<button class="btn ghost sm" id="plabel">Print label</button>` : ''}` : o.tracking ? `<h4>Tracking</h4><p>${esc(o.tracking)}</p>` : ''}
        <button class="btn ghost sm" id="link">Copy customer's private link</button></div></aside></div>`);
  const ask = () => $('#restock') && $('#restock').checked;
  if ($('#ship')) $('#ship').onclick = () => { const t = $('#trk').value.trim(), car = $('#carrier').value;
    if (t) { store.updateOrder(o.id, { status: 'fulfilled', tracking: `${car} ${t}`, shipment: { carrier: car, service: car, tracking: t, status: 'TRANSIT', source: 'manual', shipped_at: new Date().toISOString(), events: [] } }, `Shipped ${car} ${t} (entered by hand)`); toast('Marked as shipped'); return; }
    store.updateOrder(o.id, { status: 'fulfilled' }, 'Shipped (no tracking number)'); toast('Marked as shipped'); };
  if ($('#plabel')) $('#plabel').onclick = () => SHIP.openLabel(o.shipment);
  if ($('#refund')) $('#refund').onclick = () => { if (confirm(`Refund ${money(o.total)}?`)) store.updateOrder(o.id, { status: 'refunded', restock: ask() }, 'Refunded ' + money(o.total) + (ask() ? ' · restocked' : '')); };
  if ($('#cancel')) $('#cancel').onclick = () => { if (confirm('Cancel this order and refund the payment?')) store.updateOrder(o.id, { status: 'cancelled', restock: ask() }, 'Cancelled' + (ask() ? ' · restocked' : '')); };
  $('#addnote').onclick = () => { const n = $('#onote').value.trim(); if (n) store.updateOrder(o.id, {}, n); };
  $('#link').onclick = () => copy(linkFor(c));
}

// ---------------- customers ----------------
function customers() {
  let q = '';
  const draw = () => {
    const cs = store.customers().filter(c => !q || (c.name + c.email + c.phone).toLowerCase().includes(q));
    $('#cl').innerHTML = `<div class="table-wrap"><table><tr><th>Name</th><th>Email</th><th class="num">Orders</th><th class="num">Spent</th></tr>
      ${cs.map(c => { const os = store.orders().filter(o => o.customer_id === c.id && o.status !== 'refunded' && o.status !== 'cancelled');
        return `<tr class="click" data-href="#/customer/${c.id}"><td><b>${esc(c.name)}</b></td><td>${esc(c.email)}</td><td class="num">${os.length}</td><td class="num">${money0(os.reduce((s, o) => s + o.total, 0))}</td></tr>`; }).join('')}</table></div>
      <p class="small muted">Shop customers. Restoration customers, their cards and private links are in the <a class="link" href="${PORTAL}#/customers">work portal ↗</a>.</p>`;
    bindRows();
  };
  shell('customers', 'Shop customers', '<input class="search" id="q" placeholder="Search">', '<div id="cl"></div>');
  $('#q').oninput = e => { q = e.target.value.toLowerCase(); draw(); };
  draw();
}
function customer([id]) {
  const c = store.customer(id); if (!c) return shell('customers', 'Not found', '', '');
  const os = store.orders().filter(o => o.customer_id === c.id), pc = PS.db().customers.find(x => (x.email || '').toLowerCase() === c.email);
  const ss = pc ? PS.db().submissions.filter(s => s.customer_id === pc.id) : [];
  shell('customers', esc(c.name), '<a class="btn ghost sm" href="#/customers">← Customers</a>', `<div class="cols-main"><div>
      <div class="panel"><h3>Restoration submissions</h3><table>${ss.map(s => `<tr class="click" data-href="${PORTAL}#/submission/${s.id}"><td>${esc(s.code)}</td><td class="small">${fmtDate(s.created_at)}</td><td>${pill(s.status)}</td></tr>`).join('') || '<tr><td class="muted">None</td></tr>'}</table></div>
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
      <div class="panel"><p class="small muted" style="margin-top:0">Announcement bar, news, shows and Instagram are edited in the <a class="link" href="${PORTAL}#/site/announcement">work portal → Website ↗</a>, same as Restored Rarity.</p>
        <h3>Home page</h3>${['kicker', 'title', 'sub', 'line'].map(k => `<div class="field"><label>${{ kicker: 'Small heading', title: 'Headline', sub: 'Line 1', line: 'Line 2' }[k]}</label><input data-hero="${k}" value="${esc(c.hero[k])}"></div>`).join('')}
        <div class="field"><label>Bestseller blurb</label><textarea id="best">${esc(c.bestseller)}</textarea></div></div>
      <div class="panel"><h3>Restoration prices</h3><table><tr><th>Tier</th><th>From $</th><th>To $</th><th>Price $ or %</th></tr>
        ${c.prices.tiers.map((t, i) => `<tr data-t="${i}"><td><input data-tk="name" value="${esc(t.name)}"></td><td><input data-tk="min" value="${t.min}"></td><td><input data-tk="max" value="${t.max ?? ''}" placeholder="and up"></td><td><input data-tk="amt" value="${t.pct ? t.pct + '%' : t.price}"></td></tr>`).join('')}</table>
        <div class="field" style="margin-top:12px"><label>Cleaning only, $ per card</label><input id="clean" value="${c.prices.cleaning}"></div>
        <h3>Add-ons</h3>${c.prices.addons.map((a, i) => `<div class="grid3" data-a="${i}"><div class="field"><label>Name</label><input data-ak="name" value="${esc(a.name)}"></div><div class="field"><label>Price $</label><input data-ak="price" value="${a.price}"></div><div class="field"><label>Per</label><select data-ak="unit">${['card', 'slab', 'submission'].map(u => `<option ${a.unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>`).join('')}
        <p class="small muted">This is the one price list: the Pricing page, the Free Card Review quiz, the Submit Cards quote and the work portal's service menus and quotes all read it.</p></div>
      <div class="panel"><h3>Queue & shop</h3><div class="field"><label>Cards accepted per week</label><input id="cap" value="${c.capacity}"></div>
        <div class="field"><label>Sales tax %</label><input id="tax" value="${c.shop.tax_rate}" style="max-width:140px"></div>
        <h3>Shipping options at checkout</h3>${methodsOf(c.shop).map((m, i) => `<div class="grid3" data-m="${i}"><div class="field"><label>Name</label><input data-mk="name" value="${esc(m.name)}"></div>
          <div class="field"><label>Price $</label><input data-mk="price" value="${m.price}"></div><div class="field"><label>Free over $</label><input data-mk="free_over" value="${m.free_over || ''}" placeholder="never"></div>
          <div class="field" style="grid-column:1/-1;margin-top:-8px"><label>Delivery time shown</label><input data-mk="days" value="${esc(m.days || '')}"></div></div>`).join('')}</div>
      <div class="panel"><h3>Shippo (shipping labels)</h3><p class="small muted" style="margin-top:0">Rates, labels and tracking for product orders and card returns. The Shippo API token is secret: it lives in the server function, never here.</p>
        <div class="grid2"><div class="field"><label>Mode</label><select id="spMode">${[['demo', 'Demo (simulated, no charges)'], ['test', 'Shippo test key (sample labels)'], ['live', 'Shippo live (real postage)']].map(([k, l]) => `<option value="${k}" ${SHIP.shipCfg().shippo.mode === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          <div class="field"><label>Checkout shipping prices</label><select id="spCk"><option value="flat" ${SHIP.shipCfg().shippo.checkout_rates === 'flat' ? 'selected' : ''}>Flat (options below)</option><option value="live" ${SHIP.shipCfg().shippo.checkout_rates === 'live' ? 'selected' : ''}>Live Shippo rates</option></select></div></div>
        <div class="field"><label>Shipping function address (Supabase Edge Function URL)</label><input id="spUrl" value="${esc(SHIP.shipCfg().shippo.function_url)}" placeholder="https://&lt;project&gt;.supabase.co/functions/v1/shippo"></div>
        <div class="field"><label>Label format</label><select id="spFmt">${['PDF_4x6', 'PDF', 'PNG', 'ZPLII'].map(f => `<option ${SHIP.shipCfg().shippo.label_format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></div>
        <h3 style="margin-top:14px">Ship from</h3><div class="grid2"><div class="field"><label>Name</label><input id="fName" value="${esc(SHIP.shipCfg().from.name)}"></div><div class="field"><label>Phone</label><input id="fPhone" value="${esc(SHIP.shipCfg().from.phone)}"></div></div>
        <div class="field"><label>Street</label><input id="fL1" value="${esc(SHIP.shipCfg().from.line1)}"></div>
        <div class="grid3"><div class="field"><label>City</label><input id="fCity" value="${esc(SHIP.shipCfg().from.city)}"></div><div class="field"><label>State</label><input id="fSt" value="${esc(SHIP.shipCfg().from.state)}"></div><div class="field"><label>ZIP</label><input id="fZip" value="${esc(SHIP.shipCfg().from.zip)}"></div></div>
        <h3 style="margin-top:14px">Card returns</h3>
        <div class="field"><label>Box</label><select id="crBox">${SHIP.shipCfg().boxes.map(b => `<option value="${b.key}" ${b.key === SHIP.shipCfg().cardReturn.box ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
        <div class="grid2"><div class="field"><label>Ounces per card</label><input id="crOz" value="${SHIP.shipCfg().cardReturn.per_card_oz}"></div>
          <div class="field"><label>Preferred service</label><input id="crSvc" value="${esc(SHIP.shipCfg().cardReturn.prefer)}"></div></div>
        <label class="check"><input type="checkbox" id="crIns" ${SHIP.shipCfg().cardReturn.insure ? 'checked' : ''}> Insure card returns for the card values (unless the customer said no)</label>
        <h3 style="margin-top:14px">Boxes</h3>${SHIP.shipCfg().boxes.map((b, i) => `<div class="var-row" data-b="${i}" style="grid-template-columns:2fr .6fr .6fr .6fr .7fr"><div><label>Name</label><input data-bk="name" value="${esc(b.name)}"></div>
          <div><label>L in</label><input data-bk="l" value="${b.l}"></div><div><label>W in</label><input data-bk="w" value="${b.w}"></div><div><label>H in</label><input data-bk="h" value="${b.h}"></div><div><label>Box oz</label><input data-bk="oz" value="${b.oz}"></div></div>`).join('')}</div>
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
    $('#reset').onclick = () => { if (confirm('Reset all demo data (shop and work portal) in this browser?')) { PS.reset(); store.reset(); toast('Demo data reset'); } };
    $('#defaults').onclick = () => { c.prices = JSON.parse(JSON.stringify(DEFAULT_CONTENT.prices)); draw(); toast('Built-in prices loaded — Save to keep them'); };
    $$('#sf input,#sf textarea,#sf select').forEach(i => { i.addEventListener('focus', () => busy = true); i.addEventListener('blur', () => busy = false); });
    $('#sf').onsubmit = e => {
      e.preventDefault(); busy = false; const v = id => $('#' + id).value.trim(), lines = id => v(id).split('\n').map(x => x.trim()).filter(Boolean);
      $$('[data-hero]').forEach(i => c.hero[i.dataset.hero] = i.value.trim()); c.bestseller = v('best');
      $$('[data-t]').forEach(tr => { const t = c.prices.tiers[+tr.dataset.t]; const g = k => $(`[data-tk=${k}]`, tr).value.trim();
        t.name = g('name'); t.min = +g('min') || 0; t.max = g('max') === '' ? null : +g('max'); const amt = g('amt');
        if (amt.endsWith('%')) { t.pct = +amt.replace('%', '') || 0; delete t.price; } else { t.price = +amt.replace(/[^\d.]/g, '') || 0; delete t.pct; } });
      c.prices.cleaning = +v('clean') || 0;
      $$('[data-a]').forEach(row => { const a = c.prices.addons[+row.dataset.a]; a.name = $('[data-ak=name]', row).value.trim(); a.price = +$('[data-ak=price]', row).value || 0; a.unit = $('[data-ak=unit]', row).value; });
      c.capacity = parseInt(v('cap'), 10) || 40;
      c.shop = { tax_rate: +v('tax') || 0, methods: $$('[data-m]').map((row, i) => { const g = k => $(`[data-mk=${k}]`, row).value.trim();
        return { key: methodsOf(c.shop)[i].key, name: g('name'), price: +g('price') || 0, free_over: +g('free_over') || 0, days: g('days') }; }) };
      const sc = SHIP.shipCfg();
      c.shipping = { ...sc, boxes: $$('[data-b]').map((row, i) => { const g = k => $(`[data-bk=${k}]`, row).value.trim(); return { key: sc.boxes[i].key, name: g('name'), l: +g('l') || 1, w: +g('w') || 1, h: +g('h') || 1, oz: +g('oz') || 0 }; }),
        cardReturn: { box: v('crBox'), per_card_oz: +v('crOz') || 0.5, prefer: v('crSvc'), insure: $('#crIns').checked },
        from: { ...sc.from, name: v('fName'), phone: v('fPhone'), line1: v('fL1'), city: v('fCity'), state: v('fSt').toUpperCase(), zip: v('fZip') },
        shippo: { mode: v('spMode'), checkout_rates: v('spCk'), function_url: v('spUrl'), label_format: v('spFmt') } };
      if (c.shipping.shippo.mode !== 'demo' && !c.shipping.shippo.function_url) { const er = $('#serr'); er.textContent = 'Test or live Shippo needs the shipping function address.'; er.classList.remove('hidden'); return; }
      c.payments = { provider: 'stripe', mode: v('mode'), publishable_key: v('pk') };
      if (c.payments.publishable_key && !/^pk_(test|live)_/.test(c.payments.publishable_key)) { const er = $('#serr'); er.textContent = 'That doesn’t look like a publishable key (pk_test_… or pk_live_…). Never paste the secret sk_ key here.'; er.classList.remove('hidden'); return; }
      c.contact = { email: v('ce'), phone: v('cph'), address: lines('caddr') }; c.dropoff = { name: v('dn'), address: lines('da'), phone: v('dp') };
      store.saveContent(c); toast('Website updated');
    };
  };
  draw();
}

router();
