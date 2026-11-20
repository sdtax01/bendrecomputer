// =====================================================================
// Supabase connection for Bendre Computer Typing Institute.
// The anon key is designed to be public; security is enforced by the
// Row Level Security rules in schema.sql. NEVER put the service_role key here.
// =====================================================================
window.BCTI_CONFIG = {
  SUPABASE_URL: "https://ngramhiwitqmvgdgbqdc.supabase.co",
  // Cloudflare Turnstile CAPTCHA site key for the public forms (leave "" to keep the forms working without CAPTCHA)
  TURNSTILE_SITE_KEY: "",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ncmFtaGl3aXRxbXZnZGdicWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM0ODI4NjYsImV4cCI6MjEwOTA1ODg2Nn0.1jbwv-AeVb1pE-cNPuLmML2Rir-4j1NJ5h5n5CeO7Es"
};

// Clickjacking protection (GitHub Pages cannot send the X-Frame-Options header): never run inside someone else's frame.
try { if (window.top !== window.self) window.top.location = window.self.location; } catch (e) { document.documentElement.style.display = 'none'; }
