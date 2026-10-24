# Import into Claude Code

## 1. Put the files in your website repo

Copy **everything in this folder** into the root of your site repo
(`restoredraritytcg-hub/restoredraritytcg`), next to `index.html` and `intake.html`.

If your repo already has a `CLAUDE.md` or `README.md`, don't overwrite them — rename these to
`PORTAL_CLAUDE.md` / `PORTAL_README.md` and ask Claude Code to merge them in (see the prompt below).

Add the lines from `.gitignore.portal` to your repo's `.gitignore` (or rename it to `.gitignore` if you
don't have one) so test images and the desktop app's secret key never get committed.

You'll end up with:
```
index.html, intake.html, ...   ← your existing site
portal/                        ← admin, customer view, scan station (goes live at /portal/)
supabase/schema.sql            ← paste into Supabase once
desktop-scanner/               ← Windows backup app
tools/, tests/                 ← demo builder and accuracy tests
CLAUDE.md                      ← tells Claude Code how all of this works
```

## 2. Open the repo in Claude Code and paste this

> Read CLAUDE.md (and PORTAL_CLAUDE.md if it exists, merging it into CLAUDE.md). This adds a Supabase-backed
> card portal, a browser scan station and a Windows backup scanner to my site. First, wire my existing
> intake.html to the portal as described under "Status / next steps" in CLAUDE.md: submissions should create the
> customer profile, submission, cards and intake photos in Supabase via `intake_submit` and `portal_add_photo`,
> and show the customer their private portal link. Keep my current design. Ask me before removing the
> Google Apps Script backend. Don't commit tests/parity/ or any config with secret keys.

## 3. Before going live (from README.md)

1. Create the Supabase project and run `supabase/schema.sql` in its SQL Editor.
2. Create your admin login and add your email to the `admins` table; turn off public sign-ups.
3. Put the Project URL + anon key in `portal/config.js` (never the service_role key).
4. Push. Bookmark `restoredraritytcg.com/portal/admin.html` and `/portal/scan.html`.

Try it first without any setup: run `python3 -m http.server` inside `portal/` and open
`http://localhost:8000/admin.html?demo`.
