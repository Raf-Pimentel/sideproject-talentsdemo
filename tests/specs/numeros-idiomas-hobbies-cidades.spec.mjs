import { test, expect, login, nav, row } from "./fixtures.mjs";

const card = (page, title) => page.locator(".card").filter({ has: page.locator("b", { hasText: new RegExp(`^${title}$`) }) });

test.describe("números: idiomas, hobbies e cidades", () => {
  test.beforeEach(async ({ page }) => { await login(page); await nav(page, "stats"); });

  test("idiomas agrupam sem diferenciar caixa nem acentos", async ({ page }) => {
    const c = card(page, "Idiomas");
    await expect(c).toContainText("2 de 6 pessoas com idiomas preenchidos");
    await expect(c.locator("button.barbtn")).toHaveCount(3); // Inglês (2), Português, Espanhol
    await expect(c.locator("button.barbtn").first()).toContainText(/ingl[eê]s/i);
    await expect(c.locator("button.barbtn").first()).toContainText("2");
    await expect(card(page, "Idiomas por pessoa")).toBeVisible();
  });

  test("cidades usam a tabela CITY_DATA: sampa, 'Sao Paulo' e 'São Paulo' viram uma só", async ({ page }) => {
    const c = card(page, "Cidade atual");
    await expect(c.locator("button.barbtn").first()).toContainText("São Paulo");
    await expect(c.locator("button.barbtn").first()).toContainText("3");
    await expect(c.locator("button.barbtn")).toHaveCount(2);
    await expect(card(page, "Cidade de nascimento")).toContainText("1 de 2 com as duas cidades moram fora da cidade natal");
  });

  test("hobbies: mesma atividade em caixas diferentes conta junta", async ({ page }) => {
    const c = card(page, "Hobbies");
    await expect(c.locator("button.barbtn")).toHaveCount(2);
    await expect(c.locator("button.barbtn").first()).toContainText("2");
  });

  test("clicar numa barra filtra a lista de pessoas e o filtro pode ser removido", async ({ page, fake }) => {
    await card(page, "Cidade atual").locator("button.barbtn").first().click();
    await expect(page.locator("#pageTitle")).toHaveText("Pessoas");
    await expect(page.locator(".drillchip")).toContainText("Cidade atual = São Paulo");
    await expect(page.locator("tr.row")).toHaveCount(3);
    await expect(row(page, "T002")).toBeVisible();
    await expect(row(page, "T003")).toBeVisible();
    await expect(row(page, "T005")).toBeVisible();
    await page.click("#clearDrill");
    await expect(page.locator("tr.row")).toHaveCount(6);
    await expect(page.locator(".drillchip")).toHaveCount(0);
    expect(fake.writes()).toHaveLength(0);
  });

  test("filtro por idioma encontra quem escreveu 'ingles' sem acento", async ({ page }) => {
    await card(page, "Idiomas").locator("button.barbtn").first().click();
    await expect(page.locator("tr.row")).toHaveCount(2);
    await expect(row(page, "T001")).toBeVisible();
    await expect(row(page, "T003")).toBeVisible();
  });
});
