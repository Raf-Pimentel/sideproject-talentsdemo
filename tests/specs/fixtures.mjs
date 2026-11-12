import { test as base, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFake, EMAIL, PASSWORD } from "./fake-supabase.mjs";

const SUPABASE = "https://qcovgqjrznplhhwtmwht.supabase.co/**";
const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
const cache = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", ".cache", "supabase.min.js");

// O script do CDN é servido de uma cópia local (baixada uma vez). O hash SRI da página continua valendo:
// se a cópia não bater com o integrity do index.html, o navegador recusa o script e todos os testes falham.
async function supabaseScript() {
  if (!fs.existsSync(cache)) { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, Buffer.from(await (await fetch(CDN)).arrayBuffer())); }
  return fs.readFileSync(cache);
}

export const test = base.extend({
  fake: async ({}, use) => { await use(createFake()); },
  // "page" já vem com: backend falso, bloqueio de hosts externos e vigia de erros de console (inclui violações de CSP).
  page: async ({ page, context, fake }, use) => {
    const problems = [], script = await supabaseScript();
    page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) problems.push("console: " + m.text()); });
    page.on("pageerror", e => problems.push("pageerror: " + e.message));
    await context.route(u => !["127.0.0.1", "localhost"].includes(u.hostname), r => { problems.push("host externo bloqueado: " + r.request().url()); return r.abort(); });
    await context.route(CDN, r => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: script }));
    await context.route(SUPABASE, fake.handle);
    await use(page);
    expect(problems, "erros inesperados no navegador").toEqual([]);
  },
});

export { expect, EMAIL, PASSWORD };

export async function login(page) {
  await page.goto("/");
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("#btnLogin");
  await expect(page.locator("#app")).toBeVisible();
  await expect(page.locator("#count")).toContainText("pessoas");
}
export const row = (page, id) => page.locator(`tr.row[data-id="${id}"]`);
export async function openPerson(page, id) {
  await row(page, id).click();
  await expect(page.locator("#drawer")).toBeVisible();
}
export const nav = (page, view) => page.click(`nav button[data-view="${view}"]`);
