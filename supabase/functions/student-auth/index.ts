// Supabase Edge Function: student-auth
// Lets an ADMIN / STAFF user create a student's login or reset its password.
// Runs server-side because it needs the service-role key (never put that key in website code).
//
// Request  (POST, Authorization: Bearer <admin's session token>):
//   { "student_id": "<uuid>", "password": "optional – leave out to auto-generate" }
// Response: { ok: true, email, password, created: boolean }
//
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided automatically by Supabase.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

function generatePassword(len = 10): string {
  // no look-alike characters (0/O, 1/l/I)
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buf = crypto.getRandomValues(new Uint32Array(len));
  let out = "";
  for (const n of buf) out += chars[n % chars.length];
  return out + "@" + String(crypto.getRandomValues(new Uint8Array(1))[0] % 90 + 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Not signed in" }, 401);

    // 1) who is calling?
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await caller.auth.getUser();
    if (uErr || !u?.user) return json({ error: "Not signed in" }, 401);

    const admin = createClient(url, service, { auth: { persistSession: false } });

    // 2) must be listed in admin_users (admin or staff)
    const { data: me } = await admin.from("admin_users").select("user_id").eq("user_id", u.user.id).maybeSingle();
    if (!me) return json({ error: "Only institute staff can do this" }, 403);

    // 2b) if this staff member turned on two-step verification, the session must have passed it
    try {
      const tok = authHeader.slice(7).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      const aal = JSON.parse(atob(tok.padEnd(tok.length + (4 - (tok.length % 4)) % 4, "="))).aal ?? "aal1";
      const { data: fl, error: fe } = await admin.auth.admin.mfa.listFactors({ userId: u.user.id });
      if (!fe && fl?.factors?.some((f: { status: string }) => f.status === "verified") && aal !== "aal2")
        return json({ error: "Please complete two-step verification and sign in again." }, 403);
    } catch (_) { /* MFA info unavailable: continue as before */ }

    // 3) input
    const body = await req.json().catch(() => ({}));
    const studentId = String(body.student_id ?? "");
    let password = body.password ? String(body.password) : generatePassword();
    if (!/^[0-9a-f-]{36}$/i.test(studentId)) return json({ error: "Invalid student" }, 400);
    if (password.length < 8) return json({ error: "Password must be at least 8 characters" }, 400);

    const { data: s } = await admin.from("students").select("id,email,user_id,full_name").eq("id", studentId).maybeSingle();
    if (!s) return json({ error: "Student not found" }, 404);

    // 4) create the login, or reset the password of the existing one
    if (!s.user_id) {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: s.email, password, email_confirm: true, user_metadata: { student_id: s.id, full_name: s.full_name, must_change_password: true },
      });
      if (error) {
        const msg = /already|registered|exists/i.test(error.message)
          ? "A login with this email already exists (it may belong to staff). Use a different email for the student."
          : error.message;
        return json({ error: msg }, 400);
      }
      const { error: linkErr } = await admin.from("students").update({ user_id: created.user!.id, status: "Active" }).eq("id", s.id);
      if (linkErr) return json({ error: linkErr.message }, 500);
      return json({ ok: true, email: s.email, password, created: true });
    }

    const { error } = await admin.auth.admin.updateUserById(s.user_id, { password, email: s.email, email_confirm: true, user_metadata: { student_id: s.id, full_name: s.full_name, must_change_password: true } });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true, email: s.email, password, created: false });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500);
  }
});
