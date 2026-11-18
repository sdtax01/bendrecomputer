# Bendre Computer Typing Institute — Website

Static front end (HTML/CSS/JS) + Supabase (PostgreSQL, Auth, Storage). Deploys free to Cloudflare Pages.
No build step. Everything the administrator edits lives in the database, so changes go live without redeploying.

## What's inside

| Path | Purpose |
|---|---|
| `index.html`, `about.html`, `courses.html`, `gallery.html`, `admissions.html`, `contact.html`, `404.html` | Public website |
| `admin/` | Staff dashboard (`/admin/`) — now also Students, Fees, Attendance, Study Material, Assignments, Certificates |
| `student/` | **Student portal** (`/student/`) |
| `schema-students.sql` | **Student module** tables, security rules, storage (run after `schema.sql`) |
| `supabase/functions/student-auth/` | **Edge Function** that creates / resets student passwords |
| `assets/js/certificate.js` | Certificate generator (A4 landscape PDF/PNG) |
| `schema.sql` | Tables, relationships, security rules, storage bucket, seed data |
| `assets/js/config.js` | **The only file you must edit** (Supabase URL + anon key) |
| `robots.txt`, `sitemap.xml`, `_headers` | SEO and security headers |

Database: `courses` ← `batches` ← `gallery_photos` (a batch belongs to a course; a photo belongs to a batch), plus `admission_enquiries`, `admin_users`, `website_settings`.

## 1. Create the Supabase project (≈10 min)

1. Sign up at supabase.com → **New project** (choose a region close to India, e.g. Mumbai/Singapore).
2. **SQL Editor → New query** → paste all of `schema.sql` → **Run**. This creates the tables, security rules, the `gallery` storage bucket and the institute's address/phone/email.
3. **Authentication → Users → Add user** → create the administrator login (email + strong password; tick *Auto Confirm*).
4. Back in the SQL Editor run this once to make that user an admin (change the email if different):

   ```sql
   insert into public.admin_users (user_id, full_name, role)
   select id, 'Institute Admin', 'admin' from auth.users where email = 'bendregajanan81@gmail.com'
   on conflict (user_id) do update set role = 'admin';
   ```
5. **Project Settings → API** → copy the **Project URL** and the **anon public** key into `assets/js/config.js`.
   Never use the `service_role` key anywhere in this site.
6. **Authentication → Providers → Email** → turn **off** "Allow new users to sign up" so nobody else can create accounts.

Roles: `admin` can do everything (including Contact Information, Website Content, SEO). `staff` can manage courses, batches, gallery and enquiries. To add staff, create the user in Authentication, then insert a row into `admin_users` with `role = 'staff'`.

## 2. Deploy to Cloudflare Pages

1. Put this folder in a GitHub repository (or use **Direct Upload** in Cloudflare Pages and drag the folder in).
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
3. Build command: *(leave empty)* · Build output directory: `/` · Deploy.
4. Replace `YOUR-SITE.pages.dev` in `robots.txt` and `sitemap.xml` with the real domain (and add `<link rel="canonical">`/Open Graph image later if wanted).
5. Optional: add a custom domain under the Pages project → **Custom domains**.

## 3. First-time content checklist (in `/admin/`)

1. **Courses** — the four example courses are seeded as **Draft**, so nothing invented appears publicly. Edit each to match what you really teach (duration, eligibility, fee, image), delete any you don't offer, then **Publish**.
2. **Batches** → create real batches (month, course, cover photo) → **Photos** to upload pictures → **Publish**.
3. **Contact Information** — check address/phone/WhatsApp; add opening hours. The WhatsApp number was set to `919689418627` (the phone number you gave) — change it if the WhatsApp number differs.
4. **Website Content** — add About text (vision, mission, teaching approach, learning environment) and, if you have one, a real classroom photo for the homepage banner.
5. **SEO Settings** — adjust the homepage title/description.

## How the main features work

- **Photo upload**: JPG/PNG/WebP, max 15 MB each, many at once. Each photo is resized in the browser (max 1800 px) and a 520 px thumbnail is generated; progress is shown per batch of files. Captions save on blur, photos can be dragged (or use ← →) to reorder, replaced, or deleted. *Preview gallery* shows the batch before you publish.
- **Enquiries**: visitors submit through a validated database function (no direct table access). It checks the Indian mobile number server-side, creates a reference like `BCTI-261101-0001`, and ignores an identical resubmission within 10 minutes. The admin can search, filter by course/status/date, set status, add notes, open WhatsApp, and export CSV (opens in Excel).
- **Security**: Row Level Security — visitors can only read published content; only listed staff can write; enquiries are never readable by the public.

## Notes and limits

- A published batch whose course is unpublished still shows, but without a course name.
- Forgotten admin password: reset it in Supabase → Authentication → Users.
- The homepage keyboard/speed gauge is a labelled decorative animation, not a statistic. No testimonials, numbers or achievements are fabricated.
- This code was syntax-checked but could not be tested against a live Supabase project here. After setup, test: submit an enquiry, create a course, upload photos, publish a batch, and view it on the public gallery.


---

# Student module (fees, student login, attendance, study material, assignments, certificates)

## One-time setup (≈15 min)

1. **Database** — Supabase → SQL Editor → paste all of `schema-students.sql` → Run. (Run `schema.sql` first if you have not already.) Safe to re-run.
2. **Edge Function (needed to create / reset student passwords)** — passwords can only be set with Supabase's secret *service-role* key, which must never be placed in website code, so this one small function runs on Supabase's servers:
   - Supabase Dashboard → **Edge Functions → Deploy a new function → Via editor**, name it exactly `student-auth`, paste the contents of `supabase/functions/student-auth/index.ts`, **Deploy**.
   - Leave **“Verify JWT”** ON. No secrets to add — Supabase provides the keys to the function automatically.
   - (CLI alternative: `supabase functions deploy student-auth`.)
3. **Authentication → Providers → Email**: keep *“Allow new users to sign up”* **OFF** (students are created only by the admin). Email confirmation can stay as is — the function creates confirmed users.
4. Upload the updated site to GitHub / Cloudflare Pages as usual. Student login: `https://your-site/student/`.

## How it works

**Registration number.** When the Admissions form is submitted (it now asks for **date of birth** and a required **email**), a student record is created and a unique number is generated: `serial – last 4 digits of mobile – birth-year YY`, e.g. first student with mobile ending 7708 born 1998 → **`001-7708-98`**. It is shown to the student on the success screen. The same person submitting twice (same mobile + date of birth) gets the same number; an email already in use is rejected. Serial numbers continue past 999 (`1000-…`). Walk-in students: *Admin → Students → + Add student*.

**Admin → Students.** Search, open a student, edit details, **Create login / Reset password** (login ID = the student's email; leave the password blank to auto-generate, then copy it or send it on WhatsApp — it is shown once). Enrol the student in courses with the agreed fee.

**Admin → Fees.** Per-enrolment fee, payments (Cash / UPI / Bank / Cheque / Card), automatic receipt numbers (`RCPT-26-00001`), printable receipt, outstanding balance, CSV export. Students never see fee data.

**Admin → Attendance.** Choose course + date, mark Present / Absent / Leave (or *All present*), Save. Re-saving the same date updates it. Students see it read-only.

**Admin → Study Material.** Upload PDFs (also Word/Excel/PowerPoint/ZIP, up to 25 MB) per course; edit, replace the file, hide or delete at any time. A student only sees and downloads material for the courses they are enrolled in (enforced by the database, not just the screen) — e.g. a Tally student never sees Advanced Excel files.

**Admin → Assignments.** Create a task with due date for a course; open **Submissions** to see who submitted (late ones are flagged), open their files, give marks + feedback, mark Reviewed. Students see Pending / Overdue / Submitted / Reviewed on their dashboard.

**Admin → Certificates.** When a student finishes: *Complete & certify* → pick completion date and optional grade → the certificate number (`BCTI/2026/0001`) is allocated and a landscape A4 PDF downloads immediately. It contains the logo, student name, registration number, course, duration, dates, grade, **the student's uploaded photo**, certificate number and the institute address from *Contact Information*. Download again any time (PDF or PNG). The student can also download it from their dashboard.

**Student portal** (`/student/`): left menu — Dashboard (active / completed courses, certificates, pending tasks), Attendance, Study Material, Assignments, Settings (about me, KYC details, **photo upload** — used on the certificate — and change password), Log out.

## Good to know

- Student name, date of birth, mobile and registration number are locked for students (they appear on certificates); the admin can correct the name/email. Mobile and DOB cannot change because the registration number is derived from them.
- A student photo is needed before the certificate looks complete — the admin screens warn when it is missing.
- The Admissions form creates a student record immediately (as you requested), so a spam submission would create a record too: delete it from *Students*. No login exists until you create one.
- Fees are visible to every staff user. To restrict fees to the `admin` role only, change `public.is_staff()` to `public.is_admin()` in the `fp_staff` policy.
- Deleting a student removes their records but not their login account; remove it in Supabase → Authentication → Users if needed.
- Fonts for the certificate (Fraunces, Figtree, Dancing Script) load from Google Fonts; if the visitor is offline the certificate falls back to system fonts.
