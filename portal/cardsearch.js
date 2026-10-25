// Card-name suggestions from cards.json (built by tools/build_card_catalog.py).
// Plain script (window.RRCardSearch) so both the main site's intake form and the
// admin portal can use it:
//
//   RRCardSearch.attach(input)                    // picking fills "Charizard — Base Set 4/102 (1999)"
//   RRCardSearch.attach(nameInput, { details })   // name -> "Charizard", details -> "Base Set · 4/102 · 1999"
//
// Typing anything is still allowed; suggestions only help. The list loads on first focus.
(function () {
  const SRC = (document.currentScript && document.currentScript.src) || "";
  const URL_ = SRC ? new URL("cards.json", SRC).href : "cards.json";
  const MAX = 8;
  let loading = null, DB = null;

  const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9/]+/g, " ").trim();
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function load() {
    if (!loading) loading = fetch(URL_).then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); }).then((d) => {
      const cards = d.cards.map(([name, si, num, img]) => {
        const [, set, year, total, path] = d.sets[si];
        const number = /^\d+$/.test(num) && total ? `${num}/${total}` : num;
        const pic = img === 1 ? `${d.img}${path}/${num}/low.webp` : img ? `${img}/low.webp` : "";
        return { name, set, year, number, pic, n: norm(name), num: norm(num), full: norm(number),
          hay: norm(`${name} ${set} ${number} ${year}`), order: si };
      });
      DB = cards;
      return cards;
    }).catch((e) => { loading = null; throw e; });
    return loading;
  }

  function search(q) {
    const words = norm(q.replace(/#/g, " ")).split(" ").filter(Boolean);
    if (!DB || !words.length || q.trim().length < 2) return [];
    const nq = norm(q);
    const out = [];
    for (const c of DB) {
      if (!words.every((w) => c.hay.includes(w))) continue;
      let score = 0;
      if (c.n === nq) score += 100;
      else if (c.n.startsWith(nq)) score += 60;
      else if (c.n.startsWith(words[0])) score += 40;
      else if (c.n.split(" ").some((t) => t.startsWith(words[0]))) score += 20;
      if (words.some((w) => w === c.num || w === c.full)) score += 50; // "torchic 108" -> card #108 first
      out.push([score, c]);
    }
    out.sort((a, b) => b[0] - a[0] || a[1].name.length - b[1].name.length || a[1].order - b[1].order);
    return out.slice(0, MAX).map((x) => x[1]);
  }

  const label = (c) => `${c.name} — ${c.set} ${c.number}${c.year ? ` (${c.year})` : ""}`;
  const details = (c) => [c.set, c.number, c.year].filter(Boolean).join(" · ");

  let css = false;
  function addCss() {
    if (css) return; css = true;
    const st = document.createElement("style");
    st.textContent = `
.rrcs{position:fixed;z-index:9999;max-height:340px;overflow:auto;background:#0d1426;border:1px solid #2a3a5c;
  border-radius:8px;box-shadow:0 10px 30px rgba(0,0,0,.5);font:14px/1.3 system-ui,sans-serif;color:#e8ecf4;padding:4px}
.rrcs-i{display:flex;gap:10px;align-items:center;padding:6px 8px;border-radius:6px;cursor:pointer}
.rrcs-i.on,.rrcs-i:hover{background:#1b2742;outline:1px solid #f5b301}
.rrcs-i img{width:32px;height:44px;object-fit:cover;border-radius:3px;background:#1b2742;flex:none}
.rrcs-i .ph{width:32px;height:44px;border-radius:3px;background:#1b2742;flex:none}
.rrcs-i b{display:block;font-weight:600}
.rrcs-i span{color:#9fb0cc;font-size:12px}
.rrcs-note{padding:6px 8px;color:#9fb0cc;font-size:12px}`;
    document.head.appendChild(st);
  }

  function attach(input, opts = {}) {
    if (!input || input._rrcs) return; input._rrcs = true;
    addCss();
    input.setAttribute("autocomplete", "off");
    input.setAttribute("aria-autocomplete", "list");
    const box = document.createElement("div");
    box.className = "rrcs"; box.setAttribute("role", "listbox"); box.hidden = true;
    document.body.appendChild(box);
    let items = [], on = -1, timer = 0;

    const place = () => {
      const r = input.getBoundingClientRect();
      box.style.left = r.left + "px"; box.style.width = Math.max(r.width, 260) + "px";
      const below = window.innerHeight - r.bottom;
      if (below < 200 && r.top > below) { box.style.top = ""; box.style.bottom = (window.innerHeight - r.top + 4) + "px"; }
      else { box.style.bottom = ""; box.style.top = (r.bottom + 4) + "px"; }
    };
    const close = () => { box.hidden = true; on = -1; input.setAttribute("aria-expanded", "false"); };
    const highlight = (i) => {
      on = i;
      [...box.children].forEach((el, j) => el.classList.toggle("on", j === i));
      if (box.children[i]) box.children[i].scrollIntoView({ block: "nearest" });
    };
    const pick = (c) => {
      if (opts.details) { input.value = c.name; opts.details.value = details(c); }
      else input.value = label(c);
      close();
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      if (opts.onPick) opts.onPick(c);
    };
    const render = () => {
      items = search(input.value);
      if (!items.length) { close(); return; }
      box.innerHTML = items.map((c) => `<div class="rrcs-i" role="option">
        ${c.pic ? `<img loading="lazy" alt="" src="${esc(c.pic)}" onerror="this.className='ph';this.removeAttribute('src')">` : `<div class="ph"></div>`}
        <div><b>${esc(c.name)}</b><span>${esc(c.set)} · ${esc(c.number)}${c.year ? " · " + esc(c.year) : ""}</span></div></div>`).join("")
        + `<div class="rrcs-note">Not listed? Just type it in.</div>`;
      [...box.querySelectorAll(".rrcs-i")].forEach((el, i) => {
        el.addEventListener("mousedown", (e) => e.preventDefault()); // keep focus in the input
        el.addEventListener("click", () => pick(items[i]));
      });
      on = -1; place(); box.hidden = false; input.setAttribute("aria-expanded", "true");
    };

    input.addEventListener("focus", () => { load().then(() => { if (document.activeElement === input && input.value) render(); }).catch(() => {}); });
    input.addEventListener("input", (e) => {
      if (!e.isTrusted) return; // our own event after a pick
      clearTimeout(timer);
      timer = setTimeout(() => load().then(render).catch(() => {}), 80);
    });
    input.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); highlight(Math.min(on + 1, items.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); highlight(Math.max(on - 1, 0)); }
      else if (e.key === "Enter" && on >= 0) { e.preventDefault(); pick(items[on]); }
      else if (e.key === "Escape") close();
    });
    input.addEventListener("blur", () => setTimeout(close, 120));
    window.addEventListener("scroll", () => { if (!box.hidden) place(); }, true);
    window.addEventListener("resize", () => { if (!box.hidden) place(); });
    // the input was removed from the page (re-render) -> drop its list too
    new MutationObserver((_, obs) => { if (!input.isConnected) { box.remove(); obs.disconnect(); } })
      .observe(document.body, { childList: true, subtree: true });
  }

  window.RRCardSearch = { attach, load, search };
})();
