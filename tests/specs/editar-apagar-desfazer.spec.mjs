import { test, expect, login, row, openPerson, nav } from "./fixtures.mjs";

test.beforeEach(async ({ page }) => { await login(page); });

test.describe("abrir, editar e salvar", () => {
  test("abre o painel com os dados da pessoa", async ({ page }) => {
    await openPerson(page, "T002");
    await expect(page.locator("#drawer h2")).toHaveText("Bruno Exemplo Costa");
    await expect(page.locator('#fPerfil [name="nome"]')).toHaveValue("Bruno Exemplo Costa");
    await expect(page.locator('#fPriv [name="hobbies"]')).toHaveValue("xadrez");
    await expect(page.locator('#fPriv [name="data_nascimento"]')).toHaveValue("2002-03-12");
    await expect(page.locator("#s-iniciativa")).toContainText("Liga Fictícia de Xadrez");
    await expect(page.locator("#dState")).toHaveText("Tudo salvo");
  });

  test("editar perfil e dados privados e salvar grava as duas partes", async ({ page, fake }) => {
    await openPerson(page, "T002");
    await page.fill('#fPerfil [name="nome"]', "Bruno Exemplo Costa Junior");
    await page.selectOption('#fPerfil [name="status"]', "Employed");
    await page.fill('#fPriv [name="hobbies"]', "xadrez, corrida");
    await page.fill('#fPriv [name="nivel_ambicao"]', "4");
    await expect(page.locator("#dState")).toHaveText("Alterações não salvas");
    await page.click("#dSave");
    await expect(page.locator("#toast")).toContainText("Salvo");
    await expect(page.locator("#dState")).toHaveText("Tudo salvo");
    expect(fake.person("T002")).toMatchObject({ nome: "Bruno Exemplo Costa Junior", status: "Employed" });
    expect(fake.T.pessoa_privado.find(x => x.pessoa_id === "T002")).toMatchObject({ hobbies: ["xadrez", "corrida"], nivel_ambicao: 4 });
    await expect(page.locator("#drawer h2")).toHaveText("Bruno Exemplo Costa Junior");
    await expect(row(page, "T002")).toContainText("Empregado(a)");
  });

  test("Enter em um campo salva", async ({ page, fake }) => {
    await openPerson(page, "T001");
    await page.fill('#fPerfil [name="destaques"]', "Novo destaque");
    await page.fill('#fPerfil [name="linkedin"]', "https://www.linkedin.com/in/ana-nova");
    await page.press('#fPerfil [name="linkedin"]', "Enter");
    await expect(page.locator("#toast")).toContainText("Salvo");
    expect(fake.person("T001")).toMatchObject({ destaques: "Novo destaque", linkedin: "https://www.linkedin.com/in/ana-nova" });
  });

  test("Salvar sem mudar nada só avisa", async ({ page, fake }) => {
    await openPerson(page, "T001");
    await page.click("#dSave");
    await expect(page.locator("#toast")).toHaveText("Nada para salvar");
    expect(fake.writes()).toHaveLength(0);
  });

  test("nome vazio não salva", async ({ page, fake }) => {
    await openPerson(page, "T001");
    await page.fill('#fPerfil [name="nome"]', "   ");
    await page.click("#dSave");
    await expect(page.locator("#toast")).toHaveText("O nome não pode ficar vazio.");
    expect(fake.person("T001").nome).toBe("Ana Teste Silva");
    await expect(page.locator("#dState")).toHaveText("Alterações não salvas");
  });

  test("LinkedIn que já existe em outra pessoa pede confirmação", async ({ page, fake }) => {
    await openPerson(page, "T002");
    await page.fill('#fPerfil [name="linkedin"]', "linkedin.com/in/ana-teste/");
    await page.click("#dSave");
    await expect(page.locator("#dlgTitle")).toHaveText("Esse LinkedIn/contato já existe");
    await expect(page.locator("#dlgBody")).toContainText("T001");
    await page.click("#dlgCancel");
    expect(fake.person("T002").linkedin).toBeNull();
    await page.click("#dSave");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toContainText("Salvo");
    expect(fake.person("T002").linkedin).toBe("linkedin.com/in/ana-teste/");
  });

  test("erro do banco mostra aviso e mantém o que foi digitado", async ({ page, fake }) => {
    await openPerson(page, "T004");
    await page.fill('#fPerfil [name="destaques"]', "Texto que não pode se perder");
    fake.failNext.push({ table: "pessoa", method: "PATCH", message: "falha simulada" });
    await page.click("#dSave");
    await expect(page.locator("#toast")).toContainText("Erro: falha simulada");
    await expect(page.locator("#dState")).toHaveText("Alterações não salvas");
    await expect(page.locator('#fPerfil [name="destaques"]')).toHaveValue("Texto que não pode se perder");
    expect(fake.person("T004").destaques).toBeNull();
    await page.click("#dSave"); // segunda tentativa dá certo
    await expect(page.locator("#toast")).toContainText("Salvo");
    expect(fake.person("T004").destaques).toBe("Texto que não pode se perder");
  });

  test("fechar com alterações pergunta; continuar editando mantém, descartar fecha sem gravar", async ({ page, fake }) => {
    await openPerson(page, "T003");
    await page.fill('#fPerfil [name="destaques"]', "rascunho");
    await page.click("#dCancel");
    await expect(page.locator("#dlgTitle")).toHaveText("Descartar alterações?");
    await page.click("#dlgCancel");
    await expect(page.locator("#drawer")).toBeVisible();
    await expect(page.locator('#fPerfil [name="destaques"]')).toHaveValue("rascunho");
    await page.keyboard.press("Escape"); // Esc no painel também pergunta
    await expect(page.locator("#dlg")).toBeVisible();
    await page.keyboard.press("Escape"); // Esc no diálogo = continuar editando
    await expect(page.locator("#dlg")).toBeHidden();
    await expect(page.locator("#drawer")).toBeVisible();
    await page.click("#scrim");
    await page.click("#dlgOk");
    await expect(page.locator("#drawer")).toBeHidden();
    expect(fake.person("T003").destaques).toBeNull();
    expect(fake.writes()).toHaveLength(0);
    await expect(row(page, "T003")).toBeFocused(); // o foco volta para a linha
  });

  test("fechar sem alterações fecha direto, com Esc também", async ({ page }) => {
    await openPerson(page, "T003");
    await page.keyboard.press("Escape");
    await expect(page.locator("#drawer")).toBeHidden();
    await openPerson(page, "T003");
    await page.click("#dClose");
    await expect(page.locator("#drawer")).toBeHidden();
  });

  test("abas do painel rolam até a seção", async ({ page }) => {
    await openPerson(page, "T003");
    await page.click('.dtabs button[data-go="s-interacao"]');
    await expect(page.locator("#s-interacao")).toBeInViewport();
    await expect(page.locator("#s-interacao .item")).toContainText("Conversa de teste → Marcar conversa");
  });
});

test.describe("nova pessoa", () => {
  test("cria com ID seguinte, abre o painel e grava", async ({ page, fake }) => {
    await page.click("#btnNew");
    await expect(page.locator("#dlgTitle")).toHaveText("Nova pessoa");
    await expect(page.locator("#dlgInput")).toBeFocused();
    await page.fill("#dlgInput", "Gabriela Nova Prado");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Criada T007");
    await expect(page.locator("#drawer h2")).toHaveText("Gabriela Nova Prado");
    expect(fake.person("T007")).toMatchObject({ nome: "Gabriela Nova Prado", visibilidade: "privada" });
    await page.click("#dClose");
    await expect(page.locator("#count")).toHaveText("7 de 7 pessoas");
  });

  test("nome vazio não fecha o diálogo; cancelar não cria; Esc cancela", async ({ page, fake }) => {
    await page.click("#btnNew");
    await page.click("#dlgOk");
    await expect(page.locator("#dlg")).toBeVisible();
    await expect(page.locator("#dlgInput")).toBeFocused();
    await page.click("#dlgCancel");
    await expect(page.locator("#dlg")).toBeHidden();
    await page.click("#btnNew");
    await page.fill("#dlgInput", "Alguém");
    await page.keyboard.press("Escape");
    await expect(page.locator("#dlg")).toBeHidden();
    expect(fake.writes()).toHaveLength(0);
  });

  test("Enter confirma e o Tab não escapa do diálogo", async ({ page, fake }) => {
    await page.click("#btnNew");
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press("Tab");
      expect(await page.evaluate(() => !!document.activeElement.closest("#dlgBox"))).toBe(true);
    }
    await page.fill("#dlgInput", "Henrique Teclado Pires");
    await page.press("#dlgInput", "Enter");
    await expect(page.locator("#toast")).toHaveText("Criada T007");
    expect(fake.person("T007").nome).toBe("Henrique Teclado Pires");
  });

  test("nome parecido avisa antes de criar", async ({ page, fake }) => {
    await page.click("#btnNew");
    await page.fill("#dlgInput", "ana teste silva");
    await page.click("#dlgOk");
    await expect(page.locator("#dlgTitle")).toHaveText("Já existe nome parecido");
    await expect(page.locator("#dlgBody")).toContainText("T001 · Ana Teste Silva");
    await page.click("#dlgCancel");
    expect(fake.person("T007")).toBeUndefined();
    await page.click("#btnNew");
    await page.fill("#dlgInput", "Ana Teste Silva");
    await page.click("#dlgOk");
    await page.click("#dlgOk"); // "Criar mesmo assim"
    await expect(page.locator("#toast")).toHaveText("Criada T007");
  });
});

test.describe("itens do perfil (formação, experiência, iniciativas, interações)", () => {
  test("adicionar e apagar uma formação", async ({ page, fake }) => {
    await openPerson(page, "T004");
    await page.click("#s-formacao summary");
    await page.fill('#s-formacao [name="universidade"]', "FGV");
    await page.fill('#s-formacao [name="curso"]', "Administração");
    await page.fill('#s-formacao [name="ano_formatura"]', "2026");
    await page.click("#s-formacao form button.primary");
    await expect(page.locator("#toast")).toHaveText("Adicionado");
    await expect(page.locator("#s-formacao")).toContainText("FGV");
    expect(fake.T.formacao.find(f => f.universidade === "FGV")).toMatchObject({ pessoa_id: "T004", curso: "Administração", ano_formatura: 2026, principal: false });

    await page.locator("#s-formacao .item", { hasText: "FGV" }).getByRole("button", { name: "Apagar" }).click();
    await expect(page.locator("#dlgTitle")).toHaveText("Apagar este item?");
    await page.click("#dlgCancel");
    expect(fake.T.formacao.some(f => f.universidade === "FGV")).toBe(true);
    await page.locator("#s-formacao .item", { hasText: "FGV" }).getByRole("button", { name: "Apagar" }).click();
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Apagado");
    await expect(page.locator("#s-formacao")).not.toContainText("FGV");
    expect(fake.T.formacao.some(f => f.universidade === "FGV")).toBe(false);
  });

  test("adicionar experiência, iniciativa e interação", async ({ page, fake }) => {
    await openPerson(page, "T005");
    await page.click("#s-experiencia summary");
    await page.fill('#s-experiencia [name="organizacao"]', "Empresa Nova Ltda");
    await page.fill('#s-experiencia [name="cargo"]', "Estagiária");
    await page.click("#s-experiencia form button.primary");
    await expect(page.locator("#s-experiencia")).toContainText("Empresa Nova Ltda");

    await page.click("#s-iniciativa summary");
    await page.fill('#s-iniciativa [name="titulo"]', "Projeto de teste");
    await page.fill('#s-iniciativa [name="descricao"]', "Descrição fictícia");
    await page.click("#s-iniciativa form button.primary");
    await expect(page.locator("#s-iniciativa")).toContainText("Projeto de teste");

    await page.click("#s-interacao summary");
    await page.fill('#s-interacao [name="canal"]', "LinkedIn");
    await page.fill('#s-interacao [name="resumo"]', "Primeiro contato");
    await page.selectOption('#s-interacao [name="proximo_passo"]', "Send message");
    await page.click("#s-interacao form button.primary");
    await expect(page.locator("#s-interacao .item")).toContainText("Primeiro contato → Enviar mensagem");

    expect(fake.T.experiencia.find(e => e.organizacao === "Empresa Nova Ltda")).toMatchObject({ pessoa_id: "T005", cargo: "Estagiária" });
    expect(fake.T.iniciativa.find(i => i.titulo === "Projeto de teste").pessoa_id).toBe("T005");
    expect(fake.T.interacao.find(i => i.resumo === "Primeiro contato")).toMatchObject({ canal: "LinkedIn", proximo_passo: "Send message" });
  });

  test("grafia usa a já existente (USP não vira outra) e adicionar com perfil sujo pede confirmação", async ({ page, fake }) => {
    await openPerson(page, "T006");
    await page.fill('#fPerfil [name="destaques"]', "texto não salvo");
    await page.click("#s-formacao summary");
    await page.fill('#s-formacao [name="universidade"]', "insper");
    await page.click("#s-formacao form button.primary");
    await expect(page.locator("#dlgTitle")).toHaveText("Há alterações não salvas");
    await page.click("#dlgCancel"); // cancelar: nada é adicionado e o texto continua
    expect(fake.T.formacao.filter(f => f.pessoa_id === "T006")).toHaveLength(1);
    await expect(page.locator('#fPerfil [name="destaques"]')).toHaveValue("texto não salvo");
    await page.click("#dSave");
    await expect(page.locator("#toast")).toContainText("Salvo");
    await page.click("#s-formacao summary");
    await page.fill('#s-formacao [name="universidade"]', "insper");
    await page.click("#s-formacao form button.primary");
    await expect(page.locator("#toast")).toHaveText("Adicionado");
    expect(fake.T.formacao.filter(f => f.pessoa_id === "T006").map(f => f.universidade)).toContain("Insper");
  });
});

test.describe("apagar pessoa", () => {
  test("o diálogo mostra o que some junto; cancelar mantém; confirmar apaga em cascata", async ({ page, fake }) => {
    await openPerson(page, "T003"); // 1 formação, 1 experiência, 1 interação
    await page.click("#dDelete");
    await expect(page.locator("#dlgTitle")).toHaveText("Apagar Carla Modelo Souza?");
    await expect(page.locator("#dlgBody")).toContainText("1 formação");
    await expect(page.locator("#dlgBody")).toContainText("1 experiência");
    await expect(page.locator("#dlgBody")).toContainText("1 interação");
    await expect(page.locator("#dlgCancel")).toBeFocused(); // ação perigosa: foco no Cancelar
    await page.click("#dlgCancel");
    expect(fake.person("T003")).toBeDefined();
    await page.click("#dDelete");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Pessoa apagada");
    await expect(page.locator("#drawer")).toBeHidden();
    await expect(page.locator("#count")).toHaveText("5 de 5 pessoas");
    expect(fake.person("T003")).toBeUndefined();
    for (const t of ["formacao", "experiencia", "interacao", "pessoa_privado"]) expect(fake.T[t].some(x => x.pessoa_id === "T003")).toBe(false);
  });
});

test.describe("histórico e desfazer", () => {
  test("lista as alterações, filtra e desfaz uma edição", async ({ page, fake }) => {
    await openPerson(page, "T001");
    await page.fill('#fPerfil [name="nome"]', "Ana Teste Silva Souza");
    await page.click("#dSave");
    await expect(page.locator("#toast")).toContainText("Salvo");
    await page.click("#dClose");

    await nav(page, "history");
    await expect(page.locator("#pageTitle")).toHaveText("Histórico");
    await expect(page.locator("#hbody tr")).toHaveCount(1);
    await expect(page.locator("#hbody")).toContainText("alterou");
    await expect(page.locator("#hbody")).toContainText("Ana Teste Silva → Ana Teste Silva Souza");
    await page.fill("#hq", "zzz");
    await expect(page.locator("#hcount")).toHaveText("0 de 1 alterações");
    await page.fill("#hq", "silva souza");
    await expect(page.locator("#hbody tr")).toHaveCount(1);

    await page.click("button[data-undo]");
    await expect(page.locator("#dlgTitle")).toHaveText("Desfazer esta alteração?");
    await page.click("#dlgCancel");
    expect(fake.person("T001").nome).toBe("Ana Teste Silva Souza");
    await page.click("button[data-undo]");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Alteração desfeita");
    expect(fake.person("T001").nome).toBe("Ana Teste Silva");
    await expect(page.locator("#hbody tr")).toHaveCount(2); // o próprio desfazer fica registrado
  });

  test("desfazer a criação apaga a pessoa; desfazer a exclusão recria só a linha da pessoa", async ({ page, fake }) => {
    await page.click("#btnNew");
    await page.fill("#dlgInput", "Igor Provisório Dias");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Criada T007");
    await page.click("#dClose");
    await nav(page, "history");
    await expect(page.locator("#hbody tr").first()).toContainText("criou");
    await page.locator("#hbody tr").first().locator("button[data-undo]").click();
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Alteração desfeita");
    expect(fake.person("T007")).toBeUndefined();

    await nav(page, "people");
    await openPerson(page, "T006");
    await page.click("#dDelete");
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Pessoa apagada");
    await nav(page, "history");
    const del = page.locator("#hbody tr", { hasText: "apagou" }).filter({ hasText: "Perfil" }).filter({ hasText: "Fabio" });
    await expect(del).toHaveCount(1);
    await del.locator("button[data-undo]").click();
    await page.click("#dlgOk");
    await expect(page.locator("#toast")).toHaveText("Alteração desfeita");
    expect(fake.person("T006")).toMatchObject({ nome: "Fabio Teste Nunes" });
    expect(fake.T.formacao.some(f => f.pessoa_id === "T006")).toBe(false); // filhos só voltam desfazendo um a um
  });
});
