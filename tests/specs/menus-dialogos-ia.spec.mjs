import { test, expect, login, row, EMAIL } from "./fixtures.mjs";

test.beforeEach(async ({ page }) => { await login(page); });

test.describe("menus do cabeçalho", () => {
  test("menu ▾ abre, marca aria-expanded e fecha com Esc devolvendo o foco", async ({ page }) => {
    await page.click("#btnAiMenu");
    await expect(page.locator("#aiMenu")).toBeVisible();
    await expect(page.locator("#btnAiMenu")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#btnAI")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#aiMenu")).toBeHidden();
    await expect(page.locator("#btnAiMenu")).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#btnAccount")).toBeFocused();
  });

  test("clicar fora fecha; abrir um fecha o outro", async ({ page }) => {
    await page.click("#btnAiMenu");
    await page.click("#pageTitle");
    await expect(page.locator("#aiMenu")).toBeHidden();
    await page.click("#btnAiMenu");
    await page.click("#btnAccount");
    await expect(page.locator("#aiMenu")).toBeHidden();
    await expect(page.locator("#accountMenu")).toBeVisible();
    await expect(page.locator("#userRole")).toHaveText("Administrador");
    await expect(page.locator("#userAvatar")).toHaveText("t");
    await expect(page.locator("#userEmail")).toHaveText(EMAIL);
    await page.click("#btnAccount"); // clicar de novo fecha
    await expect(page.locator("#accountMenu")).toBeHidden();
  });

  test("a navegação marca a seção atual", async ({ page }) => {
    await expect(page.locator('nav button[data-view="people"]')).toHaveAttribute("aria-current", "page");
    await page.click('nav button[data-view="stats"]');
    await expect(page.locator('nav button[data-view="stats"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator('nav button[data-view="people"]')).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("Padronizar nomes", () => {
  test("cria regra, mostra registros pendentes, aplica no banco e remove a regra", async ({ page, fake }) => {
    await page.click("#btnAccount");
    await page.click("#btnAlias");
    await expect(page.locator("#alias")).toBeVisible();
    await expect(page.locator("#aliasBox")).toContainText("Nenhuma regra ainda");

    await page.selectOption('#aliasForm [name="tipo"]', "universidade");
    await page.fill('#aliasForm [name="alias"]', "Universidade de São Paulo");
    await page.fill('#aliasForm [name="canonico"]', "USP");
    await page.click("#aliasForm button.primary");
    await expect(page.locator("#toast")).toHaveText("Regra adicionada");
    await expect(page.locator("#aliasBox")).toContainText("Universidade de São Paulo → USP");
    await expect(page.locator("#aliasBox .banner")).toContainText("1 registro(s) ainda gravados com a grafia antiga");
    expect(fake.T.formacao.find(f => f.id === 1).universidade).toBe("Universidade de São Paulo"); // ainda não mexeu no banco

    await page.click("#aliasApply");
    await expect(page.locator("#dlgTitle")).toHaveText("Atualizar 1 registro(s) no banco?");
    await page.click("#dlgCancel");
    expect(fake.T.formacao.find(f => f.id === 1).universidade).toBe("Universidade de São Paulo");
    await page.click("#aliasApply");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("1 registro(s) atualizado(s)");
    expect(fake.T.formacao.find(f => f.id === 1).universidade).toBe("USP");
    await expect(page.locator("#aliasBox .banner")).toHaveCount(0);

    await page.click("button[data-adel]");
    await expect(page.locator("#toast")).toHaveText("Regra removida");
    expect(fake.T.alias_nome).toHaveLength(0);
  });

  test("regra com grafia igual ao nome oficial é recusada; Esc e clique no fundo fecham", async ({ page, fake }) => {
    await page.click("#btnAccount");
    await page.click("#btnAlias");
    await page.fill('#aliasForm [name="alias"]', "insper");
    await page.fill('#aliasForm [name="canonico"]', "Insper");
    await page.click("#aliasForm button.primary");
    await expect(page.locator("#toast")).toHaveText("A grafia e o nome oficial são iguais.");
    expect(fake.writes()).toHaveLength(0);
    await page.keyboard.press("Escape");
    await expect(page.locator("#alias")).toBeHidden();
    await page.click("#btnAccount");
    await page.click("#btnAlias");
    await page.mouse.click(5, 5);
    await expect(page.locator("#alias")).toBeHidden();
  });
});

test.describe("Adicionar com IA", () => {
  test("a IA só propõe; nada é gravado até confirmar; só o texto vai para a função", async ({ page, fake }) => {
    await page.click("#btnAiMenu");
    await page.click("#btnAI");
    await expect(page.locator("#ai")).toBeVisible();
    await expect(page.locator("#aiText")).toBeFocused();
    await page.click("#aiGo"); // texto vazio: nada acontece
    expect(fake.functionCalls).toHaveLength(0);

    await page.fill("#aiText", "Helena Proposta Alves, formada em economia no Insper, gosta de yoga.");
    await page.click("#aiGo");
    await expect(page.locator("#aiPreview")).toContainText("Nova pessoa T007");
    await expect(page.locator("#aiPreview")).toContainText("Helena Proposta Alves");
    await expect(page.locator("#aiPreview .warn")).toContainText("Aviso de teste");
    expect(fake.functionCalls).toHaveLength(1);
    expect(Object.keys(fake.functionCalls[0].body)).toEqual(["texto"]); // sem dados privados no pedido
    expect(fake.writes()).toHaveLength(0);

    await page.click("#aiDiscard");
    await expect(page.locator("#aiPreview")).toBeEmpty();
    expect(fake.person("T007")).toBeUndefined();

    await page.click("#aiGo");
    await page.click("#aiSave");
    await expect(page.locator("#toast")).toHaveText("T007 criada");
    await expect(page.locator("#ai")).toBeHidden();
    await expect(page.locator("#drawer h2")).toHaveText("Helena Proposta Alves");
    expect(fake.person("T007")).toMatchObject({ nome: "Helena Proposta Alves", nivel: "Graduated" });
    expect(fake.T.pessoa_privado.find(x => x.pessoa_id === "T007").hobbies).toEqual(["yoga"]);
    expect(fake.T.formacao.find(f => f.pessoa_id === "T007")).toMatchObject({ universidade: "Insper", principal: true });
  });

  test("proposta que atualiza uma pessoa nunca troca o nome e junta hobbies", async ({ page, fake }) => {
    fake.functions["cadastro-ia"] = () => ({ proposta: { acao: "atualizar", pessoa_id: "T002", pessoa: { nome: "Outro Nome Ignorado", status: "Employed" }, privado: { hobbies: ["corrida"] }, formacao: [{ universidade: "Insper" }], avisos: [] } });
    await page.click("#btnAiMenu");
    await page.click("#btnAI");
    await page.fill("#aiText", "atualizar o Bruno");
    await page.press("#aiText", "Control+Enter");
    await expect(page.locator("#aiPreview")).toContainText("Atualizar T002");
    await page.click("#aiSave");
    await expect(page.locator("#toast")).toHaveText("T002 atualizada");
    expect(fake.person("T002")).toMatchObject({ nome: "Bruno Exemplo Costa", status: "Employed" });
    expect(fake.T.pessoa_privado.find(x => x.pessoa_id === "T002").hobbies).toEqual(["xadrez", "corrida"]);
    expect(fake.T.formacao.filter(f => f.pessoa_id === "T002")).toHaveLength(1); // a formação já existia
  });

  test("erro da função aparece no diálogo; Esc fecha e o texto fica guardado", async ({ page, fake }) => {
    fake.functions["cadastro-ia"] = () => ({ erro: "limite de uso atingido" });
    await page.click("#btnAiMenu");
    await page.click("#btnAI");
    await page.fill("#aiText", "texto de teste");
    await page.click("#aiGo");
    await expect(page.locator("#aiStatus")).toHaveText("Erro: limite de uso atingido");
    await page.keyboard.press("Escape");
    await expect(page.locator("#ai")).toBeHidden();
    await page.click("#btnAiMenu");
    await page.click("#btnAI");
    await expect(page.locator("#aiText")).toHaveValue("texto de teste");
    await page.click("#aiClose");
    await expect(page.locator("#ai")).toBeHidden();
    expect(fake.writes()).toHaveLength(0);
  });
});

test.describe("Sugerir conexões", () => {
  test("sugere a partir de uma pessoa da base e o clique abre o perfil sugerido", async ({ page, fake }) => {
    await page.click("#btnAiMenu");
    await page.click("#btnConn");
    await expect(page.locator("#conn")).toBeVisible();
    await expect(page.locator("#connPessoa")).toBeFocused();
    await page.click("#connGo");
    await expect(page.locator("#connStatus")).toHaveText("Escolha uma pessoa ou descreva-a.");
    await page.fill("#connPessoa", "T999");
    await page.click("#connGo");
    await expect(page.locator("#connStatus")).toContainText("Pessoa não encontrada na base");
    await page.fill("#connPessoa", "t002");
    await page.fill("#connObj", "co-founder");
    await page.click("#connGo");
    await expect(page.locator(".connItem")).toHaveCount(1);
    await expect(page.locator(".connItem")).toContainText("Carla Modelo Souza");
    await expect(page.locator(".connItem")).toContainText("complementar");
    await expect(page.locator("#connStatus")).toContainText("1 sugestão(ões) · 6 perfis analisados");
    expect(fake.functionCalls[0]).toEqual({ name: "conectar-ia", body: { pessoa_id: "T002", objetivo: "co-founder" } });
    expect(fake.writes()).toHaveLength(0);
    await page.click(".connItem");
    await expect(page.locator("#conn")).toBeHidden();
    await expect(page.locator("#drawer h2")).toHaveText("Carla Modelo Souza");
  });

  test("com descrição livre manda só descrição e objetivo; Esc fecha", async ({ page, fake }) => {
    await page.click("#btnAiMenu");
    await page.click("#btnConn");
    await page.fill("#connDesc", "Estudante de engenharia que quer montar um time técnico.");
    await page.fill("#connObj", "mentoria");
    await page.click("#connGo");
    await expect(page.locator(".connItem")).toHaveCount(1);
    expect(fake.functionCalls[0].body).toEqual({ descricao: "Estudante de engenharia que quer montar um time técnico.", objetivo: "mentoria" });
    await page.keyboard.press("Escape");
    await expect(page.locator("#conn")).toBeHidden();
  });
});

test.describe("lembrete de backup", () => {
  test("aparece quando nunca houve backup neste navegador e some depois de baixar", async ({ page }) => {
    await expect(page.locator("#backupWarn")).toContainText("Nenhum backup baixado neste navegador");
    await page.click("#btnAccount");
    await Promise.all([page.waitForEvent("download"), page.click("#btnBackup")]);
    await expect(page.locator("#backupWarn")).toBeHidden();
  });
});
