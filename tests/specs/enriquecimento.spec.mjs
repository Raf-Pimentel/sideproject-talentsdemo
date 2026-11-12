import { test, expect, login, nav } from "./fixtures.mjs";

test.beforeEach(async ({ page }) => { await login(page); });

async function pedir(page) {
  await nav(page, "enrich");
  await expect(page.locator("#pageTitle")).toHaveText("Enriquecer");
  await expect(page.locator("#enList")).toContainText("Nenhuma proposta pendente");
  await page.fill("#enPessoa", "T006");
  await page.click("#enGo");
  await expect(page.locator("#enList .prop")).toHaveCount(4);
}

test.describe("Enriquecer com IA (propostas pendentes)", () => {
  test("pedir sugestões só cria propostas pendentes: nada muda no perfil", async ({ page, fake }) => {
    const antes = JSON.stringify([fake.T.pessoa, fake.T.formacao, fake.T.iniciativa]);
    await pedir(page);
    await expect(page.locator("#enStatus")).toContainText("4 proposta(s) nova(s)");
    await expect(page.locator("#enStatus")).toContainText("Aviso de enriquecimento");
    expect(fake.functionCalls.at(-1)).toEqual({ name: "enriquecer-ia", body: { pessoa_id: "T006", contexto: "" } });
    expect(JSON.stringify([fake.T.pessoa, fake.T.formacao, fake.T.iniciativa])).toBe(antes);
    await expect(page.locator("#enList .prop").last()).toContainText("https://exemplo.test/fabio");
    await expect(page.locator("#enList .prop .warn")).toHaveCount(1);
  });

  test("pessoa que não existe na base não chama a função", async ({ page, fake }) => {
    await nav(page, "enrich");
    await page.fill("#enPessoa", "Fulano Inexistente");
    await page.click("#enGo");
    await expect(page.locator("#enStatus")).toContainText("Escolha uma pessoa");
    expect(fake.functionCalls.filter(c => c.name === "enriquecer-ia")).toHaveLength(0);
  });

  test("aprovar preencher grava com fonte; o dono pode editar o valor antes", async ({ page, fake }) => {
    await pedir(page);
    const card = page.locator(".prop", { hasText: "Ano de formatura" });
    await card.locator('[data-k="ano_formatura"]').fill("2027");
    await card.locator("[data-ap]").click();
    await expect(page.locator("#toast")).toContainText("Aprovada e gravada");
    const f = fake.T.formacao.find(x => x.id === 6);
    expect(f.ano_formatura).toBe(2027);
    expect(f.fonte).toMatch(/^IA: https:\/\/exemplo\.test\/unicamp, aprovada \d{4}-\d{2}-\d{2}$/);
    const pr = fake.T.proposta_enriquecimento.find(x => x.alvo === "formacao");
    expect(pr).toMatchObject({ status: "aprovada", dados: { ano_formatura: 2027 } });
    expect(pr.decidido_em).toBeTruthy();
    await expect(page.locator("#enList .prop")).toHaveCount(3);
  });

  test("adicionar cria a linha com fonte e sem mexer no que existe", async ({ page, fake }) => {
    await pedir(page);
    await page.locator(".prop:has([data-k=\"titulo\"])").locator("[data-ap]").click();
    await expect(page.locator("#toast")).toContainText("Aprovada e gravada");
    const ini = fake.T.iniciativa.find(x => x.pessoa_id === "T006");
    expect(ini).toMatchObject({ titulo: "Projeto Inventado", fonte: expect.stringContaining("texto colado pelo dono") });
  });

  test("corrigir campo preenchido exige confirmação e cancelar não grava", async ({ page, fake }) => {
    await pedir(page);
    const card = page.locator(".prop", { hasText: "Corrigir" });
    await expect(card).toContainText("Hoje: Cursando");
    await card.locator("[data-ap]").click();
    await expect(page.locator("#dlg")).toBeVisible();
    await expect(page.locator("#dlgBody")).toContainText("Cursando → Mestrado");
    await page.click("#dlgCancel");
    expect(fake.person("T006").nivel).toBe("Not graduated");
    expect(fake.T.proposta_enriquecimento.find(x => x.acao === "corrigir").status).toBe("pendente");
    await card.locator("[data-ap]").click();
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toContainText("Aprovada e gravada");
    expect(fake.person("T006").nivel).toBe("Master's");
  });

  test("nunca sobrescreve: preencher falha se o campo foi preenchido depois", async ({ page, fake }) => {
    await pedir(page);
    fake.person("T006").linkedin = "https://www.linkedin.com/in/ja-preenchido";
    await page.locator(".prop", { hasText: "LinkedIn" }).locator("[data-ap]").click();
    await expect(page.locator(".prop", { hasText: "LinkedIn" })).toContainText("já foi preenchido");
    expect(fake.person("T006").linkedin).toBe("https://www.linkedin.com/in/ja-preenchido");
    expect(fake.T.proposta_enriquecimento.find(x => x.dados.linkedin).status).toBe("pendente");
  });

  test("corrigir falha se o campo mudou depois da proposta", async ({ page, fake }) => {
    await pedir(page);
    fake.person("T006").nivel = "Graduated";
    await page.locator(".prop", { hasText: "Corrigir" }).locator("[data-ap]").click();
    await expect(page.locator(".prop", { hasText: "Corrigir" })).toContainText("mudou desde a proposta");
    expect(fake.person("T006").nivel).toBe("Graduated");
  });

  test("valor inválido editado é recusado", async ({ page, fake }) => {
    await pedir(page);
    const card = page.locator(".prop", { hasText: "Ano de formatura" });
    await card.locator('[data-k="ano_formatura"]').fill("1800");
    await card.locator("[data-ap]").click();
    await expect(card).toContainText("entre 1950 e 2100");
    expect(fake.T.formacao.find(x => x.id === 6).ano_formatura).toBeNull();
  });

  test("rejeitar marca a proposta e não grava nada; aparece em 'mostrar também'", async ({ page, fake }) => {
    await pedir(page);
    const antes = JSON.stringify(fake.T.pessoa);
    await page.locator(".prop", { hasText: "LinkedIn" }).locator("[data-rj]").click();
    await expect(page.locator("#toast")).toContainText("rejeitada");
    await expect(page.locator("#enList .prop")).toHaveCount(3);
    expect(JSON.stringify(fake.T.pessoa)).toBe(antes);
    await page.check("#enDone");
    await expect(page.locator("#enList .prop")).toHaveCount(4);
    await expect(page.locator(".prop.done")).toContainText("rejeitada");
    await expect(page.locator(".prop.done [data-ap]")).toHaveCount(0);
  });
});
