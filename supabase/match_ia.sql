-- Feature "Sugerir conexoes" (match de pessoas com IA). Migration name: match_ia. Additive only.
-- 1) pessoa_privado.nivel_ambicao (1 to 5, assigned by the owner) and pessoa_privado.resumo (short text written by the owner for the AI).
-- 2) ia_uso gets a kind (tipo) and token counters, to cap and measure cost.
-- 3) membro.pode_match (default false): per-person release of the feature.
-- 4) perfis_para_match(): the only door the Edge Function "conectar-ia" uses to read profiles. It returns fields by access level:
--      admin      : everybody; public fields + status, availability, English, languages, hobbies, nota, ambicao, resumo
--      completo   : only visibilidade = 'rede'; same fields as admin
--      basico     : only visibilidade = 'rede'; public directory fields + nota
--    Never returned: name, LinkedIn, birth date, cities, age leaving home, indicado_por, notas, interactions.
--    It also enforces the daily limits (admin 30, member 10 per user; 200 global per day) and logs one ia_uso row per call.
-- 5) registrar_tokens_match(): lets the caller record token usage on its own row.

alter table public.pessoa_privado
  add column if not exists nivel_ambicao smallint check (nivel_ambicao between 1 and 5),
  add column if not exists resumo text check (resumo is null or length(resumo) <= 600);

alter table public.ia_uso
  add column if not exists tipo text not null default 'cadastro' check (tipo in ('cadastro','conectar')),
  add column if not exists tokens_in integer,
  add column if not exists tokens_out integer,
  add column if not exists tokens_cache integer;

alter table public.membro
  add column if not exists pode_match boolean not null default false;

create or replace function public.perfis_para_match()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  uid uuid := (select auth.uid());
  eh_admin boolean;
  m record;
  nivel text;
  limite int;
  uso_id bigint;
  ver_privado boolean;
begin
  if uid is null then
    raise exception 'sem permissao' using errcode = '42501';
  end if;

  eh_admin := exists (select 1 from public.admin a where a.user_id = uid);
  if eh_admin then
    nivel := 'admin'; limite := 30;
  else
    select * into m from public.membro where user_id = uid;
    if not found or not m.pode_match then
      raise exception 'sem permissao' using errcode = '42501';
    end if;
    nivel := case when m.acesso = 'completo' then 'completo' else 'basico' end;
    limite := 10;
  end if;
  ver_privado := nivel in ('admin', 'completo');

  if (select count(*) from public.ia_uso u
       where u.user_id = uid and u.tipo = 'conectar' and u.quando > now() - interval '1 day') >= limite then
    raise exception 'limite diario de sugestoes atingido' using errcode = '54000';
  end if;
  if (select count(*) from public.ia_uso u
       where u.tipo = 'conectar' and u.quando > now() - interval '1 day') >= 200 then
    raise exception 'limite global diario atingido' using errcode = '54000';
  end if;
  insert into public.ia_uso (user_id, tipo) values (uid, 'conectar') returning id into uso_id;

  return jsonb_build_object(
    'nivel', nivel,
    'uso_id', uso_id,
    'perfis', coalesce((
      select jsonb_agg(x order by x->>'id') from (
        select jsonb_build_object(
          'id', p.id,
          'nivel', p.nivel,
          'destaques', p.destaques,
          'nota', (select pp.nota_indicador from public.pessoa_privado pp where pp.pessoa_id = p.id),
          'formacao', coalesce((select jsonb_agg(jsonb_build_object(
              'universidade', f.universidade, 'curso', f.curso, 'ano_formatura', f.ano_formatura)
              order by f.principal desc, f.ano_formatura desc nulls last)
            from public.formacao f where f.pessoa_id = p.id), '[]'::jsonb),
          'experiencia', coalesce((select jsonb_agg(jsonb_build_object(
              'organizacao', e.organizacao, 'cargo', e.cargo, 'tipo', e.tipo, 'inicio', e.inicio, 'fim', e.fim)
              order by e.fim desc nulls first, e.inicio desc nulls last)
            from public.experiencia e where e.pessoa_id = p.id), '[]'::jsonb),
          'iniciativa', coalesce((select jsonb_agg(jsonb_build_object(
              'titulo', i.titulo, 'descricao', i.descricao, 'tipo', i.tipo)
              order by i.data desc nulls last)
            from public.iniciativa i where i.pessoa_id = p.id), '[]'::jsonb)
        ) || case when ver_privado then jsonb_build_object(
          'status', p.status,
          'disponibilidade', p.disponibilidade,
          'ingles_fluente', p.ingles_fluente,
          'idiomas', to_jsonb(p.idiomas),
          'hobbies', (select to_jsonb(pp.hobbies) from public.pessoa_privado pp where pp.pessoa_id = p.id),
          'ambicao', (select pp.nivel_ambicao from public.pessoa_privado pp where pp.pessoa_id = p.id),
          'resumo', (select pp.resumo from public.pessoa_privado pp where pp.pessoa_id = p.id)
        ) else '{}'::jsonb end as x
        from public.pessoa p
        where eh_admin or p.visibilidade = 'rede'
      ) s
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.perfis_para_match() from public, anon;
grant execute on function public.perfis_para_match() to authenticated;

create or replace function public.registrar_tokens_match(p_uso_id bigint, p_in integer, p_out integer, p_cache integer)
returns void
language sql
security definer
set search_path = ''
as $function$
  update public.ia_uso
     set tokens_in = least(greatest(coalesce(p_in, 0), 0), 10000000),
         tokens_out = least(greatest(coalesce(p_out, 0), 0), 10000000),
         tokens_cache = least(greatest(coalesce(p_cache, 0), 0), 10000000)
   where id = p_uso_id and user_id = (select auth.uid()) and tipo = 'conectar' and tokens_in is null;
$function$;

revoke all on function public.registrar_tokens_match(bigint, integer, integer, integer) from public, anon;
grant execute on function public.registrar_tokens_match(bigint, integer, integer, integer) to authenticated;
