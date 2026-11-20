// Supabase Edge Function: form-gate
// Public enquiry / admission forms call this instead of the database directly.
// It checks the Cloudflare Turnstile CAPTCHA token, then runs the same database function.
//
// Setup: Supabase -> Edge Functions -> new function "form-gate" (Verify JWT: ON), paste this code,
//        then Edge Functions -> Secrets -> add  TURNSTILE_SECRET_KEY  = your Turnstile secret key.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { ...cors, "Content-Type": "application/json" } });
const ALLOWED = new Set(["submit_enquiry", "submit_admission"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" });
  try {
    const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
    if (!secret) return json({ error: "Verification is not configured yet. Please call the institute." });
    const body = await req.json().catch(() => ({}));
    const rpc = String(body.rpc ?? ""), token = String(body.token ?? ""), args = body.args;
    if (!ALLOWED.has(rpc) || !args || typeof args !== "object" || Array.isArray(args)) return json({ error: "Invalid request" });
    if (!token || token.length > 4096) return json({ error: "Please complete the verification." });

    const form = new URLSearchParams({ secret, response: token });
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) form.set("remoteip", ip);
    const v = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const vr = await v.json().catch(() => ({ success: false }));
    if (!vr.success) return json({ error: "Verification failed. Please try again." });

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data, error } = await svc.rpc(rpc, args);
    if (error) return json({ error: error.message });
    return json({ ok: true, data });
  } catch (e) {
    return json({ error: "Something went wrong. Please try again." });
  }
});
