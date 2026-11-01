# Bendre Computer Typing Institute — Website

Static front end (HTML/CSS/JS) + Supabase (PostgreSQL, Auth, Storage). Deploys free to Cloudflare Pages.
No build step. Everything the administrator edits lives in the database, so changes go live without redeploying.

## What's inside

| Path | Purpose |
|---|---|
| `index.html`, `about.html`, `courses.html`, `gallery.html`, `admissions.html`, `contact.html`, `404.html` | Public website |
| `admin/` | Staff dashboard (`/admin/`) |
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
