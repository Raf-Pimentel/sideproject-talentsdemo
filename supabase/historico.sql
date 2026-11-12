-- Migration "historico_alteracoes" (applied 2026-11-07): change history written by triggers.
-- Table public.historico is read-only for admins; nobody can write to it through the API (only the trigger function, SECURITY DEFINER).
-- Each row: quando, quem (auth uid) and quem_email, tabela, acao (insert/update/delete), registro_id (primary key value as text),
-- pessoa_id (the person it belongs to, null for membro/admin), antes/depois (jsonb; on update only the changed columns).
-- Triggers "historico_<table>" exist on: pessoa, pessoa_privado, formacao, experiencia, iniciativa, interacao, membro, admin.
-- Updates that change nothing are not logged. Cascade deletes (deleting a person) log one row per deleted child too.
-- The panel tab "Historico" lists the last 500 and offers "Desfazer" (writes the old values back, which is logged as a new change).
-- Live definitions: select pg_get_functiondef('public.registrar_historico()'::regprocedure);
create table public.historico (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  quem uuid, quem_email text,
  tabela text not null,
  acao text not null check (acao in ('insert','update','delete')),
  registro_id text not null, pessoa_id text,
  antes jsonb, depois jsonb
);
create index historico_quando_idx on public.historico (quando desc);
create index historico_pessoa_idx on public.historico (pessoa_id);
alter table public.historico enable row level security;
create policy "admin le historico" on public.historico for select to authenticated
  using (exists (select 1 from public.admin a where a.user_id = (select auth.uid())));
revoke all on public.historico from anon, authenticated;
grant select on public.historico to authenticated;
-- Function public.registrar_historico() (security definer, search_path '', execute revoked from everyone) and the triggers
-- were created in the same migration; see the live definition above.
