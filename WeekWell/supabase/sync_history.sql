begin;

lock table public.weekwell_plans in share row exclusive mode;

create table public.weekwell_plan_history (
  user_id uuid not null references auth.users(id) on delete cascade,
  revision bigint not null check (revision > 0),
  plan jsonb not null,
  updated_at timestamptz not null,
  summary text not null,
  primary key (user_id, revision)
);

alter table public.weekwell_plan_history enable row level security;
revoke all on public.weekwell_plan_history from public, anon, authenticated;
grant select on public.weekwell_plan_history to authenticated;
create policy owner_read on public.weekwell_plan_history
  for select to authenticated
  using (user_id = (select auth.uid()) and (select public.weekwell_is_owner()));

insert into public.weekwell_plan_history (user_id, revision, plan, updated_at, summary)
select user_id, revision, plan, updated_at, 'Existing plan' from public.weekwell_plans;

create function weekwell_private.record_plan_history()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  description text;
begin
  if tg_op = 'INSERT' then
    description := 'Initial plan';
  else
    description := concat_ws(', ',
      case when old.plan->'settings' is distinct from new.plan->'settings' then 'Preferences' end,
      case when old.plan->'customerTargets' is distinct from new.plan->'customerTargets' then 'Customer targets' end,
      case when old.plan->'weeks' is distinct from new.plan->'weeks' then 'Visits, breaks or days off' end);
    if description = '' then description := 'Plan saved'; end if;
  end if;
  insert into public.weekwell_plan_history (user_id, revision, plan, updated_at, summary)
  values (new.user_id, new.revision, new.plan, new.updated_at, description);
  delete from public.weekwell_plan_history
  where user_id = new.user_id and revision not in (
    select revision from public.weekwell_plan_history
    where user_id = new.user_id order by revision desc limit 100
  );
  return new;
end;
$$;
revoke all on function weekwell_private.record_plan_history() from public, anon, authenticated;
create trigger weekwell_record_plan_history
after insert or update on public.weekwell_plans
for each row execute function weekwell_private.record_plan_history();

commit;
