// Shiny Asset Exchange demo — storefront (hash router).
import { store, money, money0, esc, fmtDate, stockState, totals, quote, cardPrice, tierFor, demoCharge, STATUS_LABEL } from './data.js';
import { FAQ, FAQ_INTRO, FAQ_OUTRO, TOOLS, RECS, PRIVACY, ASSESS, assessResult, CARE_GUIDE, NON_LIABILITY } from './content.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const app = $('#app');
const IMG = 'https://shiny-asset-exchange.myshopify.com/cdn/shop/files/';
const C = () => store.content();

// ---------------- cart ----------------
const CART = 'sae-cart';
const cart = {
  get() { try { return JSON.parse(localStorage.getItem(CART) || '[]'); } catch { return []; } },
  set(l) { try { localStorage.setItem(CART, JSON.stringify(l)); } catch {} updateBadge(); },
  add(variant_id, qty) { const l = cart.get(); const e = l.find(x => x.variant_id === variant_id); if (e) e.qty += qty; else l.push({ variant_id, qty }); cart.set(l); },
  qty(variant_id, qty) { cart.set(cart.get().map(x => x.variant_id === variant_id ? { ...x, qty } : x).filter(x => x.qty > 0)); },
  clear() { cart.set([]); },
  // cart lines joined with the live catalogue (price + stock always current)
  lines() {
    return cart.get().map(l => {
      const v = store.variant(l.variant_id), p = v && store.productOfVariant(l.variant_id);
      return v && p && p.status === 'active' ? { ...l, v, p, price: v.price, max: v.track ? v.stock : 99 } : null;
    }).filter(Boolean);
  },
};
function updateBadge() { const n = cart.get().reduce((s, l) => s + l.qty, 0); const b = $('#cartCount'); b.textContent = n; b.classList.toggle('hidden', !n); }

function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }

// ---------------- chrome ----------------
function chrome() {
  const c = C();
  $('#announce').textContent = c.announcement || ''; $('#announce').classList.toggle('hidden', !c.announcement);
  const ct = c.contact, d = c.dropoff;
  $('#footer').innerHTML = `<div class="wrap"><div class="cols">
    <div><h4>Questions? Reach us at</h4><p><a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></p><p>Phone: <a href="tel:${esc(ct.phone.replace(/\D/g, ''))}">${esc(ct.phone)}</a></p></div>
    <div><h4>Send your cards to:</h4><p>${ct.address.map(esc).join('<br>')}</p><p>Email: <a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></p></div>
    <div><h4>Local drop-off in Austin</h4><p>${esc(d.name)}<br>${d.address.map(esc).join('<br>')}<br>${esc(d.phone)}</p></div>
    </div><div class="base"><span>© ${new Date().getFullYear()} Shiny Asset Exchange</span><a href="#/privacy">Privacy policy</a><a href="#/agreement">Non Liability Agreement</a><a href="#/privacy">Your Privacy Choices</a><a href="admin.html">Admin (demo)</a></div></div>`;
  updateBadge();
}
$('#menuBtn').onclick = () => $('#nav').classList.toggle('open');
$('#cartBtn').onclick = () => openCart();
$('#scrim').onclick = () => closeCart();

// ---------------- product cards ----------------
function priceLabel(p) {
  const ps = p.variants.map(v => v.price); const lo = Math.min(...ps), hi = Math.max(...ps);
  return lo === hi ? money(lo) : 'From ' + money(lo);
}
function productStock(p) {
  const vs = p.variants.map(stockState);
  if (vs.every(s => s.key === 'out')) return { key: 'out', label: 'Sold out' };
  if (vs.some(s => s.key === 'low')) return { key: 'low', label: 'Low stock' };
  return { key: 'in', label: 'In stock' };
}
function pcard(p) {
  const s = productStock(p); const one = p.variants.length === 1;
  return `<a class="pcard" href="#/p/${esc(p.handle)}">
    <div class="img"><img loading="lazy" src="${esc(p.images[0] || '')}" alt="${esc(p.title)}">
      ${s.key === 'out' ? '<span class="pill tag">Sold out</span>' : s.key === 'low' ? '<span class="pill warn tag">Low stock</span>' : ''}</div>
    <div class="body"><div class="t">${esc(p.title)}</div><div class="pr">${priceLabel(p)}</div>
      ${s.key === 'out' ? '<span class="btn ghost sm" aria-disabled="true">Sold out</span>'
        : one ? `<button class="btn sm" data-add="${esc(p.variants[0].id)}">Add</button>` : '<span class="btn ghost sm">Choose</span>'}</div></a>`;
}
function bindAdds(root) {
  $$('[data-add]', root).forEach(b => b.onclick = e => { e.preventDefault(); addToCart(b.dataset.add, 1); });
}
function addToCart(id, qty) {
  const v = store.variant(id); const inCart = (cart.get().find(l => l.variant_id === id) || { qty: 0 }).qty;
  if (v.track && inCart + qty > v.stock) { toast(v.stock ? `Only ${v.stock} available` : 'Sold out'); return false; }
  cart.add(id, qty); openCart(); return true;
}

// ---------------- pages ----------------
const routes = {
  '': home, shop, p: productPage, cart: cartPage, checkout, thanks, pricing, review, submit, status, faq, recs, tools, privacy, agreement, my, pay,
};
function router() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const [r, ...args] = path.split('/');
  const params = new URLSearchParams(query || '');
  $('#nav').classList.remove('open'); closeCart();
  $$('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + r));
  (routes[r] || notFound)(args.map(decodeURIComponent), params);
  window.scrollTo(0, 0);
  chrome();
}
window.addEventListener('hashchange', router);
store.onChange(() => { updateBadge(); });

function notFound() { app.innerHTML = `<div class="narrow section"><h1>Page not found</h1><p><a class="link" href="#/">Back to the home page</a></p></div>`; }

function home() {
  const c = C(), h = c.hero;
  const feat = store.products().filter(p => p.featured).slice(0, 4);
  const best = store.product('hydration-phase-spray');
  app.innerHTML = `
  <section class="hero"><img class="bg" src="${IMG}MagicEraser_260221_222552.jpg?height=1920" alt="">
    <div class="in"><div class="kicker">${esc(h.kicker)}</div><h1>${esc(h.title)}</h1><p>${esc(h.sub)}</p><p>${esc(h.line)}</p>
    <a class="btn red" href="#/submit">Restore My Card</a> <a class="btn ghost" href="#/review" style="margin-left:6px">Free Card Review</a></div></section>
  <section class="section how"><div class="wrap">
    <img class="d" src="${IMG}how_it_works.png?width=1600" alt="Step-by-step process of restoration on a black background with red accents.">
    <img class="m" src="${IMG}how_it_works_mobile.png?width=800" alt="Step-by-step process of restoration on a black background with red accents."></div></section>
  <section class="section"><div class="wrap">
    <div class="row" style="justify-content:space-between;align-items:flex-end;margin-bottom:18px"><div>
      <h2>The same products we use in every restoration is now available for your personal use.</h2>
      <p class="muted" style="margin:0">Freshen up your cards with the most effective card care product line on the market exclusively from Shiny Asset Exchange.</p>
      <p class="muted" style="margin:0">Try our proprietary formula products for card care!</p></div>
      <a class="btn ghost" href="#/shop">View all</a></div>
    <div class="grid-products">${feat.map(pcard).join('')}</div></div></section>
  ${best ? `<section class="section"><div class="wrap bestseller"><img src="${esc(best.images[0])}" alt="${esc(best.title)}">
    <div><div class="kicker">Bestseller</div><h2>${esc(best.title)}</h2><p class="muted">${esc(c.bestseller)}</p>
    <a class="btn red" href="#/p/${esc(best.handle)}">SHOP NOW</a></div></div></section>` : ''}`;
  bindAdds(app);
}

function shop(args) {
  const col = args[0] || 'all';
  const all = store.products();
  const list = col === 'all' ? all : all.filter(p => p.collection === col);
  app.innerHTML = `<div class="wrap section tight"><h1>Products</h1>
    <div class="filters" style="margin:12px 0 22px">
      ${[['all', 'All products'], ['card-care', 'Card care'], ['hydration', 'Hydration Spray']].map(([k, l]) => `<a href="#/shop/${k}"><button class="${k === col ? 'on' : ''}">${l}</button></a>`).join('')}
    </div>
    <div class="grid-products">${list.map(pcard).join('') || '<p class="muted">Nothing here yet.</p>'}</div></div>`;
  bindAdds(app);
}

function productPage([handle]) {
  const p = store.product(handle);
  if (!p || p.status !== 'active') return notFound();
  let vi = Math.max(0, p.variants.findIndex(v => stockState(v).key !== 'out')), img = 0, qty = 1;
  const body = p.body.replace(/^<p><strong>[^<]*<\/strong><\/p>\s*/, '');
  const draw = () => {
    const v = p.variants[vi], s = stockState(v);
    app.innerHTML = `<div class="wrap"><div class="pdp">
      <div class="gallery"><div class="main"><img src="${esc(p.images[img] || '')}" alt="${esc(p.title)}"></div>
        ${p.images.length > 1 ? `<div class="thumbs">${p.images.map((u, i) => `<button class="${i === img ? 'on' : ''}" data-img="${i}"><img src="${esc(u.replace('width=1200', 'width=200'))}" alt=""></button>`).join('')}</div>` : ''}</div>
      <div><div class="kicker">Shiny Asset Exchange</div><h1>${esc(p.title)}</h1>
        <div class="price-lg">${money(v.price)}</div>
        ${p.tagline ? `<p><strong>${esc(p.tagline)}</strong></p>` : ''}
        ${p.variants.length > 1 ? `<label>Size</label><div class="opts">${p.variants.map((x, i) => `<button class="opt ${i === vi ? 'on' : ''} ${stockState(x).key === 'out' ? 'out' : ''}" data-v="${i}">${esc(x.title)}</button>`).join('')}</div>` : ''}
        <div class="stock"><span class="dot ${s.key}"></span>${esc(s.label)}</div>
        <div class="row" style="margin:14px 0 22px">
          <div class="qty"><button data-q="-1" aria-label="Less">−</button><input id="qty" inputmode="numeric" value="${qty}" aria-label="Quantity"><button data-q="1" aria-label="More">+</button></div>
          <button class="btn red grow" id="add" ${s.key === 'out' ? 'disabled' : ''}>${s.key === 'out' ? 'Sold out' : 'Add to cart'}</button></div>
        <button class="btn block ghost" id="buy" ${s.key === 'out' ? 'disabled' : ''}>Buy it now</button>
        <div class="rte" style="margin-top:26px">${body}</div>
        <p class="small muted"><a class="link" href="${CARE_GUIDE}" target="_blank" rel="noopener">Download the Card Care Guide</a></p></div></div></div>`;
    $$('[data-img]').forEach(b => b.onclick = () => { img = +b.dataset.img; draw(); });
    $$('[data-v]').forEach(b => b.onclick = () => { vi = +b.dataset.v; qty = 1; draw(); });
    $$('[data-q]').forEach(b => b.onclick = () => { qty = Math.max(1, Math.min(v.track ? Math.max(1, v.stock) : 99, (+$('#qty').value || 1) + +b.dataset.q)); $('#qty').value = qty; });
    $('#qty').onchange = () => { qty = Math.max(1, +$('#qty').value || 1); $('#qty').value = qty; };
    $('#add').onclick = () => addToCart(v.id, qty);
    $('#buy').onclick = () => { if (addToCart(v.id, qty)) { closeCart(); location.hash = '#/checkout'; } };
  };
  draw();
}

function cartHtml(compact) {
  const lines = cart.lines(), t = totals(C().shop, lines);
  if (!lines.length) return { empty: true, html: `<p class="muted" style="padding:20px 0">Your cart is empty</p><a class="btn" href="#/shop">Continue shopping</a>` };
  const short = lines.filter(l => l.v.track && l.qty > l.v.stock);
  return { empty: false, t, short, html: lines.map(l => `<div class="line"><img src="${esc(l.p.images[0])}" alt="">
      <div><div class="t">${esc(l.p.title)}</div>${l.v.title ? `<div class="small muted">${esc(l.v.title)}</div>` : ''}<div class="small">${money(l.price)}</div>
        ${l.v.track && l.qty > l.v.stock ? `<div class="err small">Only ${l.v.stock} left — please lower the quantity.</div>` : ''}
        <div class="row" style="margin-top:6px"><div class="qty"><button data-cq="${l.variant_id}" data-d="-1">−</button><input value="${l.qty}" readonly aria-label="Quantity"><button data-cq="${l.variant_id}" data-d="1">+</button></div>
        <button class="linkbtn" data-rm="${l.variant_id}">Remove</button></div></div>
      <div class="num">${money(l.price * l.qty)}</div></div>`).join('') };
}
function bindCart(root, redraw) {
  $$('[data-cq]', root).forEach(b => b.onclick = () => {
    const l = cart.lines().find(x => x.variant_id === b.dataset.cq); const n = l.qty + +b.dataset.d;
    if (+b.dataset.d > 0 && l.v.track && n > l.v.stock) return toast(`Only ${l.v.stock} available`);
    cart.qty(l.variant_id, n); redraw();
  });
  $$('[data-rm]', root).forEach(b => b.onclick = () => { cart.qty(b.dataset.rm, 0); redraw(); });
}
function sumHtml(t) {
  const s = C().shop;
  return `<div class="sum"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    <div class="sum"><span>Shipping</span><span>${t.shipping ? money(t.shipping) : 'Free'}</span></div>
    <div class="sum"><span>Estimated tax</span><span>${money(t.tax)}</span></div>
    <div class="sum total"><span>Total</span><span>${money(t.total)} USD</span></div>
    ${s.free_over && t.subtotal < s.free_over ? `<p class="small muted" style="margin-top:8px">Free shipping on orders over ${money0(s.free_over)}.</p>` : ''}`;
}
function openCart() {
  const d = $('#drawer'); const draw = () => {
    const c = cartHtml(true);
    d.innerHTML = `<div class="head"><h3 style="margin:0">Cart</h3><button class="icon-btn" id="dclose" aria-label="Close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <div class="lines">${c.html}</div>${c.empty ? '' : `<div class="foot">${sumHtml(c.t)}<a class="btn red block" style="margin-top:12px" href="#/checkout" ${c.short.length ? 'aria-disabled="true"' : ''}>Check out</a>
      <a class="btn ghost block" style="margin-top:8px" href="#/cart">View cart</a></div>`}`;
    $('#dclose').onclick = closeCart; bindCart(d, draw);
    $$('a', d).forEach(a => a.addEventListener('click', e => { if (a.getAttribute('aria-disabled')) { e.preventDefault(); return; } closeCart(); }));
  };
  draw(); d.classList.add('open'); $('#scrim').classList.remove('hidden');
}
function closeCart() { $('#drawer').classList.remove('open'); $('#scrim').classList.add('hidden'); }

function cartPage() {
  const draw = () => {
    const c = cartHtml();
    app.innerHTML = `<div class="narrow section tight"><h1>Your cart</h1>${c.html}
      ${c.empty ? '' : `<div style="max-width:360px;margin:20px 0 0 auto">${sumHtml(c.t)}<a class="btn red block" style="margin-top:12px" href="#/checkout">Check out</a></div>`}</div>`;
    bindCart(app, draw);
  };
  draw();
}

// Payment form. Demo mode stands in for Stripe; live mode would redirect to Stripe Checkout (see README).
function payFormHtml(amount, label) {
  return `<div class="stripe-box">
    <div class="field"><label>Card number</label><input id="cc" inputmode="numeric" autocomplete="cc-number" placeholder="1234 1234 1234 1234"></div>
    <div class="grid2"><div class="field"><label>Expiration</label><input id="exp" inputmode="numeric" autocomplete="cc-exp" placeholder="MM / YY"></div>
      <div class="field"><label>Security code</label><input id="cvc" inputmode="numeric" autocomplete="cc-csc" placeholder="CVC"></div></div>
    <div class="err hidden" id="payErr"></div>
    <div class="hint"><b>Demo payment — no real charge.</b> Use test card 4242 4242 4242 4242, any future date, any CVC. 4000 0000 0000 0002 shows a decline.</div>
  </div>
  <button class="btn block pay-btn" id="payBtn" style="margin-top:14px">${esc(label)} ${money(amount)}</button>
  <div class="powered">🔒 Payments processed by <b>Stripe</b> (test mode in this demo)</div>`;
}
function bindPayForm() {
  $('#cc').oninput = e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 '); };
  $('#exp').oninput = e => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); e.target.value = d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d; };
  $('#cvc').oninput = e => { e.target.value = e.target.value.replace(/\D/g, '').slice(0, 4); };
}
function charge(amount) {
  const r = demoCharge({ number: $('#cc').value, exp: $('#exp').value, cvc: $('#cvc').value, amount });
  const e = $('#payErr'); e.classList.toggle('hidden', r.ok); if (!r.ok) e.textContent = r.error;
  return r;
}

function checkout() {
  const lines = cart.lines();
  if (!lines.length) { location.hash = '#/cart'; return; }
  const t = totals(C().shop, lines);
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sae-checkout') || '{}'); } catch { return {}; } })();
  const f = (id, label, ac, type = 'text', req = true) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" value="${esc(saved[id] || '')}" ${req ? 'required' : ''}></div>`;
  app.innerHTML = `<div class="wrap"><div class="checkout">
    <form id="co" novalidate>
      <h2>Contact</h2>${f('email', 'Email', 'email', 'email')}${f('phone', 'Phone (optional)', 'tel', 'tel', false)}
      <h2 style="margin-top:22px">Delivery</h2>
      <div class="grid2">${f('first', 'First name', 'given-name')}${f('last', 'Last name', 'family-name')}</div>
      ${f('line1', 'Address', 'address-line1')}${f('line2', 'Apartment, suite, etc. (optional)', 'address-line2', 'text', false)}
      <div class="grid3">${f('city', 'City', 'address-level2')}${f('state', 'State', 'address-level1')}${f('zip', 'ZIP code', 'postal-code')}</div>
      <h2 style="margin-top:22px">Payment</h2><p class="small muted">All transactions are secure and encrypted.</p>
      ${payFormHtml(t.total, 'Pay')}
      <div class="err hidden" id="coErr"></div>
    </form>
    <aside class="summary"><div class="panel">${lines.map(l => `<div class="line" style="grid-template-columns:56px 1fr auto"><div style="position:relative"><img src="${esc(l.p.images[0])}" alt="" style="width:56px;height:56px"><span class="badge" style="top:-6px;right:-6px">${l.qty}</span></div>
      <div><div class="t">${esc(l.p.title)}</div><div class="small muted">${esc(l.v.title)}</div></div><div class="num">${money(l.price * l.qty)}</div></div>`).join('')}
      <div style="margin-top:12px">${sumHtml(t)}</div></div></aside></div></div>`;
  bindPayForm();
  $('#co').onsubmit = e => e.preventDefault();
  $('#payBtn').onclick = e => {
    e.preventDefault();
    const v = id => $('#' + id).value.trim(); const err = $('#coErr');
    const missing = ['email', 'first', 'last', 'line1', 'city', 'state', 'zip'].filter(id => !v(id));
    if (missing.length || !/^\S+@\S+\.\S+$/.test(v('email'))) { err.textContent = 'Please fill in your email and delivery address.'; err.classList.remove('hidden'); $('#' + (missing[0] || 'email')).focus(); return; }
    err.classList.add('hidden');
    try { localStorage.setItem('sae-checkout', JSON.stringify(Object.fromEntries(['email', 'phone', 'first', 'last', 'line1', 'line2', 'city', 'state', 'zip'].map(k => [k, v(k)])))); } catch {}
    const r = charge(t.total); if (!r.ok) return;
    const res = store.placeOrder({
      customer: { name: v('first') + ' ' + v('last'), email: v('email'), phone: v('phone') },
      ship: { name: v('first') + ' ' + v('last'), line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), zip: v('zip'), country: 'US' },
      cart: lines.map(l => ({ variant_id: l.variant_id, qty: l.qty })), payment: r.payment,
    });
    if (!res.ok) { err.innerHTML = 'Some items sold out while you were checking out: ' + res.short.map(s => `${esc(s.title || '')} ${esc(s.variant || '')} (${s.have} left)`).join(', ') + '. You have not been charged — please update your cart.'; err.classList.remove('hidden'); return; }
    cart.clear(); location.hash = '#/thanks/' + res.order.id;
  };
}

function thanks([id]) {
  const o = store.order(id); if (!o) return notFound();
  const c = store.customer(o.customer_id);
  app.innerHTML = `<div class="narrow section"><div class="kicker">Order ${esc(o.number)}</div><h1>Thank you${c ? ', ' + esc(c.name.split(' ')[0]) : ''}!</h1>
    <p>Your payment of <b>${money(o.total)}</b> went through and your order is confirmed. A receipt is on its way to ${esc(o.email)}.</p>
    <div class="panel">${o.items.map(i => `<div class="sum"><span>${i.qty} × ${esc(i.title)} ${esc(i.variant)}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div style="margin-top:10px">${sumHtml(o)}</div></div>
    <p style="margin-top:18px">Track it any time on <a class="link" href="#/status?q=${encodeURIComponent(o.number)}&e=${encodeURIComponent(o.email)}">Order Status</a>${c ? ` or your <a class="link" href="#/my/${esc(c.token)}">private order page</a>` : ''}.</p>
    <a class="btn" href="#/shop">Continue shopping</a></div>`;
}

// ---------------- service pages ----------------
function priceRows(prices) {
  return prices.tiers.map(t => `<tr><td>${esc(t.name)}</td><td>${t.max == null ? money0(t.min) + '+' : money0(t.min) + ' – ' + money0(t.max)}</td><td>${t.pct ? t.pct + '% of card value' : money0(t.price)}</td></tr>`).join('');
}
function pricing() {
  const c = C(), pr = c.prices, d = c.dropoff;
  app.innerHTML = `<div class="narrow section tight"><h1>Pricing</h1>
    <p>We offer two services: full restoration, priced by your card's current market value, and cleaning only, priced flat per card. Look up your card at <a class="link" href="https://www.tcgplayer.com/" target="_blank" rel="noopener">TCGplayer.com</a> before submitting so you know where you land.</p>
    <div class="callout"><h3>Before you submit</h3><p>Not all damage can be improved. Check our <a class="link" href="#/faq">FAQ</a> to see what we can and can't fix before sending your cards in.</p>
      <p style="margin:0">Still not sure? We recommend a Card Review for ${money0(pr.addons.find(a => a.key === 'review')?.price ?? 5)} per card. We'll assess your card and tell you honestly what's possible before you commit to a full restoration.</p></div>
    <h2 style="margin-top:32px">Restoration</h2><p class="muted">Creases, indents, scratches, warping, ink and adhesive. Includes a full clean and polish. Priced by your card's current value.</p>
    <div class="table-wrap"><table class="price-table"><tr><th>Tier</th><th>Card Value</th><th>Price</th></tr>${priceRows(pr)}</table></div>
    <h2 style="margin-top:32px">Cleaning Only</h2><p class="muted">No restoration work. Priced flat, regardless of card value.</p>
    <div class="table-wrap"><table class="price-table"><tr><th>Service</th><th>Price</th><th>What It Covers</th></tr><tr><td>Cleaning</td><td>${money0(pr.cleaning)} per card</td><td>Front and back wipe down with card spray and polish</td></tr></table></div>
    <p style="margin-top:12px" class="muted">Cleaning is a good fit if your card is structurally sound and you just want it looking its best, whether for display or before a grading submission. If your card has creases, indents, or scratches, you want full restoration instead. Cleaning is already included in every restoration.</p>
    <h2 style="margin-top:32px">Add-Ons</h2><p class="muted">Available with either service above.</p>
    <div class="table-wrap"><table class="price-table"><tr><th>Service</th><th>Price</th><th>What It Covers</th></tr>
      ${pr.addons.map(a => `<tr><td>${esc(a.name)}</td><td>${money0(a.price)} per ${esc(a.unit)}</td><td>${esc(a.desc)}</td></tr>`).join('')}</table></div>
    <h2 style="margin-top:40px">Two Ways to Get Your Cards to Us</h2><p class="muted">Ship them in, or drop them off locally in Austin.</p>
    <div class="cols2" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
      <div class="panel"><h3>Shipping to us</h3><p style="margin:0">Fill out the submission form and we'll send an invoice along with shipping instructions. Work begins once payment is confirmed.</p></div>
      <div class="panel"><h3>Local drop-off in Austin</h3><p>Bring your cards to ${esc(d.name)}. No form needed — just walk in and we'll handle the paperwork in person.</p>
        <p class="small muted" style="margin:0">${esc(d.name)}<br>${d.address.map(esc).join('<br>')}<br><a href="tel:${d.phone.replace(/\D/g, '')}">${esc(d.phone)}</a></p></div></div>
    <p style="margin-top:16px" class="muted">One exception: cards valued over $1,000 must be submitted through the online form, even if you plan to drop off in person. This gives us a documented record before the card changes hands, which protects both of us. Fill out the form first, then bring your card in.</p>
    <h2 style="margin-top:32px">Good to know</h2>
    <ul class="muted"><li>Pricing is the same whether you send one card or twenty. Every card gets the same individual attention, so we don't offer bulk discounts.</li>
      <li>Payment is due in full before work begins. We'll send you an invoice after reviewing your submission.</li>
      <li>Shipping is paid by the customer both directions. We recommend tracked and insured shipping when sending your cards to us.</li>
      <li>Trades accepted as payment at 85% of card value.</li></ul>
    <div class="cta-red"><h2 style="color:#fff">Ready to get started?</h2><a class="btn" href="#/submit">Submit Your Cards</a></div></div>`;
}

function review() {
  const prices = C().prices; let A = {}, i = 0, path = [];
  const ok = s => !s.only || s.only(A);
  const next = f => { for (let j = f; j < ASSESS.Q.length; j++) if (ok(ASSESS.Q[j])) return j; return -1; };
  const intro = () => {
    app.innerHTML = `<div class="narrow section" style="max-width:700px"><h1>Is your card worth restoring?</h1>
      <p class="muted" style="font-size:17px">A few quick questions and we'll give you a straight answer, including when the answer is no.</p>
      <p class="kicker">Under 2 minutes</p><button class="btn red" id="go">Start</button></div>`;
    $('#go').onclick = render;
  };
  const render = () => {
    const s = ASSESS.Q[i]; let shown = 0, pos = 0;
    ASSESS.Q.forEach((q, j) => { if (ok(q)) { shown++; if (j <= i) pos = shown; } });
    app.innerHTML = `<div class="narrow section" style="max-width:700px"><p class="kicker">Step ${pos} of ${shown}</p><div class="progress"><div style="width:${pos / shown * 100}%"></div></div>
      <h3 style="font-size:22px">${esc(s.q)}</h3>${s.sub ? `<p class="muted small">${esc(s.sub)}</p>` : '<div style="height:12px"></div>'}
      ${s.a.map(([l, v]) => `<button class="choice ${s.multi && (A[s.k] || []).includes(v) ? 'on' : ''}" data-v="${v}">${esc(l)}</button>`).join('')}
      ${s.multi ? '<button class="btn red" id="cont" style="margin-top:10px">Continue</button>' : ''}
      ${path.length ? '<div style="margin-top:20px"><button class="btn ghost sm" id="back">Back</button></div>' : ''}</div>`;
    $$('.choice').forEach(b => b.onclick = () => {
      const v = b.dataset.v;
      if (s.multi) { const a = A[s.k] = A[s.k] || []; const p = a.indexOf(v); p > -1 ? a.splice(p, 1) : a.push(v); render(); }
      else { A[s.k] = v; go(); }
    });
    if ($('#cont')) $('#cont').onclick = () => { if ((A[s.k] || []).length) go(); };
    if ($('#back')) $('#back').onclick = () => { i = path.pop(); render(); };
  };
  const go = () => { path.push(i); const n = next(i + 1); if (n > -1) { i = n; render(); } else result(); };
  const result = () => {
    const r = assessResult(A, prices), d = C().dropoff;
    try { sessionStorage.setItem('sae-assess', JSON.stringify({ service: r.service, value: r.value, review: r.verdict === 'diag' })); } catch {}
    app.innerHTML = `<div class="narrow section" style="max-width:700px"><p class="kicker" style="color:var(--dim)">Your result</p>
      <div class="result ${r.col}"><h3 style="font-size:26px">${esc(r.head)}</h3><p style="margin:0">${esc(r.sub)}</p></div>
      ${r.notes.length ? `<h4 style="font-size:19px;margin:32px 0 14px">What we’re seeing</h4>${r.notes.map(n => `<p class="note-line">${esc(n)}</p>`).join('')}` : ''}
      ${r.price ? `<p class="muted" style="margin-top:22px">${esc(r.price)}</p>` : ''}
      ${r.cta ? `<div class="cta-red"><p style="color:#fff">Include clear photos of the front and back so we can confirm everything before any work begins.</p><a class="btn" href="#/submit?from=review">Submit Your Card</a></div>
        <div class="callout"><p style="margin:0"><strong>Local to Austin?</strong> ${r.over1k
          ? `Cards valued over $1,000 must go through the online form even if you plan to drop off in person. It gives us a documented record before the card changes hands, which protects both of us. Fill out the form first, then bring your card to ${esc(d.name)} at ${esc(d.address[0])}.`
          : `You can skip the form entirely and drop your card off at ${esc(d.name)}, ${esc(d.address[0])}. We handle the paperwork in person.`}</p></div>`
        : `<div class="panel" style="text-align:center;margin-top:32px"><p>We would rather turn work down than take your money for nothing.</p>
          <p class="muted">If you disagree with this and want us to look anyway, you are welcome to submit. We will give you an honest read before any work starts.</p>
          <a class="btn ghost" href="#/submit">Submit Anyway</a></div>`}
      <p style="text-align:center;margin-top:26px"><button class="linkbtn" id="again">Start over</button></p></div>`;
    $('#again').onclick = () => { A = {}; i = 0; path = []; render(); };
  };
  intro();
}

// Shrink a photo to a small JPEG data URL so the demo can keep it in the browser.
function shrink(file, max = 700) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src); res(c.toDataURL('image/jpeg', .72));
    }; img.onerror = rej; img.src = URL.createObjectURL(file);
  });
}

function submit(args, params) {
  const c = C(), pr = c.prices; const pre = (() => { try { return params.get('from') === 'review' ? JSON.parse(sessionStorage.getItem('sae-assess') || 'null') : null; } catch { return null; } })();
  const blank = () => ({ name: '', details: '', value: pre ? pre.value : '', service: pre ? pre.service : 'restoration', addons: pre && pre.review ? ['review'] : [], damage: '', photos: {} });
  const cards = [blank()];
  const used = store.queueThisWeek(), full = used >= c.capacity;
  app.innerHTML = `<div class="wrap section tight"><div style="max-width:820px"><h1 style="color:var(--red)">Ready to restore your cards?</h1>
    <p>We accept up to ${c.capacity} cards per week on a first-come, first-served basis. Once we receive your cards and payment is confirmed, turnaround is 1 week. Shipping time to us is separate — please plan accordingly based on your location.</p>
    <p>If you see a message below saying our queue is full this week, don't worry — you can still submit. Your cards will be added to the next available slot and your estimated timeline will reflect that automatically. Any questions, email us at <a class="link" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a>.</p>
    <p>Fill out the form below to submit your TCG cards for restoration or cleaning. We accept all trading card game cards in any condition — sports cards not accepted.</p>
    <p class="red"><strong>Before you submit:</strong></p>
    <ul><li>Look up your card's value at <a class="link" href="https://www.tcgplayer.com/" target="_blank" rel="noopener">TCGplayer.com</a> and have it ready — your service price is based on this value.</li>
      <li>Photograph the front and back of each card clearly before submitting.</li>
      <li>Add every card to this one form — use “+ Add another card”.</li>
      <li>Payment is due in full before work begins. We'll send payment instructions after reviewing your submission.</li>
      <li>For bulk restoration orders, please email your card details directly to <a class="link" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a> instead of using this form.</li></ul>
    <div class="callout" style="border-color:${full ? 'var(--warn)' : 'var(--ok)'}">${full
      ? `<strong>Our queue is full this week.</strong> You can still submit — your cards go into next week's slot.`
      : `<strong>${c.capacity - used} of ${c.capacity} spots open this week.</strong> Cards received by Sunday join this week's queue.`}</div></div>
    <form id="sf" class="cols-main" style="margin-top:24px" novalidate>
      <div>
        <h2>Your details</h2>
        <div class="grid2"><div class="field"><label>Full name</label><input id="s_name" autocomplete="name" required></div><div class="field"><label>Email</label><input id="s_email" type="email" autocomplete="email" required></div></div>
        <div class="grid2"><div class="field"><label>Phone</label><input id="s_phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label>How will your cards get to us?</label><select id="s_del"><option value="ship">I'll ship them</option><option value="dropoff">Drop-off at ${esc(c.dropoff.name)} (Austin)</option></select></div></div>
        <div class="field" id="retWrap"><label>Return shipping address</label><textarea id="s_addr" autocomplete="street-address" placeholder="Street, city, state, ZIP"></textarea></div>
        <h2 style="margin-top:18px">Your cards</h2><div id="cards"></div>
        <button type="button" class="btn ghost" id="addCard">+ Add another card</button>
        <div class="field" style="margin-top:20px"><label>Anything else we should know?</label><textarea id="s_notes"></textarea></div>
        <label class="check"><input type="checkbox" id="s_agree"> <span>I've read the <a class="link" href="#/faq" target="_blank">FAQ</a> and agree to the <a class="link" href="#/agreement" target="_blank">Non Liability Agreement</a>. I understand results are not guaranteed and the service fee applies regardless of outcome.</span></label>
        <div class="err hidden" id="sErr"></div>
        <button class="btn red" id="sGo" style="margin-top:10px">Submit my cards</button>
      </div>
      <aside class="quote-box"><div class="panel" id="quote"></div></aside>
    </form></div>`;
  const draw = () => {
    $('#cards').innerHTML = cards.map((cd, i) => `<div class="card-entry" data-i="${i}"><div class="top"><b>Card ${i + 1}</b>${cards.length > 1 ? `<button type="button" class="linkbtn" data-del="${i}">Remove</button>` : ''}</div>
      <div class="grid2"><div class="field"><label>Card name</label><input data-f="name" value="${esc(cd.name)}" placeholder="Start typing, e.g. Charizard"></div>
        <div class="field"><label>Set · number · year</label><input data-f="details" value="${esc(cd.details)}" placeholder="Base Set · 4/102 · 1999"></div></div>
      <div class="grid2"><div class="field"><label>Current value (TCGplayer, $)</label><input data-f="value" inputmode="decimal" value="${esc(cd.value)}" placeholder="e.g. 250"></div>
        <div class="field"><label>Service</label><select data-f="service"><option value="restoration" ${cd.service === 'restoration' ? 'selected' : ''}>Restoration</option><option value="cleaning" ${cd.service === 'cleaning' ? 'selected' : ''}>Cleaning only (${money0(pr.cleaning)})</option></select></div></div>
      <label>Add-ons</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px">${pr.addons.map(a => `<label class="check"><input type="checkbox" data-addon="${a.key}" ${cd.addons.includes(a.key) ? 'checked' : ''}> ${esc(a.name)} (+${money0(a.price)}/${esc(a.unit)})</label>`).join('')}</div>
      <div class="field" style="margin-top:8px"><label>What's wrong with it?</label><textarea data-f="damage" placeholder="Crease top right, light scratches on the holo…">${esc(cd.damage)}</textarea></div>
      <label>Photos</label><div class="photos">${['front', 'back'].map(s => `<label class="photo-slot">${cd.photos[s] ? `<img src="${cd.photos[s]}" alt="">` : `📷<br>${s === 'front' ? 'Front' : 'Back'}`}<input type="file" accept="image/*" data-photo="${s}"></label>`).join('')}</div>
      ${+cd.value > 1000 && $('#s_del').value === 'dropoff' ? '<p class="small muted" style="margin-top:8px">Cards over $1,000 must go through this form before drop-off — thanks for doing that.</p>' : ''}</div>`).join('');
    $$('.card-entry').forEach(el => {
      const cd = cards[+el.dataset.i];
      $$('[data-f]', el).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { cd[inp.dataset.f] = inp.value; drawQuote(); if (inp.dataset.f === 'service') draw(); }));
      $$('[data-addon]', el).forEach(cb => cb.onchange = () => { cd.addons = cb.checked ? [...cd.addons, cb.dataset.addon] : cd.addons.filter(k => k !== cb.dataset.addon); drawQuote(); });
      $$('[data-photo]', el).forEach(inp => inp.onchange = async () => { if (inp.files[0]) { cd.photos[inp.dataset.photo] = await shrink(inp.files[0]); draw(); } });
      const del = $('[data-del]', el); if (del) del.onclick = () => { cards.splice(+del.dataset.del, 1); draw(); };
      if (window.RRCardSearch) RRCardSearch.attach($('[data-f=name]', el), { details: $('[data-f=details]', el), onPick: () => { cd.name = $('[data-f=name]', el).value; cd.details = $('[data-f=details]', el).value; } });
    });
    drawQuote();
  };
  const drawQuote = () => {
    const q = quote(pr, cards);
    $('#quote').innerHTML = `<h3>Estimated quote</h3>${q.lines.map((l, i) => `<div class="sum"><span>Card ${i + 1}${l.card.name ? ' · ' + esc(l.card.name) : ''}<br><span class="small muted">${l.card.service === 'cleaning' ? 'Cleaning' : (+l.card.value ? tierFor(pr, l.card.value).name + ' restoration' : 'Restoration — enter value')}${l.addons ? ' + add-ons' : ''}</span></span><span>${money0(l.total)}</span></div>`).join('')}
      ${q.perSubmission.map(a => `<div class="sum"><span>${esc(a.name)} (per submission)</span><span>${money0(a.price)}</span></div>`).join('')}
      <div class="sum total"><span>Estimate</span><span>${money0(q.total)}</span></div>
      <p class="small muted" style="margin-top:10px">Plus shipping both ways. We review every card first and send a final invoice — payment is due before work begins. Trades accepted at 85% of card value.</p>`;
  };
  $('#addCard').onclick = () => { cards.push(blank()); draw(); };
  $('#s_del').onchange = () => { $('#retWrap').classList.toggle('hidden', $('#s_del').value === 'dropoff'); draw(); };
  $('#sf').onsubmit = e => e.preventDefault();
  $('#sGo').onclick = e => {
    e.preventDefault(); const err = $('#sErr'); const v = id => $('#' + id).value.trim();
    const problems = [];
    if (!v('s_name')) problems.push('your name'); if (!/^\S+@\S+\.\S+$/.test(v('s_email'))) problems.push('a valid email');
    if (v('s_del') === 'ship' && !v('s_addr')) problems.push('a return address');
    cards.forEach((cd, i) => { if (!cd.name.trim()) problems.push(`card ${i + 1}'s name`); if (cd.service === 'restoration' && !(+cd.value > 0)) problems.push(`card ${i + 1}'s value`); });
    if (!$('#s_agree').checked) problems.push('agreement to the Non Liability Agreement');
    if (problems.length) { err.textContent = 'Please add ' + problems.join(', ') + '.'; err.classList.remove('hidden'); return; }
    try {
      const r = store.submit({ customer: { name: v('s_name'), email: v('s_email'), phone: v('s_phone') }, delivery: v('s_del'),
        cards: cards.map(cd => ({ ...cd, value: +cd.value || 0 })), notes: [v('s_notes'), v('s_del') === 'ship' ? 'Return address: ' + v('s_addr') : ''].filter(Boolean).join('\n') });
      submitted(r);
    } catch (x) { err.textContent = 'Your photos are too large for this demo browser — try fewer or smaller photos.'; err.classList.remove('hidden'); }
  };
  draw();
}
function submitted({ submission: s, customer: c }) {
  const ct = C().contact, drop = s.delivery === 'dropoff', d = C().dropoff;
  app.innerHTML = `<div class="narrow section"><div class="kicker">Submission ${esc(s.code)}</div><h1>Thanks — we've got your submission!</h1>
    <p>Your reference is <b>${esc(s.code)}</b>. We'll review your ${s.cards.length === 1 ? 'card' : s.cards.length + ' cards'} and email an invoice to <b>${esc(c.email)}</b>${drop ? '' : ' along with shipping instructions'}. Work begins once payment is confirmed.</p>
    ${drop ? `<div class="callout">Bring your cards to <b>${esc(d.name)}</b>, ${d.address.map(esc).join(', ')}. Mention ${esc(s.code)}.</div>`
      : `<div class="callout"><b>Ship to:</b><br>${ct.address.map(esc).join('<br>')}<br><span class="small muted">Write ${esc(s.code)} on a note inside the package. Tracked and insured shipping recommended.</span></div>`}
    <p>Your private page shows every update, photo and invoice — bookmark it:</p>
    <p><a class="btn red" href="#/my/${esc(c.token)}">Open my private page</a></p></div>`;
  window.scrollTo(0, 0);
}

// ---------------- order status + customer page ----------------
const SUB_STEPS = ['submitted', 'invoiced', 'paid', 'received', 'in_progress', 'restored', 'shipped', 'completed'];
const ORDER_STEPS = ['paid', 'fulfilled'];
function timeline(steps, cur, history) {
  const at = s => (history.slice().reverse().find(h => h.status === s) || {}).at;
  const idx = steps.indexOf(cur);
  return `<ul class="timeline">${steps.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'done now' : ''}">${esc(s === 'paid' && steps === ORDER_STEPS ? 'Order placed & paid' : STATUS_LABEL[s])}${at(s) ? ` <span class="small dim">· ${fmtDate(at(s), true)}</span>` : ''}</li>`).join('')}</ul>`;
}
function orderBlock(o) {
  const stopped = ['refunded', 'cancelled'].includes(o.status);
  return `<div class="panel" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Order ${esc(o.number)}</h3><span class="small muted">${fmtDate(o.created)}</span></div>
    <p class="small muted">${o.items.map(i => `${i.qty} × ${esc(i.title)} ${esc(i.variant)}`).join(' · ')} — ${money(o.total)}</p>
    ${stopped ? `<span class="pill bad">${esc(STATUS_LABEL[o.status])}</span>` : timeline(ORDER_STEPS, o.status, o.history)}
    ${o.tracking ? `<p class="small" style="margin:8px 0 0">Tracking: <b>${esc(o.tracking)}</b></p>` : ''}</div>`;
}
function subBlock(s, token) {
  const pr = C().prices, q = quote(pr, s.cards); const due = s.status === 'invoiced' && s.invoice.status !== 'paid';
  return `<div class="panel" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Restoration ${esc(s.code)}</h3><span class="small muted">${fmtDate(s.created)}</span></div>
    ${s.status === 'cancelled' ? '<span class="pill bad">Cancelled</span>' : timeline(SUB_STEPS, s.status, s.history)}
    ${s.public_notes ? `<div class="callout" style="margin:10px 0">${esc(s.public_notes)}</div>` : ''}
    <div class="table-wrap" style="margin-top:10px"><table><tr><th>Card</th><th>Service</th><th>Status</th><th class="num">Price</th></tr>
      ${s.cards.map((c, i) => `<tr><td>${c.photos && c.photos.front ? `<img class="thumb" src="${c.photos.front}" alt="" style="float:left;margin-right:10px">` : ''}<b>${esc(c.name)}</b><br><span class="small muted">${esc(c.details || '')}</span></td>
        <td>${c.service === 'cleaning' ? 'Cleaning' : 'Restoration'}${(c.addons || []).length ? `<br><span class="small muted">+ ${c.addons.map(k => esc(pr.addons.find(a => a.key === k)?.name || k)).join(', ')}</span>` : ''}</td>
        <td>${esc(STATUS_LABEL[c.status] || c.status)}</td><td class="num">${money0(q.lines[i].total)}</td></tr>`).join('')}
      <tr><td colspan="3"><b>Invoice</b> ${s.invoice.status === 'paid' ? '<span class="pill ok">Paid</span>' : due ? '<span class="pill warn">Due</span>' : '<span class="pill">Being prepared</span>'}</td><td class="num"><b>${money0(s.invoice.total)}</b></td></tr></table></div>
    ${due && token ? `<a class="btn red" style="margin-top:12px" href="#/pay/${esc(s.code)}?t=${esc(token)}">Pay invoice ${money0(s.invoice.total)}</a>` : ''}</div>`;
}
function status(args, params) {
  app.innerHTML = `<div class="narrow section tight" style="max-width:720px"><h1>Order Status</h1>
    <p class="muted">Look up a product order (like #1001) or a restoration submission (like SAE-1041) with the email you used.</p>
    <form id="lk" class="panel"><div class="grid2"><div class="field"><label>Order number or submission code</label><input id="q" value="${esc(params.get('q') || '')}"></div>
      <div class="field"><label>Email</label><input id="e" type="email" value="${esc(params.get('e') || '')}"></div></div>
      <button class="btn red">Find my order</button></form><div id="res" style="margin-top:20px"></div></div>`;
  const find = () => {
    const q = $('#q').value.trim(), e = $('#e').value.trim().toLowerCase(); const res = $('#res');
    if (!q || !e) return;
    const o = store.order(q.replace(/^#?/, '#')); const s = store.submission(q);
    const own = x => x && (store.customer(x.customer_id) || {}).email === e;
    if (own(o)) res.innerHTML = orderBlock(o); else if (own(s)) res.innerHTML = subBlock(s);
    else res.innerHTML = `<div class="callout">We couldn't find that order with that email. Check the number in your confirmation email, or email <a class="link" href="mailto:${esc(C().contact.email)}">${esc(C().contact.email)}</a>.</div>`;
  };
  $('#lk').onsubmit = e => { e.preventDefault(); find(); };
  if (params.get('q')) find();
}
function my([tok]) {
  const c = store.customerByToken(tok);
  if (!c) return app.innerHTML = `<div class="narrow section"><h1>This link isn't valid</h1><p class="muted">It may have been replaced with a new one. Email ${esc(C().contact.email)} and we'll send you your current link.</p></div>`;
  const subs = store.submissions().filter(s => s.customer_id === c.id), orders = store.orders().filter(o => o.customer_id === c.id);
  app.innerHTML = `<div class="narrow section tight"><div class="kicker">Private page</div><h1>Hi ${esc(c.name.split(' ')[0])}</h1>
    <p class="muted">Everything you have with Shiny Asset Exchange, updated live. Keep this link private.</p>
    ${subs.length ? `<h2 style="margin-top:20px">Restorations</h2>${subs.map(s => subBlock(s, c.token)).join('')}` : ''}
    ${orders.length ? `<h2 style="margin-top:20px">Product orders</h2>${orders.map(orderBlock).join('')}` : ''}
    ${!subs.length && !orders.length ? '<p>Nothing here yet.</p>' : ''}</div>`;
}
function pay([code], params) {
  const s = store.submission(code), c = s && store.customer(s.customer_id);
  if (!s || !c || c.token !== params.get('t')) return notFound();
  if (s.invoice.status === 'paid') { location.hash = '#/my/' + c.token; return; }
  app.innerHTML = `<div class="narrow section tight" style="max-width:520px"><div class="kicker">Invoice · ${esc(s.code)}</div><h1>Pay your invoice</h1>
    <div class="panel" style="margin-bottom:16px">${quote(C().prices, s.cards).lines.map(l => `<div class="sum"><span>${esc(l.card.name)} — ${l.card.service === 'cleaning' ? 'Cleaning' : 'Restoration'}</span><span>${money0(l.total)}</span></div>`).join('')}
      <div class="sum total"><span>Total due</span><span>${money0(s.invoice.total)}</span></div></div>
    ${payFormHtml(s.invoice.total, 'Pay')}</div>`;
  bindPayForm();
  $('#payBtn').onclick = () => { const r = charge(s.invoice.total); if (!r.ok) return; store.payInvoice(s.id, r.payment); toast('Payment received — thank you!'); location.hash = '#/my/' + c.token; };
}

// ---------------- info pages ----------------
function faq() {
  app.innerHTML = `<div class="narrow section tight"><h1>FAQ</h1><p class="muted">${FAQ_INTRO}</p>
    ${FAQ.map(g => `<h2 style="margin-top:32px">${esc(g.group)}</h2>${g.intro ? `<p class="muted">${esc(g.intro)}</p>` : ''}
      ${g.items.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}`).join('')}
    <div style="margin-top:32px">${FAQ_OUTRO}</div><a class="btn red" href="#/review">Take the Free Card Review</a></div>`;
}
function tools() {
  app.innerHTML = `<div class="narrow section tight"><h1>Tools</h1>${TOOLS.intro.map(p => `<p class="muted">${esc(p)}</p>`).join('')}
    ${TOOLS.groups.map(g => `<h2 style="margin-top:32px">${esc(g.name)}</h2><p class="muted">${esc(g.sub)}</p>
      ${g.items.map(([n, u, d]) => `<div class="tool"><a href="${esc(u)}" target="_blank" rel="noopener sponsored">${esc(n)} →</a><p class="muted" style="margin:6px 0 0">${esc(d)}</p></div>`).join('')}`).join('')}
    <div class="callout" style="margin-top:32px"><h3>Before you dive in</h3>${TOOLS.warning.map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <h3>Looking for our own card care products?</h3><a class="btn red" href="#/shop">Shop Card Care</a></div>`;
}
function recs() {
  const p = RECS.pick;
  app.innerHTML = `<div class="narrow section tight"><h1>Recs</h1><p class="muted">${esc(RECS.intro)}</p><p class="small dim">${esc(RECS.affiliate)}</p>
    <div class="panel" style="margin-top:24px"><div class="kicker">Our top pick</div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.sub)}</p>
      ${p.body.map(t => `<p>${esc(t)}</p>`).join('')}<p class="small muted">Use code at checkout for 10% off</p><div class="code">${esc(p.code)}</div>
      <p style="margin-top:18px"><a class="btn red" href="${esc(p.url)}" target="_blank" rel="noopener sponsored">Shop ${esc(p.name)}</a></p></div>
    <h2 style="margin-top:32px">Why inspection matters before you buy</h2>${RECS.why.map(t => `<p class="muted">${esc(t)}</p>`).join('')}
    <h3>Looking for our own card care products?</h3><a class="btn red" href="#/shop">Shop Card Care</a></div>`;
}
function privacy() { app.innerHTML = `<div class="narrow section tight"><h1>Your Privacy Choices</h1>${PRIVACY.map(p => `<p class="muted">${esc(p)}</p>`).join('')}</div>`; }
function agreement() {
  app.innerHTML = `<div class="narrow section tight"><h1>Non Liability Agreement</h1>
    <iframe src="${NON_LIABILITY}" title="Non Liability Agreement" style="width:100%;height:80vh;border:0;background:#fff;border-radius:6px"></iframe></div>`;
}

router();
