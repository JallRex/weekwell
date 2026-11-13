begin;

create schema if not exists weekwell_private;
revoke all on schema weekwell_private from public, anon, authenticated;

create table weekwell_private.owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id)
);

do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Create exactly one app user before running Weekwell setup.';
  end if;
  insert into weekwell_private.owner (user_id) select id from auth.users;
end;
$$;

create function public.weekwell_is_owner()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from weekwell_private.owner where user_id = (select auth.uid())
  );
$$;
revoke all on function public.weekwell_is_owner() from public, anon;
grant execute on function public.weekwell_is_owner() to authenticated;

create table public.weekwell_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan jsonb not null check ((
    jsonb_typeof(plan) = 'object'
    and plan->>'version' = '1'
    and jsonb_typeof(plan->'settings') = 'object'
    and jsonb_typeof(plan->'weeks') = 'object'
    and octet_length(plan::text) <= 5242880
  ) is true),
  revision bigint not null check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.weekwell_plans enable row level security;
revoke all on public.weekwell_plans from public, anon, authenticated;
grant select on public.weekwell_plans to authenticated;
create policy owner_read on public.weekwell_plans
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.weekwell_is_owner()));

create function public.weekwell_save_plan(p_plan jsonb, p_expected_revision bigint)
returns table (revision bigint, updated_at timestamptz)
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.weekwell_is_owner() then
    raise exception 'This account is not the Weekwell owner.' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid expected revision.';
  end if;
  if p_expected_revision = 0 then
    return query
      insert into public.weekwell_plans as saved (user_id, plan, revision)
      values (auth.uid(), p_plan, 1)
      on conflict (user_id) do nothing
      returning saved.revision, saved.updated_at;
  else
    return query
      update public.weekwell_plans as saved
      set plan = p_plan, revision = saved.revision + 1, updated_at = now()
      where saved.user_id = auth.uid() and saved.revision = p_expected_revision
      returning saved.revision, saved.updated_at;
  end if;
  if not found then
    raise exception 'Cloud plan changed. Load the latest cloud plan before saving.' using errcode = '40001';
  end if;
end;
$$;
revoke all on function public.weekwell_save_plan(jsonb, bigint) from public, anon;
grant execute on function public.weekwell_save_plan(jsonb, bigint) to authenticated;

commit;
