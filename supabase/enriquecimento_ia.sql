-- Migration "enriquecimento_ia" (2026-11-12): enrichment agent proposals (docs/PRIVACIDADE.md rules 9, 10, 11).
-- The Edge Function "enriquecer-ia" asks the AI for suggested fixes/additions for ONE person, always with a source,
-- and stores each one as a row here with status 'pendente'. NOTHING touches pessoa/formacao/experiencia/iniciativa
-- until the owner approves a row in the panel (tab "Enriquecer"); the page then writes with the owner's own login.
-- One row = one change: a field of the person, a field of an existing education/experience/initiative row, or a new row.
-- Admin only (RLS), every change logged by the historico trigger. Applied rows keep status 'aprovada' as the provenance record.
create table public.proposta_enriquecimento (
  id bigint generated always as identity primary key,
  pessoa_id text not null references public.pessoa(id) on delete cascade,
  alvo text not null check (alvo in ('pessoa','formacao','experiencia','iniciativa')),
  acao text not null check (acao in ('preencher','corrigir','adicionar')),
  registro_id uuid,                       -- existing child row (formacao/experiencia/iniciativa) for preencher/corrigir
  dados jsonb not null check (jsonb_typeof(dados) = 'object' and dados <> '{}'::jsonb),  -- proposed values (field -> value)
  valor_atual jsonb,                      -- snapshot of the current values of those fields when proposed
  fonte text not null check (length(btrim(fonte)) > 0 and length(fonte) <= 500),  -- URL or description
  justificativa text check (justificativa is null or length(justificativa) <= 500),
  confianca text check (confianca in ('alta','media','baixa')),
  status text not null default 'pendente' check (status in ('pendente','aprovada','rejeitada')),
  origem text not null default 'ia',
  criado_em timestamptz not null default now(),
  criado_por uuid default auth.uid(),
  decidido_em timestamptz,
  decidido_por uuid,
  check (
    (acao = 'adicionar' and alvo <> 'pessoa' and registro_id is null) or
    (acao <> 'adicionar' and alvo = 'pessoa' and registro_id is null) or
    (acao <> 'adicionar' and alvo <> 'pessoa' and registro_id is not null))
);
create index proposta_enriquecimento_pessoa_idx on public.proposta_enriquecimento (pessoa_id);
create index proposta_enriquecimento_status_idx on public.proposta_enriquecimento (status);
alter table public.proposta_enriquecimento enable row level security;
create policy "admin all" on public.proposta_enriquecimento for all to authenticated
  using (exists (select 1 from public.admin a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin a where a.user_id = (select auth.uid())));
revoke all on public.proposta_enriquecimento from anon;
create trigger historico_proposta_enriquecimento after insert or update or delete on public.proposta_enriquecimento
  for each row execute function public.registrar_historico();

-- Where an initiative came from (formacao.fonte and experiencia.fonte already exist, see fonte_dados.sql).
alter table public.iniciativa add column fonte text;

-- ia_uso gets a new kind for the rate limit of the enrichment function.
alter table public.ia_uso drop constraint ia_uso_tipo_check;
alter table public.ia_uso add constraint ia_uso_tipo_check check (tipo in ('cadastro','conectar','enriquecer'));
