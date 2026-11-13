begin;

do $$
declare
  owner_id uuid;
  saved_plan jsonb;
  old_revision bigint;
  new_revision bigint;
  rejected boolean := false;
begin
  select user_id into strict owner_id from weekwell_private.owner;
  perform set_config('weekwell.test_owner', owner_id::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', owner_id)::text, true);
  if not public.weekwell_is_owner() then raise exception 'Owner check failed'; end if;
  select plan, revision into saved_plan, old_revision
    from public.weekwell_plans where user_id = owner_id;
  saved_plan := coalesce(saved_plan,
    '{"version":1,"settings":{"target":37.5,"breakMinutes":30},"weeks":{}}'::jsonb);
  old_revision := coalesce(old_revision, 0);
  select revision into strict new_revision
    from public.weekwell_save_plan(saved_plan, old_revision);
  if new_revision <> old_revision + 1 then raise exception 'Revision increment failed'; end if;
  begin
    perform public.weekwell_save_plan(saved_plan, old_revision);
  exception when serialization_failure then
    rejected := true;
  end;
  if not rejected then raise exception 'Stale overwrite was allowed'; end if;
  rejected := false;
  begin
    perform public.weekwell_save_plan('{}'::jsonb, new_revision);
  exception when check_violation then
    rejected := true;
  end;
  if not rejected then raise exception 'Invalid cloud plan was accepted'; end if;
end;
$$;

select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-0000-0000-000000000000"}', true);
set local role authenticated;
do $$
declare
  rejected boolean := false;
begin
  if public.weekwell_is_owner() then raise exception 'Non-owner passed owner check'; end if;
  if exists (select 1 from public.weekwell_plans) then raise exception 'RLS exposed plans to another account'; end if;
  begin
    perform public.weekwell_save_plan('{}'::jsonb, 0);
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'Non-owner write was allowed'; end if;
end;
$$;
reset role;

select set_config('request.jwt.claims',
  json_build_object('sub', current_setting('weekwell.test_owner'))::text, true);
set local role authenticated;
do $$
begin
  if not exists (select 1 from public.weekwell_plans) then raise exception 'Owner cannot read saved plan'; end if;
end;
$$;
reset role;

set local role anon;
do $$
declare
  rejected boolean := false;
begin
  begin
    perform 1 from public.weekwell_plans;
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'Anonymous read was allowed'; end if;
  rejected := false;
  begin
    perform public.weekwell_save_plan('{}'::jsonb, 0);
  exception when insufficient_privilege then
    rejected := true;
  end;
  if not rejected then raise exception 'Anonymous write was allowed'; end if;
end;
$$;
reset role;

rollback;
select 'PASS: owner read/write, stale-save rejection, invalid-plan rejection, non-owner isolation, anonymous denial. Test writes rolled back.' as result;
