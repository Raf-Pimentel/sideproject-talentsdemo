# Testes da interface (painel `app/`)

Roteiro automatizado com Playwright. **Não usa o banco real**: o navegador abre o `app/` de verdade, mas toda chamada ao
Supabase é atendida por um banco falso em memória (`specs/fake-supabase.mjs`) com pessoas fictícias. Qualquer outro host
externo é bloqueado e vira falha. Também falha qualquer erro de console, inclusive violação da Content-Security-Policy
(o servidor de teste aplica os mesmos cabeçalhos do `app/vercel.json`).

## Como rodar

```bash
cd tests
npm install
npx playwright install chromium   # só na primeira vez
npm test
```

`npm run test:ui` abre o modo visual. Em caso de falha, o relatório guarda captura de tela e trace em `test-results/`.

## O que cobre

- `login-lista.spec.mjs`: login (senha errada, Enter, sessão ao recarregar, sair, saída por inatividade), lista, busca, filtros, ordenação, abas (aniversários, dados faltando, números, rede/globo) e backup.
- `editar-apagar-desfazer.spec.mjs`: abrir, editar, salvar, erro do banco, fechar com alterações, nova pessoa, itens do perfil, apagar pessoa em cascata, histórico e desfazer.
- `enriquecimento.spec.mjs`: aba "Enriquecer": a função só cria propostas pendentes; aprovar (preencher, adicionar, corrigir com confirmação) grava com a fonte, nunca sobrescreve campo preenchido depois da proposta, editar antes de aprovar, rejeitar.
- `menus-dialogos-ia.spec.mjs`: menus, "Padronizar nomes", "Adicionar com IA" e "Sugerir conexões" (as Edge Functions são simuladas), lembrete de backup.

## Regras

- Dados só fictícios; a senha de `fake-supabase.mjs` existe só ali.
- Nunca apontar os testes para o projeto real do Supabase.
- Se o painel usar uma tabela ou coluna nova, ensine o banco falso (`seed()` e `rest()`) e acrescente um teste.
- O script do Supabase vem de uma cópia local em `.cache/` (baixada na primeira execução); o hash SRI do `index.html` continua sendo conferido.
- Não cobre `rede/` nem as regras de acesso do banco (RLS): isso só se testa com contas reais de teste.
