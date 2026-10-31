// Data API for Scan Station: Supabase (accounts, cards table, private "cards" storage bucket)
// or, with placeholder config / ?demo, an in-memory stand-in that forgets everything on reload.
const CFG = window.SCANNER_CONFIG || {};
export const DEMO = new URLSearchParams(location.search).has("demo") ||
  !CFG.supabaseUrl || CFG.supabaseUrl.includes("YOUR-PROJECT");
const BUCKET = "cards";
export const appUrl = () => location.origin + location.pathname + (DEMO && location.search.includes("demo") ? "?demo" : "");

let _sb = null;
async function sb() {
  if (_sb) return _sb;
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  _sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey);
  return _sb;
}
const must = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

const realApi = {
  async session() { return (await (await sb()).auth.getSession()).data.session; },
  async onAuth(cb) { (await sb()).auth.onAuthStateChange((ev, s) => cb(ev, s)); },
  async signIn(email, password) { must(await (await sb()).auth.signInWithPassword({ email, password })); },
  async signUp(email, password, displayName) {
    const d = must(await (await sb()).auth.signUp({ email, password,
      options: { emailRedirectTo: appUrl(), data: { display_name: displayName || "" } } }));
    return { confirm: !d.session };
  },
  async resetPassword(email) { must(await (await sb()).auth.resetPasswordForEmail(email, { redirectTo: appUrl() })); },
  async updatePassword(password) { must(await (await sb()).auth.updateUser({ password })); },
  async signOut() { await (await sb()).auth.signOut(); },

  async profile() { return must(await (await sb()).from("profiles").select("*").maybeSingle()); },
  async saveProfile(p) {
    const s = await realApi.session();
    must(await (await sb()).from("profiles").update({ display_name: p.display_name, ebay_store: p.ebay_store }).eq("id", s.user.id));
  },
  async listCards() {
    const c = await sb(), out = [];
    for (let from = 0; ; from += 1000) {
      const rows = must(await c.from("cards").select("*").order("created_at", { ascending: false }).range(from, from + 999));
      out.push(...rows); if (rows.length < 1000) return out;
    }
  },
  async getCard(id) { return must(await (await sb()).from("cards").select("*").eq("id", id).maybeSingle()); },
  async countCards() {
    const { count, error } = await (await sb()).from("cards").select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message); return count || 0;
  },
  async insertCard(row) { return must(await (await sb()).from("cards").insert(row).select().single()); },
  async updateCard(id, patch) { return must(await (await sb()).from("cards").update(patch).eq("id", id).select().single()); },
  async deleteCard(id) { must(await (await sb()).from("cards").delete().eq("id", id)); },
  async deleteAccount() { must(await (await sb()).rpc("delete_me")); await (await sb()).auth.signOut(); },

  async putFile(path, blob) {
    must(await (await sb()).storage.from(BUCKET).upload(path, blob, { contentType: blob.type || "image/jpeg", upsert: true }));
    return path;
  },
  async removeFiles(paths) { if (paths.length) must(await (await sb()).storage.from(BUCKET).remove(paths)); },
  async getFile(path) { return must(await (await sb()).storage.from(BUCKET).download(path)); },
  // Private bucket: pictures are shown through short-lived signed links.
  async urls(paths) {
    const now = Date.now(), need = [...new Set(paths.filter(Boolean))].filter((p) => !(urlCache.get(p)?.until > now));
    for (let i = 0; i < need.length; i += 100) {
      const res = must(await (await sb()).storage.from(BUCKET).createSignedUrls(need.slice(i, i + 100), 3600));
      for (const r of res) if (r.signedUrl) urlCache.set(r.path, { url: r.signedUrl, until: now + 50 * 60e3 });
    }
    return Object.fromEntries(paths.filter(Boolean).map((p) => [p, urlCache.get(p)?.url || ""]));
  },
};
const urlCache = new Map();

// ------------------------------------------------------------------ demo
const mem = { user: null, profile: null, cards: [], files: new Map(), listeners: [] };
const delay = (v) => new Promise((r) => setTimeout(() => r(v), 60));
const demoUser = (email) => ({ user: { id: "demo-user", email } });
const demoApi = {
  async session() { return mem.user; },
  async onAuth(cb) { mem.listeners.push(cb); },
  async signIn(email) {
    mem.user = demoUser(email || "demo@example.com");
    mem.profile ||= { id: "demo-user", display_name: "Demo collector", ebay_store: "", card_limit: 200 };
    mem.listeners.forEach((cb) => cb("SIGNED_IN", mem.user));
  },
  async signUp(email, pw, displayName) { await demoApi.signIn(email); mem.profile.display_name = displayName || ""; return { confirm: false }; },
  async resetPassword() { return delay(); },
  async updatePassword() { return delay(); },
  async signOut() { mem.user = null; mem.listeners.forEach((cb) => cb("SIGNED_OUT", null)); },
  async profile() { return delay(mem.profile); },
  async saveProfile(p) { Object.assign(mem.profile, { display_name: p.display_name, ebay_store: p.ebay_store }); return delay(); },
  async listCards() { return delay(structuredClone(mem.cards).sort((a, b) => b.created_at.localeCompare(a.created_at))); },
  async getCard(id) { const c = mem.cards.find((x) => x.id === id); return delay(c ? structuredClone(c) : null); },
  async countCards() { return delay(mem.cards.length); },
  async insertCard(row) {
    if (mem.cards.length >= mem.profile.card_limit) throw new Error(`Card limit reached (${mem.profile.card_limit} cards).`);
    const c = { ...structuredClone(row), created_at: new Date().toISOString(), updated_at: new Date().toISOString(), user_id: "demo-user" };
    mem.cards.push(c); return delay(structuredClone(c));
  },
  async updateCard(id, patch) {
    const c = mem.cards.find((x) => x.id === id); if (!c) throw new Error("Card not found");
    Object.assign(c, structuredClone(patch), { updated_at: new Date().toISOString() }); return delay(structuredClone(c));
  },
  async deleteCard(id) { mem.cards = mem.cards.filter((c) => c.id !== id); return delay(); },
  async deleteAccount() { mem.cards = []; mem.files.clear(); mem.profile = null; await demoApi.signOut(); },
  async putFile(path, blob) { const old = mem.files.get(path); if (old) URL.revokeObjectURL(old.url);
    mem.files.set(path, { blob, url: URL.createObjectURL(blob) }); return delay(path); },
  async removeFiles(paths) { for (const p of paths) { const f = mem.files.get(p); if (f) URL.revokeObjectURL(f.url); mem.files.delete(p); } },
  async getFile(path) { const f = mem.files.get(path); if (!f) throw new Error("missing " + path); return f.blob; },
  async urls(paths) { return Object.fromEntries(paths.filter(Boolean).map((p) => [p, mem.files.get(p)?.url || ""])); },
};

export const api = DEMO ? demoApi : realApi;
