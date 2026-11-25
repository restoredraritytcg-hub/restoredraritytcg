/* Centering calculator — shared by /centering-calculator/.
   Thresholds are each grader's published centering tolerances. */
(function(){
  if(!document.getElementById('cent-f-top')) return;

/* ---------- Centering calculator ----------
   Thresholds below are each grader's published centering tolerances.
   Values are the maximum allowed "larger share" percentage (e.g. 55 means 55/45).
   front/back are evaluated against the worst axis of that face.            */

const CENT_STANDARDS = {
  PSA: {
    label: 'PSA',
    tiers: [
      { grade: 'PSA 10',  name: 'Gem Mint', front: 55, back: 75 },
      { grade: 'PSA 9',   name: 'Mint',     front: 60, back: 90 },
      { grade: 'PSA 8',   name: 'NM-MT',    front: 65, back: 90 }
    ],
    below: 'Below PSA 8'
  },
  BGS: {
    label: 'BGS',
    tiers: [
      { grade: 'BGS 10',  name: 'Pristine — Black Label eligible', front: 50, back: 60, frontBoth: true, blackLabel: true },
      { grade: 'BGS 9.5', name: 'Gem Mint', front: 55, frontBest: 50, back: 60 },
      { grade: 'BGS 9',   name: 'Mint',     front: 55, back: 70 }
    ],
    below: 'Below BGS 9'
  },
  CGC: {
    label: 'CGC',
    tiers: [
      { grade: 'CGC 10 Pristine', name: 'Pristine', front: 50, back: 50 },
      { grade: 'CGC 10',  name: 'Gem Mint', front: 55, back: 75 },
      { grade: 'CGC 9',   name: 'Mint',     front: 60, back: 90 },
      { grade: 'CGC 8',   name: 'NM/Mint',  front: 65, back: 90 }
    ],
    below: 'Below CGC 8'
  },
  TAG: {
    label: 'TAG',
    tiers: [
      { grade: 'TAG 10P', name: 'Pristine', front: 51,   back: { tcg: 52, sports: 54.5 } },
      { grade: 'TAG 10',  name: 'Gem Mint', front: 55,   back: { tcg: 65, sports: 70 } },
      { grade: 'TAG 9',   name: 'Mint',     front: 60,   back: { tcg: 75, sports: 90 } },
      { grade: 'TAG 8.5', name: 'NM-Mint+', front: 62.5, back: { tcg: 85, sports: 95 } },
      { grade: 'TAG 8',   name: 'NM-Mint',  front: 65,   back: { tcg: 95, sports: 95 } }
    ],
    below: 'Below TAG 8'
  }
};

const CENT_EPS = 0.051;

const centFrontIds = ['f-top','f-left','f-right','f-bottom'];
const centBackIds  = ['b-top','b-left','b-right','b-bottom'];
const centAllIds = centFrontIds.concat(centBackIds);
const centEl = {};
centAllIds.forEach(k => { centEl[k] = document.getElementById('cent-' + k); });

function centSplit(a, b){
  const total = a + b;
  if(!(total > 0)) return null;
  const pa = (a / total) * 100;
  return { a: pa, b: 100 - pa, worse: Math.max(pa, 100 - pa), better: Math.min(pa, 100 - pa) };
}
function centVals(ids){
  const out = {};
  for(const id of ids){
    const raw = centEl[id].value.trim();
    if(raw === '') return null;
    const n = Number(raw);
    if(isNaN(n) || n < 0) return null;
    out[id.split('-')[1]] = n;
  }
  return out;
}
function backLimit(tier){
  if(tier.back === undefined) return null;
  return (typeof tier.back === 'object') ? tier.back.tcg : tier.back;
}

/* Best achievable tier for a grader. backWorst === null means back not supplied. */
function bestTier(std, frontWorst, frontBest, backWorst){
  for(const tier of std.tiers){
    const frontOk = (tier.frontBest !== undefined)
      ? (frontBest <= tier.frontBest + CENT_EPS && frontWorst <= tier.front + CENT_EPS)
      : (frontWorst <= tier.front + CENT_EPS);
    if(!frontOk) continue;
    const bl = backLimit(tier);
    if(backWorst === null) return { tier, provisional: true, backLimit: bl };
    if(bl === null || backWorst <= bl + CENT_EPS) return { tier, provisional: false, backLimit: bl };
  }
  return null;
}

function fmtPct(n){
  return (Math.round(n * 10) / 10).toFixed(1);
}
function splitText(s){
  return `${fmtPct(s.worse)} / ${fmtPct(s.better)}`;
}
function barColor(worse){
  if(worse <= 52) return 'linear-gradient(90deg, #3ddc84, #49dbe8)';
  if(worse <= 60) return 'linear-gradient(90deg, #49dbe8, #6fa8ff)';
  if(worse <= 75) return 'linear-gradient(90deg, #ffd23f, #f68a1e)';
  return 'linear-gradient(90deg, #f68a1e, #e5484d)';
}
function tierClass(idx, total){
  if(idx === 0) return 'tier-top';
  if(idx === 1) return 'tier-high';
  if(idx < total - 1) return 'tier-mid';
  return 'tier-low';
}

function renderAxes(containerId, lr, tb){
  const el = document.getElementById(containerId);
  if(!lr || !tb){ el.innerHTML = ''; return; }
  const rows = [
    { name: 'L / R', s: lr },
    { name: 'T / B', s: tb }
  ];
  el.innerHTML = rows.map(r => `
    <div class="cent-axis-row">
      <span class="axis-name">${r.name}</span>
      <span class="cent-axis-bar"><span class="cent-axis-fill" style="width:${r.s.worse}%; background:${barColor(r.s.worse)};"></span></span>
      <span class="cent-axis-val">${splitText(r.s)}</span>
    </div>
  `).join('');
}

/* Total border share of card width/height, measured from real Pokemon cards:
   front (yellow) ~7.9% horizontal / 5.9% vertical, back (blue) ~14% / 8%. */
const CENT_BORDER = {
  'cent-img-front': { H: 7.9, V: 6.2 },
  'cent-img-back':  { H: 9.9, V: 7.6 }
};

function paintCard(frameId, lr, tb){
  const img = document.getElementById(frameId);
  if(!img) return;
  const b = CENT_BORDER[frameId] || { H: 7.9, V: 5.9 };
  if(!lr || !tb){
    img.style.left = img.style.right = (b.H / 2).toFixed(2) + '%';
    img.style.top = img.style.bottom = (b.V / 2).toFixed(2) + '%';
    return;
  }
  img.style.left   = (b.H * (lr.a / 100)).toFixed(2) + '%';
  img.style.right  = (b.H * (lr.b / 100)).toFixed(2) + '%';
  img.style.top    = (b.V * (tb.a / 100)).toFixed(2) + '%';
  img.style.bottom = (b.V * (tb.b / 100)).toFixed(2) + '%';
}

function runCenteringCalc(){
  centAllIds.forEach(k => {
    centEl[k].classList.toggle('filled', centEl[k].value.trim() !== '');
  });

  const f = centVals(centFrontIds);
  const b = centVals(centBackIds);

  const fLR = f ? centSplit(f.left, f.right) : null;
  const fTB = f ? centSplit(f.top, f.bottom) : null;
  const bLR = b ? centSplit(b.left, b.right) : null;
  const bTB = b ? centSplit(b.top, b.bottom) : null;

  const frontOk = !!(fLR && fTB);
  const backOk  = !!(bLR && bTB);

  document.getElementById('cent-f-status').textContent = frontOk ? 'Measured' : 'Needs 4 values';
  document.getElementById('cent-f-status').classList.toggle('ok', frontOk);
  document.getElementById('cent-b-status').textContent = backOk ? 'Measured' : 'Not entered';
  document.getElementById('cent-b-status').classList.toggle('ok', backOk);

  renderAxes('cent-front-readout', fLR, fTB);
  renderAxes('cent-back-readout', bLR, bTB);
  paintCard('cent-img-front', fLR, fTB);
  paintCard('cent-img-back', bLR, bTB);

  const emptyEl  = document.getElementById('cent-empty');
  const outEl    = document.getElementById('cent-output');

  if(!frontOk){
    const partial = f && (!fLR || !fTB);
    emptyEl.textContent = partial
      ? "Opposite borders can't both be zero — please check your front measurements."
      : 'Enter the four front measurements to see your centering results.';
    emptyEl.style.display = 'block';
    outEl.style.display = 'none';
    return;
  }
  emptyEl.style.display = 'none';
  outEl.style.display = 'block';

  const frontWorst = Math.max(fLR.worse, fTB.worse);
  const frontBest  = Math.min(fLR.worse, fTB.worse);
  const backWorst  = backOk ? Math.max(bLR.worse, bTB.worse) : null;

  document.getElementById('cent-summary').innerHTML = `
    <div class="cent-stat">
      <div class="stat-label">Front — worst axis</div>
      <div class="stat-val" style="color:${frontWorst <= 55 ? 'var(--cyan)' : frontWorst <= 65 ? 'var(--yellow)' : 'var(--orange)'};">${fmtPct(frontWorst)}/${fmtPct(100-frontWorst)}</div>
    </div>
    <div class="cent-stat">
      <div class="stat-label">Back — worst axis</div>
      <div class="stat-val" style="color:${backWorst === null ? 'var(--muted)' : backWorst <= 70 ? 'var(--cyan)' : backWorst <= 90 ? 'var(--yellow)' : 'var(--orange)'};">${backWorst === null ? '—' : fmtPct(backWorst) + '/' + fmtPct(100-backWorst)}</div>
    </div>
  `;

  const cards = Object.keys(CENT_STANDARDS).map(key => {
    const std = CENT_STANDARDS[key];
    const res = bestTier(std, frontWorst, frontBest, backWorst);
    if(!res){
      return `
        <div class="grade-card tier-low">
          <span class="grader">${std.label}</span>
          <span class="grade-body">
            <span class="grade-val">${std.below}</span>
            <div class="grade-note">Centering falls outside this grader's published tiers.</div>
          </span>
        </div>`;
    }
    const idx = std.tiers.indexOf(res.tier);
    const cls = tierClass(idx, std.tiers.length);
    const note = res.provisional
      ? `Front qualifies. Needs back within ${res.backLimit}/${fmtPct(100-res.backLimit)} to confirm.`
      : res.tier.name;
    const isBL = res.tier.blackLabel === true;
    if(isBL){
      return `
        <div class="grade-card black-label${res.provisional ? ' bl-provisional' : ''}">
          <span class="bl-ribbon">BLACK LABEL</span>
          <span class="grader">${std.label}</span>
          <span class="grade-body">
            <span class="grade-val">BGS 10 <span class="bl-pristine">PRISTINE</span>${res.provisional ? '<span class="bl-prov-tag"> (front only)</span>' : ''}</span>
            <div class="grade-note">${res.provisional
              ? `Front is a perfect 50/50. Needs back within ${res.backLimit}/${fmtPct(100-res.backLimit)} to confirm.`
              : 'Perfect 50/50 front &mdash; the top centering tier Beckett awards.'}</div>
          </span>
        </div>`;
    }
    return `
      <div class="grade-card ${cls}">
        <span class="grader">${std.label}</span>
        <span class="grade-body">
          <span class="grade-val">${res.tier.grade}${res.provisional ? '<span style="font-size:11px; color:var(--muted); font-weight:400;"> (front only)</span>' : ''}</span>
          <div class="grade-note">${note}</div>
        </span>
      </div>`;
  }).join('');
  document.getElementById('cent-grades').innerHTML = cards;

  const backNote = document.getElementById('cent-backnote');
  if(!backOk){
    backNote.style.display = 'block';
    backNote.innerHTML = 'These are <strong>front-only</strong> estimates — the back can pull any of these down. Add the four back measurements for a complete read.';
  } else {
    backNote.style.display = 'none';
  }
}

centAllIds.forEach(k => centEl[k].addEventListener('input', runCenteringCalc));

document.getElementById('cent-reset').addEventListener('click', () => {
  centAllIds.forEach(k => { centEl[k].value = ''; });
  runCenteringCalc();
});

runCenteringCalc();

})();
