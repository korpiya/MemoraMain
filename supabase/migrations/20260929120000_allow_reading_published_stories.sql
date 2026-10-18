drop policy if exists "Authenticated users can view published stories" on public.stories;

create policy "Authenticated users can view published stories"
on public.stories
for select
to authenticated
using (status = 'approved' and is_public = true);