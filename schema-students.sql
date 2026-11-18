-- =====================================================================
-- Bendre Computer Typing Institute — STUDENT MODULE (v3)
-- Run this ONCE in Supabase → SQL Editor, AFTER schema.sql has been run.
-- Safe to re-run. Adds: student master + registration numbers, enrolments,
-- fees & receipts, attendance, study material, assignments, certificates,
-- the student portal's security rules and two private storage buckets.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SEQUENCES + HELPERS
-- ---------------------------------------------------------------------
create sequence if not exists public.student_seq     start 1;
create sequence if not exists public.certificate_seq start 1;
create sequence if not exists public.receipt_seq     start 1;

create or replace function public.norm_mobile(p text) returns text
language plpgsql immutable as $$
declare v text := regexp_replace(coalesce(p,''), '[\s\-+]', '', 'g');
begin
  if v ~ '^91[6-9][0-9]{9}$' then v := substr(v, 3); end if;
  if v ~ '^0[6-9][0-9]{9}$'  then v := substr(v, 2); end if;
  return v;
end $$;

create or replace function public.safe_uuid(p text) returns uuid
language plpgsql immutable as $$
begin return p::uuid; exception when others then return null; end $$;

-- ---------------------------------------------------------------------
-- 2. TABLES
-- ---------------------------------------------------------------------
-- Student master. reg_no format:  <serial>-<last 4 of mobile>-<birth year YY>   e.g. 001-7708-98
create table if not exists public.students (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid unique references auth.users(id) on delete set null,
  reg_no         text unique not null,
  serial         int  not null,
  full_name      text not null,
  guardian_name  text,
  mobile         text not null,
  whatsapp       text,
  email          text not null,
  dob            date not null,
  gender         text,
  address        text,
  qualification  text,
  about          text,
  photo_path     text,
  enquiry_id     uuid references public.admission_enquiries(id) on delete set null,
  status         text not null default 'Registered' check (status in ('Registered','Active','Inactive')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create unique index if not exists students_email_uq  on public.students (lower(email));
create index        if not exists students_mobile_idx on public.students (mobile);

-- A student's enrolment in a course (also carries the fee agreed and the certificate)
create table if not exists public.student_courses (
  id                    uuid primary key default gen_random_uuid(),
  student_id            uuid not null references public.students(id) on delete cascade,
  course_id             uuid not null references public.courses(id) on delete restrict,
  status                text not null default 'Active' check (status in ('Active','Completed','Dropped')),
  start_date            date not null default current_date,
  completed_on          date,
  total_fee             numeric(10,2) not null default 0 check (total_fee >= 0),
  grade                 text,
  certificate_no        text unique,
  certificate_issued_on date,
  created_at            timestamptz not null default now(),
  unique (student_id, course_id)
);
create index if not exists sc_student_idx on public.student_courses(student_id);
create index if not exists sc_course_idx  on public.student_courses(course_id);

create table if not exists public.fee_payments (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references public.students(id) on delete cascade,
  enrollment_id uuid not null references public.student_courses(id) on delete cascade,
  amount        numeric(10,2) not null check (amount > 0),
  paid_on       date not null default current_date,
  mode          text not null default 'Cash' check (mode in ('Cash','UPI','Bank Transfer','Cheque','Card','Other')),
  reference     text,
  note          text,
  receipt_no    text unique not null default
                ('RCPT-' || to_char(now() at time zone 'Asia/Kolkata','YY') || '-' || lpad(nextval('public.receipt_seq')::text, 5, '0')),
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now()
);
create index if not exists fp_enrol_idx   on public.fee_payments(enrollment_id);
create index if not exists fp_student_idx on public.fee_payments(student_id);

create table if not exists public.attendance (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  course_id  uuid not null references public.courses(id) on delete cascade,
  att_date   date not null,
  status     text not null check (status in ('Present','Absent','Leave')),
  marked_by  uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, course_id, att_date)
);
create index if not exists att_student_idx on public.attendance(student_id, att_date desc);
create index if not exists att_course_idx  on public.attendance(course_id, att_date);

create table if not exists public.study_materials (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  title        text not null,
  description  text,
  file_path    text not null,
  file_name    text,
  file_size    bigint,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists sm_course_idx on public.study_materials(course_id, created_at desc);

create table if not exists public.assignments (
  id           uuid primary key default gen_random_uuid(),
  course_id    uuid not null references public.courses(id) on delete cascade,
  title        text not null,
  description  text,
  due_date     date not null,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists asg_course_idx on public.assignments(course_id, due_date);

create table if not exists public.assignment_submissions (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id    uuid not null references public.students(id) on delete cascade,
  status        text not null default 'Submitted' check (status in ('Submitted','Reviewed')),
  note          text,
  file_path     text,
  file_name     text,
  submitted_at  timestamptz not null default now(),
  is_late       boolean not null default false,
  marks         text,
  feedback      text,
  reviewed_at   timestamptz,
  unique (assignment_id, student_id)
);
create index if not exists sub_student_idx on public.assignment_submissions(student_id);

do $$
declare t text;
begin
  foreach t in array array['students','study_materials','assignments'] loop
    execute format('drop trigger if exists trg_touch on public.%I', t);
    execute format('create trigger trg_touch before update on public.%I
                    for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- Fee overview per enrolment (staff use; respects RLS of the caller)
create or replace view public.enrollment_fees with (security_invoker = true) as
select e.id as enrollment_id, e.student_id, e.course_id, e.total_fee,
       coalesce(sum(p.amount), 0)::numeric(10,2)               as paid,
       (e.total_fee - coalesce(sum(p.amount), 0))::numeric(10,2) as balance
  from public.student_courses e
  left join public.fee_payments p on p.enrollment_id = e.id
 group by e.id;

-- ---------------------------------------------------------------------
-- 3. STUDENT HELPERS (used by security rules)
-- ---------------------------------------------------------------------
create or replace function public.my_student_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.students where user_id = auth.uid() limit 1;
$$;

create or replace function public.enrolled_in(p_course uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.student_courses e
                  where e.student_id = public.my_student_id()
                    and e.course_id = p_course and e.status in ('Active','Completed'));
$$;

-- ---------------------------------------------------------------------
-- 4. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.students               enable row level security;
alter table public.student_courses        enable row level security;
alter table public.fee_payments           enable row level security;
alter table public.attendance             enable row level security;
alter table public.study_materials        enable row level security;
alter table public.assignments            enable row level security;
alter table public.assignment_submissions enable row level security;

-- students: staff manage; a student reads only their own row (edits go through update_my_profile())
drop policy if exists students_staff on public.students;
create policy students_staff on public.students for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists students_self on public.students;
create policy students_self on public.students for select using (user_id = auth.uid());

drop policy if exists sc_staff on public.student_courses;
create policy sc_staff on public.student_courses for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists sc_self on public.student_courses;
create policy sc_self on public.student_courses for select using (student_id = public.my_student_id());

-- fees: staff only (students never see fee data)
drop policy if exists fp_staff on public.fee_payments;
create policy fp_staff on public.fee_payments for all using (public.is_staff()) with check (public.is_staff());

drop policy if exists att_staff on public.attendance;
create policy att_staff on public.attendance for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists att_self on public.attendance;
create policy att_self on public.attendance for select using (student_id = public.my_student_id());

drop policy if exists sm_staff on public.study_materials;
create policy sm_staff on public.study_materials for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists sm_student on public.study_materials;
create policy sm_student on public.study_materials for select using (is_published and public.enrolled_in(course_id));

drop policy if exists asg_staff on public.assignments;
create policy asg_staff on public.assignments for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists asg_student on public.assignments;
create policy asg_student on public.assignments for select using (is_published and public.enrolled_in(course_id));

drop policy if exists sub_staff on public.assignment_submissions;
create policy sub_staff on public.assignment_submissions for all using (public.is_staff()) with check (public.is_staff());
drop policy if exists sub_self on public.assignment_submissions;
create policy sub_self on public.assignment_submissions for select using (student_id = public.my_student_id());

-- ---------------------------------------------------------------------
-- 5. CREATING STUDENTS + REGISTRATION NUMBER
-- ---------------------------------------------------------------------
-- internal: not callable from the browser
create or replace function public._create_student(
  p_name text, p_guardian text, p_mobile text, p_whatsapp text, p_email text,
  p_dob date, p_qualification text, p_enquiry uuid, p_gender text default null, p_address text default null
) returns text
language plpgsql security definer set search_path = public as $$
declare v_mobile text := public.norm_mobile(p_mobile); v_email text := lower(trim(coalesce(p_email,'')));
        v_existing text; v_serial int; v_reg text;
begin
  if length(trim(coalesce(p_name,''))) < 2 or length(p_name) > 100 then raise exception 'Please enter a valid name'; end if;
  if v_mobile !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid 10-digit Indian mobile number'; end if;
  if v_email !~* '^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$' then raise exception 'Please enter a valid email address'; end if;
  if p_dob is null or p_dob > current_date - interval '3 years' or p_dob < date '1940-01-01' then
    raise exception 'Please enter a valid date of birth';
  end if;

  -- same person submitting again (same mobile + date of birth): return the existing number
  select reg_no into v_existing from public.students where mobile = v_mobile and dob = p_dob limit 1;
  if v_existing is not null then return v_existing; end if;

  if exists (select 1 from public.students where lower(email) = v_email) then
    raise exception 'This email address is already registered. Please use a different email or contact the institute.';
  end if;

  v_serial := nextval('public.student_seq');
  v_reg := case when v_serial < 100 then lpad(v_serial::text, 3, '0') else v_serial::text end
           || '-' || right(v_mobile, 4) || '-' || to_char(p_dob, 'YY');

  insert into public.students (reg_no, serial, full_name, guardian_name, mobile, whatsapp, email, dob,
                               qualification, enquiry_id, gender, address)
  values (v_reg, v_serial, trim(p_name), nullif(trim(coalesce(p_guardian,'')),''), v_mobile,
          nullif(public.norm_mobile(p_whatsapp),''), v_email, p_dob,
          nullif(trim(coalesce(p_qualification,'')),''), p_enquiry,
          nullif(trim(coalesce(p_gender,'')),''), nullif(trim(coalesce(p_address,'')),''));
  return v_reg;
end $$;
revoke all on function public._create_student(text,text,text,text,text,date,text,uuid,text,text) from public, anon, authenticated;

-- public admission form: creates the enquiry (existing validation) + the student + the registration number
create or replace function public.submit_admission(
  p_student_name text, p_guardian_name text, p_mobile text, p_whatsapp text, p_email text, p_dob date,
  p_course_id uuid, p_preferred_timing text, p_qualification text, p_message text, p_consent boolean
) returns json
language plpgsql security definer set search_path = public as $$
declare v_ref text; v_reg text; v_enq uuid;
begin
  if nullif(trim(coalesce(p_email,'')),'') is null then raise exception 'Email address is required (it will be your student login ID)'; end if;
  if p_dob is null then raise exception 'Please enter a valid date of birth'; end if;
  -- validate student fields first so no orphan enquiry is created
  perform 1 where public.norm_mobile(p_mobile) ~ '^[6-9][0-9]{9}$';
  if not found then raise exception 'Please enter a valid 10-digit Indian mobile number'; end if;
  if exists (select 1 from public.students where lower(email) = lower(trim(p_email))
             and not (mobile = public.norm_mobile(p_mobile) and dob = p_dob)) then
    raise exception 'This email address is already registered. Please use a different email or contact the institute.';
  end if;

  v_ref := public.submit_enquiry(p_student_name, p_guardian_name, p_mobile, p_whatsapp, p_email, p_course_id,
                                 p_preferred_timing, p_qualification, p_message, p_consent, 'admission');
  select id into v_enq from public.admission_enquiries where ref_no = v_ref;
  v_reg := public._create_student(p_student_name, p_guardian_name, p_mobile, p_whatsapp, p_email, p_dob,
                                  p_qualification, v_enq);
  return json_build_object('ref_no', v_ref, 'reg_no', v_reg);
end $$;
revoke all on function public.submit_admission(text,text,text,text,text,date,uuid,text,text,text,boolean) from public;
grant execute on function public.submit_admission(text,text,text,text,text,date,uuid,text,text,text,boolean) to anon, authenticated;

-- admin adds a walk-in student directly
create or replace function public.admin_add_student(
  p_name text, p_guardian text, p_mobile text, p_whatsapp text, p_email text, p_dob date,
  p_gender text, p_qualification text, p_address text
) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  return public._create_student(p_name, p_guardian, p_mobile, p_whatsapp, p_email, p_dob, p_qualification, null, p_gender, p_address);
end $$;
revoke all on function public.admin_add_student(text,text,text,text,text,date,text,text,text) from public, anon;
grant execute on function public.admin_add_student(text,text,text,text,text,date,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. STUDENT SELF-SERVICE (profile, assignment submission)
-- ---------------------------------------------------------------------
create or replace function public.update_my_profile(
  p_about text, p_address text, p_whatsapp text, p_qualification text, p_gender text,
  p_guardian text, p_photo_path text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.my_student_id(); v_wa text := nullif(public.norm_mobile(p_whatsapp),'');
begin
  if v_id is null then raise exception 'Not a student account'; end if;
  if v_wa is not null and v_wa !~ '^[6-9][0-9]{9}$' then raise exception 'Please enter a valid WhatsApp number'; end if;
  if length(coalesce(p_about,'')) > 1000 or length(coalesce(p_address,'')) > 400 then raise exception 'Text is too long'; end if;
  if p_photo_path is not null and p_photo_path not like ('photos/' || v_id::text || '/%') then raise exception 'Invalid photo'; end if;
  update public.students set
    about = nullif(trim(coalesce(p_about,'')),''), address = nullif(trim(coalesce(p_address,'')),''),
    whatsapp = v_wa, qualification = nullif(trim(coalesce(p_qualification,'')),''),
    gender = nullif(trim(coalesce(p_gender,'')),''), guardian_name = nullif(trim(coalesce(p_guardian,'')),''),
    photo_path = coalesce(p_photo_path, photo_path)
  where id = v_id;
end $$;
revoke all on function public.update_my_profile(text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_my_profile(text,text,text,text,text,text,text) to authenticated;

create or replace function public.submit_assignment(p_assignment uuid, p_note text, p_file_path text, p_file_name text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_id uuid := public.my_student_id(); a public.assignments; s public.assignment_submissions;
begin
  if v_id is null then raise exception 'Not a student account'; end if;
  select * into a from public.assignments where id = p_assignment and is_published;
  if a.id is null or not public.enrolled_in(a.course_id) then raise exception 'Assignment not found'; end if;
  if length(coalesce(p_note,'')) > 4000 then raise exception 'Your answer is too long'; end if;
  if nullif(trim(coalesce(p_note,'')),'') is null and p_file_path is null then
    raise exception 'Please write a note or attach a file before submitting';
  end if;
  if p_file_path is not null and p_file_path not like ('submissions/' || v_id::text || '/%') then raise exception 'Invalid file'; end if;
  select * into s from public.assignment_submissions where assignment_id = p_assignment and student_id = v_id;
  if s.status = 'Reviewed' then raise exception 'This assignment has already been reviewed'; end if;

  insert into public.assignment_submissions (assignment_id, student_id, note, file_path, file_name, submitted_at, is_late)
  values (p_assignment, v_id, nullif(trim(coalesce(p_note,'')),''), p_file_path, p_file_name, now(),
          (now() at time zone 'Asia/Kolkata')::date > a.due_date)
  on conflict (assignment_id, student_id) do update
    set note = excluded.note, file_path = coalesce(excluded.file_path, public.assignment_submissions.file_path),
        file_name = coalesce(excluded.file_name, public.assignment_submissions.file_name),
        submitted_at = now(), is_late = excluded.is_late;
end $$;
revoke all on function public.submit_assignment(uuid,text,text,text) from public, anon;
grant execute on function public.submit_assignment(uuid,text,text,text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. COMPLETION + CERTIFICATE NUMBER (staff)
-- ---------------------------------------------------------------------
create or replace function public.issue_certificate(p_enrollment uuid, p_completed_on date default current_date, p_grade text default null)
returns json
language plpgsql security definer set search_path = public as $$
declare e public.student_courses;
begin
  if not public.is_staff() then raise exception 'Not authorised'; end if;
  select * into e from public.student_courses where id = p_enrollment for update;
  if e.id is null then raise exception 'Enrolment not found'; end if;
  update public.student_courses set
    status = 'Completed',
    completed_on = coalesce(p_completed_on, current_date),
    grade = nullif(trim(coalesce(p_grade,'')),''),
    certificate_no = coalesce(e.certificate_no,
        'BCTI/' || to_char(coalesce(p_completed_on, current_date), 'YYYY') || '/' || lpad(nextval('public.certificate_seq')::text, 4, '0')),
    certificate_issued_on = coalesce(e.certificate_issued_on, current_date)
  where id = p_enrollment returning * into e;
  return row_to_json(e);
end $$;
revoke all on function public.issue_certificate(uuid,date,text) from public, anon;
grant execute on function public.issue_certificate(uuid,date,text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. PRIVATE STORAGE BUCKETS
--   materials     : <course_id>/<file>                    (staff write, enrolled students read)
--   student-files : photos/<student_id>/<file>            (student + staff)
--                   submissions/<student_id>/<assignment_id>/<file>
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
 ('materials', 'materials', false, 26214400,
   array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation','application/zip','text/plain','image/jpeg','image/png','image/webp']),
 ('student-files', 'student-files', false, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "materials read" on storage.objects;
create policy "materials read" on storage.objects for select to authenticated
  using (bucket_id = 'materials' and (public.is_staff() or public.enrolled_in(public.safe_uuid((storage.foldername(name))[1]))));
drop policy if exists "materials staff insert" on storage.objects;
create policy "materials staff insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'materials' and public.is_staff());
drop policy if exists "materials staff update" on storage.objects;
create policy "materials staff update" on storage.objects for update to authenticated
  using (bucket_id = 'materials' and public.is_staff());
drop policy if exists "materials staff delete" on storage.objects;
create policy "materials staff delete" on storage.objects for delete to authenticated
  using (bucket_id = 'materials' and public.is_staff());

drop policy if exists "sfiles read" on storage.objects;
create policy "sfiles read" on storage.objects for select to authenticated
  using (bucket_id = 'student-files' and (public.is_staff() or (storage.foldername(name))[2] = public.my_student_id()::text));
drop policy if exists "sfiles insert" on storage.objects;
create policy "sfiles insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'student-files' and (public.is_staff() or (storage.foldername(name))[2] = public.my_student_id()::text));
drop policy if exists "sfiles update" on storage.objects;
create policy "sfiles update" on storage.objects for update to authenticated
  using (bucket_id = 'student-files' and (public.is_staff() or (storage.foldername(name))[2] = public.my_student_id()::text));
drop policy if exists "sfiles delete" on storage.objects;
create policy "sfiles delete" on storage.objects for delete to authenticated
  using (bucket_id = 'student-files' and (public.is_staff() or (storage.foldername(name))[2] = public.my_student_id()::text));
