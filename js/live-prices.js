/* Shared live pricing for service pages.
   Same source as the homepage: built-in defaults, then public.site_get when available.
   Does not change portal or Apps Script logic. */
(function(){
  const ORIGIN = 'https://restoredraritytcg.com';

  const money = (n) => {
    const v = Number(n);
    if(!isFinite(v)) return '';
    return (Math.round(v * 100) / 100).toLocaleString('en-US', { style:'currency', currency:'USD' });
  };
  const clean = (v) => Math.max(0, Number(v) || 0);

  const state = {
    services: [
      { title:'Card Cleaning', type:'clean', price:10, bulk:true,
        desc:"A meticulous cleaning performed under magnification to safely lift dirt, grime, fingerprints, and surface buildup while restoring the card's natural presentation and holo brilliance. Does not include scratch repair or buffing." },
      { title:'Card Cleaning + Scratch Repair', type:'clean', price:15,
        desc:"Everything included in our Card Cleaning service, with additional surface refinement and precision buffing to reduce visible scratches, scuffs, and holo wear while preserving the card's original finish." },
      { title:'Grade-Ready Evaluation + Deep Clean', type:'clean', price:20,
        desc:"Our most comprehensive grading-prep service. Includes a detailed evaluation under magnification, deep cleaning, scratch and surface refinement, identification and correction of addressable surface defects, and minor corner or edge flattening where appropriate. Your card is cleaned, evaluated, refined, and ready to submit." },
      { title:'Base Repair', type:'repair', price:35,
        desc:"Targeted restoration for localized damage, including minor corner or edge lifting, dents or gouges under ¼ inch, and creases under ½ inch. Each repair is carefully addressed to stabilize the affected area and restore the card as close as possible to its original appearance." },
      { title:'Major Repair', type:'repair', price:50,
        desc:"Advanced restoration for significant damage, including major corner or edge lifting, delamination or layer separation, dents or gouges over ¼ inch, and creases over ½ inch. Designed for cards requiring more extensive techniques, additional working time, or multiple rounds of restoration to achieve the best result possible." },
      { title:'Slab Cracking', type:'addon', price:15,
        desc:"Careful removal of your card from a graded slab so it can be cleaned, restored, or resubmitted. The slab is opened with care to protect the card's surface, edges, and corners." },
      { title:'Grading Submission (PSA, CGC, BGS, TAG)', type:'grading', price:15,
        desc:"We package your card and submit it to the grading company you choose: PSA, CGC, BGS or TAG. The grading company's own fees are separate (see How grading fees work)." }
    ],
    bulk: [{ min:26, price: (globalThis.CLEANING_26_50_PRICE != null ? globalThis.CLEANING_26_50_PRICE : 7.5) }, { min:51, price:5 }],
    evalBulk: [{ min:26, price:16 }, { min:51, price:14 }],
    slabAddon: 10,
    gradingNext: 5,
    gradingAddon: 5
  };

  function applyPayload(pr){
    if(!pr || typeof pr !== 'object') return;
    const levels = list => (Array.isArray(list) ? list : []).map(b => ({ min: Math.max(2, Math.round(clean(b.min))), price: clean(b.price) })).filter(b => b.min);
    if(Array.isArray(pr.services) && pr.services.length){
      const keep = [];
      pr.services.forEach(x => {
        if(!x || !x.title || !['clean','repair','addon','grading'].includes(x.type)) return;
        keep.push({ title:String(x.title||'').trim(), type:x.type, price:clean(x.price), desc:String(x.desc||''), bulk:!!x.bulk });
      });
      if(keep.length) state.services = keep;
    }
    if(Array.isArray(pr.bulk)) state.bulk = levels(pr.bulk);
    if(Array.isArray(pr.evalBulk)) state.evalBulk = levels(pr.evalBulk);
    if(pr.slabAddon != null) state.slabAddon = clean(pr.slabAddon);
    if(pr.gradingNext != null) state.gradingNext = clean(pr.gradingNext);
    if(pr.gradingAddon != null) state.gradingAddon = clean(pr.gradingAddon);
  }

  function findService(pred){
    return state.services.find(pred);
  }
  function isEval(t){ return t && t.type === 'clean' && /evaluation|grade-ready/i.test(t.title); }

  function priceMap(){
    const cleanSvc = findService(t => t.type==='clean' && t.bulk) || findService(t => /card cleaning$/i.test(t.title));
    const scratch = findService(t => t.type==='clean' && /scratch/i.test(t.title));
    const evalSvc = findService(isEval);
    const base = findService(t => t.type==='repair' && /base/i.test(t.title));
    const major = findService(t => t.type==='repair' && /major/i.test(t.title));
    const slab = findService(t => t.type==='addon' || /slab/i.test(t.title));
    const grade = findService(t => t.type==='grading');
    const bulk26 = (state.bulk.find(b => b.min === 26) || state.bulk[0] || {}).price;
    const bulk51 = (state.bulk.find(b => b.min >= 51) || state.bulk[state.bulk.length-1] || {}).price;
    const eval26 = (state.evalBulk.find(b => b.min === 26) || state.evalBulk[0] || {}).price;
    const eval51 = (state.evalBulk.find(b => b.min >= 51) || state.evalBulk[state.evalBulk.length-1] || {}).price;
    return {
      'cleaning': cleanSvc && cleanSvc.price,
      'cleaning-scratch': scratch && scratch.price,
      'eval': evalSvc && evalSvc.price,
      'base-repair': base && base.price,
      'major-repair': major && major.price,
      'slab': slab && slab.price,
      'slab-addon': state.slabAddon,
      'grading-first': grade && grade.price,
      'grading-next': state.gradingNext,
      'grading-addon': state.gradingAddon,
      'cleaning-26-50': bulk26,
      'cleaning-51': bulk51,
      'eval-26-50': eval26,
      'eval-51': eval51
    };
  }

  function fillPrices(){
    const map = priceMap();
    document.querySelectorAll('[data-price]').forEach(el => {
      const key = el.getAttribute('data-price');
      const val = map[key];
      if(val == null || val === '') return;
      el.textContent = money(val);
    });
    // Optional service description fill
    const byKey = {
      'cleaning': findService(t => t.type==='clean' && (t.bulk || /card cleaning$/i.test(t.title))),
      'cleaning-scratch': findService(t => t.type==='clean' && /scratch/i.test(t.title)),
      'eval': findService(isEval),
      'base-repair': findService(t => t.type==='repair' && /base/i.test(t.title)),
      'major-repair': findService(t => t.type==='repair' && /major/i.test(t.title)),
      'slab': findService(t => t.type==='addon' || /slab/i.test(t.title)),
      'grading': findService(t => t.type==='grading')
    };
    document.querySelectorAll('[data-service-desc]').forEach(el => {
      const t = byKey[el.getAttribute('data-service-desc')];
      if(t && t.desc) el.textContent = t.desc;
    });
    document.querySelectorAll('[data-service-title]').forEach(el => {
      const t = byKey[el.getAttribute('data-service-title')];
      if(t && t.title) el.textContent = t.title;
    });
    syncServiceSchema(map);
  }

  function syncServiceSchema(map){
    const el = document.getElementById('rr-service');
    if(!el) return;
    let data;
    try{ data = JSON.parse(el.textContent); }catch(e){ return; }
    const keys = (el.getAttribute('data-offer-keys') || '').split(',').map(s => s.trim()).filter(Boolean);
    if(!keys.length){
      // single price
      const key = el.getAttribute('data-offer-key');
      if(key && map[key] != null && data.offers){
        data.offers.price = String(map[key]);
      }
    }else{
      const offers = keys.map(k => {
        const price = map[k];
        return price == null ? null : { '@type':'Offer', priceCurrency:'USD', price:String(price) };
      }).filter(Boolean);
      if(offers.length === 1) data.offers = offers[0];
      else if(offers.length) data.offers = offers;
    }
    el.textContent = JSON.stringify(data);
  }

  function paint(pr){
    applyPayload(pr);
    fillPrices();
  }

  paint(null);

  // Live prices from the same public site_get used by the homepage.
  const cfg = window.RR_CONFIG || {};
  if(!cfg.supabaseUrl || !cfg.supabaseAnonKey || /YOUR-/.test(cfg.supabaseUrl + cfg.supabaseAnonKey)) return;
  if(/[?&]nocms\b/.test(location.search)) return;
  fetch(cfg.supabaseUrl.replace(/\/$/, '') + '/rest/v1/rpc/site_get', {
    method: 'POST',
    headers: { apikey: cfg.supabaseAnonKey, Authorization: 'Bearer ' + cfg.supabaseAnonKey, 'Content-Type': 'application/json' },
    body: '{}'
  }).then(r => r.ok ? r.json() : null).then(c => {
    if(c && c.prices) paint(c.prices);
  }).catch(err => console.warn('Service page prices: using built-in defaults', err));
})();
