// Track record: "Got the slab back? Tell us the grade." Reports are kept on this device (always) and, when the
// Restored Rarity Supabase project has supabase/2026-11-18_centering_reports.sql installed, added to the shared,
// anonymous hit rate. Nothing identifying is sent: grader, grades, measured centering, tilt, picture type.
const KEY = "ciq-reports", CLIENT = "ciq-client";
const cfg = () => window.RR_CONFIG || {};
const live = () => /^https:\/\/.+\.supabase\.co/.test(cfg().supabaseUrl || "") && !/YOUR|xxxx/i.test(cfg().supabaseAnonKey || "");

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode: fine */ } },
};
function clientId() {
  let id = store.get(CLIENT, null);
  if (!id) { id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); store.set(CLIENT, id); }
  return id;
}
async function rpc(fn, args) {
  const k = cfg().supabaseAnonKey;
  const r = await fetch(`${cfg().supabaseUrl}/rest/v1/rpc/${fn}`, {
    method: "POST", headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json" },
    body: JSON.stringify(args || {}),
  });
  const body = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(body?.message || `answered ${r.status}`), { status: r.status, code: body?.code });
  return body;
}

export const localReports = () => store.get(KEY, []);
export function localStats() {
  const all = localReports();
  if (!all.length) return null;
  const held = all.filter((r) => r.real_grade <= r.predicted).length;
  const subs = all.filter((r) => r.subgrade != null);
  return { n: all.length, held: Math.round(100 * held / all.length), subN: subs.length,
           subExact: subs.length ? Math.round(100 * subs.filter((r) => r.subgrade === r.predicted).length / subs.length) : null };
}

// report: { company, predicted, real_grade, subgrade?, front_share, back_share, tilt, source, name? }
// Returns { shared: bool, note }.
export async function addReport(report) {
  const all = localReports(); all.unshift({ ...report, at: new Date().toISOString() }); store.set(KEY, all.slice(0, 500));
  if (!live()) return { shared: false, note: "Saved on this device." };
  const { name, ...anon } = report;                     // the card's name stays on the device
  try { await rpc("centering_report_add", { p: { ...anon, client: clientId() } }); return { shared: true, note: "Saved — and added to the shared track record. Thank you!" }; }
  catch (e) {
    if (e.status === 404 || e.code === "PGRST202") return { shared: false, note: "Saved on this device (the shared track record isn't switched on yet)." };
    const why = /fetch|network/i.test(e.message) ? "couldn't reach it — check the connection" : e.message;
    return { shared: false, note: `Saved on this device. Not added to the shared record (${why}).` };
  }
}
export function deleteLocal(i) { const all = localReports(); all.splice(i, 1); store.set(KEY, all); }

// Shared stats per grader or null when not available.
export async function sharedStats() {
  if (!live()) return null;
  try { return await rpc("centering_report_stats"); } catch { return null; }
}
