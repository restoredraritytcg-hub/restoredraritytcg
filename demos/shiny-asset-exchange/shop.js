// Shiny Asset Exchange demo — storefront (hash router).
import { store, money, money0, esc, fmtDate, stockState, totals, methodsOf, quote, tierFor, demoCharge, STATUS_LABEL } from './data.js';
import { trackingLink, statusLabel, shipCfg, shippo } from './shipping.js';
import * as PS from './portal/demostore.js';
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
  const A = PS.siteContent('announcement') || {}; const on = A.on && A.text && !(A.until && A.until < new Date().toISOString().slice(0, 10));
  const href = A.link && A.link.startsWith('#') && !A.link.startsWith('#/') ? '#/' + A.link.slice(1) : A.link;
  $('#announce').innerHTML = on ? esc(A.text) + (href ? ` <a href="${esc(href)}" style="color:#fff;text-decoration:underline">${esc(A.linkText || 'Learn more')}</a>` : '') : '';
  $('#announce').classList.toggle('hidden', !on);
  const ct = c.contact, d = c.dropoff;
  $('#footer').innerHTML = `<div class="wrap"><div class="cols">
    <div class="brandcol"><img src="${IMG}64F23902-BF59-4ECD-83AF-2698895120CB.png?width=200" alt=""><div class="script">Revive · Resale · Repeat</div>
      <p class="small">Professional card restoration. Professional Results.</p>
      <p><a class="btn ghost sm" href="https://www.instagram.com/shinyassetexchange/" target="_blank" rel="noopener">Instagram @shinyassetexchange</a></p></div>
    <div><h4>Questions? Reach us at</h4><p><a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></p><p>Phone: <a href="tel:${esc(ct.phone.replace(/\D/g, ''))}">${esc(ct.phone)}</a></p></div>
    <div><h4>Send your cards to:</h4><p>${ct.address.map(esc).join('<br>')}</p><p>Email: <a href="mailto:${esc(ct.email)}">${esc(ct.email)}</a></p></div>
    <div><h4>Local drop-off in Austin</h4><p>${esc(d.name)}<br>${d.address.map(esc).join('<br>')}<br>${esc(d.phone)}</p></div>
    </div><div class="base"><span>© ${new Date().getFullYear()} Shiny Asset Exchange</span><a href="#/privacy">Privacy policy</a><a href="#/agreement">Non Liability Agreement</a><a href="#/privacy">Your Privacy Choices</a><a href="#/tools">Tools</a><a href="#/recs">Recs</a><a href="https://www.instagram.com/shinyassetexchange/" target="_blank" rel="noopener">Instagram</a><a href="admin.html">Shop admin (demo)</a><a href="portal/admin.html">Work portal (demo)</a></div></div>`;
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
        : one ? `<button class="btn red sm" data-add="${esc(p.variants[0].id)}">Add to cart</button>` : '<span class="btn ghost sm">Choose</span>'}</div></a>`;
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
  '': home, shop, p: productPage, cart: cartPage, checkout, thanks, pricing, review, submit, status, faq, recs, tools, privacy, agreement, my,
};
function router() {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const [r, ...args] = path.split('/');
  const params = new URLSearchParams(query || '');
  $('#nav').classList.remove('open'); closeCart();
  $$('#nav a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#/' + r));
  (routes[r] || notFound)(args.map(decodeURIComponent), params);
  window.scrollTo(0, 0);
  chrome(); reveal();
}
window.addEventListener('hashchange', router);
store.onChange(() => { updateBadge(); });

// Fade sections in as they scroll into view (like the Restored Rarity site). Without IntersectionObserver, or with
// reduced motion, everything just shows.
let revealer = null;
function reveal() {
  const els = $$('.rv:not(.in)');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) { els.forEach(e => e.classList.add('in')); return; }
  revealer = revealer || new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); revealer.unobserve(e.target); } }), { rootMargin: '0px 0px -40px 0px' });
  els.forEach((e, i) => { e.style.transitionDelay = (i % 4) * 70 + 'ms'; revealer.observe(e); });
}

function notFound() { app.innerHTML = `<div class="narrow" style="padding-bottom:80px">${pageHead('Lost?', 'Page not found')}<a class="btn red" href="#/">Back to the home page</a></div>`; }

const pageHead = (script, title, sub = '') => `<div class="page-head rv">${script ? `<span class="script">${script}</span>` : ''}<h1 class="grad">${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>`;
const LOGO_BIG = IMG + '64F23902-BF59-4ECD-83AF-2698895120CB.png?width=800';
const secHead = (eyebrow, title, sub = '', cls = '') => `<div class="sec-head rv ${cls}">${eyebrow ? `<span class="eyebrow">${eyebrow}</span>` : ''}<h2>${title}</h2>${sub ? `<p>${sub}</p>` : ''}</div>`;
const tierRange = t => t.max == null ? money0(t.min) + '+' : `${money0(t.min)} – ${money0(t.max)}`;
const tierPrice = t => t.pct ? t.pct + '%' : money0(t.price);

function home() {
  const c = C(), h = c.hero, pr = c.prices;
  const feat = store.products().filter(p => p.featured).slice(0, 4);
  const best = store.product('hydration-phase-spray');
  const title = esc(h.title).replace(/\.\s+/, '.<br>');
  app.innerHTML = `
  <section class="hero2"><img class="bg" src="${IMG}MagicEraser_260221_222552.jpg?height=1920" alt="">
    <div class="wrap hero-grid">
      <div class="hero-logo"><img src="${LOGO_BIG}" alt="Shiny Asset Exchange — Revive, Resale, Repeat"></div>
      <div class="hero-copy"><div class="script">${esc(h.kicker)}</div>
        <h1 class="grad">${title}</h1>
        <p class="lead">${esc(h.sub)}</p><p class="muted" style="margin:0">${esc(h.line)}</p>
        <div class="ctas"><a class="btn red" href="#/submit">Restore My Card</a><a class="btn ghost" href="#/pricing">See Pricing</a></div>
        <div class="chips"><span class="chip"><b>7</b> business-day turnaround</span><span class="chip">Trades accepted at <b>85%</b></span><span class="chip">Local drop-off in <b>Austin</b></span></div>
      </div></div></section>

  <section class="section tight"><div class="wrap"><a class="promo rv" href="#/review"><span class="mini-card" aria-hidden="true"></span>
    <span class="pt"><b>Free Card Review</b><span>Is your card worth restoring? A few quick questions and we'll give you a straight answer, including when the answer is no.</span></span><span class="arrow">→</span></a></div></section>

  <section class="section"><div class="wrap">${secHead('How it works', 'How restoration works')}
    <div class="steps">
      <div class="step rv"><div class="n">1</div><h3>Submit</h3><p>Fill out our simple submission form with your card details and photos.</p></div>
      <div class="step rv"><div class="n">2</div><h3>We restore</h3><p>Our process includes hydration, careful pressing, and polishing, restoring your card's surface with precision and care.</p></div>
      <div class="step rv"><div class="n">3</div><h3>Ships back</h3><p>Track your order every step of the way. Once restoration is complete, your card ships back ready to grade, display, or sell.</p></div>
    </div></div></section>

  <div class="divider"></div>
  <section class="section"><div class="wrap">${secHead('Before you submit', 'What we can and can’t fix', 'Not all damage can be improved. What we guarantee is improvement, not perfection.')}
    <div class="fix rv">
      <div class="col yes"><h3>Restoration can help</h3><ul>
        <li><i>✓</i><span><b>Creases</b>Front creases typically improve about 90%, leaving a scar rather than a crease.</span></li>
        <li><i>✓</i><span><b>Indents</b>Shallow indents can usually be worked out.</span></li>
        <li><i>✓</i><span><b>Holo scratches</b>Usually reduced significantly, sometimes eliminated.</span></li>
        <li><i>✓</i><span><b>Warping</b>Flattened with controlled heat and pressure.</span></li>
        <li><i>✓</i><span><b>Ink &amp; adhesive</b>Sharpie, stickers, tape residue, glue and pen.</span></li>
        <li><i>✓</i><span><b>Dirt &amp; grime</b>Fingerprints, dust and everyday buildup.</span></li></ul></div>
      <div class="col no"><h3>We can’t fix</h3><ul>
        <li><i>✕</i><span><b>Whitening</b>Pigment loss — the fix risks the card itself.</span></li>
        <li><i>✕</i><span><b>Print lines</b>A manufacturing trait, improved maybe 5–10% of the time.</span></li>
        <li><i>✕</i><span><b>Material loss</b>Once it’s physically gone, it can’t be put back.</span></li></ul>
        <p style="margin:16px 0 0"><a class="link" href="#/faq">Read the full FAQ →</a></p></div></div></div></section>

  <div class="divider"></div>
  <section class="section"><div class="wrap">${secHead('<span class="script" style="font-size:18px;letter-spacing:0;text-transform:none">Card Restoration Services</span>', 'Priced by your card’s value', `Restoration includes a full clean and polish. Cleaning only is ${money0(pr.cleaning)} per card. Trades accepted as payment at 85%.`)}
    <div class="tiers-mini rv">${pr.tiers.map(t => `<div class="tm ${t.pct ? 'hot' : ''}"><span>${tierRange(t)}</span><b>${t.pct ? t.pct + '% value' : money0(t.price)}</b></div>`).join('')}</div>
    <div class="row rv" style="margin-top:22px"><a class="btn gold" href="#/pricing">Full price list &amp; add-ons</a><a class="btn ghost" href="#/review">Not sure? Free Card Review</a></div></div></section>

  <section class="section" style="padding-top:0"><div class="wrap">${secHead('Shipping or drop-off', 'Two ways to get your cards to us', 'Ship them in, or drop them off locally in Austin.')}
    <div class="ways"><div class="panel rv"><h3>Shipping to us</h3><p class="muted" style="margin:0 0 14px">Fill out the submission form and we'll send an invoice along with shipping instructions. Work begins once payment is confirmed.</p><a class="btn red sm" href="#/submit">Submit Your Cards</a></div>
      <div class="panel rv"><h3>Local drop-off in Austin</h3><p class="muted" style="margin:0 0 14px">Bring your cards to ${esc(c.dropoff.name)}, ${esc(c.dropoff.address[0])}. No form needed — just walk in and we'll handle the paperwork in person.</p><a class="btn ghost sm" href="#/pricing">Drop-off details</a></div></div></div></section>
  <section class="section tight"><div class="wrap"><div class="cta-band rv"><span class="script" style="color:#ffe3b0">Revive · Resale · Repeat</span>
    <h2>Ready to get started?</h2><p>We accept up to ${c.capacity} cards per week on a first-come, first-served basis.</p>
    <div class="row" style="justify-content:center"><a class="btn" href="#/submit">Submit Your Cards</a></div></div></div></section>

  <div class="divider"></div>
  <section class="section"><div class="wrap">
    <div class="row" style="justify-content:space-between;align-items:flex-end">${secHead('Card care products', 'The same products we use in every restoration is now available for your personal use.',
      'Freshen up your cards with the most effective card care product line on the market exclusively from Shiny Asset Exchange. Try our proprietary formula products for card care!', 'plain')}
      <a class="btn ghost rv" href="#/shop" style="margin-bottom:28px">View all</a></div>
    <div class="grid-products">${feat.map(p => pcard(p).replace('class="pcard"', 'class="pcard rv"')).join('')}</div></div></section>
  ${best ? `<section class="section" style="padding-top:8px"><div class="wrap bestseller compact"><div class="frame rv"><img src="${esc(best.images[0])}" alt="${esc(best.title)}"></div>
    <div class="rv"><span class="eyebrow">Bestseller</span><h2 class="grad">${esc(best.title)}</h2><p class="muted" style="font-size:17px">${esc(c.bestseller)}</p>
    <div class="row"><a class="btn red" href="#/p/${esc(best.handle)}">SHOP NOW</a><span class="pcard-price" style="color:var(--gold);font-weight:700;font-size:20px">${priceLabel(best)}</span></div></div></div></section>` : ''}
  ${eventsHtml()}${newsHtml()}${instagramHtml()}`;
  bindAdds(app);
  if ($('.instagram-media') && !window.instgrm) { const sc = document.createElement('script'); sc.async = true; sc.src = 'https://www.instagram.com/embed.js'; document.body.appendChild(sc); }
  else if (window.instgrm) window.instgrm.Embeds.process();
}

// Website content managed in the work portal (portal/admin.html#/site): events, news, Instagram.
function eventsHtml() {
  const today = new Date().toISOString().slice(0, 10);
  const ev = (PS.siteContent('shows') || []).filter(e => (e.endDate || e.date) >= today).sort((a, b) => a.date.localeCompare(b.date));
  if (!ev.length) return '';
  return `<div class="divider"></div><section class="section"><div class="wrap">${secHead('Come see us', 'Upcoming shows')}
    <div class="grid-products" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">${ev.map(e => `<div class="panel"><b style="color:#fff">${esc(e.name)}</b>
      <p class="small muted" style="margin:6px 0 0">${fmtDate(e.date + 'T12:00')}${e.endDate ? ' – ' + fmtDate(e.endDate + 'T12:00') : ''}${e.time ? '<br>' + esc(e.time) : ''}${e.location ? '<br>' + esc(e.location) : ''}</p>
      ${e.link ? `<a class="link small" href="${esc(e.link)}" target="_blank" rel="noopener">Details →</a>` : ''}</div>`).join('')}</div></div></section>`;
}
function newsHtml() {
  const posts = (PS.siteContent('news') || []).filter(n => n.published !== false).sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.date).localeCompare(String(a.date))).slice(0, 3);
  if (!posts.length) return '';
  return `<div class="divider"></div><section class="section"><div class="wrap">${secHead('News', 'From the studio')}
    <div class="grid-products" style="grid-template-columns:repeat(auto-fill,minmax(260px,1fr))">${posts.map(n => `<article class="pcard" style="cursor:default">
      ${n.image ? `<div class="img" style="aspect-ratio:16/10"><img src="${esc(n.image)}" alt=""></div>` : ''}<div class="body"><div class="small muted">${n.date ? fmtDate(n.date + 'T12:00') : ''}</div>
      <div class="t">${esc(n.title)}</div><p class="small muted" style="margin:0;white-space:pre-line">${esc(n.body || '')}</p>
      ${n.link ? `<a class="link small" href="${esc(n.link)}" target="_blank" rel="noopener">${esc(n.linkText || 'Read more')} →</a>` : ''}</div></article>`).join('')}</div></div></section>`;
}
function instagramHtml() {
  const I = PS.siteContent('instagram') || {}; if (!I.on) return '';
  const h = I.handle || 'shinyassetexchange';
  return `<div class="divider"></div><section class="section"><div class="wrap" style="text-align:center">${secHead('@' + esc(h), esc(I.heading || 'On Instagram'), I.sub ? esc(I.sub) : '', 'center')}
    ${(I.posts || []).length ? `<div class="grid-products" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr));text-align:left">${I.posts.map(u => `<blockquote class="instagram-media" data-instgrm-permalink="${esc(u)}" data-instgrm-version="14" style="background:#fff;border:0;border-radius:6px;margin:0;min-width:0;width:100%"><a href="${esc(u)}" target="_blank" rel="noopener">View this post on Instagram</a></blockquote>`).join('')}</div>` : ''}
    <a class="btn red" style="margin-top:18px;white-space:normal;max-width:100%" href="https://www.instagram.com/${esc(h)}/" target="_blank" rel="noopener">Follow @${esc(h)}</a></div></section>`;
}

function shop(args) {
  const col = args[0] || 'all';
  const all = store.products();
  const list = col === 'all' ? all : all.filter(p => p.collection === col);
  app.innerHTML = `<div class="wrap"><div class="page-head rv"><span class="script">The same products we use in every restoration</span><h1 class="grad">Products</h1><p>Try our proprietary formula products for card care!</p></div><div class="section tight" style="padding-top:8px">
    <div class="filters" style="margin:12px 0 22px">
      ${[['all', 'All products'], ['card-care', 'Card care'], ['hydration', 'Hydration Spray']].map(([k, l]) => `<a href="#/shop/${k}"><button class="${k === col ? 'on' : ''}">${l}</button></a>`).join('')}
    </div>
    <div class="grid-products">${list.map(pcard).join('') || '<p class="muted">Nothing here yet.</p>'}</div></div></div>`;
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
      <div class="buybox"><div class="crumbs"><a href="#/shop">Card care</a> / <span>${esc(p.collection === 'hydration' ? 'Hydration Spray' : 'Products')}</span></div>
        <span class="script" style="font-size:19px">Straight from our restoration studio</span><h1>${esc(p.title)}</h1>
        <div class="price-lg">${money(v.price)}</div>
        ${p.tagline ? `<p><strong>${esc(p.tagline)}</strong></p>` : ''}
        ${p.variants.length > 1 ? `<label>Size</label><div class="opts">${p.variants.map((x, i) => `<button class="opt ${i === vi ? 'on' : ''} ${stockState(x).key === 'out' ? 'out' : ''}" data-v="${i}">${esc(x.title)}</button>`).join('')}</div>` : ''}
        <div class="stock"><span class="dot ${s.key}"></span>${esc(s.label)}</div>
        <div class="row" style="margin:14px 0 22px">
          <div class="qty"><button data-q="-1" aria-label="Less">−</button><input id="qty" inputmode="numeric" value="${qty}" aria-label="Quantity"><button data-q="1" aria-label="More">+</button></div>
          <button class="btn red grow" id="add" ${s.key === 'out' ? 'disabled' : ''}>${s.key === 'out' ? 'Sold out' : 'Add to cart'}</button></div>
        <button class="btn block ghost" id="buy" ${s.key === 'out' ? 'disabled' : ''}>Buy it now</button>
        <div class="perks"><span>✦ The same formula we use on client cards every week</span><span>✦ Secure checkout by Stripe</span>
          <span>✦ <a class="link" href="${CARE_GUIDE}" target="_blank" rel="noopener">Card Care Guide</a> included</span></div>
        <div class="rte desc">${body}</div>
        <div class="callout" style="margin-top:24px"><b style="color:#fff">Rather have the pros do it?</b><p style="margin:6px 0 10px">Send your card in — restoration starts at ${money0(C().prices.tiers[0].price)}.</p>
          <a class="btn red sm" href="#/submit">Submit Your Cards</a> <a class="btn ghost sm" href="#/review">Free Card Review</a></div></div></div></div>`;
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
  const ms = methodsOf(C().shop), m = ms.find(x => x.key === t.method) || ms[0], s = m;
  return `<div class="sum"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>
    <div class="sum"><span>Shipping${t.method_name ? ` <span class="small muted">· ${esc(t.method_name)}</span>` : ''}</span><span>${t.shipping ? money(t.shipping) : 'Free'}</span></div>
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
    app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('Card care', 'Your cart')}<div class="panel">${c.html}</div>
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
  let method = methodsOf(C().shop)[0].key;
  let t = totals(C().shop, lines, method);
  const saved = (() => { try { return JSON.parse(localStorage.getItem('sae-checkout') || '{}'); } catch { return {}; } })();
  const f = (id, label, ac, type = 'text', req = true) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" type="${type}" autocomplete="${ac}" value="${esc(saved[id] || '')}" ${req ? 'required' : ''}></div>`;
  app.innerHTML = `<div class="wrap"><div class="checkout">
    <form id="co" novalidate>
      ${pageHead('Secure checkout', 'Checkout')}<h2 class="step-h"><i>1</i>Contact</h2>${f('email', 'Email', 'email', 'email')}${f('phone', 'Phone (optional)', 'tel', 'tel', false)}
      <h2 class="step-h"><i>2</i>Delivery</h2>
      <div class="grid2">${f('first', 'First name', 'given-name')}${f('last', 'Last name', 'family-name')}</div>
      ${f('line1', 'Address', 'address-line1')}${f('line2', 'Apartment, suite, etc. (optional)', 'address-line2', 'text', false)}
      <div class="grid3">${f('city', 'City', 'address-level2')}${f('state', 'State', 'address-level1')}${f('zip', 'ZIP code', 'postal-code')}</div>
      <h2 class="step-h"><i>3</i>Shipping method</h2><div class="ship-methods">${methodsOf(C().shop).map((m, i) => { const free = m.free_over && t.subtotal >= m.free_over;
        return `<label class="ship-m"><input type="radio" name="sm" value="${esc(m.key)}" ${i === 0 ? 'checked' : ''}><span><b>${esc(m.name)}</b><small>${esc(m.days || '')}${m.free_over && !free ? ` · free over ${money0(m.free_over)}` : ''}</small></span><em>${free || !+m.price ? 'Free' : money(m.price)}</em></label>`; }).join('')}</div>
      <p class="small muted" style="margin:8px 0 0">Ships from Elgin, TX with a tracking number emailed to you.</p>
      <h2 class="step-h"><i>4</i>Payment</h2><p class="small muted">All transactions are secure and encrypted.</p>
      ${payFormHtml(t.total, 'Pay')}
      <div class="err hidden" id="coErr"></div>
    </form>
    <aside class="summary"><div class="panel">${lines.map(l => `<div class="line" style="grid-template-columns:56px 1fr auto"><div style="position:relative"><img src="${esc(l.p.images[0])}" alt="" style="width:56px;height:56px"><span class="badge" style="top:-6px;right:-6px">${l.qty}</span></div>
      <div><div class="t">${esc(l.p.title)}</div><div class="small muted">${esc(l.v.title)}</div></div><div class="num">${money(l.price * l.qty)}</div></div>`).join('')}
      <div style="margin-top:12px" id="coSum">${sumHtml(t)}</div></div></aside></div></div>`;
  bindPayForm();
  let liveRates = null; // live Shippo rates at checkout (Prices & shop settings → Shippo → Checkout shipping prices)
  const shopNow = () => liveRates ? { ...C().shop, methods: liveRates } : C().shop;
  const bindMethods = () => $$('input[name=sm]').forEach(r => r.onchange = () => { method = r.value; t = totals(shopNow(), lines, method); $('#coSum').innerHTML = sumHtml(t); $('#payBtn').textContent = 'Pay ' + money(t.total); });
  bindMethods();
  if (shipCfg().shippo.checkout_rates === 'live') {
    const fetchRates = async () => {
      const a = { line1: $('#line1').value.trim(), city: $('#city').value.trim(), state: $('#state').value.trim(), zip: $('#zip').value.trim() };
      if (!a.line1 || !/^\d{5}/.test(a.zip)) return;
      $('.ship-methods').innerHTML = '<p class="small muted">Getting live rates…</p>';
      try {
        const oz = lines.reduce((n, l) => n + (l.v.weight_oz || 4) * l.qty, 0) + 4;
        const rates = await shippo.rates({ kind: 'quote', ref: 'checkout', name: 'Customer', address: a, box: oz > 24 ? 'medium' : oz > 8 ? 'small' : 'mailer', oz: Math.ceil(oz), insured: 0 }, true);
        const pick = ['Ground Advantage', 'Priority Mail', 'Ground Saver'].map(n => rates.find(r => r.service === n)).filter(Boolean);
        liveRates = pick.map((r, i) => ({ key: r.token, name: `${r.provider} ${r.service}`, price: r.amount, days: `${r.days} business day${r.days === 1 ? '' : 's'}`, free_over: 0 }));
        method = liveRates[0].key;
        $('.ship-methods').innerHTML = liveRates.map((m, i) => `<label class="ship-m"><input type="radio" name="sm" value="${esc(m.key)}" ${i === 0 ? 'checked' : ''}><span><b>${esc(m.name)}</b><small>${esc(m.days)} · live rate</small></span><em>${money(m.price)}</em></label>`).join('');
        bindMethods(); t = totals(shopNow(), lines, method); $('#coSum').innerHTML = sumHtml(t); $('#payBtn').textContent = 'Pay ' + money(t.total);
      } catch (e) { $('.ship-methods').innerHTML = `<p class="err small">${esc(e.message)}</p>`; }
    };
    ['line1', 'city', 'state', 'zip'].forEach(id => $('#' + id).addEventListener('change', fetchRates)); fetchRates();
  }
  $('#co').onsubmit = e => e.preventDefault();
  $('#payBtn').onclick = e => {
    e.preventDefault();
    const v = id => $('#' + id).value.trim(); const err = $('#coErr');
    const missing = ['email', 'first', 'last', 'line1', 'city', 'state', 'zip'].filter(id => !v(id));
    if (missing.length || !/^\S+@\S+\.\S+$/.test(v('email'))) { err.textContent = 'Please fill in your email and delivery address.'; err.classList.remove('hidden'); $('#' + (missing[0] || 'email')).focus(); return; }
    err.classList.add('hidden');
    try { localStorage.setItem('sae-checkout', JSON.stringify(Object.fromEntries(['email', 'phone', 'first', 'last', 'line1', 'line2', 'city', 'state', 'zip'].map(k => [k, v(k)])))); } catch {}
    if (shipCfg().shippo.checkout_rates === 'live' && !liveRates) { err.textContent = 'Enter your address to see shipping rates.'; err.classList.remove('hidden'); return; }
    const r = charge(t.total); if (!r.ok) return;
    const res = store.placeOrder({
      customer: { name: v('first') + ' ' + v('last'), email: v('email'), phone: v('phone') },
      ship: { name: v('first') + ' ' + v('last'), line1: v('line1'), line2: v('line2'), city: v('city'), state: v('state'), zip: v('zip'), country: 'US', method, rate: liveRates ? liveRates.find(m => m.key === method) : null },
      cart: lines.map(l => ({ variant_id: l.variant_id, qty: l.qty })), payment: r.payment,
    });
    if (!res.ok) { err.innerHTML = 'Some items sold out while you were checking out: ' + res.short.map(s => `${esc(s.title || '')} ${esc(s.variant || '')} (${s.have} left)`).join(', ') + '. You have not been charged — please update your cart.'; err.classList.remove('hidden'); return; }
    cart.clear(); location.hash = '#/thanks/' + res.order.id;
  };
}

function thanks([id]) {
  const o = store.order(id); if (!o) return notFound();
  const c = store.customer(o.customer_id);
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px"><div class="success-mark rv">✓</div>${pageHead('Order ' + esc(o.number), 'Thank you' + (c ? ', ' + esc(c.name.split(' ')[0]) : '') + '!')}
    <p>Your payment of <b>${money(o.total)}</b> went through and your order is confirmed. A receipt is on its way to ${esc(o.email)}.</p>
    <div class="panel">${o.items.map(i => `<div class="sum"><span>${i.qty} × ${esc(i.title)} ${esc(i.variant)}</span><span>${money(i.price * i.qty)}</span></div>`).join('')}
      <div style="margin-top:10px">${sumHtml(o)}</div></div>
    <p style="margin-top:18px">Track it any time on <a class="link" href="#/status?q=${encodeURIComponent(o.number)}&e=${encodeURIComponent(o.email)}">Order Status</a>${c ? ` or your <a class="link" href="#/my/${esc(c.token)}">private order page</a>` : ''}.</p>
    <a class="btn" href="#/shop">Continue shopping</a></div>`;
}

// ---------------- service pages ----------------
function pricing() {
  const c = C(), pr = c.prices, d = c.dropoff;
  const review = pr.addons.find(a => a.key === 'review');
  const per = a => a.unit === 'submission' ? 'per submission' : 'per ' + a.unit;
  app.innerHTML = `<div class="wrap"><div class="page-head rv"><span class="script">Card Restoration Services</span><h1 class="grad">Price List</h1>
    <p>We offer two services: full restoration, priced by your card's current market value, and cleaning only, priced flat per card. Look up your card at <a class="link" href="https://www.tcgplayer.com/" target="_blank" rel="noopener">TCGplayer.com</a> before submitting so you know where you land.</p></div>
    <div class="price-layout" style="padding-bottom:40px"><div>
      <div class="notice rv"><span class="tag">UPDATE</span><span><b>Pricing updated October 1, 2026</b> to make pricing on larger grails more clear.</span></div>
      <div class="callout rv"><h3 style="margin-bottom:6px">Before you submit</h3><p>Not all damage can be improved. Check our <a class="link" href="#/faq">FAQ</a> to see what we can and can't fix before sending your cards in.</p>
        <p style="margin:0">Still not sure? We recommend a Card Review for ${money0(review ? review.price : 5)} per card. We'll assess your card and tell you honestly what's possible before you commit to a full restoration.</p></div>

      <span class="group-label rv">Restoration · current card value</span>
      <p class="muted rv" style="margin-top:-6px">Creases, indents, scratches, warping, ink and adhesive. Includes a full clean and polish. Priced by your card's current value.</p>
      <div class="ladder">${pr.tiers.map(t => `<div class="tier rv"><span class="badge-price ${t.pct ? 'red' : ''}">${tierPrice(t)}</span><div class="body">
        <h3>${tierRange(t)}</h3><p>${esc(t.name)} · ${t.pct ? `${t.pct}% of your card's current value` : `${money0(t.price)} per card`}</p></div></div>`).join('')}</div>

      <span class="group-label gold rv">Cleaning only</span>
      <div class="ladder"><div class="tier rv"><span class="badge-price">${money0(pr.cleaning)}</span><div class="body"><h3>Cleaning</h3><p>Front and back wipe down with card spray and polish. No restoration work. Priced flat, regardless of card value.</p>
        <span class="sub">Cleaning is a good fit if your card is structurally sound and you just want it looking its best, whether for display or before a grading submission. If your card has creases, indents, or scratches, you want full restoration instead. Cleaning is already included in every restoration.</span></div></div></div>

      <span class="group-label rv">Extras / add-ons</span>
      <p class="muted rv" style="margin-top:-6px">Available with either service above.</p>
      <div class="ladder">${pr.addons.map(a => `<div class="tier rv"><span class="badge-price">${money0(a.price)}</span><div class="body"><h3>${esc(a.name)}</h3><p>${esc(a.desc)}</p><span class="sub">${per(a)}</span></div></div>`).join('')}</div>
    </div>
    <aside class="calc"><div class="panel"><h3>Price calculator</h3>
      <div class="field"><label>Service</label><select id="cSvc"><option value="restoration">Restoration</option><option value="cleaning">Cleaning only — ${money0(pr.cleaning)}</option></select></div>
      <div class="field" id="cValW"><label>Card value (TCGplayer, $)</label><input id="cVal" inputmode="decimal" placeholder="e.g. 300" value="250"></div>
      <div class="field"><label>Number of cards</label><input id="cQty" inputmode="numeric" value="1"></div>
      ${pr.addons.map(a => `<label class="check" style="font-size:14px"><input type="checkbox" data-ca="${a.key}"> ${esc(a.name)} (+${money0(a.price)} ${per(a)})</label>`).join('')}
      <div id="cOut" style="margin-top:12px"></div>
      <p class="small muted" style="margin:12px 0 0;text-align:center">An estimate. We review every card first and send a final invoice. Shipping both ways is extra.</p>
      <a class="btn red block" style="margin-top:14px" href="#/submit">Submit Your Cards</a></div></aside></div>

    <div class="divider"></div>
    <section class="section">${secHead('Shipping or drop-off', 'Two Ways to Get Your Cards to Us', 'Ship them in, or drop them off locally in Austin.')}
      <div class="ways rv"><div class="panel"><h3>Shipping to us</h3><p class="muted" style="margin:0">Fill out the submission form and we'll send an invoice along with shipping instructions. Work begins once payment is confirmed.</p></div>
        <div class="panel"><h3>Local drop-off in Austin</h3><p class="muted">Bring your cards to ${esc(d.name)}. No form needed — just walk in and we'll handle the paperwork in person.</p>
          <p class="small" style="margin:0">${esc(d.name)}<br>${d.address.map(esc).join('<br>')}<br><a class="link" href="tel:${d.phone.replace(/\D/g, '')}">${esc(d.phone)}</a></p></div></div>
      <div class="notice rv" style="margin:18px 0 0"><span class="tag">NOTE</span><span>One exception: cards valued over <b>$1,000</b> must be submitted through the online form, even if you plan to drop off in person. This gives us a documented record before the card changes hands, which protects both of us. Fill out the form first, then bring your card in.</span></div></section>
    <section class="section" style="padding-top:0">${secHead('', 'Good to know')}
      <ul class="good rv"><li>Pricing is the same whether you send one card or twenty. Every card gets the same individual attention, so we don't offer bulk discounts.</li>
        <li>Payment is due in full before work begins. We'll send you an invoice after reviewing your submission.</li>
        <li>Shipping is paid by the customer both directions. We recommend tracked and insured shipping when sending your cards to us.</li>
        <li>Trades accepted as payment at 85% of card value.</li></ul>
      <div class="cta-band rv"><h2>Ready to get started?</h2><div class="row" style="justify-content:center"><a class="btn" href="#/submit">Submit Your Cards</a></div></div></section></div>`;
  const calc = () => {
    const svc = $('#cSvc').value, n = Math.max(1, Math.min(100, parseInt($('#cQty').value, 10) || 1));
    $('#cValW').classList.toggle('hidden', svc === 'cleaning');
    const card = { service: svc, value: +$('#cVal').value.replace(/[^\d.]/g, '') || 0, addons: $$('[data-ca]').filter(x => x.checked).map(x => x.dataset.ca) };
    const q = quote(pr, Array.from({ length: n }, () => card)), one = q.lines[0];
    const t = svc === 'restoration' ? tierFor(pr, card.value) : null;
    $('#cOut').innerHTML = `<div class="row-sum"><span>${svc === 'cleaning' ? 'Cleaning' : (card.value ? t.name + ' restoration' : 'Restoration — enter a value')}</span><span>${money0(one.base)}</span></div>
      ${one.addons ? `<div class="row-sum"><span>Add-ons per card</span><span>${money0(one.addons)}</span></div>` : ''}
      ${n > 1 ? `<div class="row-sum"><span>× ${n} cards</span><span>${money0(one.total * n)}</span></div>` : ''}
      ${q.perSubmission.map(a => `<div class="row-sum"><span>${esc(a.name)} (per submission)</span><span>${money0(a.price)}</span></div>`).join('')}
      <div class="row-sum total"><span>Estimated total</span><span>${money0(q.total)}</span></div>`;
  };
  $$('#cSvc,#cVal,#cQty,[data-ca]').forEach(el => el.addEventListener(el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input', calc));
  calc();
}

function review() {
  const prices = C().prices; let A = {}, i = 0, path = [];
  const ok = s => !s.only || s.only(A);
  const next = f => { for (let j = f; j < ASSESS.Q.length; j++) if (ok(ASSESS.Q[j])) return j; return -1; };
  const intro = () => {
    app.innerHTML = `<div class="narrow" style="max-width:760px;padding-bottom:80px">${pageHead('Free Card Review', 'Is your card worth restoring?', "A few quick questions and we'll give you a straight answer, including when the answer is no.")}
      <div class="quiz-start rv"><span class="mini-card" aria-hidden="true"></span><div><b>Under 2 minutes</b><span>7 quick questions · honest answer · no sign-up</span></div><button class="btn red" id="go">Start</button></div></div>`;
    $('#go').onclick = render;
  };
  const render = () => {
    const s = ASSESS.Q[i]; let shown = 0, pos = 0;
    ASSESS.Q.forEach((q, j) => { if (ok(q)) { shown++; if (j <= i) pos = shown; } });
    app.innerHTML = `<div class="narrow section quiz" style="max-width:760px"><p class="kicker">Step ${pos} of ${shown}</p><div class="progress"><div style="width:${pos / shown * 100}%"></div></div>
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
    app.innerHTML = `<div class="narrow section quiz" style="max-width:760px"><p class="kicker">Your result</p>
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

// ---------------- Submit Cards: restoration & repair intake → the work portal ----------------
// Same flow as the Restored Rarity website: the form calls intake (intake_submit when live), the submission
// lands in the portal (portal/admin.html) with code SAE-…, and the customer gets their private portal link.
const GRADERS = ['PSA', 'CGC', 'BGS', 'TAG', 'Not sure yet'];
const m0 = n => '$' + (+n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
/** Card's service text in the portal's wording, e.g. "Restoration — Tier 1 ($80) + Card Review ($5) + Grading Submission ($20) — grading: PSA". */
function serviceText(pr, cd) {
  let t;
  if (cd.service === 'cleaning') t = `Cleaning (${m0(pr.cleaning)})`;
  else { const tr = tierFor(pr, cd.value); t = `Restoration — ${tr.name} (${tr.pct ? tr.pct + '% of card value' : m0(tr.price)})`; }
  for (const a of pr.addons) if (cd.addons.includes(a.key) && ['card'].includes(a.unit)) t += ` + ${a.name} (${m0(a.price)})`;
  const slab = pr.addons.find(a => a.key === 'slab'), ship = pr.addons.find(a => a.key === 'ship');
  if (slab && cd.addons.includes('slab')) t += ` + Slab Cracking (${m0(slab.price)})`;
  if (ship && cd.addons.includes('ship')) t += ` + Grading Submission (${m0(ship.price)}) — ${cd.grading === 'Not sure yet' ? 'grading company not chosen yet' : 'grading: ' + cd.grading}`;
  return t;
}

function submit(args, params) {
  const c = C(), pr = c.prices; const pre = (() => { try { return params.get('from') === 'review' ? JSON.parse(sessionStorage.getItem('sae-assess') || 'null') : null; } catch { return null; } })();
  const blank = () => ({ name: '', details: '', value: pre ? pre.value : '', service: pre ? pre.service : 'restoration', addons: pre && pre.review ? ['review'] : [], grading: '', damage: '', photos: {} });
  const cards = [blank()];
  const used = PS.queueThisWeek(), full = used >= c.capacity;
  app.innerHTML = `<div class="wrap" style="padding-bottom:40px"><div style="max-width:860px">${pageHead('Card Restoration Services', 'Ready to restore your cards?')}
    <p>We accept up to ${c.capacity} cards per week on a first-come, first-served basis. Once we receive your cards and payment is confirmed, turnaround is 1 week. Shipping time to us is separate — please plan accordingly based on your location.</p>
    <p>If you see a message below saying our queue is full this week, don't worry — you can still submit. Your cards will be added to the next available slot and your estimated timeline will reflect that automatically. Any questions, email us at <a class="link" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a>.</p>
    <p>Fill out the form below to submit your TCG cards for restoration or cleaning. We accept all trading card game cards in any condition — sports cards not accepted.</p>
    <div class="panel checklist rv"><h3>Before you submit:</h3>
    <ul><li>Look up your card's value at <a class="link" href="https://www.tcgplayer.com/" target="_blank" rel="noopener">TCGplayer.com</a> and have it ready — your service price is based on this value.</li>
      <li>Photograph the front and back of each card clearly before submitting.</li>
      <li>Add every card to this one form — use “+ Add another card”.</li>
      <li>Payment is due in full before work begins. We'll send payment instructions after reviewing your submission.</li>
      <li>For bulk restoration orders, please email your card details directly to <a class="link" href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a> instead of using this form.</li></ul></div>
    <div class="queue rv"><div class="qbar"><div style="width:${Math.min(100, used / c.capacity * 100)}%"></div></div><div>${full
      ? `<strong>Our queue is full this week.</strong> You can still submit — your cards go into next week's slot.`
      : `<strong>${c.capacity - used} of ${c.capacity} spots open this week.</strong> Cards received by Sunday join this week's queue.`}</div></div></div>
    <form id="sf" class="cols-main" style="margin-top:24px" novalidate>
      <div>
        <h2 class="step-h"><i>1</i>Your details</h2>
        <div class="grid2"><div class="field"><label>Full name</label><input id="s_name" autocomplete="name" required></div><div class="field"><label>Email</label><input id="s_email" type="email" autocomplete="email" required></div></div>
        <div class="grid2"><div class="field"><label>Phone</label><input id="s_phone" type="tel" autocomplete="tel"></div>
          <div class="field"><label>How will your cards get to us?</label><select id="s_del"><option value="ship">I'll ship them</option><option value="dropoff">Drop-off at ${esc(c.dropoff.name)} (Austin)</option></select></div></div>
        <div id="retWrap"><label style="margin-top:4px">Return shipping address <span class="dim">(we ship your cards back here)</span></label>
          <div class="field"><input id="s_a1" autocomplete="address-line1" placeholder="Street address"></div>
          <div class="field"><input id="s_a2" autocomplete="address-line2" placeholder="Apartment, suite, etc. (optional)"></div>
          <div class="grid3"><div class="field"><input id="s_city" autocomplete="address-level2" placeholder="City"></div><div class="field"><input id="s_st" autocomplete="address-level1" placeholder="State"></div><div class="field"><input id="s_zip" autocomplete="postal-code" placeholder="ZIP"></div></div>
          <label class="check"><input type="checkbox" id="s_ins" checked> Insure my return shipping</label></div>
        <h2 class="step-h"><i>2</i>Your cards</h2><div id="cards"></div>
        <button type="button" class="btn ghost" id="addCard">+ Add another card</button>
        <h2 class="step-h"><i>3</i>Anything else</h2><div class="field"><label>Anything else we should know?</label><textarea id="s_notes"></textarea></div>
        <div class="field"><label>How did you hear about us? (optional)</label><select id="s_how"><option value="">—</option><option>Instagram</option><option>YouTube</option><option>Home Town Cards & Collectibles</option><option>A friend</option><option>Google</option><option>Other</option></select></div>
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
        <div class="field"><label>Service</label><select data-f="service"><option value="restoration" ${cd.service === 'restoration' ? 'selected' : ''}>Restoration &amp; repair (creases, indents, scratches, warping, ink)</option><option value="cleaning" ${cd.service === 'cleaning' ? 'selected' : ''}>Cleaning only (${money0(pr.cleaning)})</option></select></div></div>
      <label>Add-ons</label><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:0 12px">${pr.addons.map(a => `<label class="check"><input type="checkbox" data-addon="${a.key}" ${cd.addons.includes(a.key) ? 'checked' : ''}> ${esc(a.name)} (+${money0(a.price)}/${esc(a.unit)})</label>`).join('')}</div>
      ${cd.addons.includes('ship') ? `<div class="field" style="max-width:320px"><label>Which grading company?</label><select data-f="grading"><option value="">Choose…</option>${GRADERS.map(g => `<option ${cd.grading === g ? 'selected' : ''}>${g}</option>`).join('')}</select>
        <p class="small muted" style="margin:6px 0 0">Complete the grading company's paperwork and include it with your cards.</p></div>` : ''}
      <div class="field" style="margin-top:8px"><label>What's wrong with it?</label><textarea data-f="damage" placeholder="Crease top right, light scratches on the holo…">${esc(cd.damage)}</textarea></div>
      <label>Photos</label><div class="photos">${['front', 'back'].map(s => `<label class="photo-slot">${cd.photos[s] ? `<img src="${cd.photos[s]}" alt="">` : `📷<br>${s === 'front' ? 'Front' : 'Back'}`}<input type="file" accept="image/*" data-photo="${s}"></label>`).join('')}</div>
      ${+cd.value > 1000 && $('#s_del').value === 'dropoff' ? '<p class="small muted" style="margin-top:8px">Cards over $1,000 must go through this form before drop-off — thanks for doing that.</p>' : ''}</div>`).join('');
    $$('.card-entry').forEach(el => {
      const cd = cards[+el.dataset.i];
      $$('[data-f]', el).forEach(inp => inp.addEventListener(inp.tagName === 'SELECT' ? 'change' : 'input', () => { cd[inp.dataset.f] = inp.value; drawQuote(); if (inp.dataset.f === 'service') draw(); }));
      $$('[data-addon]', el).forEach(cb => cb.onchange = () => { cd.addons = cb.checked ? [...cd.addons, cb.dataset.addon] : cd.addons.filter(k => k !== cb.dataset.addon); if (cb.dataset.addon === 'ship') draw(); else drawQuote(); });
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
    if (v('s_del') === 'ship' && !(v('s_a1') && v('s_city') && v('s_st') && v('s_zip'))) problems.push('a full return address');
    cards.forEach((cd, i) => {
      if (!cd.name.trim()) problems.push(`card ${i + 1}'s name`);
      if (cd.service === 'restoration' && !(+cd.value > 0)) problems.push(`card ${i + 1}'s value`);
      if (cd.addons.includes('ship') && !cd.grading) problems.push(`card ${i + 1}'s grading company`);
    });
    if (!$('#s_agree').checked) problems.push('agreement to the Non Liability Agreement');
    if (problems.length) { err.textContent = 'Please add ' + problems.join(', ') + '.'; err.classList.remove('hidden'); return; }
    const ship = v('s_del') === 'ship';
    const svc = cards.map(cd => serviceText(pr, cd));
    const payload = {
      name: v('s_name'), email: v('s_email'), phone: v('s_phone'),
      service: [...new Set(cards.map(cd => cd.service === 'cleaning' ? 'Cleaning' : 'Restoration'))].join(', '),
      notes: v('s_notes'),
      return_address: ship ? { line1: v('s_a1'), line2: v('s_a2'), city: v('s_city'), state: v('s_st').toUpperCase(), zip: v('s_zip') } : null,
      // delivery / address / source → internal notes (never on the customer's link), like Restored Rarity's intake_info
      intake_info: [`Delivery: ${ship ? 'Ship' : 'Drop-off at ' + C().dropoff.name}`, ship ? `Return address: ${[v('s_a1'), v('s_a2'), v('s_city') + ' ' + v('s_st') + ' ' + v('s_zip')].filter(Boolean).join(', ')}` : '',
        ship ? `Insured return shipping: ${$('#s_ins').checked ? 'Yes' : 'No'}` : '', v('s_how') ? `Heard about us: ${v('s_how')}` : '',
        `Estimate on the form: ${money0(quote(pr, cards).total)}`].filter(Boolean).join('\n'),
      cards: cards.map((cd, i) => ({ name: cd.name.trim(), details: cd.details.trim(), service: svc[i], grading: cd.addons.includes('ship') ? cd.grading : '',
        notes: [`Service: ${svc[i]}`, `Card value: $${(+cd.value || 0).toLocaleString('en-US')}`, cd.damage ? `Damage: ${cd.damage}` : ''].filter(Boolean).join('\n') })),
      photos: cards.map(cd => ['front', 'back'].filter(s => cd.photos[s]).map(s => ({ dataUrl: cd.photos[s], caption: s === 'front' ? 'Front (intake)' : 'Back (intake)' }))),
    };
    try { submitted(PS.intake(payload), v('s_email'), !ship); }
    catch (x) { err.textContent = /quota|storage|full/i.test(x.message || x.name) ? 'Your photos are too large for this demo browser — try fewer or smaller photos.' : 'Something went wrong: ' + x.message; err.classList.remove('hidden'); }
  };
  draw();
}
const portalLink = token => new URL('portal/view.html#t=' + token, location.href).href;
function submitted(r, email, drop) {
  const ct = C().contact, d = C().dropoff;
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px"><div class="success-mark rv">✓</div>${pageHead('Submission ' + esc(r.code), "Thanks — we've got your submission!")}
    <p>Your reference is <b>${esc(r.code)}</b>. We'll review your ${r.cards === 1 ? 'card' : r.cards + ' cards'} and email an invoice to <b>${esc(email)}</b>${drop ? '' : ' along with shipping instructions'}. Work begins once payment is confirmed.</p>
    ${drop ? `<div class="callout">Bring your cards to <b>${esc(d.name)}</b>, ${d.address.map(esc).join(', ')}. Mention ${esc(r.code)}.</div>`
      : `<div class="callout"><b>Ship to:</b><br>${ct.address.map(esc).join('<br>')}<br><span class="small muted">Write ${esc(r.code)} on a note inside the package. Tracked and insured shipping recommended.</span></div>`}
    <p>Your private page shows every status update, scan, before/after photo and centering measurement as we work — bookmark it:</p>
    <p><a class="btn red" href="${esc(portalLink(r.token))}">Open my private page</a></p></div>`;
  window.scrollTo(0, 0);
}

// ---------------- order status + customer page ----------------
const SUB_STEPS = ['submitted', 'received', 'in_progress', 'restored', 'ready', 'completed'];
const ORDER_STEPS = ['paid', 'fulfilled'];
function timeline(steps, cur, history) {
  const at = s => (history.slice().reverse().find(h => h.status === s) || {}).at;
  const idx = steps.indexOf(cur);
  return `<ul class="timeline">${steps.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'done now' : ''}">${esc(s === 'paid' && steps === ORDER_STEPS ? 'Order placed & paid' : STATUS_LABEL[s])}${at(s) ? ` <span class="small dim">· ${fmtDate(at(s), true)}</span>` : ''}</li>`).join('')}</ul>`;
}
function shipBox(sh, title = 'Shipped') {
  const done = sh.status === 'DELIVERED';
  return `<div class="shipbox ${done ? 'done' : ''}"><div class="row" style="justify-content:space-between"><b>${done ? 'Delivered' : esc(title)}</b><span class="pill ${done ? 'ok' : 'info'}">${esc(statusLabel(sh))}</span></div>
    <div class="small muted">${esc(sh.service || sh.carrier)} · ${trackingLink(sh)}${sh.eta && !done ? ` · estimated ${fmtDate(sh.eta)}` : ''}</div>
    ${(sh.events || []).length > 1 ? `<ul class="scans">${sh.events.slice().reverse().map(e => `<li><span>${fmtDate(e.at, true)}</span>${esc(e.details)}${e.location ? ` <em>${esc(e.location)}</em>` : ''}</li>`).join('')}</ul>` : ''}</div>`;
}
function orderBlock(o) {
  const stopped = ['refunded', 'cancelled'].includes(o.status);
  return `<div class="panel" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Order ${esc(o.number)}</h3><span class="small muted">${fmtDate(o.created)}</span></div>
    <p class="small muted">${o.items.map(i => `${i.qty} × ${esc(i.title)} ${esc(i.variant)}`).join(' · ')} — ${money(o.total)}</p>
    ${stopped ? `<span class="pill bad">${esc(STATUS_LABEL[o.status])}</span>` : timeline(ORDER_STEPS, o.status, o.history)}
    ${o.shipment ? shipBox(o.shipment) : o.tracking ? `<p class="small" style="margin:8px 0 0">Tracking: <b>${esc(o.tracking)}</b></p>` : ''}</div>`;
}
function subBlock({ submission: s, customer: c, cards }) {
  return `<div class="panel" style="margin-bottom:16px"><div class="row" style="justify-content:space-between"><h3 style="margin:0">Restoration ${esc(s.code)}</h3><span class="small muted">${fmtDate(s.created_at)}</span></div>
    ${timeline(SUB_STEPS, s.status, [{ status: s.status, at: s.status_changed_at || s.updated_at }])}
    ${s.public_notes ? `<div class="callout" style="margin:10px 0">${esc(s.public_notes)}</div>` : ''}
    ${s.return_shipment ? shipBox(s.return_shipment, 'Your cards are on the way back') : ''}
    <p class="small muted">${cards.map(k => esc(k.name)).join(' · ')}</p>
    <a class="btn red" href="${esc(portalLink(c.share_token))}">See every card, scan and photo</a></div>`;
}
function status(args, params) {
  app.innerHTML = `<div class="narrow" style="max-width:760px;padding-bottom:60px">${pageHead('Track your cards', 'Order Status', 'Look up a restoration submission (like SAE-1041) or a product order (like #1001) with the email you used.')}
    <form id="lk" class="panel"><div class="grid2"><div class="field"><label>Order number or submission code</label><input id="q" value="${esc(params.get('q') || '')}"></div>
      <div class="field"><label>Email</label><input id="e" type="email" value="${esc(params.get('e') || '')}"></div></div>
      <button class="btn red">Find my order</button></form><div id="res" style="margin-top:20px"></div></div>`;
  const find = () => {
    const q = $('#q').value.trim(), e = $('#e').value.trim().toLowerCase(); const res = $('#res');
    if (!q || !e) return;
    const o = store.order(q.replace(/^#?/, '#')); const s = PS.findSubmission(q, e);
    if (o && (store.customer(o.customer_id) || {}).email === e) res.innerHTML = orderBlock(o); else if (s) res.innerHTML = subBlock(s);
    else res.innerHTML = `<div class="callout">We couldn't find that order with that email. Check the number in your confirmation email, or email <a class="link" href="mailto:${esc(C().contact.email)}">${esc(C().contact.email)}</a>.</div>`;
  };
  $('#lk').onsubmit = e => { e.preventDefault(); find(); };
  if (params.get('q')) find();
}
function my([tok]) {
  const c = store.customerByToken(tok);
  if (!c) return app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('', "This link isn't valid")}<p class="muted">It may have been replaced with a new one. Email ${esc(C().contact.email)} and we'll send you your current link.</p></div>`;
  const orders = store.orders().filter(o => o.customer_id === c.id);
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('Your orders', 'Hi ' + esc(c.name.split(' ')[0]))}
    <p class="muted">Your Shiny Asset Exchange product orders, updated live. Keep this link private. Restorations have their own private page (linked in your submission email).</p>
    ${orders.map(orderBlock).join('') || '<p>Nothing here yet.</p>'}</div>`;
}

// ---------------- info pages ----------------
function faq() {
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('Questions', 'FAQ', FAQ_INTRO)}
    ${FAQ.map(g => `<div class="sec-head rv" style="margin:36px 0 16px"><h2>${esc(g.group)}</h2>${g.intro ? `<p>${esc(g.intro)}</p>` : ''}</div>
      ${g.items.map(([q, a]) => `<details class="faq"><summary>${esc(q)}</summary><p>${a}</p></details>`).join('')}`).join('')}
    <div style="margin-top:32px">${FAQ_OUTRO}</div><a class="btn red" href="#/review">Take the Free Card Review</a></div>`;
}
function tools() {
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('From our studio', 'Tools', esc(TOOLS.intro[0]))}<p class="muted rv">${esc(TOOLS.intro[1])}</p>
    ${TOOLS.groups.map(g => `<div class="sec-head rv" style="margin:36px 0 16px"><h2>${esc(g.name)}</h2><p>${esc(g.sub)}</p></div>
      ${g.items.map(([n, u, d]) => `<div class="tool"><a href="${esc(u)}" target="_blank" rel="noopener sponsored">${esc(n)} →</a><p class="muted" style="margin:6px 0 0">${esc(d)}</p></div>`).join('')}`).join('')}
    <div class="callout" style="margin-top:32px"><h3>Before you dive in</h3>${TOOLS.warning.map(p => `<p>${esc(p)}</p>`).join('')}</div>
    <h3>Looking for our own card care products?</h3><a class="btn red" href="#/shop">Shop Card Care</a></div>`;
}
function recs() {
  const p = RECS.pick;
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('Worth your money', 'Recs', esc(RECS.intro))}<p class="small dim">${esc(RECS.affiliate)}</p>
    <div class="panel" style="margin-top:24px"><div class="kicker">Our top pick</div><h2>${esc(p.name)}</h2><p class="muted">${esc(p.sub)}</p>
      ${p.body.map(t => `<p>${esc(t)}</p>`).join('')}<p class="small muted">Use code at checkout for 10% off</p><div class="code">${esc(p.code)}</div>
      <p style="margin-top:18px"><a class="btn red" href="${esc(p.url)}" target="_blank" rel="noopener sponsored">Shop ${esc(p.name)}</a></p></div>
    <h2 style="margin-top:32px">Why inspection matters before you buy</h2>${RECS.why.map(t => `<p class="muted">${esc(t)}</p>`).join('')}
    <h3>Looking for our own card care products?</h3><a class="btn red" href="#/shop">Shop Card Care</a></div>`;
}
function privacy() { app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('Privacy', 'Your Privacy Choices')}${PRIVACY.map(p => `<p class="muted">${esc(p)}</p>`).join('')}</div>`; }
function agreement() {
  app.innerHTML = `<div class="narrow" style="padding-bottom:60px">${pageHead('Before we work on your cards', 'Non Liability Agreement')}
    <iframe src="${NON_LIABILITY}" title="Non Liability Agreement" style="width:100%;height:80vh;border:0;background:#fff;border-radius:6px"></iframe></div>`;
}

router();
