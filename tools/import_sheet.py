"""Combine the intake Google Sheet exports (Submissions + Cards tabs) and build
a one-time Supabase import.

    python tools/import_sheet.py Submissions.csv Cards.csv OUT_DIR [--skip SUBMISSION_ID ...]

Writes to OUT_DIR (keep it out of the repo, it has customer details):
  combined.csv   one row per card with its submitter and submission
  customers.csv  one row per customer with their submissions
  issues.txt     rows that didn't line up
  import.sql     paste into Supabase SQL Editor and Run (safe to re-run)

Customers are matched by email, then by phone (so "Tung Ha" with and without
an email is one person). Original references (sub_... / RR-XXXXXX) are kept as
the submission code so existing emails and tracking links still match.
"""
import csv, json, os, re, sys
from collections import OrderedDict, defaultdict
from datetime import datetime

STATUS = {
    "submission received": "submitted",
    "in queue": "received",
    "received": "received",
    "in progress": "in_progress",
    "restored": "restored",
    "ready to ship / pick up": "ready",
    "completed": "completed", "shipped": "completed", "picked up": "completed",
}


def clean(s):
    return re.sub(r"\s+", " ", (s or "").replace("\r", "")).strip()


def ts(s):
    s = clean(s)
    for f in ("%m/%d/%Y %H:%M:%S", "%m/%d/%Y %H:%M", "%m/%d/%Y %I:%M %p"):
        try:
            return datetime.strptime(s, f).isoformat()
        except ValueError:
            pass
    return None


def status(s, issues, where):
    k = clean(s).lower()
    if not k:
        return "submitted"
    if k not in STATUS:
        issues.append(f"{where}: unknown status '{s}', imported as Submitted")
        return "submitted"
    return STATUS[k]


def phone_key(p):
    d = re.sub(r"\D", "", p or "")
    return d[-10:] if len(d) >= 10 else None


def main(sub_path, card_path, out, skip=()):
    os.makedirs(out, exist_ok=True)
    issues = []

    with open(sub_path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.reader(f))
    head = rows[0]
    subs = []
    for r in rows[1:]:
        r += [""] * (len(head) - len(r))
        d = dict(zip(head, r))
        # The two unnamed columns after "Card Count" hold referral code + discount.
        d["Referral"], d["Discount"] = clean(r[11]), clean(r[12])
        if clean(d["Submission ID"]) in skip:
            issues.append(f"{clean(d['Submission ID'])} ({clean(d['Name'])}): left out on request")
        elif clean(d["Submission ID"]):
            subs.append(d)

    with open(card_path, newline="", encoding="utf-8-sig") as f:
        cards = [c for c in csv.DictReader(f)
                 if clean(c.get("Submission ID")) and clean(c["Submission ID"]) not in skip]

    # --- group submissions into customers (email first, then phone) ---
    parent = {}

    def find(x):
        while parent.setdefault(x, x) != x:
            x = parent[x]
        return x

    def union(a, b):
        parent[find(a)] = find(b)

    for s in subs:
        sid = s["Submission ID"]
        email = clean(s["Email"]).lower()
        ph = phone_key(s["Phone"])
        find(sid)
        if email:
            union(sid, "e:" + email)
        if ph:
            union(sid, "p:" + ph)

    groups = OrderedDict()
    for s in sorted(subs, key=lambda s: ts(s["Timestamp"]) or ""):
        groups.setdefault(find(s["Submission ID"]), []).append(s)

    cards_by_sub = defaultdict(list)
    for c in cards:
        cards_by_sub[clean(c["Submission ID"])].append(c)
    sub_ids = {s["Submission ID"] for s in subs}
    for sid, cs in cards_by_sub.items():
        if sid not in sub_ids:
            names = ", ".join(clean(c["Card Name"]) for c in cs)
            issues.append(f"Cards with no matching submission (skipped): {sid} -> {names}")

    customers = []
    for subs_ in groups.values():
        # Prefer a properly capitalised name, then the longest.
        names = [clean(s["Name"]) for s in subs_]
        name = max(names, key=lambda n: (n != n.lower(), len(n)))
        emails = sorted({clean(s["Email"]).lower() for s in subs_ if clean(s["Email"])})
        phones = [clean(s["Phone"]) for s in subs_ if clean(s["Phone"])]
        if len(emails) > 1:
            issues.append(f"{name}: several emails {emails}, using the first")
        if len(set(phones)) > 1:
            issues.append(f"{name}: different phone numbers {sorted(set(phones))}, using the latest")
        if len(set(n.lower() for n in names)) > 1:
            issues.append(f"Same customer under different names {sorted(set(names))}, using '{name}'")
        cust = {"name": name, "email": emails[0] if emails else None,
                "phone": phones[-1] if phones else None, "submissions": []}
        if not emails:
            issues.append(f"{name}: no email on file. They get a portal link but no email lookups")
        for s in subs_:
            sid = s["Submission ID"]
            cs = sorted(cards_by_sub.get(sid, []), key=lambda c: int(clean(c["Card #"]) or 0))
            want = clean(s["Card Count"])
            if want and want.isdigit() and int(want) != len(cs):
                issues.append(f"{sid} ({name}): sheet says {want} cards, found {len(cs)}")
            info = [f"Imported from Google Sheet ({sid})", f"Delivery: {clean(s['Delivery Method'])}"]
            addr = clean(s["Address"])
            if addr:
                info.append(f"Return address: {addr}")
                if clean(s["Delivery Method"]).lower().startswith("hand"):
                    issues.append(f"{sid} ({name}): hand delivered but has an address; kept in notes")
            info.append(f"Insured return shipping: {clean(s['Insured Shipping']) or 'No'}")
            if s["Referral"]:
                info.append(f"Referral code: {s['Referral']}" + (f" ({s['Discount']} off)" if s["Discount"] else ""))
            if clean(s["Return Tracking #"]):
                info.append(f"Return tracking #: {clean(s['Return Tracking #'])}")
            sub = {
                "code": sid,
                "status": status(s["Status"], issues, sid),
                "service": "; ".join(OrderedDict.fromkeys(clean(c["Service"]) for c in cs if clean(c["Service"]))),
                "public_notes": clean(s["Note to Customer"]),
                "internal_notes": "\n".join(info),
                "created_at": ts(s["Timestamp"]),
                "updated_at": ts(s["Status Updated"]) or ts(s["Timestamp"]),
                "cards": [],
            }
            for c in cs:
                where = f"{sid} card {clean(c['Card #'])}"
                note = [f"Service: {clean(c['Service'])}"]
                if clean(c["Estimated Value"]):
                    note.append(f"NM value: {clean(c['Estimated Value'])}")
                if clean(c["Notes"]):
                    note.append(clean(c["Notes"]))
                photos = []
                for label, col in (("front", "Front Photo"), ("back", "Back Photo")):
                    if clean(c[col]):
                        photos.append([clean(c[col]), f"Card {clean(c['Card #'])} · {label}"])
                for u in re.split(r"[,\s]+", c["Detail Photos"] or ""):
                    if u.startswith("http"):
                        photos.append([u, f"Card {clean(c['Card #'])} · detail"])
                for u, _ in photos:
                    if "res.cloudinary.com" not in u:
                        issues.append(f"{where}: photo isn't a direct image link and may not display: {u}")
                sub["cards"].append({
                    "card_number": int(clean(c["Card #"])),
                    "name": clean(c["Card Name"]),
                    "status": status(c["Status"], issues, where),
                    "public_notes": clean(c["Note to Customer"]),
                    "customer_notes": "\n".join(note),
                    "photos": photos,
                    "_value": clean(c["Estimated Value"]), "_service": clean(c["Service"]),
                    "_notes": clean(c["Notes"]),
                })
            cust["submissions"].append(sub)
        customers.append(cust)

    # --- combined.csv: one row per card ---
    with open(os.path.join(out, "combined.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Customer", "Email", "Phone", "Submission", "Submitted", "Submission Status",
                    "Card #", "Card", "Service", "NM Value", "Card Status", "Customer Notes", "Photos"])
        for cu in customers:
            for s in cu["submissions"]:
                for c in s["cards"] or [{}]:
                    w.writerow([cu["name"], cu["email"] or "", cu["phone"] or "", s["code"],
                                (s["created_at"] or "")[:10], s["status"], c.get("card_number", ""),
                                c.get("name", "(no cards found)"), c.get("_service", ""), c.get("_value", ""),
                                c.get("status", ""), c.get("_notes", ""), len(c.get("photos", []))])

    with open(os.path.join(out, "customers.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Customer", "Email", "Phone", "Submissions", "Cards", "References"])
        for cu in customers:
            w.writerow([cu["name"], cu["email"] or "", cu["phone"] or "", len(cu["submissions"]),
                        sum(len(s["cards"]) for s in cu["submissions"]),
                        " ".join(s["code"] for s in cu["submissions"])])

    with open(os.path.join(out, "issues.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(issues) + "\n")

    # --- import.sql ---
    payload = [{k: v for k, v in cu.items()} for cu in customers]
    for cu in payload:
        for s in cu["submissions"]:
            s["cards"] = [{k: v for k, v in c.items() if not k.startswith("_")} for c in s["cards"]]
    data = json.dumps(payload, ensure_ascii=False)
    tag = "rrimport"
    assert f"${tag}$" not in data
    sql = f"""-- One-time import of the Google Sheet into the portal.
-- Paste into Supabase -> SQL Editor -> Run. Safe to re-run: submissions whose
-- code already exists are skipped, customers are matched by email.
do $do$
declare
  d jsonb := ${tag}${data}${tag}$::jsonb;
  cu jsonb; su jsonb; ca jsonb; ph jsonb;
  v_cust uuid; v_sub uuid; v_card uuid;
  n_c int := 0; n_s int := 0; n_k int := 0; n_p int := 0; n_skip int := 0;
begin
  -- the touch trigger would replace the Sheet's "Status Updated" time with now();
  -- off for this run only (the DO block is one transaction, so an error re-enables it)
  alter table public.submissions disable trigger submissions_touch;
  for cu in select * from jsonb_array_elements(d) loop
    v_cust := null;
    if cu->>'email' is not null then
      select id into v_cust from public.customers where lower(email) = lower(cu->>'email');
    end if;
    if v_cust is null and cu->>'email' is null and cu->>'phone' is not null then
      select id into v_cust from public.customers
        where email is null and regexp_replace(phone, '\\D', '', 'g') = regexp_replace(cu->>'phone', '\\D', '', 'g');
    end if;
    if v_cust is null then
      insert into public.customers (name, email, phone, created_at)
        values (cu->>'name', cu->>'email', cu->>'phone',
                coalesce((cu->'submissions'->0->>'created_at')::timestamptz, now()))
        returning id into v_cust;
      n_c := n_c + 1;
    end if;

    for su in select * from jsonb_array_elements(cu->'submissions') loop
      if exists (select 1 from public.submissions where code = su->>'code') then
        n_skip := n_skip + 1;
        continue;
      end if;
      insert into public.submissions (code, customer_id, status, service, public_notes, internal_notes, created_at)
        values (su->>'code', v_cust, su->>'status', su->>'service', su->>'public_notes', su->>'internal_notes',
                coalesce((su->>'created_at')::timestamptz, now()))
        returning id into v_sub;
      n_s := n_s + 1;
      for ca in select * from jsonb_array_elements(su->'cards') loop
        insert into public.cards (submission_id, card_number, name, status, public_notes, customer_notes, created_at)
          values (v_sub, (ca->>'card_number')::int, ca->>'name', ca->>'status', ca->>'public_notes',
                  ca->>'customer_notes', coalesce((su->>'created_at')::timestamptz, now()))
          returning id into v_card;
        n_k := n_k + 1;
        for ph in select * from jsonb_array_elements(ca->'photos') loop
          insert into public.photos (customer_id, submission_id, card_id, path, source, caption, created_at)
            values (v_cust, v_sub, v_card, ph->>0, 'intake', ph->>1,
                    coalesce((su->>'created_at')::timestamptz, now()));
          n_p := n_p + 1;
        end loop;
      end loop;
      update public.submissions set updated_at = coalesce((su->>'updated_at')::timestamptz, now()) where id = v_sub;
    end loop;
  end loop;
  alter table public.submissions enable trigger submissions_touch;
  raise notice 'Imported % new customers, % submissions, % cards, % photos (% submissions already there, skipped)',
    n_c, n_s, n_k, n_p, n_skip;
end
$do$;

-- Check: everything that was imported
select s.code, c.name as customer, s.status, count(k.id) as cards
from public.submissions s join public.customers c on c.id = s.customer_id
left join public.cards k on k.submission_id = s.id
where s.internal_notes like 'Imported from Google Sheet%'
group by s.code, c.name, s.status, s.created_at order by s.created_at;
"""
    with open(os.path.join(out, "import.sql"), "w", encoding="utf-8") as f:
        f.write(sql)

    n_cards = sum(len(s["cards"]) for cu in customers for s in cu["submissions"])
    n_ph = sum(len(c["photos"]) for cu in customers for s in cu["submissions"] for c in s["cards"])
    print(f"{len(customers)} customers, {len(subs)} submissions, {n_cards} cards, {n_ph} photos, {len(issues)} notes")


if __name__ == "__main__":
    args = sys.argv[1:]
    skip = set(args[args.index("--skip") + 1:]) if "--skip" in args else set()
    main(*args[:3], skip=skip)
