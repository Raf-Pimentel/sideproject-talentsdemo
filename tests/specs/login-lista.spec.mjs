import { test, expect, login, row, nav, EMAIL, PASSWORD } from "./fixtures.mjs";

test.describe("login e sessão", () => {
  test("senha errada mostra aviso e não entra", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#login")).toBeVisible();
    await page.fill("#email", EMAIL);
    await page.fill("#password", "senha-errada");
    await page.click("#btnLogin");
    await expect(page.locator("#loginMsg")).toHaveText("E-mail ou senha incorretos.");
    await expect(page.locator("#app")).toBeHidden();
  });

  test("senha certa entra (com Enter), mostra o usuário e mantém a sessão ao recarregar", async ({ page }) => {
    await page.goto("/");
    await page.fill("#email", EMAIL);
    await page.fill("#password", PASSWORD);
    await page.press("#password", "Enter");
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#count")).toHaveText("6 de 6 pessoas");
    await expect(page.locator("#password")).toHaveValue("");
    await page.reload();
    await expect(page.locator("#app")).toBeVisible();
    await expect(page.locator("#count")).toHaveText("6 de 6 pessoas");
  });

  test("Sair volta ao login e apaga os dados da tela", async ({ page }) => {
    await login(page);
    await page.click("#btnAccount");
    await expect(page.locator("#userEmail")).toHaveText(EMAIL);
    await page.click("#btnLogout");
    await expect(page.locator("#login")).toBeVisible();
    await expect(page.locator("#app")).toBeHidden();
    await page.reload();
    await expect(page.locator("#login")).toBeVisible();
  });

  test("sai sozinho depois de 30 minutos parado", async ({ page }) => {
    await page.clock.install();
    await login(page);
    await page.clock.fastForward("31:00");
    await expect(page.locator("#login")).toBeVisible();
  });
});

test.describe("lista de pessoas", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("mostra todas as pessoas, ordenadas por ID", async ({ page }) => {
    await expect(page.locator("tr.row")).toHaveCount(6);
    await expect(page.locator("tr.row").first()).toContainText("Ana Teste Silva");
    await expect(page.locator("tr.row").last()).toContainText("Fabio Teste Nunes");
    await expect(row(page, "T003")).toContainText("Mestrado");
    await expect(row(page, "T003")).toContainText("Na rede");
  });

  test("busca por nome, por empresa e sem resultado (com limpar filtros)", async ({ page }) => {
    await page.fill("#fq", "bruno");
    await expect(page.locator("tr.row")).toHaveCount(1);
    await expect(page.locator("#count")).toHaveText("1 de 6 pessoas");
    await page.fill("#fq", "startup inventada");
    await expect(page.locator("tr.row")).toHaveCount(1);
    await expect(row(page, "T003")).toBeVisible();
    await page.fill("#fq", "zzzz-nao-existe");
    await expect(page.locator(".empty")).toContainText("Nenhuma pessoa com esses filtros");
    await page.click("#clearFilters");
    await expect(page.locator("tr.row")).toHaveCount(6);
    await expect(page.locator("#fq")).toHaveValue("");
  });

  test("filtros de nível, universidade e nota combinam", async ({ page }) => {
    await page.selectOption("#fnivel", "Not graduated");
    await expect(page.locator("#count")).toHaveText("2 de 6 pessoas");
    await page.selectOption("#funi", "Insper");
    await expect(page.locator("tr.row")).toHaveCount(1);
    await expect(row(page, "T002")).toBeVisible();
    await page.selectOption("#fnivel", "");
    await expect(page.locator("tr.row")).toHaveCount(2); // T002 e T005 (Insper)
    await page.fill("#fnmin", "9.2");
    await expect(page.locator("tr.row")).toHaveCount(1);
    await page.fill("#fnmin", "");
    await page.fill("#fnmax", "9.1");
    await expect(row(page, "T005")).toBeVisible();
    await expect(row(page, "T002")).toBeHidden();
  });

  test("ordenar: clique no cabeçalho inverte; seletor e botão de direção funcionam", async ({ page }) => {
    await page.click('th[data-sort="nome"]');
    await expect(page.locator("tr.row").first()).toContainText("Ana");
    await page.click('th[data-sort="nome"]');
    await expect(page.locator("tr.row").first()).toContainText("Fabio");
  });

  test("no celular: seletor de ordenação e botão de direção", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.selectOption("#fsort", "nota");
    await expect(page.locator("tr.row").first()).toContainText("Diego"); // menor nota (7,2) primeiro
    await page.click("#fdir");
    await expect(page.locator("tr.row").first()).toContainText("Bruno"); // maior nota (9,5)
    // quem não tem nota (Ana e Fabio) vai sempre para o fim, nos dois sentidos
    await expect(page.locator("tr.row").nth(4)).toContainText("Ana");
    await expect(page.locator("tr.row").nth(5)).toContainText("Fabio");
  });

  test("linha abre com Enter (teclado)", async ({ page }) => {
    await row(page, "T004").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#drawer h2")).toHaveText("Diego Ficticio Lima");
  });
});

test.describe("abas e visões", () => {
  test.beforeEach(async ({ page }) => { await login(page); });

  test("aniversários lista quem tem data e baixa o .ics", async ({ page }) => {
    await nav(page, "birthdays");
    await expect(page.locator("#pageTitle")).toHaveText("Aniversários");
    await expect(page.locator("#view tbody tr")).toHaveCount(1);
    await expect(page.locator("#view tbody")).toContainText("Bruno Exemplo Costa");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnIcs")]);
    expect(dl.suggestedFilename()).toBe("aniversarios-talents.ics");
  });

  test("dados faltando lista lacunas e abre a pessoa", async ({ page }) => {
    await nav(page, "missing");
    await expect(page.locator("#pageTitle")).toHaveText("Dados faltando");
    await expect(page.locator("#view tbody tr").first()).toBeVisible();
    await page.locator("#view tbody tr.row").first().click();
    await expect(page.locator("#drawer")).toBeVisible();
  });

  test("números mostra os indicadores", async ({ page }) => {
    await nav(page, "stats");
    await expect(page.locator(".tile").first()).toContainText("6");
    await expect(page.locator(".tile").first()).toContainText("pessoas");
    await expect(page.locator(".card").filter({ has: page.locator("b", { hasText: /^Universidades$/ }) })).toContainText("Insper");
  });

  test("rede (grafo) desenha sem erro e o globo aparece na primeira página", async ({ page }) => {
    await expect(page.locator("#globeBox canvas").first()).toBeVisible();
    await nav(page, "graph");
    await expect(page.locator("#pageTitle")).toHaveText("Rede");
    await expect(page.locator("#view canvas").first()).toBeVisible();
    await nav(page, "people");
    await expect(page.locator("#globeBox canvas").first()).toBeVisible();
  });

  test("baixar backup gera um JSON com todas as pessoas", async ({ page, fake }) => {
    await page.click("#btnAccount");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnBackup")]);
    expect(dl.suggestedFilename()).toMatch(/^talents-backup-\d{4}-\d{2}-\d{2}\.json$/);
    const json = JSON.parse(await (await import("node:fs/promises")).readFile(await dl.path(), "utf8"));
    expect(json.pessoa).toHaveLength(6);
    expect(Object.keys(json)).toEqual(expect.arrayContaining(["pessoa_privado", "formacao", "experiencia", "iniciativa", "interacao", "historico", "alias_nome"]));
    await expect(page.locator("#toast")).toContainText("Backup baixado (6 pessoas)");
    await expect(page.locator("#backupWarn")).toBeHidden();
    expect(fake.writes()).toHaveLength(0);
  });
});

test.describe("grupos (clusterização)", () => {
  test("agrupa as pessoas por traços em comum e abre a ficha", async ({ page }) => {
    await login(page);
    await nav(page, "groups");
    await expect(page.locator("#pageTitle")).toHaveText("Grupos");
    // 6 pessoas fictícias: todas aparecem em algum grupo ou em "sem traços suficientes"
    await expect(page.locator(".cl-card .vl-p")).toHaveCount(6);
    await expect(page.locator(".cl-card").first()).toContainText(/pessoas?/);
    await page.locator(".cl-card .vl-p", { hasText: "Ana Teste Silva" }).click();
    await expect(page.locator("#drawer")).toBeVisible();
  });

  test("controles: número de grupos e pesos mudam o resultado; pessoa privada marcada", async ({ page }) => {
    await login(page);
    await nav(page, "groups");
    await page.locator("#clK").fill("2");
    await expect(page.locator("#clKv")).toHaveText("2");
    const n2 = await page.locator("section.cl-card[aria-label^=Grupo]").count();
    expect(n2).toBeLessThanOrEqual(2);
    await page.locator("#clK").fill("4");
    expect(await page.locator("section.cl-card[aria-label^=Grupo]").count()).toBeGreaterThanOrEqual(n2);
    await expect(page.locator(".cl-card .vl-p", { hasText: "Diego Ficticio Lima" })).toContainText("(privada)");
    // zerar todos os pesos: ninguém tem traço útil
    for (const k of ["uni","curso","org","perfil","atuacao","idioma","hobby","destaque"]) await page.locator(`input[data-w="${k}"]`).fill("0");
    await expect(page.locator("section.cl-card[aria-label^=Grupo]")).toHaveCount(0);
    await expect(page.locator(".cl-card").first()).toContainText("Sem traços suficientes");
    await page.click("#clReset");
    await expect(page.locator(".cl-card .vl-p")).toHaveCount(6);
  });
});
