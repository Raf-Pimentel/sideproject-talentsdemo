-- Talents: complete schema + migration from the flat table "pessoa".
-- Run in Supabase > SQL Editor. Run PART 1, then PART 2, then PART 3.
-- The old table is kept as "pessoa_original" (nothing is deleted).

-- ========== PART 1: rename the old table and create the new ones ==========
begin;

alter table pessoa rename to pessoa_original;
alter index pessoa_pkey rename to pessoa_original_pkey;

-- Public profile (what a restricted reader may see later)
create table pessoa (
  id text primary key,                       -- T001, T002, ...
  nome text not null,
  linkedin text,
  nivel text,                                -- Not graduated, Recent graduate, Graduated, Master's, Dropout
  ingles_fluente text not null default 'Unknown'
    check (ingles_fluente in ('Yes','No','Unknown')),
  idiomas text[],                            -- e.g. {Portuguese,English,Spanish}
  status text,                               -- Employed, Founder, ...
  disponibilidade text,                      -- On-site, Remote, On-site/Remote
  destaques text,                            -- leadership / highlights
  visibilidade text not null default 'privada'
    check (visibilidade in ('privada','rede')),  -- 'rede' = person agreed to appear to the network
  criado_em timestamptz not null default now()
);

-- Private data: owner only (personal life + your own opinions)
create table pessoa_privado (
  pessoa_id text primary key references pessoa(id) on delete cascade,
  data_nascimento date,
  cidade_nascimento text,
  cidade_atual text,
  idade_saida_casa_pais int,                 -- age when left parents' home
  hobbies text[],
  nota_indicador numeric,                    -- referrer's score
  indicado_por text,
  notas text                                 -- your private notes
);

-- Education: one row per institution (several per person allowed)
create table formacao (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text not null references pessoa(id) on delete cascade,
  universidade text not null,
  curso text,
  ano_inicio int,
  ano_formatura int,
  principal boolean not null default false
);

-- Work, startups, organizations, leagues, funds
create table experiencia (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text not null references pessoa(id) on delete cascade,
  organizacao text not null,
  cargo text,
  tipo text,                                 -- company, startup, student org, fund...
  inicio date,
  fim date,                                  -- empty = still there
  notas text
);

-- Things the person launched or achieved (to track over time)
create table iniciativa (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text not null references pessoa(id) on delete cascade,
  titulo text not null,
  descricao text,
  tipo text,                                 -- startup, project, paper, award, event...
  data date,
  link text,
  criado_em timestamptz not null default now()
);

-- Your contact history with each person
create table interacao (
  id uuid primary key default gen_random_uuid(),
  pessoa_id text not null references pessoa(id) on delete cascade,
  data date,
  canal text,                                -- WhatsApp, LinkedIn, call, in person...
  resumo text,
  proximo_passo text,                        -- Send message, Wait for reply, Schedule call, Discard
  data_proximo_passo date,
  criado_em timestamptz not null default now()
);

create index on formacao (pessoa_id);
create index on experiencia (pessoa_id);
create index on iniciativa (pessoa_id);
create index on interacao (pessoa_id);

-- Lock everything: with RLS on and no policy, outsiders read nothing.
alter table pessoa enable row level security;
alter table pessoa_privado enable row level security;
alter table formacao enable row level security;
alter table experiencia enable row level security;
alter table iniciativa enable row level security;
alter table interacao enable row level security;

commit;

-- ========== PART 2: move the existing data ==========
begin;

insert into pessoa (id, nome, linkedin, nivel, ingles_fluente, status, disponibilidade, destaques)
select id, nome, contato, nivel, coalesce(ingles_fluente, 'Unknown'), status, disponibilidade, destaques
from pessoa_original;

insert into pessoa_privado (pessoa_id, nota_indicador, notas)
select id, nota_indicador, notas
from pessoa_original;

-- "Insper + Stanford" becomes two rows; the major text stays on the first (main) row
insert into formacao (pessoa_id, universidade, curso, principal)
select o.id, trim(u.parte), case when u.ordem = 1 then o.curso end, (u.ordem = 1)
from pessoa_original o
cross join lateral unnest(string_to_array(o.universidade, ' + ')) with ordinality as u(parte, ordem)
where o.universidade is not null and trim(o.universidade) <> '';

-- "Coinbase, AWS" becomes two rows
insert into experiencia (pessoa_id, organizacao)
select o.id, trim(e.nome)
from pessoa_original o
cross join lateral unnest(string_to_array(o.empresas, ',')) as e(nome)
where o.empresas is not null and trim(e.nome) <> '';

-- Follow-up columns become contact history (only people with something filled in)
insert into interacao (pessoa_id, data, resumo, proximo_passo)
select id, data_contato, resposta, proximo_passo
from pessoa_original
where contatado in ('Yes', 'In progress')
   or data_contato is not null
   or resposta is not null
   or proximo_passo is not null;

commit;

-- ========== PART 3: check ==========
select
  (select count(*) from pessoa_original) as originais,
  (select count(*) from pessoa) as pessoas,
  (select count(*) from pessoa_privado) as privados,
  (select count(*) from formacao) as formacoes,
  (select count(*) from experiencia) as experiencias,
  (select count(*) from interacao) as interacoes;

-- Migration "exigir_mfa_admin" (applied): admin policies also require aal2 (two-step verification).
-- Pattern: using (exists (select 1 from public.admin a where a.user_id = (select auth.uid())) and (select auth.jwt()->>'aal') = 'aal2')
-- Applied to: pessoa, pessoa_privado, formacao, experiencia, iniciativa, interacao, ia_uso ("admin all"),
-- membro ("admin gerencia membros") and acesso_log ("admin le log").
-- Other hardening migrations (admin, membro, rede_diretorio, acesso_log, ia_uso, revoke from anon) were applied via apply_migration; see list_migrations.

-- Migration "membro_acesso_completo" (applied): membro.acesso text default 'basico' check in ('basico','completo');
--   rede_diretorio() returns extra fields (status, availability, English, languages, pessoa_privado, interacao) for 'completo' members and admins.
-- Migration "rede_diretorio_nota_para_todos" (applied, SUPERSEDED 2026-11-11 by nota_somente_admin: the score is now admin only).
-- The full current function body is mirrored in supabase/rede_diretorio.sql (source of truth: the database).

-- Migration "remover_exigencia_mfa" (applied 2026-11-07, owner's request): the aal2 check was removed from every admin policy
-- (pessoa, pessoa_privado, formacao, experiencia, iniciativa, interacao, ia_uso: "admin all"; membro: "admin gerencia membros"; acesso_log: "admin le log").
-- Policies now only check that auth.uid() is in public.admin. The Edge Function cadastro-ia (v5) no longer checks aal2.

-- Migration "historico_alteracoes" (applied 2026-11-07): see supabase/historico.sql.

-- Feature "Sugerir conexoes" (2026-11-11): see supabase/match_ia.sql (adds pessoa_privado.nivel_ambicao and resumo, ia_uso.tipo/tokens_*, membro.pode_match, functions perfis_para_match and registrar_tokens_match).
-- Phase 6 (2026-11-11): see supabase/match_ia_membros.sql (perfis_para_match also returns nome and linkedin; new function pode_usar_match).
-- Also 2026-11-11: supabase/match_ia_escopo_rede.sql (perfis_para_match takes p_somente_rede boolean default false; admins still see everybody by default).

-- Enrichment agents (2026-11-12): see supabase/enriquecimento_ia.sql (table proposta_enriquecimento with RLS admin only and history trigger, iniciativa.fonte, ia_uso.tipo 'enriquecer').
