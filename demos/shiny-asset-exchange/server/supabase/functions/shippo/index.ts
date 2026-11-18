// Shiny Asset Exchange — Shippo shipping function (Supabase Edge Function, Deno).
// NOT YET DEPLOYED OR RUN: written for going live; test it with a Shippo TEST token (shippo_test_…) first.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   SHIPPO_API_TOKEN       Shippo API token (test or live). Never put it in the website.
//   SHIPPO_WEBHOOK_SECRET  any long random string; also in the webhook URL you give Shippo (…/shippo?webhook=<secret>)
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (provided by Supabase)
//
// Calls from the admin (POST JSON, Authorization: Bearer <signed-in admin's access token>):
//   {action:"rates", shipment:{address_from, address_to, parcel, insurance?, metadata}}  → {rates:[...]}
//   {action:"buy", rate_id, ref, label_format}                                          → {transaction, tracking_number, label_url, eta}
//   {action:"void", transaction}                                                         → {status}
// Checkout (no login): {action:"quote", shipment:{address_to, parcel}} → {rates:[{provider, service, token, amount, days}]} (no rate ids)
// Shippo webhook (event "track_updated"): POST …/shippo?webhook=<SHIPPO_WEBHOOK_SECRET>
import { createClient } from "jsr:@supabase/supabase-js@2";

const SHIPPO = "https://api.goshippo.com";
const env = (k: string) => Deno.env.get(k) ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function shippo(path: string, body?: unknown) {
  const res = await fetch(SHIPPO + path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `ShippoToken ${env("SHIPPO_API_TOKEN")}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Shippo ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
  return out;
}

// The site's address shape → Shippo's
const addr = (a: any) => ({ name: a.name || "", company: a.company || "", street1: a.line1, street2: a.line2 || "", city: a.city, state: a.state,
  zip: a.zip, country: a.country || "US", phone: a.phone || "", email: a.email || "" });

async function rates(s: any, withIds: boolean) {
  const shipment = await shippo("/shipments/", {
    address_from: addr(s.address_from), address_to: addr(s.address_to),
    parcels: [{ ...s.parcel, length: String(s.parcel.length), width: String(s.parcel.width), height: String(s.parcel.height), weight: String(s.parcel.weight) }],
    extra: s.insurance ? { insurance: { amount: String(s.insurance.amount), currency: "USD", content: s.insurance.content || "Trading cards" } } : undefined,
    metadata: s.metadata || "", async: false,
  });
  const list = (shipment.rates || []).map((r: any) => ({
    ...(withIds ? { id: r.object_id } : {}), provider: r.provider, service: r.servicelevel?.name, token: r.servicelevel?.token,
    amount: Number(r.amount), days: r.estimated_days ?? null, insurance: 0,
  })).sort((a: any, b: any) => a.amount - b.amount);
  if (list[0]) list[0].tags = ["Cheapest"];
  const fast = [...list].filter((r: any) => r.days != null).sort((a: any, b: any) => a.days - b.days || a.amount - b.amount)[0];
  if (fast) fast.tags = [...(fast.tags || []), "Fastest"];
  return list;
}

// Tracking update → the matching order / card return. Delivered card returns complete their submission.
async function onTrack(ev: any) {
  const d = ev.data || {}, st = d.tracking_status || {}, tn = d.tracking_number;
  if (!tn) return;
  const db = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"));
  const event = { at: st.status_date || new Date().toISOString(), status: st.status, details: st.status_details || "",
    location: [st.location?.city, st.location?.state].filter(Boolean).join(", ") };
  for (const [table, col] of [["submissions", "return_shipment"], ["orders", "shipment"]] as const) {
    const { data: rows } = await db.from(table).select(`id, status, ${col}`).eq(`${col}->>tracking`, tn);
    for (const row of rows || []) {
      const sh = (row as any)[col] || {};
      const next = { ...sh, status: st.status, status_details: st.status_details || "", eta: d.eta || sh.eta, events: [...(sh.events || []), event] };
      const patch: Record<string, unknown> = { [col]: next };
      if (table === "submissions" && st.status === "DELIVERED" && (row as any).status !== "completed") patch.status = "completed";
      await db.from(table).update(patch).eq("id", (row as any).id);
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  try {
    if (url.searchParams.has("webhook")) {
      if (!env("SHIPPO_WEBHOOK_SECRET") || url.searchParams.get("webhook") !== env("SHIPPO_WEBHOOK_SECRET")) return json({ error: "not allowed" }, 403);
      const ev = await req.json();
      if (ev.event === "track_updated") await onTrack(ev);
      return json({ ok: true });
    }
    const body = await req.json();
    if (body.action === "quote") return json({ rates: await rates({ ...body.shipment, address_from: body.shipment.address_from }, false) });

    // everything else: signed-in admins only (same is_admin() check as the portal)
    const user = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } });
    const { data: isAdmin } = await user.rpc("is_admin");
    if (isAdmin !== true) return json({ error: "Sign in to the admin portal first." }, 401);

    if (body.action === "rates") return json({ rates: await rates(body.shipment, true) });
    if (body.action === "buy") {
      const t = await shippo("/transactions/", { rate: body.rate_id, label_file_type: body.label_format || "PDF_4x6", metadata: body.ref || "", async: false });
      if (t.status !== "SUCCESS") return json({ error: (t.messages || []).map((m: any) => m.text).join(" ") || "Shippo couldn't create the label." }, 400);
      // follow the package (Shippo also sends track_updated for labels bought through it)
      return json({ transaction: t.object_id, tracking_number: t.tracking_number, label_url: t.label_url, eta: t.eta, test: !!t.test });
    }
    if (body.action === "void") return json(await shippo("/refunds/", { transaction: body.transaction, async: false }));
    return json({ error: "Unknown action." }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
