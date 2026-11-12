-- Current definition of the directory function (mirror of what is deployed in Supabase; updated 2026-11-11).
-- Applied through migrations: network_directory, hardening_logs_limits, membro_acesso_completo, rede_diretorio_nota_para_todos,
-- nota_somente_admin (referrer score and "indicado_por" are admin only; see supabase/nota_somente_admin.sql) and indicado_por_somente_admin.
-- Source of truth is the database: select pg_get_functiondef('public.rede_diretorio()'::regprocedure);
--
-- Support tables (all with RLS on; admin policies check only that the user is in public.admin, two-step verification was removed):
--   admin(user_id uuid primary key)
--   membro(user_id uuid primary key, nome text, criado_em timestamptz default now(),
--          acesso text not null default 'basico' check (acesso in ('basico','completo')), pode_match boolean default true)
--   acesso_log(id bigint identity, user_id uuid, acao text not null, quando timestamptz not null default now())
--   ia_uso(id bigint identity, user_id uuid not null, quando timestamptz not null default now(), tipo text, tokens_*)

create or replace function public.rede_diretorio()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := (select auth.uid());
  completo boolean;
  eh_admin boolean;
begin
  if uid is null
     or (not exists (select 1 from public.membro m where m.user_id = uid)
         and not exists (select 1 from public.admin a where a.user_id = uid)) then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  if (select count(*) from public.acesso_log l
       where l.user_id = uid and l.acao = 'rede_diretorio' and l.quando > now() - interval '1 hour') >= 60 then
    raise exception 'limite de acessos atingido, tente mais tarde' using errcode = '54000';
  end if;
  insert into public.acesso_log (user_id, acao) values (uid, 'rede_diretorio');

  eh_admin := exists (select 1 from public.admin a where a.user_id = uid);
  completo := eh_admin
           or exists (select 1 from public.membro m where m.user_id = uid and m.acesso = 'completo');

  return coalesce((
    select jsonb_agg(x order by x->>'nome') from (
      select jsonb_build_object(
        'nome', p.nome,
        'linkedin', p.linkedin,
        'nivel', p.nivel,
        'destaques', p.destaques,
        'formacao', coalesce((select jsonb_agg(jsonb_build_object(
            'universidade', f.universidade, 'curso', f.curso, 'ano_formatura', f.ano_formatura, 'principal', f.principal)
            order by f.principal desc, f.ano_formatura desc nulls last)
          from public.formacao f where f.pessoa_id = p.id), '[]'::jsonb),
        'experiencia', coalesce((select jsonb_agg(jsonb_build_object(
            'organizacao', e.organizacao, 'cargo', e.cargo, 'tipo', e.tipo, 'inicio', e.inicio, 'fim', e.fim)
            order by e.fim desc nulls first, e.inicio desc nulls last)
          from public.experiencia e where e.pessoa_id = p.id), '[]'::jsonb),
        'iniciativa', coalesce((select jsonb_agg(jsonb_build_object(
            'titulo', i.titulo, 'descricao', i.descricao, 'tipo', i.tipo, 'data', i.data, 'link', i.link)
            order by i.data desc nulls last)
          from public.iniciativa i where i.pessoa_id = p.id), '[]'::jsonb)
      )
      || case when eh_admin then jsonb_build_object(
        'nota', (select pp.nota_indicador from public.pessoa_privado pp where pp.pessoa_id = p.id)
      ) else '{}'::jsonb end
      || case when completo then jsonb_build_object(
        'ingles_fluente', p.ingles_fluente,
        'idiomas', to_jsonb(p.idiomas),
        'status', p.status,
        'disponibilidade', p.disponibilidade,
        'privado', (select to_jsonb(v) - case when eh_admin then array[]::text[] else array['nota_indicador', 'indicado_por'] end from (
            select pp.data_nascimento, pp.cidade_nascimento, pp.cidade_atual, pp.idade_saida_casa_pais,
                   pp.hobbies, pp.nota_indicador, pp.indicado_por, pp.notas
            from public.pessoa_privado pp where pp.pessoa_id = p.id) v),
        'interacoes', coalesce((select jsonb_agg(jsonb_build_object(
            'data', it.data, 'canal', it.canal, 'resumo', it.resumo,
            'proximo_passo', it.proximo_passo, 'data_proximo_passo', it.data_proximo_passo)
            order by it.data desc nulls last)
          from public.interacao it where it.pessoa_id = p.id), '[]'::jsonb)
      ) else '{}'::jsonb end as x
      from public.pessoa p
      where p.visibilidade = 'rede'
    ) s
  ), '[]'::jsonb);
end;
$function$;

revoke all on function public.rede_diretorio() from public, anon;
grant execute on function public.rede_diretorio() to authenticated;
