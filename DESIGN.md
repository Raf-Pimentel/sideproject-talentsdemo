# Design do Talents (direção "Calmo")

Vale para o painel (`app/`) e o diretório (`rede/`). Interface de trabalho: calma, legível, rápida. O globo de cidades e o grafo da rede são partes fixas do produto e nunca saem.

## Restrições
- Sem build, sem bibliotecas novas, sem CDN novo, sem fontes externas (a CSP bloqueia). Fonte do corpo: pilha do sistema. Títulos: serifa do sistema (`--font-title`: Iowan Old Style, Palatino, Georgia).
- Texto de usuário sempre com `esc()`. Sem segredos no front. `app/` e `rede/` seguem como deploys separados; `rede/style.css` repete os tokens do painel e precisa ficar alinhado.
- Mudança visual não altera dados: os valores gravados continuam em inglês, e a tela os traduz pelos mapas `PT`.

## Tokens (em `:root`, claro e escuro)
- Espaço: `--s-1` 4, `--s-2` 8, `--s-3` 12, `--s-4` 16, `--s-5` 24, `--s-6` 32, `--s-7` 48, `--s-8` 64. Nenhum outro valor para margin, gap ou padding.
- Raios: `--r-ctl` 8 (controles), `--r-card` 12 (cartões, painéis, diálogos), `--r-pill` (tags).
- Cores: `--bg`, `--panel`, `--text`, `--muted`, `--line`, `--line-strong`, `--accent` (teal), `--accent-text`, `--danger`, `--ok`, `--warn`, `--chip`, `--hover`, mais as sete cores de categoria `--c0` a `--c6` (usadas também por `viz.js`).
- Movimento: `--m-fast` 120ms, `--m-base` 200ms, `--ease`. `prefers-reduced-motion` desliga tudo.

## Regras
1. Texto nunca abaixo de 13px (exceção: números dentro de SVG de gráficos). `--muted` só para rótulos, datas e meta.
2. Um botão primário por tela. Secundário tem borda; terciário é texto. Ações destrutivas em vermelho, longe do primário.
3. Estado nunca só por cor: sempre texto ou forma junto.
4. Todo estado existe: vazio (diz o que fazer), carregando, erro, foco visível, desabilitado.
5. Nada de `confirm()`, `prompt()` ou `alert()`: use `ask()`.
6. Sem sombra em repouso; sombra só em menu, painel e diálogo.
7. Teste em 390, 768, 1024 e 1440 de largura, claro e escuro, e com teclado.

## Componentes
- Cabeçalho: marca em serifa, abas por tarefa, "+ Nova pessoa" (com menu ▾ de IA) e menu do avatar (nomes, backup, sair).
- Página: título em serifa e uma linha de subtítulo (`#pageTitle`, `#pageSub`).
- Tabela: linhas de 52px, cabeçalho ordenável por teclado (`aria-sort`), linha abre com Enter ou clique.
- Painel lateral: fundo escurecido, abas de seção, rodapé fixo (Excluir pessoa à esquerda; Fechar e Salvar à direita), aviso "Alterações não salvas".
- Globo e grafo (`viz.js`): texto de canvas sempre 13px ou mais; controles usam `.vizbar`/`.chk`, tooltip usa `.viztip`; cada um tem alternativa sem mouse (globo: lista lateral de botões; grafo: `<details class="vizlist">` com grupos e pessoas). Canvas leva `role="img"` e `aria-label`.
- Diálogo `ask({ title, body, ok, cancel, danger, input })`: devolve true/false, ou o texto digitado quando há `input`.
