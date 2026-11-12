# Plano: pré-filtro de candidatos da `conectar-ia`

Status: planejado, não construído. Hoje a função manda todos os perfis (75) e recusa acima de `MAX_PERFIS = 400`. Construir antes de a base passar de 250 pessoas (cerca de 8.600 tokens de entrada para 74 perfis, ou seja, ~115 tokens por perfil; 250 perfis ≈ 29 mil tokens por busca).

## Objetivo

Mandar à IA só cerca de 150 candidatos em vez da base toda, sem perder os melhores. Sem nomes e sem dados privados novos: valem as mesmas regras do `docs/PRIVACIDADE.md` (regra 9).

## Desenho

1. Nova função SQL `candidatos_para_match(p_alvo text, p_texto text, p_somente_rede boolean default false, p_limite int default 150)`, SECURITY DEFINER, `search_path = ''`, execute só para `authenticated`, revogada de `anon` e `public`. Reaproveita as regras de acesso de `perfis_para_match()` (admin vê tudo, membro só `rede`, `basico` x `completo`). Não duplicar a regra: chamar `perfis_para_match()` por dentro e filtrar o resultado.
2. Pontuação por candidato (soma, tudo no banco):
   - busca de texto (`to_tsvector('portuguese', destaques || resumo || cursos || organizações || iniciativas)` contra o texto da busca e o objetivo);
   - sobreposição com a pessoa-alvo: mesma universidade, mesma empresa, mesmo curso (peso maior para empresa e iniciativa);
   - **cota de diversidade**: 30% das vagas reservadas a quem tem pouca sobreposição (para a relação "complementar" não ser cortada pelo filtro).
3. Ordenar por pontuação, pegar `p_limite`, devolver na ordem estável de id (mantém o bloco de prompt cacheável dentro da mesma busca).
4. Edge Function: trocar a chamada a `perfis_para_match` por `candidatos_para_match` quando o total passar de `PRE_FILTRO_A_PARTIR_DE` (200); abaixo disso manda a base inteira, como hoje. Remover a recusa de 413 e manter um teto duro (`MAX_PERFIS` = 300 candidatos).
5. Índice GIN só se a base passar de alguns milhares; com 250 pessoas um scan sequencial basta.

## Testes antes de ligar

- Com os 75 perfis atuais, comparar as 8 sugestões da base inteira com as da base filtrada em 5 alvos diferentes; aceitar se pelo menos 6 de 8 coincidem.
- Teste como membro `basico` e `completo`: nenhum campo que o nível não permite aparece, e `privada` nunca aparece para membro.
- Rodar o advisor de segurança; o aviso de SECURITY DEFINER é esperado.
- Migration em `supabase/pre_filtro_match.sql` e espelho em `schema.sql`.

## Fora do escopo

Embeddings (envia texto a outro serviço; fere a regra 9) e qualquer filtro feito no navegador.
