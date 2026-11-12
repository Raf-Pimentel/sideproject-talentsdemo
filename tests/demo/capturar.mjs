// Gera as imagens e os GIFs do README com o painel real (app/) rodando contra o banco FALSO.
// Os dados abaixo são inventados (nomes, escolas e empresas fictícios). Nada aqui toca o Supabase real.
//
// Uso:  cd tests && node demo/capturar.mjs <pasta de saída>
// Requer: Chromium do Playwright (npm run install:browser) e Python com Pillow (só para o GIF: pip install pillow).
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createFake, EMAIL, PASSWORD } from "../specs/fake-supabase.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(process.argv[2] || path.join(here, "saida"));
fs.mkdirSync(out, { recursive: true });
const tmp = path.join(out, "_quadros");
fs.rmSync(tmp, { recursive: true, force: true }); fs.mkdirSync(tmp, { recursive: true });

const SUPABASE = "https://qcovgqjrznplhhwtmwht.supabase.co/**";
const CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js";
const cache = path.resolve(here, "..", ".cache", "supabase.min.js");
if (!fs.existsSync(cache)) { fs.mkdirSync(path.dirname(cache), { recursive: true }); fs.writeFileSync(cache, Buffer.from(await (await fetch(CDN)).arrayBuffer())); }

// ---- dados fictícios (gerador determinístico) ----
let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
const pick = a => a[Math.floor(rnd() * a.length)];
const NOMES = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fabio", "Gabi", "Heitor", "Iris", "Joana", "Kleber", "Lia", "Marcos", "Nina", "Otavio", "Paula", "Rui", "Sara", "Tiago", "Vera"];
const SOBRE = ["Exemplo", "Modelo", "Ficticio", "Demo", "Amostra", "Teste", "Inventado", "Padrao"];
const UNIS = [["USP", "Engenharia"], ["USP", "Computação"], ["UNICAMP", "Computação"], ["UNICAMP", "Engenharia"], ["Insper", "Economia"], ["Insper", "Administração"], ["UFMG", "Ciência da Computação"], ["UFRJ", "Engenharia"], ["FGV", "Administração"], ["PUC-Rio", "Direito"]];
const ORGS = ["Startup Alfa", "Banco Beta", "Consultoria Gama", "Fundo Delta", "Empresa Épsilon", "Lab Zeta", "Liga Acadêmica Eta"];
const CIDADES = ["São Paulo", "Rio de Janeiro", "Belo Horizonte", "Campinas", "Brasília", "Recife", "Porto Alegre", "Curitiba"];
const HOBBIES = ["xadrez", "corrida", "leitura", "violão", "futebol", "fotografia", "culinária", "trilha"];
const NIVEIS = ["Not graduated", "Recent graduate", "Graduated", "Master's", "Dropout"];
const STATUS = ["Employed", "Employed + Founder", "Founder", "Unemployed", "Exchange program"];

function popular(fake) {
  const T = fake.T, base = T.pessoa[0];
  for (const k of Object.keys(T)) if (Array.isArray(T[k])) T[k].length = 0;
  let fid = 1, eid = 1, iid = 1;
  for (let i = 1; i <= 42; i++) {
    const id = "T" + String(i).padStart(3, "0"), [uni, curso] = pick(UNIS), ini = 2015 + Math.floor(rnd() * 8);
    const status = pick(STATUS), fundador = status.includes("Founder");
    T.pessoa.push({ ...base, id, nome: `${pick(NOMES)} ${pick(SOBRE)} ${String.fromCharCode(64 + (i % 26) + 1)}.`, linkedin: i % 3 ? `https://www.linkedin.com/in/demo-${i}` : null,
      nivel: pick(NIVEIS), ingles_fluente: pick(["Yes", "Yes", "No", "Unknown"]), idiomas: rnd() > 0.5 ? ["Inglês", pick(["Espanhol", "Francês", "Alemão"])] : ["Inglês"], status,
      disponibilidade: pick(["On-site", "Remote", "On-site/Remote"]), visibilidade: i % 5 ? "rede" : "privada",
      destaques: fundador ? "Fundou um projeto de impacto durante a graduação (dado fictício)." : (rnd() > 0.5 ? "Liderou uma entidade estudantil (dado fictício)." : null), criado_em: "2026-01-01T00:00:00Z" });
    T.pessoa_privado.push({ pessoa_id: id, data_nascimento: `${2000 + Math.floor(rnd() * 5)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 28)).padStart(2, "0")}`,
      cidade_atual: pick(CIDADES), cidade_nascimento: pick(CIDADES), nota_indicador: Math.round((6.5 + rnd() * 3.5) * 10) / 10, nivel_ambicao: 1 + Math.floor(rnd() * 5),
      hobbies: [pick(HOBBIES), pick(HOBBIES)].filter((v, k, a) => a.indexOf(v) === k), resumo: null, notas: null, indicado_por: null });
    T.formacao.push({ id: fid++, pessoa_id: id, universidade: uni, curso, ano_inicio: ini, ano_formatura: ini + 4 > 2026 ? null : ini + 4, principal: true });
    for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) T.experiencia.push({ id: eid++, pessoa_id: id, organizacao: pick(ORGS), cargo: pick(["Estagiário", "Analista", "Fundador", "Presidente"]), tipo: pick(["empresa", "startup", "entidade"]), inicio: `${ini + 1 + k}-02-01`, fim: null });
    if (fundador) T.iniciativa.push({ id: iid++, pessoa_id: id, titulo: `Projeto ${pick(["Aurora", "Horizonte", "Impulso", "Raiz"])} (fictício)`, descricao: "Iniciativa de exemplo.", tipo: "startup", data: "2024-03-01", link: null });
  }
}

// ---- servidor estático do app/ com os mesmos cabeçalhos do vercel.json ----
const server = spawn("node", [path.resolve(here, "..", "serve.mjs")], { stdio: "ignore" });
await new Promise(r => setTimeout(r, 1200));

const fake = createFake(); popular(fake);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 820 }, locale: "pt-BR", timezoneId: "America/Sao_Paulo" });
await ctx.route(u => !["127.0.0.1", "localhost"].includes(u.hostname), r => r.abort());
await ctx.route(CDN, r => r.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: fs.readFileSync(cache) }));
await ctx.route(SUPABASE, fake.handle);
await ctx.addInitScript(() => { try { localStorage.setItem("talents_last_backup", String(Date.now())); } catch {} });
const page = await ctx.newPage();
const wait = ms => page.waitForTimeout(ms);
const shot = async nome => { await wait(700); await page.screenshot({ path: path.join(out, nome + ".png") }); };
const nav = async v => { await page.click(`nav button[data-view="${v}"]`); await wait(900); };
let rec = true, n = 0;
(async () => { while (rec) { try { await page.screenshot({ path: path.join(tmp, `q${String(n++).padStart(4, "0")}.png`) }); } catch {} await new Promise(r => setTimeout(r, 120)); } })();
const marks = {}; const t0 = Date.now(); const mark = (k, fim) => { marks[k] = marks[k] || {}; marks[k][fim ? "fim" : "ini"] = (Date.now() - t0) / 1000; };

await page.goto("http://127.0.0.1:5199/");
await shot("login");
mark("tour");
await page.fill("#email", EMAIL); await page.fill("#password", PASSWORD); await page.click("#btnLogin");
await page.waitForSelector("#app", { state: "visible" }); await wait(2200);
await shot("lista");
await page.fill("#fq", "insper"); await wait(1000);
await page.fill("#fq", ""); await wait(600);
await page.locator("tr.row").nth(2).click(); await page.waitForSelector("#drawer", { state: "visible" }); await wait(1200);
await shot("perfil");
await page.keyboard.press("Escape"); await wait(500);
const fechar = page.locator("#drawer button", { hasText: /Fechar|Descartar/ }); if (await fechar.count() && await page.locator("#drawer").isVisible()) await fechar.first().click().catch(() => {});
await wait(500);
await nav("stats"); await wait(1800); await shot("numeros");
await nav("graph"); await wait(2500); await shot("rede");
await nav("groups"); await wait(1800); await shot("grupos");
await nav("missing"); await wait(900); await shot("dados-faltando");
await nav("birthdays"); await wait(900);
await nav("history"); await wait(700);
await nav("people"); await wait(2500); await shot("globo");
mark("tour", true);

rec = false; await wait(400);
await ctx.close(); await browser.close(); server.kill();

// ---- GIF do passeio (Pillow): reduz, usa paleta adaptativa e junta os quadros ----
const py = `
import glob, sys
from PIL import Image
fr = sorted(glob.glob(sys.argv[1] + "/q*.png"))
fr = fr[::2] if len(fr) > 90 else fr
ims = []
for f in fr:
    im = Image.open(f).convert("RGB"); im = im.resize((880, round(im.height * 880 / im.width)), Image.LANCZOS)
    ims.append(im.quantize(colors=96, method=Image.MEDIANCUT, dither=Image.NONE))
ims[0].save(sys.argv[2], save_all=True, append_images=ims[1:], duration=170, loop=0, optimize=True, disposal=1)
print(len(ims), "quadros")
`;
const r = spawnSync("python", ["-c", py, tmp, path.join(out, "tour.gif")], { stdio: "inherit" });
if (r.status === 0) fs.rmSync(tmp, { recursive: true, force: true });
console.log("Imagens e GIF em", out);
