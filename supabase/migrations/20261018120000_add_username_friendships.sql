alter table public.profiles
  add column if not exists username text;

create unique index if not exists profiles_username_lower_unique
  on public.profiles (lower(username))
  where username is not null and username <> '';

create table if not exists public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_no_self check (user_id <> friend_id)
);

alter table public.friendships enable row level security;

drop policy if exists "Users can view their friendships" on public.friendships;
create policy "Users can view their friendships"
  on public.friendships
  for select
  to authenticated
  using (auth.uid() = user_id);

create or replace function public.search_profiles(search_term text)
returns table (id uuid, username text, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.full_name, p.avatar_url
  from public.profiles p
  where auth.uid() is not null
    and nullif(trim(search_term), '') is not null
    and p.username ilike '%' || trim(search_term) || '%'
    and p.id <> auth.uid()
  order by p.username
  limit 20;
$$;

create or replace function public.get_my_friends()
returns table (id uuid, username text, full_name text, avatar_url text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username, p.full_name, p.avatar_url
  from public.friendships f
  join public.profiles p on p.id = f.friend_id
  where auth.uid() = f.user_id
  order by p.username;
$$;

create or replace function public.add_friend(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'You must be signed in to add a friend.';
  end if;
  if current_user_id = target_user_id then
    raise exception 'You cannot add yourself as a friend.';
  end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id and p.username is not null) then
    raise exception 'That user could not be found.';
  end if;

  insert into public.friendships (user_id, friend_id)
  values (current_user_id, target_user_id), (target_user_id, current_user_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.search_profiles(text) from public, anon;
revoke all on function public.get_my_friends() from public, anon;
revoke all on function public.add_friend(uuid) from public, anon;

grant execute on function public.search_profiles(text) to authenticated;
grant execute on function public.get_my_friends() to authenticated;
grant execute on function public.add_friend(uuid) to authenticated;