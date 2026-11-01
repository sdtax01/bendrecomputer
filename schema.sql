-- =====================================================================
-- Bendre Computer Typing Institute — Supabase schema
-- Run this whole file once in: Supabase Dashboard → SQL Editor → New query
-- Safe to re-run (uses IF NOT EXISTS / OR REPLACE where possible).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1. TABLES
-- ---------------------------------------------------------------------

-- Admin users: links a Supabase Auth user to a role.
-- role 'admin'  = full control (incl. settings and other admins)
-- role 'staff'  = manage courses, batches, gallery, enquiries
create table if not exists public.admin_users (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  role       text not null default 'staff' check (role in ('admin','staff')),
  created_at timestamptz not null default now()
);

create table if not exists public.courses (
  id                 uuid primary key default gen_random_uuid(),
  slug               text unique not null,
  name               text not null,
  category           text,
  short_description  text,
  full_description   text,
  skills             text[] not null default '{}',
  duration           text,
  eligibility        text,
  fee                text,
  admission_open     boolean not null default true,
  image_path         text,
  sort_order         int not null default 0,
  is_published       boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table if not exists public.batches (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete restrict,
  name         text not null,
  batch_month  date not null,               -- store the 1st of the month
  description  text,
  cover_path   text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists batches_course_idx on public.batches(course_id);

create table if not exists public.gallery_photos (
  id          uuid primary key default gen_random_uuid(),
  batch_id    uuid not null references public.batches(id) on delete cascade,
  image_path  text not null,
  thumb_path  text not null,
  caption     text,
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists photos_batch_idx on public.gallery_photos(batch_id, sort_order);

create sequence if not exists public.enquiry_seq start 1;

create table if not exists public.admission_enquiries (
  id               uuid primary key default gen_random_uuid(),
  ref_no           text unique not null,
  kind             text not null default 'admission' check (kind in ('admission','contact')),
  student_name     text not null,
  guardian_name    text,
  mobile           text not null,
  whatsapp         text,
  email            text,
  course_id        uuid references public.courses(id) on delete set null,
  course_name      text,
  preferred_timing text,
  qualification    text,
  message          text,
  consent          boolean not null default false,
  status           text not null default 'New'
                   check (status in ('New','Contacted','Follow-up Required','Admission Confirmed','Closed')),
  follow_up_notes  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists enquiries_created_idx on public.admission_enquiries(created_at desc);
create index if not exists enquiries_mobile_idx on public.admission_enquiries(mobile);

create table if not exists public.website_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- keep updated_at fresh
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t text;
begin
  foreach t in array array['courses','batches','admission_enquiries','website_settings'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 2. ROLE HELPERS
-- ---------------------------------------------------------------------
create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin');
$$;

-- ---------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.admin_users         enable row level security;
alter table public.courses             enable row level security;
alter table public.batches             enable row level security;
alter table public.gallery_photos      enable row level security;
alter table public.admission_enquiries enable row level security;
alter table public.website_settings    enable row level security;

-- admin_users: a person can see their own row; only role 'admin' manages the list
drop policy if exists admin_users_self on public.admin_users;
create policy admin_users_self on public.admin_users for select
  using (user_id = auth.uid() or public.is_admin());
drop policy if exists admin_users_manage on public.admin_users;
create policy admin_users_manage on public.admin_users for all
  using (public.is_admin()) with check (public.is_admin());

-- courses
drop policy if exists courses_public_read on public.courses;
create policy courses_public_read on public.courses for select
  using (is_published or public.is_staff());
drop policy if exists courses_staff_write on public.courses;
create policy courses_staff_write on public.courses for all
  using (public.is_staff()) with check (public.is_staff());

-- batches
drop policy if exists batches_public_read on public.batches;
create policy batches_public_read on public.batches for select
  using (is_published or public.is_staff());
drop policy if exists batches_staff_write on public.batches;
create policy batches_staff_write on public.batches for all
  using (public.is_staff()) with check (public.is_staff());

-- gallery photos: visible publicly only when their batch is published
drop policy if exists photos_public_read on public.gallery_photos;
create policy photos_public_read on public.gallery_photos for select
  using (
    public.is_staff()
    or exists (select 1 from public.batches b where b.id = batch_id and b.is_published)
  );
drop policy if exists photos_staff_write on public.gallery_photos;
create policy photos_staff_write on public.gallery_photos for all
  using (public.is_staff()) with check (public.is_staff());

-- enquiries: NO public access at all (visitors submit through submit_enquiry())
drop policy if exists enquiries_staff_all on public.admission_enquiries;
create policy enquiries_staff_all on public.admission_enquiries for all
  using (public.is_staff()) with check (public.is_staff());

-- settings: public can read; only role 'admin' can change
drop policy if exists settings_public_read on public.website_settings;
create policy settings_public_read on public.website_settings for select using (true);
drop policy if exists settings_admin_write on public.website_settings;
create policy settings_admin_write on public.website_settings for all
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------------
-- 4. PUBLIC ENQUIRY SUBMISSION (server-side validation)
-- ---------------------------------------------------------------------
create or replace function public.submit_enquiry(
  p_student_name     text,
  p_guardian_name    text,
  p_mobile           text,
  p_whatsapp         text,
  p_email            text,
  p_course_id        uuid,
  p_preferred_timing text,
  p_qualification    text,
  p_message          text,
  p_consent          boolean,
  p_kind             text default 'admission'
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_mobile   text := regexp_replace(coalesce(p_mobile,''), '[\s\-+]', '', 'g');
  v_whatsapp text := nullif(regexp_replace(coalesce(p_whatsapp,''), '[\s\-+]', '', 'g'), '');
  v_course   text;
  v_ref      text;
  v_existing text;
begin
  -- normalise: strip leading 91 / 0 from 12 / 11 digit numbers
  if v_mobile ~ '^91[6-9][0-9]{9}$' then v_mobile := substr(v_mobile, 3); end if;
  if v_mobile ~ '^0[6-9][0-9]{9}$'  then v_mobile := substr(v_mobile, 2); end if;
  if v_whatsapp is not null then
    if v_whatsapp ~ '^91[6-9][0-9]{9}$' then v_whatsapp := substr(v_whatsapp, 3); end if;
    if v_whatsapp ~ '^0[6-9][0-9]{9}$'  then v_whatsapp := substr(v_whatsapp, 2); end if;
  end if;

  if p_kind not in ('admission','contact') then raise exception 'Invalid enquiry type'; end if;
  if length(trim(coalesce(p_student_name,''))) < 2 or length(p_student_name) > 100 then
    raise exception 'Please enter a valid name';
  end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit Indian mobile number'; end if;
  if v_whatsapp is not null and v_whatsapp !~ '^[6-9][0-9]{9}$' then
    raise exception 'Please enter a valid WhatsApp number';
  end if;
  if nullif(trim(coalesce(p_email,'')),'') is not null
     and p_email !~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' then
    raise exception 'Please enter a valid email address';
  end if;
  if not coalesce(p_consent,false) then raise exception 'Consent is required so we can contact you'; end if;
  if length(coalesce(p_message,'')) > 1500 then raise exception 'Message is too long'; end if;

  if p_course_id is not null then
    select name into v_course from public.courses where id = p_course_id and is_published;
  end if;

  -- duplicate guard: same mobile + same course within 10 minutes returns the earlier reference
  select ref_no into v_existing from public.admission_enquiries
   where mobile = v_mobile and course_id is not distinct from p_course_id and kind = p_kind
     and created_at > now() - interval '10 minutes'
   order by created_at desc limit 1;
  if v_existing is not null then return v_existing; end if;

  v_ref := 'BCTI-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMMDD') || '-' ||
           lpad(nextval('public.enquiry_seq')::text, 4, '0');

  insert into public.admission_enquiries
    (ref_no, kind, student_name, guardian_name, mobile, whatsapp, email, course_id, course_name,
     preferred_timing, qualification, message, consent)
  values
    (v_ref, p_kind, trim(p_student_name), nullif(trim(coalesce(p_guardian_name,'')),''), v_mobile, v_whatsapp,
     nullif(trim(coalesce(p_email,'')),''), p_course_id, v_course,
     nullif(trim(coalesce(p_preferred_timing,'')),''), nullif(trim(coalesce(p_qualification,'')),''),
     nullif(trim(coalesce(p_message,'')),''), true);

  return v_ref;
end $$;

revoke all on function public.submit_enquiry(text,text,text,text,text,uuid,text,text,text,boolean,text) from public;
grant execute on function public.submit_enquiry(text,text,text,text,text,uuid,text,text,text,boolean,text) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 5. DASHBOARD COUNTS (staff only)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_counts() returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  return json_build_object(
    'courses',        (select count(*) from courses),
    'active_batches', (select count(*) from batches where is_published),
    'photos',         (select count(*) from gallery_photos),
    'new_enquiries',  (select count(*) from admission_enquiries where status = 'New'),
    'confirmed',      (select count(*) from admission_enquiries where status = 'Admission Confirmed')
  );
end $$;
grant execute on function public.dashboard_counts() to authenticated;

-- ---------------------------------------------------------------------
-- 6. STORAGE BUCKET (public read, staff write)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('gallery', 'gallery', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "gallery public read" on storage.objects;
create policy "gallery public read" on storage.objects for select
  using (bucket_id = 'gallery');

drop policy if exists "gallery staff insert" on storage.objects;
create policy "gallery staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and public.is_staff());

drop policy if exists "gallery staff update" on storage.objects;
create policy "gallery staff update" on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and public.is_staff());

drop policy if exists "gallery staff delete" on storage.objects;
create policy "gallery staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and public.is_staff());

-- ---------------------------------------------------------------------
-- 7. SEED DATA
-- Only facts supplied by the institute are pre-filled. Everything else is
-- left blank for the administrator to complete from the dashboard.
-- ---------------------------------------------------------------------
insert into public.website_settings (key, value) values
 ('contact', jsonb_build_object(
    'institute_name', 'Bendre Computer Typing Institute',
    'address', 'Near City Care Hospital, Kamalnagar Society, Wadgaonsheri, Pune 411014',
    'phone', '9689418627',
    'whatsapp', '919689418627',
    'email', 'bendregajanan81@gmail.com',
    'opening_hours', '',
    'maps_query', 'Bendre Computer Typing Institute, Near City Care Hospital, Kamalnagar Society, Wadgaonsheri, Pune 411014')),
 ('home', jsonb_build_object(
    'hero_title', 'Your Future Begins with the Right Skills.',
    'hero_text',  'Build your typing speed, computer confidence, and practical skills with Bendre Computer Typing Institute.',
    'hero_image_url', '')),
 ('about', jsonb_build_object(
    'intro', 'Bendre Computer Typing Institute is a computer typing and education institute in Wadgaonsheri, Pune, helping students build practical typing and computer skills.',
    'vision', '',
    'mission', '',
    'teaching_approach', '',
    'learning_environment', '')),
 ('seo', jsonb_build_object(
    'site_title', 'Bendre Computer Typing Institute | Typing & Computer Classes in Wadgaonsheri, Pune',
    'site_description', 'Typing and computer training in Wadgaonsheri, Pune. Enquire online for admission at Bendre Computer Typing Institute.'))
on conflict (key) do nothing;

-- Sample courses are inserted UNPUBLISHED. They stay hidden from the public
-- site until you edit them to match what the institute really offers and
-- tick "Published" in the admin dashboard.
insert into public.courses (slug, name, category, short_description, skills, sort_order, is_published) values
 ('english-typing','English Typing','Typing',
  'Develop English typing accuracy, keyboard familiarity, and typing speed through structured practice.',
  array['Keyboard familiarity','Typing accuracy','Typing speed'], 1, false),
 ('marathi-typing','Marathi Typing','Typing',
  'Improve Marathi typing skills using the relevant keyboard layout and practical typing exercises.',
  array['Marathi keyboard layout','Practical typing exercises'], 2, false),
 ('computer-fundamentals','Computer Fundamentals','Computer Skills',
  'Learn essential computer operations, file management, keyboard usage, and basic digital skills.',
  array['Computer operations','File management','Basic digital skills'], 3, false),
 ('gcc-tbc-typing','GCC-TBC Typing Course','Exam Preparation',
  'Prepare for the GCC-TBC examination through structured typing practice, accuracy improvement, and examination-oriented training.',
  array['Structured typing practice','Accuracy improvement','Exam-oriented training'], 4, false)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- 8. MAKE YOURSELF AN ADMIN (run AFTER creating your user in
--    Authentication → Users). Replace the email, then run this one line:
--
-- insert into public.admin_users (user_id, full_name, role)
-- select id, 'Institute Admin', 'admin' from auth.users where email = 'bendregajanan81@gmail.com'
-- on conflict (user_id) do update set role = 'admin';
-- ---------------------------------------------------------------------
