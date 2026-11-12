-- Migration "qualidade_dados" (applied 2026-11-10): data-quality guards.
-- 1) Table alias_nome: spelling variants -> the official name (universidade, curso, organizacao). Managed in the panel ("Padronizar nomes").
--    Admin only (RLS), anon has no access, every change is logged in historico (trigger).
-- 2) CHECK constraints so the database refuses bad values even if the panel fails.
--    Existing data was verified to satisfy all of them before applying.

create table public.alias_nome (
  id bigint generated always as identity primary key,
  tipo text not null check (tipo in ('universidade', 'curso', 'organizacao')),
  alias text not null check (alias = btrim(alias) and alias <> ''),
  canonico text not null check (canonico = btrim(canonico) and canonico <> ''),
  criado_em timestamptz not null default now(),
  check (lower(alias) <> lower(canonico))
);
create unique index alias_nome_unico on public.alias_nome (tipo, lower(alias));
alter table public.alias_nome enable row level security;
create policy "admin all" on public.alias_nome for all to authenticated
  using (exists (select 1 from public.admin a where a.user_id = (select auth.uid())))
  with check (exists (select 1 from public.admin a where a.user_id = (select auth.uid())));
revoke all on public.alias_nome from anon, public;
grant select, insert, update, delete on public.alias_nome to authenticated;
create trigger historico_alias_nome after insert or update or delete on public.alias_nome
  for each row execute function public.registrar_historico();

insert into public.alias_nome (tipo, alias, canonico) values
  ('universidade', 'University of Pensilvania', 'University of Pennsylvania'),
  ('universidade', 'UPenn', 'University of Pennsylvania'),
  ('universidade', 'Universidade de São Paulo', 'USP'),
  ('universidade', 'Universidade Estadual de Campinas', 'Unicamp'),
  ('universidade', 'Instituto Tecnológico de Aeronáutica', 'ITA'),
  ('universidade', 'Massachusetts Institute of Technology', 'MIT'),
  ('universidade', 'UC Berkeley', 'Berkeley'),
  ('universidade', 'University of California, Berkeley', 'Berkeley'),
  ('universidade', 'ETH Zürich', 'ETH Zurich'),
  ('universidade', 'Universidade do Porto', 'University of Porto'),
  ('organizacao', 'BTG', 'BTG Pactual'),
  ('curso', 'Economia', 'Economics'),
  ('curso', 'Ciência da Computação', 'Computer Science'),
  ('curso', 'Engenharia Elétrica', 'Electrical Engineering'),
  ('curso', 'Engenharia de Computação', 'Computer Engineering'),
  ('curso', 'Engenharia Mecânica', 'Mechanical Engineering'),
  ('curso', 'Engenharia Química', 'Chemical Engineering'),
  ('curso', 'Estatística', 'Statistics'),
  ('curso', 'Física', 'Physics'),
  ('curso', 'Psicologia', 'Psychology'),
  ('curso', 'Administração', 'Business');

alter table public.pessoa
  add constraint pessoa_id_formato check (id ~ '^T[0-9]{3,}$'),
  add constraint pessoa_nome_limpo check (nome = btrim(nome) and nome <> ''),
  add constraint pessoa_nivel_check check (nivel in ('Not graduated', 'Recent graduate', 'Graduated', 'Master''s', 'Dropout')),
  add constraint pessoa_status_check check (status in ('Employed', 'Employed + Founder', 'Founder', 'Unemployed', 'Exchange program')),
  add constraint pessoa_disponibilidade_check check (disponibilidade in ('On-site', 'Remote', 'On-site/Remote'));

alter table public.pessoa_privado
  add constraint pessoa_privado_nota_check check (nota_indicador between 0 and 10),
  add constraint pessoa_privado_nascimento_check check (data_nascimento between date '1930-01-01' and date '2015-12-31'),
  add constraint pessoa_privado_saida_check check (idade_saida_casa_pais between 5 and 40);

alter table public.formacao
  add constraint formacao_anos_check check (
    (ano_inicio is null or ano_inicio between 1950 and 2100)
    and (ano_formatura is null or ano_formatura between 1950 and 2100)
    and (ano_inicio is null or ano_formatura is null or ano_inicio <= ano_formatura));

alter table public.experiencia
  add constraint experiencia_datas_check check (inicio is null or fim is null or fim >= inicio);

alter table public.interacao
  add constraint interacao_proximo_passo_check check (proximo_passo in ('Send message', 'Wait for reply', 'Schedule call', 'Discard'));
