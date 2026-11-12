// Backend falso do Supabase, em memória. Os testes nunca falam com o banco real:
// toda chamada para *.supabase.co é atendida aqui (ver fixtures.mjs) e qualquer outro host externo é bloqueado.
// Imita só o que o painel usa: login, PostgREST (select/insert/upsert/update/delete), os triggers de histórico e as Edge Functions.

export const EMAIL = "teste@example.test";
export const PASSWORD = "senha-de-teste-123"; // valor fictício, só existe aqui

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = () => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: "00000000-0000-4000-8000-000000000001", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })}.fake`;

export function seed() {
  const pessoa = (id, nome, o = {}) => ({ id, nome, linkedin: null, nivel: null, ingles_fluente: "Unknown", idiomas: null, status: null, disponibilidade: null, destaques: null, visibilidade: "privada", criado_em: "2026-01-01T00:00:00Z", ...o });
  return {
    pessoa: [
      pessoa("T001", "Ana Teste Silva", { linkedin: "https://www.linkedin.com/in/ana-teste", nivel: "Graduated", ingles_fluente: "Yes", status: "Employed", visibilidade: "rede", destaques: "Fundou uma liga de testes", idiomas: ["Português", "Inglês"] }),
      pessoa("T002", "Bruno Exemplo Costa", { nivel: "Not graduated", status: "Founder", visibilidade: "rede" }),
      pessoa("T003", "Carla Modelo Souza", { nivel: "Master's", ingles_fluente: "Yes", status: "Employed + Founder", visibilidade: "rede", idiomas: ["ingles", "Espanhol"] }),
      pessoa("T004", "Diego Ficticio Lima", { nivel: "Dropout", ingles_fluente: "No", status: "Unemployed" }),
      pessoa("T005", "Elisa Dummy Rocha", { nivel: "Recent graduate", ingles_fluente: "Yes", visibilidade: "rede" }),
      pessoa("T006", "Fabio Teste Nunes", { nivel: "Not graduated" }),
    ],
    pessoa_privado: [
      { pessoa_id: "T002", data_nascimento: "2002-03-12", nota_indicador: 9.5, cidade_atual: "São Paulo", hobbies: ["xadrez"], notas: "nota fictícia" },
      { pessoa_id: "T003", nota_indicador: 8, cidade_atual: "sampa", cidade_nascimento: "Campinas", hobbies: ["Xadrez", "corrida"] },
      { pessoa_id: "T004", nota_indicador: 7.2, cidade_atual: "Rio de Janeiro", cidade_nascimento: "rio de janeiro" },
      { pessoa_id: "T005", nota_indicador: 9, cidade_atual: "Sao Paulo", hobbies: ["CORRIDA"] },
    ],
    formacao: [
      { id: 1, pessoa_id: "T001", universidade: "Universidade de São Paulo", curso: "Engenharia", ano_inicio: 2018, ano_formatura: 2022, principal: true },
      { id: 2, pessoa_id: "T002", universidade: "Insper", curso: "Economia", ano_inicio: 2021, ano_formatura: 2025, principal: true },
      { id: 3, pessoa_id: "T003", universidade: "UNICAMP", curso: "Computação", ano_inicio: 2016, ano_formatura: 2020, principal: true },
      { id: 4, pessoa_id: "T004", universidade: "USP", curso: "Direito", ano_inicio: 2019, ano_formatura: null, principal: true },
      { id: 5, pessoa_id: "T005", universidade: "Insper", curso: "Administração", ano_inicio: 2018, ano_formatura: 2022, principal: true },
      { id: 6, pessoa_id: "T006", universidade: "UNICAMP", curso: "Engenharia", ano_inicio: 2022, ano_formatura: null, principal: true },
    ],
    experiencia: [
      { id: 1, pessoa_id: "T001", organizacao: "Empresa Falsa SA", cargo: "Analista", tipo: "empresa", inicio: "2022-02-01", fim: null },
      { id: 2, pessoa_id: "T003", organizacao: "Startup Inventada", cargo: "Fundadora", tipo: "startup", inicio: "2021-01-01", fim: null },
    ],
    iniciativa: [{ id: 1, pessoa_id: "T002", titulo: "Liga Fictícia de Xadrez", descricao: "Torneios mensais", tipo: "liga", data: "2023-05-01", link: null }],
    interacao: [{ id: 1, pessoa_id: "T003", data: "2026-10-01", canal: "WhatsApp", resumo: "Conversa de teste", proximo_passo: "Schedule call", data_proximo_passo: null }],
    alias_nome: [],
    proposta_enriquecimento: [],
    historico: [],
  };
}

const CHILD = ["pessoa_privado", "formacao", "experiencia", "iniciativa", "interacao"];
const LOGGED = ["pessoa", ...CHILD];
const RESERVED = ["select", "order", "limit", "offset", "on_conflict", "columns"];
const pkOf = t => (t === "pessoa_privado" ? "pessoa_id" : "id");
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createFake() {
  const T = seed();
  let hid = 0, seq = 1000;
  const t0 = Date.now();
  const fake = {
    T, requests: [], functionCalls: [], failNext: [],
    // respostas das Edge Functions (os testes trocam por outras quando precisam)
    functions: {
      "cadastro-ia": () => ({ proposta: { acao: "criar", pessoa: { nome: "Helena Proposta Alves", nivel: "Graduated" }, privado: { hobbies: ["yoga"] }, formacao: [{ universidade: "Insper", curso: "Economia" }], avisos: ["Aviso de teste"] } }),
      // Imita a Edge Function enriquecer-ia: só guarda propostas PENDENTES (a IA real nunca grava nos dados do perfil).
      "enriquecer-ia": body => {
        if (body?.pessoa_id !== "T006") return { erro: "Pessoa não encontrada." };
        const base = { pessoa_id: "T006", status: "pendente", origem: "ia", criado_em: new Date().toISOString(), justificativa: "Justificativa de teste", confianca: "alta", decidido_em: null, decidido_por: null };
        const rows = [
          { alvo: "pessoa", acao: "preencher", registro_id: null, dados: { linkedin: "https://www.linkedin.com/in/fabio-teste" }, valor_atual: { linkedin: null }, fonte: "https://exemplo.test/fabio" },
          { alvo: "pessoa", acao: "corrigir", registro_id: null, dados: { nivel: "Master's" }, valor_atual: { nivel: "Not graduated" }, fonte: "https://exemplo.test/fabio" },
          { alvo: "formacao", acao: "preencher", registro_id: 6, dados: { ano_formatura: 2026 }, valor_atual: { ano_formatura: null }, fonte: "https://exemplo.test/unicamp" },
          { alvo: "iniciativa", acao: "adicionar", registro_id: null, dados: { titulo: "Projeto Inventado", tipo: "projeto", link: "https://exemplo.test/proj" }, valor_atual: null, fonte: "texto colado pelo dono" },
        ].map(r => ({ id: ++seq, ...base, ...r }));
        T.proposta_enriquecimento.push(...rows);
        return { criadas: rows.length, avisos: ["Aviso de enriquecimento"], notas: null, uso: { entrada: 10, saida: 5 } };
      },
      "conectar-ia": () => ({ sugestoes: [{ id: "T003", relacao: "complementar", papel: "CTO", motivo: "Motivo de teste", confianca: "alta" }], perfis_analisados: 6, uso: { entrada: 100, cache: 0, saida: 20 } }),
    },
    person: id => T.pessoa.find(p => p.id === id),
    writes: () => fake.requests.filter(r => r.method !== "GET" && r.table !== "functions"),
  };

  const log = (tabela, acao, antes, depois, full = depois ?? antes) => {
    if (!LOGGED.includes(tabela)) return;
    const row = full, hs = ++hid;
    T.historico.push({ id: hs, quando: new Date(t0 + hs * 1000).toISOString(), quem_email: EMAIL, tabela, acao, registro_id: String(row[pkOf(tabela)]),
      pessoa_id: tabela === "pessoa" ? row.id : (row.pessoa_id ?? null), antes, depois });
  };
  const patchRow = (table, row, changes) => {
    const before = {}, after = {};
    for (const [k, v] of Object.entries(changes)) if (!same(row[k], v)) { before[k] = row[k] ?? null; after[k] = v; row[k] = v; }
    if (Object.keys(after).length) log(table, "update", before, after, row);
  };
  const err = (status, code, message) => ({ status, body: { code, message, details: null, hint: null } });

  function rest(method, table, url, body) {
    const q = url.searchParams;
    const fail = fake.failNext.findIndex(f => f.table === table && f.method === method);
    if (fail >= 0) { const f = fake.failNext.splice(fail, 1)[0]; return err(f.status || 500, "XX000", f.message || "erro simulado"); }
    if (!(table in T)) return err(404, "42P01", `relation ${table} does not exist`);
    const filters = [...q].filter(([k]) => !RESERVED.includes(k));
    const match = r => filters.every(([k, v]) => !v.startsWith("eq.") || String(r[k]) === v.slice(3));
    if (method === "GET") {
      let rows = T[table].filter(match);
      const order = q.get("order");
      if (order) for (const spec of order.split(",").reverse()) {
        const [col, dir] = spec.split("."), s = dir === "desc" ? -1 : 1;
        rows = [...rows].sort((a, b) => (a[col] == null ? 1 : b[col] == null ? -1 : (a[col] > b[col] ? 1 : a[col] < b[col] ? -1 : 0) * s));
      }
      const off = Number(q.get("offset") || 0), lim = q.get("limit");
      rows = rows.slice(off, lim ? off + Number(lim) : undefined);
      if (table === "pessoa" && (q.get("select") || "").includes("formacao"))
        rows = rows.map(p => ({ ...p, ...Object.fromEntries(CHILD.map(c => [c, T[c].filter(x => x.pessoa_id === p.id)])) }));
      return { status: 200, body: structuredClone(rows) };
    }
    if (method === "POST") {
      const rows = Array.isArray(body) ? body : [body], key = q.get("on_conflict");
      for (const r of rows) {
        const old = key ? T[table].find(x => x[key] === r[key]) : null;
        if (old) { patchRow(table, old, r); continue; }
        if (table === "pessoa") {
          if (!/^T\d{3,}$/.test(r.id || "")) return err(400, "23514", "violates check constraint pessoa_id_formato");
          if (!String(r.nome || "").trim()) return err(400, "23514", "violates check constraint pessoa_nome_ok");
          if (T.pessoa.some(x => x.id === r.id)) return err(409, "23505", "duplicate key value violates unique constraint");
        }
        const row = { ...(table === "pessoa" ? { ingles_fluente: "Unknown", visibilidade: "privada", criado_em: new Date().toISOString() } : {}), ...r };
        if (table !== "pessoa" && table !== "pessoa_privado" && row.id == null) row.id = ++seq;
        T[table].push(row); log(table, "insert", null, row);
      }
      return { status: 201, body: null };
    }
    if (method === "PATCH") { T[table].filter(match).forEach(r => patchRow(table, r, body)); return { status: 204, body: null }; }
    if (method === "DELETE") {
      for (const r of T[table].filter(match)) {
        if (table === "pessoa") for (const c of CHILD) for (const k of T[c].filter(x => x.pessoa_id === r.id)) { T[c].splice(T[c].indexOf(k), 1); log(c, "delete", k, null); }
        T[table].splice(T[table].indexOf(r), 1); log(table, "delete", r, null);
      }
      return { status: 204, body: null };
    }
    return err(405, "PGRST", "método não suportado");
  }

  // Manipulador de rota do Playwright para https://<projeto>.supabase.co/**
  fake.handle = async route => {
    const req = route.request(), url = new URL(req.url()), method = req.method();
    const cors = { "access-control-allow-origin": req.headers()["origin"] || "*", "access-control-allow-headers": req.headers()["access-control-request-headers"] || "*",
      "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS", "access-control-expose-headers": "*" };
    const send = (status, body) => route.fulfill({ status, headers: { ...cors, ...(body == null ? {} : { "content-type": "application/json" }) }, body: body == null ? "" : JSON.stringify(body) });
    if (method === "OPTIONS") return send(204, null);
    let body = null; try { body = req.postDataJSON(); } catch {}
    const p = url.pathname;
    if (p === "/auth/v1/token") {
      if (body?.email !== EMAIL || body?.password !== PASSWORD) return send(400, { code: 400, error_code: "invalid_credentials", msg: "Invalid login credentials", error: "invalid_grant", error_description: "Invalid login credentials" });
      return send(200, { access_token: jwt(), token_type: "bearer", expires_in: 3600, refresh_token: "fake-refresh", user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } });
    }
    if (p === "/auth/v1/logout") return send(204, null);
    if (p === "/auth/v1/user") return send(200, { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", email: EMAIL, app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" });
    let m = p.match(/^\/rest\/v1\/(\w+)$/);
    if (m) {
      fake.requests.push({ method, table: m[1], query: url.search, body });
      const r = rest(method, m[1], url, body); return send(r.status, r.body);
    }
    m = p.match(/^\/functions\/v1\/([\w-]+)$/);
    if (m) {
      fake.functionCalls.push({ name: m[1], body }); fake.requests.push({ method, table: "functions", body });
      const f = fake.functions[m[1]]; return f ? send(200, f(body)) : send(404, { erro: "função não existe" });
    }
    return send(404, { message: "rota não simulada: " + p });
  };
  return fake;
}
