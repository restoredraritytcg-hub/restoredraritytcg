// Scan Station settings. Fill these in from the scanner's OWN Supabase project
// (Project Settings → API) — not the Restored Rarity portal's project.
// The publishable/anon key is meant to be public; the database rules decide what it can do.
// NEVER put the service_role key in this file.
// Placeholder values => demo mode (nothing is saved).
window.SCANNER_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-PUBLISHABLE-KEY",
};
