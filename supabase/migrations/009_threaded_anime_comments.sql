-- Add threaded episode/anime discussion without changing existing comment IDs
-- or access rules. Deleting a parent removes its reply tree.
alter table public.anime_comments
  add column if not exists parent_comment_id uuid references public.anime_comments(id) on delete cascade;

create index if not exists anime_comments_parent_created_idx
  on public.anime_comments(parent_comment_id, created_at asc)
  where parent_comment_id is not null;

create or replace function public.nanime_validate_comment_parent()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if new.parent_comment_id is not null then
    if new.parent_comment_id = new.id then raise exception 'comment cannot reply to itself'; end if;
    if not exists (
      select 1 from public.anime_comments parent
      where parent.id = new.parent_comment_id
        and parent.anime_id = new.anime_id
        and parent.parent_comment_id is null
    ) then raise exception 'reply parent must be a top-level comment on the same anime'; end if;
  end if;
  return new;
end $$;

drop trigger if exists nanime_comment_parent_valid on public.anime_comments;
create trigger nanime_comment_parent_valid
before insert or update of parent_comment_id, anime_id on public.anime_comments
for each row execute function public.nanime_validate_comment_parent();
