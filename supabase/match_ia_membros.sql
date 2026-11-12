-- ATENCAO: a definicao de perfis_para_match() abaixo esta SUPERADA (match_ia_escopo_rede.sql e depois nota_somente_admin.sql).
-- Nao rode de novo; vale a definicao em nota_somente_admin.sql. pode_usar_match() abaixo continua valida.
-- Fase 6 de "Sugerir conexoes": liberar para membros da rede. Migration name: match_ia_membros.
-- 1) perfis_para_match() passa a devolver 'nome' e 'linkedin' (campos ja publicos no diretorio). A Edge Function NUNCA os envia
--    para a IA (a funcao linha() escolhe os campos); ela so monta um mapa id -> nome/linkedin para devolver junto de cada sugestao.
-- 2) pode_usar_match(): boolean para a pagina da rede decidir se mostra o botao, sem gastar uma busca do limite diario.
--    admin = true; membro = membro.pode_match; qualquer outro = false. Execute so para authenticated.

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
          'nome', p.nome,
          'linkedin', p.linkedin,
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

create or replace function public.pode_usar_match()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (select 1 from public.admin a where a.user_id = (select auth.uid()))
      or exists (select 1 from public.membro m where m.user_id = (select auth.uid()) and m.pode_match);
$function$;

revoke all on function public.pode_usar_match() from public, anon;
grant execute on function public.pode_usar_match() to authenticated;
