-- ResearchOS database schema for Supabase.
-- Paste the whole file into Supabase > SQL Editor and run it once.
-- It creates the tables, row-level security, helper functions, realtime and the example project.

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '',
  orcid text check (orcid is null or orcid ~ '^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  idea_text text not null default '',
  field text not null default '',
  goal text not null default 'Academic paper' check (goal in ('Academic paper', 'Product', 'Grant proposal')),
  verdict text check (verdict in ('Pursue', 'Refine', 'Rethink')),
  viability_score int check (viability_score between 0 and 100),
  assessment jsonb,
  milestones jsonb not null default '[]'::jsonb,
  is_example boolean not null default false,
  from_project uuid references public.projects (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'Researcher' check (role in ('Lead', 'Researcher', 'Observer')),
  last_seen timestamptz,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role text not null default 'Researcher' check (role in ('Lead', 'Researcher', 'Observer')),
  token uuid not null default gen_random_uuid() unique,
  invited_by uuid references auth.users (id) on delete set null default auth.uid(),
  accepted_at timestamptz,
  accepted_by uuid references auth.users (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  created_at timestamptz not null default now()
);

create table if not exists public.papers (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  year int,
  url text,
  abstract text,
  relevance_note text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  milestone text not null default 'General',
  title text not null,
  method text not null default '',
  success_criterion text not null default '',
  est_days int not null default 1 check (est_days > 0),
  status text not null default 'To do' check (status in ('To do', 'Running', 'Blocked', 'Done')),
  blocker text not null default '',
  assignee_id uuid references auth.users (id) on delete set null,
  due_date date,
  added_by_review boolean not null default false,
  changed_by_review boolean not null default false,
  position double precision not null default extract(epoch from now()),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.results (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  what_done text not null default '',
  outcome text not null,
  criterion_met text not null check (criterion_met in ('Yes', 'Partly', 'No')),
  notes text not null default '',
  logged_by uuid references auth.users (id) on delete set null default auth.uid(),
  logged_at timestamptz not null default now()
);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'Protocol' check (kind in ('Protocol', 'Observation', 'Decision', 'Literature')),
  title text not null,
  body text not null default '',
  task_id uuid references public.tasks (id) on delete set null,
  author_id uuid references auth.users (id) on delete set null default auth.uid(),
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  status text not null check (status in ('On track', 'Adjust', 'Pivot')),
  diagnosis text not null default '',
  recommendations jsonb not null default '[]'::jsonb,
  applied jsonb not null default '[]'::jsonb,
  run_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.evidence (
  project_id uuid not null references public.projects (id) on delete cascade,
  assumption_id text not null,
  status text not null check (status in ('Confirmed', 'Rejected')),
  link text not null default '',
  note text not null default '',
  recorded_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (project_id, assumption_id)
);

create table if not exists public.publications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  member_id uuid references auth.users (id) on delete set null,
  title text not null,
  year int,
  doi_or_url text not null default '',
  abstract text not null default '',
  topics jsonb not null default '[]'::jsonb,
  source text not null default 'manual' check (source in ('orcid', 'manual')),
  created_at timestamptz not null default now()
);

create table if not exists public.directions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  expertise_summary text not null default '',
  suggestions jsonb not null default '[]'::jsonb,
  based_on_count int not null default 0,
  run_by uuid references auth.users (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.econ (
  project_id uuid primary key references public.projects (id) on delete cascade,
  currency text not null default 'INR' check (currency in ('INR', 'USD', 'EUR')),
  price numeric not null default 0,
  cost numeric not null default 0,
  units numeric not null default 0,
  updated_by uuid references auth.users (id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now()
);

-- @mentions in task comments: one row per person mentioned, cleared when they read it
create table if not exists public.mentions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid not null references public.tasks (id) on delete cascade,
  comment_id uuid not null references public.comments (id) on delete cascade,
  mentioned_user_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique (comment_id, mentioned_user_id)
);
create index if not exists mentions_user_idx on public.mentions (mentioned_user_id, read_at);

-- AI work runs as background jobs; the app watches this table for the result
create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  action text not null,
  status text not null default 'running' check (status in ('running', 'done', 'error')),
  progress text not null default '',
  result jsonb,
  error text,
  created_by uuid not null references auth.users (id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ai_jobs_project_idx on public.ai_jobs (project_id, created_at desc);

create table if not exists public.activity_log (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null default auth.uid(),
  text text not null,
  target_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists tasks_project_idx on public.tasks (project_id);
create index if not exists results_project_idx on public.results (project_id);
create index if not exists notes_project_idx on public.notes (project_id);
create index if not exists comments_task_idx on public.comments (task_id);
create index if not exists activity_project_idx on public.activity_log (project_id, created_at desc);
create index if not exists members_user_idx on public.project_members (user_id);

-- ---------- Helper functions ----------
create or replace function public.member_role(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.project_members where project_id = p and user_id = auth.uid()
$$;

create or replace function public.is_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid())
$$;

create or replace function public.can_edit(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p) in ('Lead', 'Researcher'), false)
$$;

create or replace function public.is_lead(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.member_role(p) = 'Lead', false)
$$;

create or replace function public.shares_project(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members a
    join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = other
  )
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['profiles', 'projects', 'tasks', 'notes', 'ai_jobs'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- New user -> profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Project creator becomes its Lead
create or replace function public.add_creator_as_lead()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is not null then
    insert into public.project_members (project_id, user_id, role)
    values (new.id, new.created_by, 'Lead') on conflict do nothing;
  end if;
  return new;
end $$;
drop trigger if exists project_creator_lead on public.projects;
create trigger project_creator_lead after insert on public.projects
  for each row execute function public.add_creator_as_lead();

-- A project always keeps at least one Lead
create or replace function public.keep_one_lead()
returns trigger language plpgsql as $$
declare pid uuid := coalesce(old.project_id, new.project_id);
begin
  if old.role = 'Lead' and (tg_op = 'DELETE' or new.role <> 'Lead') then
    if not exists (select 1 from public.project_members
                   where project_id = pid and role = 'Lead' and user_id <> old.user_id)
       and exists (select 1 from public.projects where id = pid) then
      raise exception 'A project needs at least one Lead';
    end if;
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists keep_one_lead on public.project_members;
create trigger keep_one_lead before update or delete on public.project_members
  for each row execute function public.keep_one_lead();

-- Accept an invite (the signed-in user's email must match)
create or replace function public.accept_invite(invite_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.invites; my_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  select * into inv from public.invites where token = invite_token;
  if not found then raise exception 'This invite link is not valid'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = auth.uid() then return inv.project_id; end if;
    raise exception 'This invite has already been used';
  end if;
  if inv.expires_at < now() then raise exception 'This invite has expired. Ask the Lead for a new one'; end if;
  if lower(inv.email) <> my_email then
    raise exception 'This invite was sent to %. Sign in with that email to accept it', inv.email;
  end if;
  insert into public.project_members (project_id, user_id, role)
  values (inv.project_id, auth.uid(), inv.role)
  on conflict (project_id, user_id) do nothing;
  update public.invites set accepted_at = now(), accepted_by = auth.uid() where id = inv.id;
  insert into public.activity_log (project_id, actor_id, text) values (inv.project_id, auth.uid(), 'joined the project as ' || inv.role);
  return inv.project_id;
end $$;

-- Who can see an invite before accepting it (project title only)
create or replace function public.invite_preview(invite_token uuid)
returns table (project_title text, email text, role text, expired boolean, used boolean)
language sql stable security definer set search_path = public as $$
  select p.title, i.email, i.role, i.expires_at < now(), i.accepted_at is not null
  from public.invites i join public.projects p on p.id = i.project_id
  where i.token = invite_token
$$;

-- ---------- Row-level security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invites enable row level security;
alter table public.papers enable row level security;
alter table public.tasks enable row level security;
alter table public.results enable row level security;
alter table public.notes enable row level security;
alter table public.comments enable row level security;
alter table public.reviews enable row level security;
alter table public.evidence enable row level security;
alter table public.publications enable row level security;
alter table public.directions enable row level security;
alter table public.activity_log enable row level security;
alter table public.econ enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.mentions enable row level security;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select using (id = auth.uid() or public.shares_project(id));
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());

drop policy if exists projects_read on public.projects;
-- The creator check lets "insert ... returning" work: Postgres checks read access before the trigger adds the creator as Lead
create policy projects_read on public.projects for select using (public.is_member(id) or created_by = auth.uid());
drop policy if exists projects_insert on public.projects;
create policy projects_insert on public.projects for insert to authenticated with check (created_by = auth.uid());
drop policy if exists projects_update on public.projects;
create policy projects_update on public.projects for update using (public.is_lead(id)) with check (public.is_lead(id));
drop policy if exists projects_delete on public.projects;
create policy projects_delete on public.projects for delete using (public.is_lead(id));

drop policy if exists members_read on public.project_members;
create policy members_read on public.project_members for select using (public.is_member(project_id));
drop policy if exists members_lead_write on public.project_members;
create policy members_lead_write on public.project_members for all using (public.is_lead(project_id)) with check (public.is_lead(project_id));
drop policy if exists members_self_seen on public.project_members;
create policy members_self_seen on public.project_members for update using (user_id = auth.uid())
  with check (user_id = auth.uid() and role = public.member_role(project_id));

drop policy if exists invites_lead on public.invites;
create policy invites_lead on public.invites for all using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- Read for members; write for Lead + Researcher
do $$ declare t text; begin
  foreach t in array array['papers', 'tasks', 'results', 'notes', 'evidence', 'publications', 'directions', 'econ'] loop
    execute format('drop policy if exists %1$s_read on public.%1$s', t);
    execute format('create policy %1$s_read on public.%1$s for select using (public.is_member(project_id))', t);
    execute format('drop policy if exists %1$s_write on public.%1$s', t);
    execute format('create policy %1$s_write on public.%1$s for all using (public.can_edit(project_id)) with check (public.can_edit(project_id))', t);
  end loop;
end $$;

-- Papers come only from the idea check, which only a Lead can run
drop policy if exists papers_write on public.papers;
create policy papers_write on public.papers for all using (public.is_lead(project_id)) with check (public.is_lead(project_id));

-- Related directions are suggested (and refreshed) by a Lead only
drop policy if exists directions_write on public.directions;
create policy directions_write on public.directions for all using (public.is_lead(project_id)) with check (public.is_lead(project_id));

drop policy if exists reviews_read on public.reviews;
create policy reviews_read on public.reviews for select using (public.is_member(project_id));
drop policy if exists reviews_insert on public.reviews;
create policy reviews_insert on public.reviews for insert with check (public.can_edit(project_id));
drop policy if exists reviews_apply on public.reviews;
create policy reviews_apply on public.reviews for update using (public.is_lead(project_id)) with check (public.is_lead(project_id));

drop policy if exists comments_read on public.comments;
create policy comments_read on public.comments for select using (public.is_member(project_id));
drop policy if exists comments_insert on public.comments;
create policy comments_insert on public.comments for insert with check (public.is_member(project_id) and author_id = auth.uid());
drop policy if exists comments_delete on public.comments;
-- Only the person who wrote a comment can delete it (not even a Lead can delete someone else's)
create policy comments_delete on public.comments for delete using (author_id = auth.uid());

-- You see only mentions of you; the comment's author creates them, only for project members; you mark yours read
drop policy if exists mentions_read on public.mentions;
create policy mentions_read on public.mentions for select using (mentioned_user_id = auth.uid() or author_id = auth.uid());
drop policy if exists mentions_insert on public.mentions;
create policy mentions_insert on public.mentions for insert with check (
  author_id = auth.uid() and public.is_member(project_id)
  and exists (select 1 from public.comments c where c.id = mentions.comment_id and c.author_id = auth.uid() and c.project_id = mentions.project_id and c.task_id = mentions.task_id)
  and exists (select 1 from public.project_members m where m.project_id = mentions.project_id and m.user_id = mentioned_user_id));
drop policy if exists mentions_update on public.mentions;
create policy mentions_update on public.mentions for update using (mentioned_user_id = auth.uid()) with check (mentioned_user_id = auth.uid());

drop policy if exists ai_jobs_read on public.ai_jobs;
create policy ai_jobs_read on public.ai_jobs for select using (public.is_member(project_id));
drop policy if exists ai_jobs_insert on public.ai_jobs;
create policy ai_jobs_insert on public.ai_jobs for insert with check (public.is_member(project_id) and created_by = auth.uid());
drop policy if exists ai_jobs_update on public.ai_jobs;
create policy ai_jobs_update on public.ai_jobs for update using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists activity_read on public.activity_log;
create policy activity_read on public.activity_log for select using (public.is_member(project_id));
drop policy if exists activity_insert on public.activity_log;
create policy activity_insert on public.activity_log for insert with check (public.is_member(project_id) and actor_id = auth.uid());

-- Results, comments and tasks must belong to the same project as their task
create or replace function public.check_task_project()
returns trigger language plpgsql as $$
begin
  if new.task_id is not null and not exists (select 1 from public.tasks where id = new.task_id and project_id = new.project_id) then
    raise exception 'Task belongs to a different project';
  end if;
  return new;
end $$;
do $$ declare t text; begin
  foreach t in array array['results', 'comments', 'notes'] loop
    execute format('drop trigger if exists task_project_%1$s on public.%1$s', t);
    execute format('create trigger task_project_%1$s before insert or update on public.%1$s for each row execute function public.check_task_project()', t);
  end loop;
end $$;

-- ---------- Notifications for the person a task is assigned to ----------
-- Made by the database itself whenever a task, its result, a linked note, a comment or a mention changes,
-- so every path (board, edit window, results, notes, AI review approvals) notifies, and nobody can skip it.
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  kind text not null check (kind in ('mention', 'assigned', 'unassigned', 'updated', 'comment')),
  summary text not null default '',
  comment_id uuid references public.comments (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, updated_at desc);
alter table public.notifications enable row level security;
drop policy if exists notifications_read on public.notifications;
create policy notifications_read on public.notifications for select using (user_id = auth.uid());
drop policy if exists notifications_mark on public.notifications;
create policy notifications_mark on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Adds a notification; repeated changes to the same task by the same person within 10 minutes
-- are merged into one unread notification ("moved to Running; changed the due date").
create or replace function public.notify(recipient uuid, p uuid, t uuid, what text, msg text, cmt uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare actor uuid := auth.uid(); n public.notifications;
begin
  if recipient is null or msg is null or msg = '' or recipient = actor then return; end if;
  if not exists (select 1 from project_members where project_id = p and user_id = recipient) then return; end if;
  if what = 'updated' then
    select * into n from notifications
      where user_id = recipient and task_id = t and actor_id is not distinct from actor and kind = 'updated'
        and read_at is null and updated_at > now() - interval '10 minutes'
      order by updated_at desc limit 1;
    if found then
      if position(msg in n.summary) = 0 then
        update notifications set summary = left(n.summary || '; ' || msg, 400), updated_at = now() where id = n.id;
      else
        update notifications set updated_at = now() where id = n.id;
      end if;
      return;
    end if;
  end if;
  insert into notifications (user_id, project_id, task_id, actor_id, kind, summary, comment_id)
  values (recipient, p, t, actor, what, left(msg, 400), cmt);
end $$;

create or replace function public.notify_task_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare changes text[] := '{}'; who text; prefix text := '';
begin
  if tg_op = 'INSERT' then
    perform notify(new.assignee_id, new.project_id, new.id, 'assigned', 'added this task and assigned it to you');
    return new;
  end if;
  -- Owner changed
  if new.assignee_id is distinct from old.assignee_id then
    perform notify(new.assignee_id, new.project_id, new.id, 'assigned', 'assigned this task to you');
    select display_name into who from profiles where id = new.assignee_id;
    perform notify(old.assignee_id, old.project_id, old.id, 'unassigned',
      case when new.assignee_id is null then 'unassigned you from this task' else 'reassigned this task to ' || coalesce(nullif(who, ''), 'someone else') end);
  end if;
  -- What changed on the card (for its current owner)
  if new.status is distinct from old.status then
    changes := changes || ('moved it to ' || new.status || case when new.status = 'Blocked' and new.blocker <> '' then ' (' || new.blocker || ')' else '' end);
  elsif new.blocker is distinct from old.blocker and new.status = 'Blocked' and new.blocker <> '' then
    changes := changes || ('updated the blocker: ' || new.blocker);
  end if;
  if new.title is distinct from old.title then changes := changes || ('renamed it from "' || old.title || '"'); end if;
  if new.milestone is distinct from old.milestone then changes := changes || ('moved it to the milestone "' || new.milestone || '"'); end if;
  if new.method is distinct from old.method then changes := changes || 'changed the method'::text; end if;
  if new.success_criterion is distinct from old.success_criterion then changes := changes || 'changed the success criterion'::text; end if;
  if new.est_days is distinct from old.est_days then changes := changes || ('changed the estimate to ' || new.est_days || ' days'); end if;
  if new.due_date is distinct from old.due_date then
    changes := changes || (case when new.due_date is null then 'removed the due date' else 'changed the due date to ' || to_char(new.due_date, 'FMDD Mon YYYY') end);
  end if;
  if new.changed_by_review and not old.changed_by_review then prefix := 'approved an AI review that '; end if;
  if array_length(changes, 1) > 0 and new.assignee_id is not distinct from old.assignee_id then
    perform notify(new.assignee_id, new.project_id, new.id, 'updated', prefix || array_to_string(changes, '; '));
  end if;
  return new;
end $$;
drop trigger if exists notify_task_change on public.tasks;
create trigger notify_task_change after insert or update on public.tasks
  for each row execute function public.notify_task_change();

create or replace function public.notify_result()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from tasks where id = new.task_id;
  if tg_op = 'UPDATE' and new.outcome is not distinct from old.outcome and new.criterion_met is not distinct from old.criterion_met
     and new.what_done is not distinct from old.what_done and new.notes is not distinct from old.notes then return new; end if;
  perform notify(t.assignee_id, t.project_id, t.id, 'updated',
    case when tg_op = 'INSERT' then 'logged a result' else 'updated the result' end || ': criterion ' ||
    case new.criterion_met when 'Yes' then 'met' when 'Partly' then 'partly met' else 'missed' end);
  return new;
end $$;
drop trigger if exists notify_result on public.results;
create trigger notify_result after insert or update on public.results
  for each row execute function public.notify_result();

create or replace function public.notify_note()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  if new.task_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.task_id is not distinct from old.task_id and new.body is not distinct from old.body and new.title is not distinct from old.title then return new; end if;
  select * into t from tasks where id = new.task_id;
  perform notify(t.assignee_id, t.project_id, t.id, 'updated',
    case when tg_op = 'INSERT' or new.task_id is distinct from old.task_id then 'linked the ' || lower(new.kind) || ' note "' || new.title || '"'
         else 'edited the note "' || new.title || '"' end);
  return new;
end $$;
drop trigger if exists notify_note on public.notes;
create trigger notify_note after insert or update on public.notes
  for each row execute function public.notify_note();

create or replace function public.notify_comment()
returns trigger language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from tasks where id = new.task_id;
  perform notify(t.assignee_id, t.project_id, t.id, 'comment', 'commented: ' || left(new.body, 140), new.id);
  return new;
end $$;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments
  for each row execute function public.notify_comment();

-- A mention is the stronger notification: it replaces the "commented" one for the same comment.
create or replace function public.notify_mention()
returns trigger language plpgsql security definer set search_path = public as $$
declare body text;
begin
  select c.body into body from comments c where c.id = new.comment_id;
  delete from notifications where user_id = new.mentioned_user_id and comment_id = new.comment_id and kind = 'comment';
  perform notify(new.mentioned_user_id, new.project_id, new.task_id, 'mention', 'mentioned you: ' || left(coalesce(body, ''), 140), new.comment_id);
  return new;
end $$;
drop trigger if exists notify_mention on public.mentions;
create trigger notify_mention after insert on public.mentions
  for each row execute function public.notify_mention();

-- ---------- Realtime ----------
do $$ declare t text; begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['projects', 'project_members', 'tasks', 'results', 'notes', 'comments', 'reviews', 'evidence', 'publications', 'directions', 'econ', 'activity_log', 'ai_jobs', 'mentions', 'notifications'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ---------- Example project for demos ----------
create or replace function public.create_example_project()
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; t1 uuid; t2 uuid; t3 uuid; t4 uuid; t5 uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in first'; end if;
  -- One example per person: reopen it if they already have one (the lock stops double clicks racing)
  perform pg_advisory_xact_lock(hashtext('example:' || me::text));
  select p.id into pid from projects p
  where p.is_example and p.created_by = me
    and exists (select 1 from project_members m where m.project_id = p.id and m.user_id = me)
  order by p.created_at limit 1;
  if pid is not null then return pid; end if;
  insert into projects (title, idea_text, field, goal, verdict, viability_score, assessment, milestones, is_example, created_by)
  values (
    'Paper-strip nitrate test read by a phone camera (example)',
    'A low-cost paper test strip that changes colour with nitrate concentration in groundwater. A smartphone photo of the strip next to a printed reference card gives a reading in mg/L, so village health workers can test wells without a lab.',
    'Environmental engineering', 'Product', 'Refine', 68,
    jsonb_build_object(
      'summary', 'Solid, buildable chemistry with real demand. The novelty has to come from reliable phone calibration in the field, not from the colour reaction itself.',
      'novelty', jsonb_build_object('score', 55, 'reason', 'Phone colorimetry for nitrate is well studied; the open space is calibration that works without lab conditions.'),
      'feasibility', jsonb_build_object('score', 78, 'reason', 'Griess-reaction chemistry and phone imaging are mature; a basic wet lab can prototype in weeks.'),
      'commercial_potential', jsonb_build_object('score', 70, 'reason', 'Clear demand from rural water programmes and NGOs, but price pressure is high and field validation is costly.'),
      'challenges', jsonb_build_array('Ambient light shifts colour readings between locations', 'Reagent stability on paper over weeks in hot climates', 'Interference from nitrite and turbid samples', 'Matching lab accuracy (ion chromatography) at a low price', 'Getting field kits accepted by water-quality regulators'),
      'gaps', jsonb_build_array('Few studies validate readings across many phone models', 'Little shelf-life data above 35 °C', 'Calibration without a printed reference card is barely explored'),
      'assumptions', jsonb_build_array(
        jsonb_build_object('id', 'a1', 'category', 'Customer', 'claim', 'Rural water programmes and NGOs will pay for field nitrate kits rather than send samples to labs.', 'basis', 'Estimate from how many programmes test wells regularly.', 'confidence', 'Medium', 'check', 'Ask 3 NGOs or district water offices how they test today and what they pay per test.', 'search', 'groundwater nitrate field test kit procurement NGO', 'where', 'web'),
        jsonb_build_object('id', 'a2', 'category', 'Price', 'claim', 'A strip plus phone reading can sell for under ₹50 per test and still be profitable.', 'basis', 'Estimate: paper, reagent and packaging cost well under ₹15 per strip at volume.', 'confidence', 'Low', 'check', 'Get reagent and paper quotes at 10,000-strip volume and compare with existing kit prices.', 'search', 'nitrate test strip price per test', 'where', 'web'),
        jsonb_build_object('id', 'a3', 'category', 'Competition', 'claim', 'No existing product reads nitrate strips with a phone camera at lab-comparable accuracy.', 'basis', 'Guess from the gap in multi-phone validation studies.', 'confidence', 'Low', 'check', 'Search patents and app stores for phone-read nitrate or water test strips.', 'search', 'smartphone camera nitrate test strip colorimetric reading', 'where', 'patents'),
        jsonb_build_object('id', 'a4', 'category', 'Regulation', 'claim', 'Field results will be accepted for screening, with lab confirmation only for positives.', 'basis', 'Common practice for field kits; unverified for this region.', 'confidence', 'Medium', 'check', 'Check the national drinking-water testing protocol for field-kit screening rules.', 'search', 'drinking water quality field test kit screening protocol nitrate', 'where', 'web')
      )
    ),
    '["Sensor chemistry", "Phone reading", "Field validation"]'::jsonb, true, me)
  returning id into pid;

  insert into papers (project_id, title, year, url, relevance_note) values
    (pid, 'Search Semantic Scholar for: smartphone colorimetric nitrate detection', null, 'https://www.semanticscholar.org/search?q=smartphone%20colorimetric%20nitrate%20detection', 'The example project has no live paper search; run the idea check on your own idea to fetch real papers.');

  insert into tasks (project_id, milestone, title, method, success_criterion, est_days, status, position)
    values (pid, 'Sensor chemistry', 'Optimise Griess reagent loading on filter paper', 'Vary reagent volume and drying time across 12 strip batches', 'Visible colour change at 5 mg/L NO3-N within 5 minutes', 4, 'Done', 1) returning id into t1;
  insert into tasks (project_id, milestone, title, method, success_criterion, est_days, status, position, assignee_id, due_date)
    values (pid, 'Sensor chemistry', 'Shelf-life test at 25 °C and 40 °C', 'Store sealed strips, test against standards weekly', 'Under 10% signal loss after 30 days', 30, 'Running', 2, me, current_date + 20) returning id into t2;
  insert into tasks (project_id, milestone, title, method, success_criterion, est_days, status, position)
    values (pid, 'Phone reading', 'Colour-reading flow with reference card', 'Photograph strips beside a printed card; fit a calibration curve', 'R² ≥ 0.95 against standards from 0 to 50 mg/L', 5, 'Done', 3) returning id into t3;
  insert into tasks (project_id, milestone, title, method, success_criterion, est_days, status, position, due_date)
    values (pid, 'Phone reading', 'Test across 5 phone models', 'Same strips and standards, 5 phones, 3 repeats each', 'Coefficient of variation between phones under 10%', 3, 'To do', 4, current_date + 10) returning id into t4;
  insert into tasks (project_id, milestone, title, method, success_criterion, est_days, status, blocker, position, due_date)
    values (pid, 'Field validation', 'Compare with lab ion chromatography on 30 wells', 'Split each well sample between strip test and lab', 'Mean absolute error under 2 mg/L', 10, 'Blocked', 'Waiting for the partner lab to confirm ion chromatography slots', 5, current_date + 35) returning id into t5;

  insert into results (task_id, project_id, what_done, outcome, criterion_met, notes) values
    (t1, pid, 'Tested 12 batches; 20 µL reagent dried 15 min worked best.', 'Colour clearly visible at 3 mg/L after 4 minutes.', 'Yes', ''),
    (t3, pid, 'Fitted a curve from 40 photos under office light and near a window.', 'R² = 0.91 under office light; 0.82 near the window.', 'Partly', 'Readings drift with daylight; the card alone is not correcting it.');

  insert into notes (project_id, kind, title, body, task_id) values
    (pid, 'Protocol', 'Strip preparation protocol v2', E'1. Cut Whatman No. 1 paper into 5 × 40 mm strips.\n2. Pipette 20 µL Griess reagent onto the 5 mm test zone.\n3. Dry 15 min at room temperature, away from light.\n4. Seal in foil pouches with a silica sachet.', t1),
    (pid, 'Observation', 'Readings drift near the window', 'Same 40 strips photographed twice. Office light: R² 0.91. Near the window at 3 pm: R² 0.82. The red channel drifts most. The reference card did not correct it.', t3),
    (pid, 'Decision', 'Pause multi-phone testing', 'Agreed to wait for a dark cradle before testing 5 phones, so phone differences are not mixed with lighting noise.', t4),
    (pid, 'Literature', 'Reading list: phone colorimetry', E'- Smartphone colorimetric nitrate detection on paper\n- Griess reagent stability on paper\n- Lighting correction for smartphone colorimetry', null);

  insert into reviews (project_id, status, diagnosis, recommendations) values (pid, 'Adjust',
    'The chemistry is on track, but phone readings drift with lighting, so the calibration step misses its target. Fix lighting before testing more phones, or the multi-phone results will be noisy for the wrong reason.',
    jsonb_build_array(
      jsonb_build_object('change', 'Shield the strip from ambient light', 'reason', 'Window light cut R² from 0.91 to 0.82; a fixed light path removes that variable.', 'edits', '[]'::jsonb,
        'new_tasks', jsonb_build_array(jsonb_build_object('milestone', 'Phone reading', 'title', 'Design a 3D-printed dark cradle for the phone and strip', 'method', 'Cradle with a fixed distance and the phone flash as the only light', 'success_criterion', 'R² ≥ 0.95 under 3 lighting conditions', 'est_days', 4))),
      jsonb_build_object('change', 'Re-run the calibration with white-balance correction', 'reason', 'The card''s grey patch can normalise each photo, which may recover the R² lost near the window.',
        'edits', jsonb_build_array(jsonb_build_object('task_id', t3, 'status', 'Running', 'method', 'Normalise RGB by the card''s grey patch, then re-fit the curve under office and window light')), 'new_tasks', '[]'::jsonb),
      jsonb_build_object('change', 'Hold the 5-phone test until lighting is fixed', 'reason', 'Running it now would mix phone differences with lighting noise.',
        'edits', jsonb_build_array(jsonb_build_object('task_id', t4, 'method', 'Run only after the dark cradle passes; same strips and standards, 5 phones, 3 repeats each', 'est_days', 4)), 'new_tasks', '[]'::jsonb)
    ));

  insert into activity_log (project_id, actor_id, text) values (pid, me, 'loaded the example project');
  return pid;
end $$;

grant execute on function public.accept_invite(uuid) to authenticated;
grant execute on function public.invite_preview(uuid) to anon, authenticated;
grant execute on function public.create_example_project() to authenticated;
revoke execute on function public.notify(uuid, uuid, uuid, text, text, uuid) from public, anon, authenticated;
