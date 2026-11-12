// Public values (safe in a browser): the project URL and the publishable key.
// Access is enforced in the database by Row Level Security, not by this page.
const SUPABASE_URL = "https://qcovgqjrznplhhwtmwht.supabase.co";
const SUPABASE_KEY = "sb_publishable_R0lWsNzYAuuH_LfA-MJBjA_O30_Q7me";

const NIVEIS = ["Not graduated","Recent graduate","Graduated","Master's","Dropout"];
const STATUS = ["Employed","Employed + Founder","Founder","Unemployed","Exchange program"];
const DISP = ["On-site","Remote","On-site/Remote"];
const INGLES = ["Yes","No","Unknown"];
const PROX = ["Send message","Wait for reply","Schedule call","Discard"];
// Rótulos em português só para exibir; o valor gravado no banco continua em inglês (os CHECK do banco dependem disso).
const PT = {
  nivel: { "Not graduated":"Cursando", "Recent graduate":"Recém-formado(a)", "Graduated":"Formado(a)", "Master's":"Mestrado", "Dropout":"Abandonou" },
  status: { "Employed":"Empregado(a)", "Employed + Founder":"Empregado(a) e founder", "Founder":"Founder", "Unemployed":"Desempregado(a)", "Exchange program":"Intercâmbio" },
  disp: { "On-site":"Presencial", "Remote":"Remoto", "On-site/Remote":"Presencial ou remoto" },
  ingles: { "Yes":"Sim", "No":"Não", "Unknown":"Não confirmado" },
  prox: { "Send message":"Enviar mensagem", "Wait for reply":"Aguardar resposta", "Schedule call":"Marcar conversa", "Discard":"Descartar" },
  vis: { "rede":"Na rede", "privada":"Privada" },
};
const pt = (map, v) => (v == null || v === "" ? "" : (PT[map][v] ?? v));

let db = null;
const state = { people: [], view: "people", sortKey: "id", sortDir: 1, filters: { q:"", nivel:"", status:"", ingles:"", uni:"", notaMin:"", notaMax:"", drill:null }, openId: null };

const $ = (s, r=document) => r.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const val = v => (v === "" || v === undefined ? null : v);
const num = v => (v === "" || v == null ? null : Number(v));
const list = v => { const a = String(v||"").split(",").map(s=>s.trim()).filter(Boolean); return a.length ? a : null; };
const opts = (arr, cur, blank=true, labels=null) => (blank ? '<option value=""></option>' : "") + arr.map(o => `<option value="${esc(o)}" ${o===cur?"selected":""}>${esc(labels?.[o] ?? o)}</option>`).join("");

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.remove("hidden");
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.add("hidden"), 2600);
}

// ---------- diálogo próprio (no lugar de confirm() e prompt()) ----------
// ask({ title, body, ok, danger, input }) -> true/false; com input: o texto digitado ou null.
let dlgOpen = null;
function ask({ title, body = "", ok = "Confirmar", cancel = "Cancelar", danger = false, input = null }) {
  return new Promise(resolve => {
    const box = $("#dlg"), inp = $("#dlgInput"), okB = $("#dlgOk"), noB = $("#dlgCancel"), prev = document.activeElement;
    $("#dlgTitle").textContent = title; $("#dlgBody").textContent = body; $("#dlgBody").classList.toggle("hidden", !body);
    okB.textContent = ok; noB.textContent = cancel; okB.classList.toggle("danger", danger);
    inp.classList.toggle("hidden", input === null); inp.value = ""; inp.placeholder = input?.placeholder || ""; inp.setAttribute("aria-label", input?.label || title);
    box.classList.remove("hidden");
    const done = v => {
      box.classList.add("hidden"); dlgOpen = null; okB.onclick = noB.onclick = inp.onkeydown = box.onkeydown = box.onmousedown = null;
      if (prev && prev.focus && document.contains(prev)) prev.focus();
      resolve(v);
    };
    const okVal = () => (input === null ? true : (inp.value.trim() || null));
    okB.onclick = () => { const v = okVal(); if (input !== null && !v) { inp.focus(); return; } done(v); };
    noB.onclick = () => done(input === null ? false : null);
    inp.onkeydown = e => { if (e.key === "Enter") { e.preventDefault(); okB.click(); } };
    box.onmousedown = e => { if (e.target === box) noB.click(); };
    box.onkeydown = e => {
      if (e.key === "Escape") { e.stopPropagation(); noB.click(); return; }
      if (e.key !== "Tab") return;
      const f = [...box.querySelectorAll("input,button")].filter(x => !x.classList.contains("hidden") && !x.disabled);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    dlgOpen = box;
    (input !== null ? inp : (danger ? noB : okB)).focus();
  });
}

// ---------- menus do cabeçalho ----------
function closeMenus() {
  document.querySelectorAll(".pop").forEach(m => m.classList.add("hidden"));
  document.querySelectorAll("[data-menu]").forEach(b => b.setAttribute("aria-expanded", "false"));
}
function bindMenus() {
  document.querySelectorAll("[data-menu]").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const m = document.getElementById(b.dataset.menu), open = m.classList.contains("hidden");
    closeMenus();
    if (open) { m.classList.remove("hidden"); b.setAttribute("aria-expanded", "true"); m.querySelector("button")?.focus(); }
  }));
  document.querySelectorAll(".pop").forEach(m => m.addEventListener("click", e => { if (e.target.closest("button")) closeMenus(); }));
  document.addEventListener("click", e => { if (!e.target.closest(".pop")) closeMenus(); });
}

// ---------- Esc e foco: fecha a camada de cima ----------
const OVERLAYS = ["#alias", "#conn", "#ai"];
document.addEventListener("keydown", e => {
  if (e.key !== "Escape" || dlgOpen) return;
  if (document.querySelector(".pop:not(.hidden)")) { closeMenus(); $("#btnAccount")?.focus(); return; }
  const o = OVERLAYS.map(s => $(s)).find(x => x && !x.classList.contains("hidden"));
  if (o) { o.classList.add("hidden"); return; }
  if (!$("#drawer").classList.contains("hidden")) requestClose();
});
// Clique no fundo escuro fecha os modais (o texto digitado continua lá quando você reabre).
OVERLAYS.forEach(s => $(s).addEventListener("mousedown", e => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); }));
function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : null; }

// ---------- data ----------
const priv = p => (Array.isArray(p.pessoa_privado) ? p.pessoa_privado[0] : p.pessoa_privado) || {};
const mainEdu = p => (p.formacao || []).find(f => f.principal) || (p.formacao || [])[0] || {};

// ---------- data quality: aliases, suggestions, duplicates ----------
// Rules in table alias_nome map a spelling to the official name. On read they are applied in memory (originals kept in _u/_c/_o),
// on save the value is also snapped to an existing spelling (ignoring case and accents), so new data stays consistent.
const squash = v => String(v ?? "").replace(/\s+/g, " ").trim();
const ALIAS_TIPOS = { universidade: "Universidade", curso: "Curso", organizacao: "Organização" };
const DL_BY_TIPO = { universidade: "dl-uni", curso: "dl-curso", organizacao: "dl-org" };
function buildAlias() {
  state.alias = {}; Object.keys(ALIAS_TIPOS).forEach(t => state.alias[t] = new Map());
  (state.aliasRows || []).forEach(r => state.alias[r.tipo]?.set(norm(r.alias), r.canonico));
}
function canonRead(tipo, v) { const s = squash(v); if (!s) return v; return state.alias?.[tipo]?.get(norm(s)) ?? s; }
function canonWrite(tipo, v) {
  const s = canonRead(tipo, v); if (!s) return null;
  const k = norm(s); return (state.known?.[tipo] || []).find(x => norm(x) === k) ?? s;
}
function canonCity(v) { const s = squash(v); if (!s) return null; const c = cityCoord(s); return c ? c.label : s; }
function applyCanon(p) {
  (p.formacao || []).forEach(f => { f._u = f.universidade; f._c = f.curso; f.universidade = canonRead("universidade", f.universidade); f.curso = canonRead("curso", f.curso); });
  (p.experiencia || []).forEach(e => { e._o = e.organizacao; e.organizacao = canonRead("organizacao", e.organizacao); });
}
function refreshLists() {
  const P = state.people, uniq = arr => { const m = new Map(); arr.filter(Boolean).forEach(v => m.set(v, (m.get(v) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(x => x[0]); };
  state.known = {
    universidade: uniq(P.flatMap(p => (p.formacao || []).map(f => f.universidade))),
    curso: uniq(P.flatMap(p => (p.formacao || []).map(f => f.curso))),
    organizacao: uniq(P.flatMap(p => (p.experiencia || []).map(e => e.organizacao))),
  };
  const lists = {
    "dl-uni": state.known.universidade, "dl-curso": state.known.curso, "dl-org": state.known.organizacao,
    "dl-tipo-exp": uniq(P.flatMap(p => (p.experiencia || []).map(e => e.tipo))),
    "dl-tipo-ini": uniq(P.flatMap(p => (p.iniciativa || []).map(i => i.tipo))),
    "dl-canal": uniq(P.flatMap(p => (p.interacao || []).map(i => i.canal))),
    "dl-cidade": uniq([...[...CITIES.values()].map(c => c.label), ...P.flatMap(p => [priv(p).cidade_atual, priv(p).cidade_nascimento])]),
    "dl-pessoa": P.map(p => p.nome),
  };
  $("#dls").innerHTML = Object.entries(lists).map(([id, arr]) => `<datalist id="${id}">${arr.map(v => `<option value="${esc(v)}"></option>`).join("")}</datalist>`).join("");
}
const normLinkedin = v => norm(v).replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[a.length][b.length];
}
// People whose name looks like the given one (same name, one contains the other, 1-2 typos, or same first and last name).
function similarPeople(nome, exceptId) {
  const n = norm(nome).replace(/\s+/g, " "); if (n.length < 3) return [];
  const nt = n.split(" ");
  return state.people.filter(p => {
    if (p.id === exceptId) return false;
    const m = norm(p.nome).replace(/\s+/g, " "); if (!m) return false;
    if (m === n) return true;
    if (Math.min(m.length, n.length) >= 6 && (m.includes(n) || n.includes(m))) return true;
    if (Math.max(m.length, n.length) >= 6 && lev(m, n) <= 2) return true;
    const mt = m.split(" "); return nt.length > 1 && mt.length > 1 && nt[0] === mt[0] && nt[nt.length - 1] === mt[mt.length - 1];
  }).slice(0, 3);
}
const simText = list => list.map(x => `${x.id} · ${x.nome}`).join("\n");

async function loadPeople() {
  const { data, error } = await db.from("pessoa")
    .select("*, pessoa_privado(*), formacao(*), experiencia(*), iniciativa(*), interacao(*)")
    .order("id");
  if (error) { toast("Erro ao carregar: " + error.message); return false; }
  const ar = await db.from("alias_nome").select("*").order("tipo").order("alias");
  state.aliasRows = ar.data || []; buildAlias();
  state.people = data || []; state.people.forEach(applyCanon); refreshLists();
  $("#notAdmin").classList.toggle("hidden", state.people.length > 0);
  return true;
}
async function reload(keepOpen=true) {
  await loadPeople(); renderView();
  if (keepOpen && state.openId) openDrawer(state.openId);
}
async function run(promise, okMsg) {
  const { error } = await promise;
  if (error) { toast("Erro: " + error.message); return false; }
  if (okMsg) toast(okMsg);
  return true;
}

// ---------- views ----------
const VIEW_HEAD = {
  people: ["Pessoas", () => `${state.people.length} pessoas na base`],
  birthdays: ["Aniversários", () => "Quem faz aniversário em breve"],
  missing: ["Dados faltando", () => "Onde ainda faltam informações nos perfis"],
  stats: ["Números", () => "Indicadores da base"],
  graph: ["Rede", () => "Pessoas ligadas por universidades, empresas e cursos"],
  groups: ["Grupos", () => "Pessoas agrupadas por traços em comum"],
  history: ["Histórico", () => "Últimas alterações, com opção de desfazer"],
  enrich: ["Enriquecer", () => "A IA sugere dados com fonte; nada vale até você aprovar"],
};
function renderView() {
  vizStop();
  document.querySelectorAll("nav button").forEach(b => {
    const on = b.dataset.view === state.view; b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const vh = VIEW_HEAD[state.view] || VIEW_HEAD.stats;
  $("#pageTitle").textContent = vh[0]; $("#pageSub").textContent = vh[1]();
  if (state.view === "graph") renderGraph();
  else if (state.view === "groups") renderGroups();
  else if (state.view === "people") renderPeople();
  else if (state.view === "birthdays") renderBirthdays();
  else if (state.view === "missing") renderMissing();
  else if (state.view === "history") renderHistory();
  else if (state.view === "enrich") renderEnrich();
  else renderStats();
}

// Score filter: with a min or max set, people without a score are left out.
function notaOk(n, min, max) {
  if (min === "" && max === "") return true;
  if (n == null || n === "") return false;
  const v = Number(n);
  return (min === "" || v >= Number(min)) && (max === "" || v <= Number(max));
}

// Filtro vindo de um clique na aba Números (idioma, hobby ou cidade). Compara pela chave sem caixa/acentos.
const DRILL = {
  idioma: { rot: "Idioma", get: p => p.idiomas || [] },
  hobby: { rot: "Hobby", get: p => priv(p).hobbies || [] },
  cidade_atual: { rot: "Cidade atual", get: p => [canonCity(priv(p).cidade_atual)] },
  cidade_nasc: { rot: "Cidade de nascimento", get: p => [canonCity(priv(p).cidade_nascimento)] },
};
const drillOk = (p, d) => !d || DRILL[d.campo].get(p).some(v => v && norm(squash(v)) === d.key);

function filtered() {
  const f = state.filters, q = f.q.toLowerCase();
  let rows = state.people.filter(p => {
    const e = mainEdu(p);
    const hay = [p.nome, p.id, p.status, p.destaques, priv(p).notas, ...(p.formacao||[]).flatMap(x=>[x.universidade,x.curso]), ...(p.experiencia||[]).map(x=>x.organizacao)].join(" ").toLowerCase();
    return (!q || hay.includes(q)) && (!f.nivel || p.nivel === f.nivel) && (!f.status || p.status === f.status)
      && (!f.ingles || p.ingles_fluente === f.ingles) && (!f.uni || (p.formacao||[]).some(x => x.universidade === f.uni))
      && notaOk(priv(p).nota_indicador, f.notaMin, f.notaMax) && drillOk(p, f.drill);
  });
  const key = state.sortKey, dir = state.sortDir;
  const get = p => ({ id:p.id, nome:p.nome, uni:mainEdu(p).universidade, curso:mainEdu(p).curso, nivel:p.nivel, nota:priv(p).nota_indicador, ingles:p.ingles_fluente, status:p.status, vis:p.visibilidade })[key];
  rows.sort((a,b) => {
    const x = get(a), y = get(b);
    if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1;
    return (typeof x === "number" || key === "nota" ? Number(x) - Number(y) : String(x).localeCompare(String(y))) * dir;
  });
  return rows;
}

function renderPeople() {
  const unis = [...new Set(state.people.flatMap(p => (p.formacao||[]).map(f => f.universidade)))].sort();
  const f = state.filters;
  $("#view").innerHTML = `
    <div id="globeBox" class="globebox"></div>
    <div class="filters">
      <input id="fq" type="search" aria-label="Buscar" placeholder="Buscar por nome, empresa, curso, notas…" value="${esc(f.q)}">
      <select id="fnivel" aria-label="Nível"><option value="">Nível: todos</option>${opts(NIVEIS, f.nivel, false, PT.nivel)}</select>
      <select id="fstatus" aria-label="Status"><option value="">Status: todos</option>${opts(STATUS, f.status, false, PT.status)}</select>
      <select id="fingles" aria-label="Inglês"><option value="">Inglês: todos</option>${opts(INGLES, f.ingles, false, PT.ingles)}</select>
      <select id="funi" aria-label="Universidade"><option value="">Universidade: todas</option>${opts(unis, f.uni, false)}</select>
      <input id="fnmin" type="number" min="0" max="10" step="0.1" aria-label="Nota mínima" placeholder="Nota mín." value="${esc(f.notaMin)}">
      <input id="fnmax" type="number" min="0" max="10" step="0.1" aria-label="Nota máxima" placeholder="Nota máx." value="${esc(f.notaMax)}">
    </div>
    ${f.drill ? `<div class="drillchip"><span>Filtro dos números: ${esc(DRILL[f.drill.campo].rot)} = <b>${esc(f.drill.rotulo)}</b></span><button id="clearDrill" type="button">Remover filtro</button></div>` : ""}
    <div class="count" id="count" role="status"></div>
    <label class="sortbar">Ordenar por <select id="fsort" aria-label="Ordenar por">${[["id","ID"],["nome","Nome"],["uni","Universidade"],["curso","Curso"],["nivel","Nível"],["nota","Nota"],["ingles","Inglês"],["status","Status"],["vis","Visibilidade"]].map(([k,l]) => `<option value="${k}"${state.sortKey===k?" selected":""}>${l}</option>`).join("")}</select>
      <button id="fdir" type="button" aria-label="Inverter ordem">${state.sortDir>0?"↑":"↓"}</button></label>
    <div class="tablewrap people-wrap"><table class="people"><thead><tr>
      ${[["id","ID"],["nome","Nome"],["uni","Universidade"],["curso","Curso"],["nivel","Nível"],["nota","Nota"],["ingles","Inglês"],["status","Status"],["vis","Visibilidade"]]
        .map(([k,l]) => `<th data-sort="${k}" tabindex="0" aria-sort="${state.sortKey===k ? (state.sortDir>0?"ascending":"descending") : "none"}">${l}${state.sortKey===k ? (state.sortDir>0?" ↑":" ↓") : ""}</th>`).join("")}
    </tr></thead><tbody id="tbody"></tbody></table></div>
    <div class="morebar" id="morebar" hidden><span id="moreinfo"></span><button id="moreBtn" type="button">Mostrar mais</button></div>`;
  // Acima de PAGINAR pessoas, mostra PASSO por vez (botao "Mostrar mais"); o filtro volta ao inicio.
  const PAGINAR = 250, PASSO = 100; let shown = PASSO;
  const draw = (reset = true) => {
    if (reset) shown = PASSO;
    const all = filtered();
    const rows = all.length > PAGINAR ? all.slice(0, shown) : all;
    $("#count").textContent = `${all.length} de ${state.people.length} pessoas`;
    const more = all.length > rows.length;
    $("#morebar").hidden = all.length <= PAGINAR;
    $("#moreinfo").textContent = `Mostrando ${rows.length} de ${all.length}`;
    $("#moreBtn").hidden = !more;
    $("#tbody").innerHTML = rows.length ? rows.map(p => { const e = mainEdu(p);
      return `<tr class="row" tabindex="0" data-id="${esc(p.id)}"><td>${esc(p.id)}</td><td><b>${esc(p.nome)}</b></td><td>${esc(e.universidade)}</td><td>${esc(e.curso)}</td>
        <td>${esc(pt("nivel", p.nivel))}</td><td>${esc(priv(p).nota_indicador)}</td><td>${esc(pt("ingles", p.ingles_fluente))}</td><td>${p.status ? `<span class="tag">${esc(pt("status", p.status))}</span>` : ""}</td>
        <td><span class="dot ${p.visibilidade === "rede" ? "on" : ""}">${esc(pt("vis", p.visibilidade))}</span></td></tr>`; }).join("")
      : `<tr><td colspan="9"><div class="empty"><div>Nenhuma pessoa com esses filtros.</div><button id="clearFilters">Limpar filtros</button></div></td></tr>`;
    const cf = $("#clearFilters");
    if (cf) cf.onclick = () => { state.filters = { q:"", nivel:"", status:"", ingles:"", uni:"", notaMin:"", notaMax:"", drill:null }; renderPeople(); };
  };
  const cd = $("#clearDrill"); if (cd) cd.onclick = () => { state.filters.drill = null; renderPeople(); };
  renderGlobe("#globeBox", 380);
  draw();
  $("#moreBtn").onclick = () => { shown += PASSO; draw(false); };
  const bind = (id, key) => $(id).addEventListener("input", e => { state.filters[key] = e.target.value; draw(); });
  bind("#fq","q"); bind("#fnivel","nivel"); bind("#fstatus","status"); bind("#fingles","ingles"); bind("#funi","uni"); bind("#fnmin","notaMin"); bind("#fnmax","notaMax");
  $("#view").querySelectorAll("th[data-sort]").forEach(th => {
    const sort = () => { const k = th.dataset.sort; state.sortDir = state.sortKey === k ? -state.sortDir : 1; state.sortKey = k; renderPeople(); };
    th.onclick = sort; th.onkeydown = e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); sort(); } };
  });
  $("#fsort").onchange = e => { state.sortKey = e.target.value; state.sortDir = 1; renderPeople(); };
  $("#fdir").onclick = () => { state.sortDir = -state.sortDir; renderPeople(); };
  $("#tbody").onclick = e => { const tr = e.target.closest("tr.row"); if (tr) openDrawer(tr.dataset.id); };
}
// Linhas da tabela abrem com Enter ou espaço (teclado).
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("tr.row")) { e.preventDefault(); openDrawer(e.target.dataset.id); }
});

// ----- birthdays -----
function nextBirthday(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ""); if (!m) return null;
  const today = new Date(); today.setHours(0,0,0,0);
  let d = new Date(today.getFullYear(), +m[2]-1, +m[3]);
  if (d < today) d = new Date(today.getFullYear()+1, +m[2]-1, +m[3]);
  return { date: d, days: Math.round((d - today) / 86400000), age: d.getFullYear() - +m[1] };
}
function renderBirthdays() {
  const items = state.people.map(p => ({ p, nb: nextBirthday(priv(p).data_nascimento) })).filter(x => x.nb).sort((a,b) => a.nb.days - b.nb.days);
  $("#view").innerHTML = `
    <div class="row-actions flush"><button id="btnIcs" ${items.length?"":"disabled"}>Baixar calendário (.ics)</button>
      <span class="muted">${items.length} com data de nascimento preenchida. O arquivo cria um evento anual para cada pessoa.</span></div>
    ${items.length ? `<div class="tablewrap"><table><thead><tr><th>Quando</th><th>Nome</th><th>Data</th><th>Vai fazer</th></tr></thead><tbody>
      ${items.map(({p,nb}) => `<tr class="row" tabindex="0" data-id="${esc(p.id)}"><td>${nb.days===0?"Hoje":nb.days===1?"Amanhã":"em "+nb.days+" dias"}</td><td>${esc(p.nome)}</td>
        <td>${nb.date.toLocaleDateString("pt-BR",{day:"2-digit",month:"long"})}</td><td>${nb.age} anos</td></tr>`).join("")}</tbody></table></div>`
      : `<div class="card muted">Nenhuma data de nascimento preenchida ainda. Abra uma pessoa e preencha em “Dados privados”.</div>`}`;
  const t = $("#view tbody"); if (t) t.onclick = e => { const tr = e.target.closest("tr.row"); if (tr) openDrawer(tr.dataset.id); };
  $("#btnIcs").onclick = () => {
    const pad = n => String(n).padStart(2,"0");
    const ev = items.map(({p}) => { const [y,m,d] = priv(p).data_nascimento.split("-");
      return ["BEGIN:VEVENT",`UID:talents-${p.id}@local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").split(".")[0]}Z`,
        `DTSTART;VALUE=DATE:${new Date().getFullYear()}${m}${d}`,"RRULE:FREQ=YEARLY",`SUMMARY:Aniversário: ${p.nome.replace(/[,;\\]/g," ")}`,"END:VEVENT"].join("\r\n"); });
    const ics = ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Talents//PT","CALSCALE:GREGORIAN",...ev,"END:VCALENDAR"].join("\r\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([ics], {type:"text/calendar"}));
    a.download = "aniversarios-talents.ics"; a.click();
  };
}

// ----- missing data -----
// def = counted by default. Each field says when a person is missing it.
const MISS = [
  { key:"linkedin", label:"LinkedIn / contato", def:true, miss:p => !p.linkedin },
  { key:"nivel", label:"Nível", def:true, miss:p => !p.nivel },
  { key:"ingles", label:"Inglês (confirmar)", def:true, miss:p => !p.ingles_fluente || p.ingles_fluente === "Unknown" },
  { key:"status", label:"Status", def:true, miss:p => !p.status },
  { key:"disp", label:"Disponibilidade", def:true, miss:p => !p.disponibilidade },
  { key:"idiomas", label:"Idiomas", def:true, miss:p => !(p.idiomas || []).length },
  { key:"destaques", label:"Destaques", def:false, miss:p => !p.destaques },
  { key:"nasc", label:"Data de nascimento", def:true, miss:p => !priv(p).data_nascimento },
  { key:"cnasc", label:"Cidade de nascimento", def:true, miss:p => !priv(p).cidade_nascimento },
  { key:"catual", label:"Cidade atual", def:true, miss:p => !priv(p).cidade_atual },
  { key:"saida", label:"Idade ao sair de casa", def:true, miss:p => priv(p).idade_saida_casa_pais == null },
  { key:"hobbies", label:"Hobbies", def:true, miss:p => !(priv(p).hobbies || []).length },
  { key:"nota", label:"Nota do indicador", def:false, miss:p => priv(p).nota_indicador == null },
  { key:"ambicao", label:"Nível de ambição", def:true, miss:p => priv(p).nivel_ambicao == null },
  { key:"resumo", label:"Resumo curto (para a IA)", def:true, miss:p => !priv(p).resumo },
  { key:"formacao", label:"Formação", def:true, miss:p => !(p.formacao || []).length },
  { key:"formatura", label:"Ano de formatura", def:true, miss:p => (p.formacao || []).length > 0 && mainEdu(p).ano_formatura == null },
  { key:"exp", label:"Experiência", def:false, miss:p => !(p.experiencia || []).length },
  { key:"inic", label:"Iniciativas", def:false, miss:p => !(p.iniciativa || []).length },
  { key:"inter", label:"Interações (contato feito)", def:false, miss:p => !(p.interacao || []).length },
];
const missState = { fields: null, only: null };
function loadMissSel() {
  try { const s = JSON.parse(localStorage.getItem("talents_missing_fields") || "null"); if (Array.isArray(s)) return s.filter(k => MISS.some(f => f.key === k)); } catch {}
  return MISS.filter(f => f.def).map(f => f.key);
}
function renderMissing() {
  if (!missState.fields) missState.fields = loadMissSel();
  const on = missState.fields, sel = MISS.filter(f => on.includes(f.key));
  const rows = state.people.map(p => ({ p, miss: sel.filter(f => f.miss(p)) }));
  const total = rows.length * sel.length, gaps = rows.reduce((a, r) => a + r.miss.length, 0);
  const pct = total ? Math.round((1 - gaps / total) * 100) : 100;
  const complete = rows.filter(r => !r.miss.length).length;
  const only = MISS.find(f => f.key === missState.only);
  const shown = rows.filter(r => r.miss.length && (!only || r.miss.includes(only)))
    .sort((a, b) => b.miss.length - a.miss.length || String(a.p.id).localeCompare(String(b.p.id)));
  $("#view").innerHTML = `
    <div class="card"><b>${pct}%</b> completo nos campos marcados · <b>${complete}</b> de ${rows.length} pessoas sem nenhuma lacuna · <b>${gaps}</b> lacunas no total</div>
    <div class="card"><b>Campos considerados</b> <span class="muted">(marque o que importa; a escolha fica salva neste navegador)</span>
      <div class="checkgrid">
        ${MISS.map(f => { const n = state.people.filter(f.miss).length;
          return `<div class="item"><label><input type="checkbox" data-f="${f.key}" ${on.includes(f.key) ? "checked" : ""}>${esc(f.label)}</label>
            <button data-only="${f.key}" ${n ? "" : "disabled"} title="Ver só quem falta">${n}</button></div>`; }).join("")}
      </div></div>
    <div class="row-actions flush"><span class="count flush">${only ? `Mostrando só quem falta: <b>${esc(only.label)}</b>` : "Mostrando quem falta qualquer campo marcado"} · ${shown.length} pessoas</span>
      ${only ? '<button id="missAll">Ver todos os campos</button>' : ""}<button id="missCopy" ${shown.length ? "" : "disabled"}>Copiar lista de nomes</button></div>
    ${shown.length ? `<div class="tablewrap"><table><thead><tr><th>ID</th><th>Nome</th><th>Faltam</th><th>O que falta</th></tr></thead><tbody>
      ${shown.map(r => `<tr class="row" tabindex="0" data-id="${esc(r.p.id)}"><td>${esc(r.p.id)}</td><td>${esc(r.p.nome)}</td><td>${r.miss.length}</td>
        <td class="wrapcell">${r.miss.map(f => `<span class="tag">${esc(f.label)}</span>`).join(" ")}</td></tr>`).join("")}</tbody></table></div>`
      : '<div class="card muted">Nenhuma lacuna nos campos marcados.</div>'}`;
  $("#view").querySelectorAll("input[data-f]").forEach(c => c.onchange = () => {
    missState.fields = MISS.filter(f => f.key === c.dataset.f ? c.checked : missState.fields.includes(f.key)).map(f => f.key);
    try { localStorage.setItem("talents_missing_fields", JSON.stringify(missState.fields)); } catch {}
    renderMissing(); });
  $("#view").querySelectorAll("button[data-only]").forEach(b => b.onclick = () => { missState.only = b.dataset.only; renderMissing(); });
  const all = $("#missAll"); if (all) all.onclick = () => { missState.only = null; renderMissing(); };
  $("#missCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(shown.map(r => `${r.p.id} ${r.p.nome}`).join("\n")); toast("Lista copiada"); } catch { toast("Não foi possível copiar"); } };
  const tb = $("#view tbody"); if (tb) tb.onclick = e => { const tr = e.target.closest("tr.row"); if (tr) openDrawer(tr.dataset.id); };
}

// ----- change history (written by database triggers; read-only here, plus "undo") -----
const H = { rows: [], q: "" };
const H_TABLES = { pessoa:"Perfil", pessoa_privado:"Dados privados", formacao:"Formação", experiencia:"Experiência", iniciativa:"Iniciativa", interacao:"Interação", membro:"Convidado", admin:"Administrador", proposta_enriquecimento:"Proposta de enriquecimento" };
const H_UNDO = ["pessoa", "pessoa_privado", "formacao", "experiencia", "iniciativa", "interacao"];
const hPk = t => (t === "pessoa_privado" ? "pessoa_id" : "id");
const hShow = v => (v == null ? "vazio" : Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v));
const hCut = s => (s.length > 90 ? s.slice(0, 90) + "…" : s);

function hPerson(h) {
  const p = state.people.find(x => x.id === h.pessoa_id);
  if (p) return `${p.nome} (${p.id})`;
  const nome = h.tabela === "pessoa" ? (h.antes?.nome || h.depois?.nome) : null;
  return nome ? `${nome} (${h.pessoa_id})` : (h.pessoa_id || "");
}
function hSummary(h) {
  if (h.acao === "update") return Object.keys(h.depois || {}).map(k => `${k}: ${hCut(hShow(h.antes?.[k]))} → ${hCut(hShow(h.depois[k]))}`).join(" · ");
  const r = (h.acao === "insert" ? h.depois : h.antes) || {};
  const main = r.nome || r.universidade || r.organizacao || r.titulo || r.resumo || r.email || "";
  return (h.acao === "insert" ? "criado" : "apagado") + (main ? `: ${hCut(String(main))}` : "");
}

async function renderHistory() {
  $("#view").innerHTML = `<div class="muted">Carregando histórico…</div>`;
  const { data, error } = await db.from("historico").select("*").order("quando", { ascending: false }).limit(500);
  if (error) { $("#view").innerHTML = `<div class="card">Não foi possível carregar o histórico: ${esc(error.message)}</div>`; return; }
  H.rows = data || [];
  $("#view").innerHTML = `
    <div class="filters one"><input id="hq" type="search" aria-label="Filtrar histórico" placeholder="Filtrar por pessoa, quem alterou, tabela ou campo…" value="${esc(H.q)}"></div>
    <div class="count" id="hcount" role="status"></div>
    <div class="tablewrap"><table><thead><tr><th>Quando</th><th>Quem</th><th>O que</th><th>Pessoa</th><th>Mudança</th><th></th></tr></thead><tbody id="hbody"></tbody></table></div>
    <p class="muted">Mostra as últimas 500 alterações. O histórico é gravado pelo banco e não pode ser editado nem apagado por aqui.</p>`;
  const draw = () => {
    const q = H.q.toLowerCase();
    const rows = H.rows.filter(h => !q || [hPerson(h), h.quem_email, h.tabela, H_TABLES[h.tabela], h.acao, hSummary(h)].join(" ").toLowerCase().includes(q));
    $("#hcount").textContent = `${rows.length} de ${H.rows.length} alterações`;
    $("#hbody").innerHTML = rows.map(h => `<tr>
      <td class="nowrap">${esc(new Date(h.quando).toLocaleString("pt-BR"))}</td>
      <td>${esc(h.quem_email || "banco (sem login)")}</td>
      <td><span class="tag">${esc({ insert:"criou", update:"alterou", delete:"apagou" }[h.acao])}</span> ${esc(H_TABLES[h.tabela] || h.tabela)}</td>
      <td>${esc(hPerson(h))}</td>
      <td class="wrapcell histcell">${esc(hSummary(h))}</td>
      <td>${H_UNDO.includes(h.tabela) ? `<button data-undo="${h.id}">Desfazer</button>` : ""}</td></tr>`).join("");
  };
  draw();
  $("#hq").addEventListener("input", e => { H.q = e.target.value; draw(); });
  $("#hbody").onclick = e => { const b = e.target.closest("button[data-undo]"); if (b) undoChange(H.rows.find(x => String(x.id) === b.dataset.undo)); };
}

// Undo = write the old values back (this creates a new history entry, so nothing is lost).
async function undoChange(h) {
  if (!h) return;
  const t = h.tabela, pk = hPk(t);
  const what = { update: "voltar os campos alterados aos valores anteriores", insert: "apagar o que foi criado", delete: "recriar o que foi apagado" }[h.acao];
  if (!(await ask({ title: "Desfazer esta alteração?", body: `${hSummary(h)}\n\nIsso vai ${what}.`, ok: "Desfazer" }))) return;
  let q;
  if (h.acao === "update") q = db.from(t).update(h.antes).eq(pk, h.registro_id);
  else if (h.acao === "insert") q = db.from(t).delete().eq(pk, h.registro_id);
  else q = db.from(t).insert(h.antes);
  if (await run(q, "Alteração desfeita")) { await loadPeople(); renderHistory(); }
}

// ----- Enriquecer: propostas da IA (tabela proposta_enriquecimento). Nada vale até o dono aprovar aqui (regra 10) -----
// A função enriquecer-ia só guarda propostas pendentes, cada uma com fonte. Ao aprovar, esta página grava com o login do dono,
// preenche a coluna fonte (formação, experiência, iniciativa) e nunca sobrescreve um campo já preenchido sem a confirmação explícita.
const EN = { rows: [], showDone: false };
const EN_ALVO = { pessoa:"Perfil", formacao:"Formação", experiencia:"Experiência", iniciativa:"Iniciativa" };
const EN_ACAO = { preencher:"Preencher", corrigir:"Corrigir", adicionar:"Adicionar" };
const EN_CONF = { alta:"alta", media:"média", baixa:"baixa" };
const EN_LABEL = { linkedin:"LinkedIn", nivel:"Nível", ingles_fluente:"Inglês fluente", idiomas:"Idiomas", status:"Status", disponibilidade:"Disponibilidade", destaques:"Destaques",
  universidade:"Universidade", curso:"Curso", ano_inicio:"Ano de início", ano_formatura:"Ano de formatura", organizacao:"Organização", cargo:"Cargo", tipo:"Tipo",
  inicio:"Início", fim:"Fim", titulo:"Título", descricao:"Descrição", data:"Data", link:"Link" };
const EN_ENUM = { nivel:[NIVEIS, PT.nivel], ingles_fluente:[INGLES, PT.ingles], status:[STATUS, PT.status], disponibilidade:[DISP, PT.disp] };
const EN_TABLE = { formacao:"formacao", experiencia:"experiencia", iniciativa:"iniciativa" };
const EN_KEY = { formacao:"universidade", experiencia:"organizacao", iniciativa:"titulo" };
const enEmpty = (k, v) => v == null || v === "" || (Array.isArray(v) && !v.length) || (k === "ingles_fluente" && v === "Unknown");
const enSame = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const enShow = (k, v) => (v == null || v === "" ? "vazio" : Array.isArray(v) ? v.join(", ") : EN_ENUM[k] ? (EN_ENUM[k][1][v] ?? v) : String(v));
// Valor que está gravado no banco (formação e experiência passam por regras de grafia ao ler; o original fica em _u/_c/_o).
const enRaw = (cur, k) => cur[{ universidade:"_u", curso:"_c", organizacao:"_o" }[k]] ?? cur[k];

// Lê e valida o que está nos campos do cartão (o dono pode editar antes de aprovar). Devolve { dados } ou { erro }.
function enRead(card, pr) {
  const dados = {};
  for (const k of Object.keys(pr.dados)) {
    const el = card.querySelector(`[data-k="${k}"]`); if (!el) continue;
    const raw = el.value.trim();
    if (raw === "") { if (pr.acao === "adicionar" && ["universidade", "organizacao", "titulo"].includes(k)) return { erro: `${EN_LABEL[k]} não pode ficar vazio.` }; continue; }
    if (EN_ENUM[k]) { if (!EN_ENUM[k][0].includes(raw)) return { erro: `${EN_LABEL[k]}: valor inválido.` }; dados[k] = raw; }
    else if (k === "idiomas") { const a = list(raw); if (a) dados[k] = [...new Set(a)]; }
    else if (k === "ano_inicio" || k === "ano_formatura") { const n = Number(raw); if (!Number.isInteger(n) || n < 1950 || n > 2100) return { erro: `${EN_LABEL[k]}: use um ano entre 1950 e 2100.` }; dados[k] = n; }
    else if (k === "inicio" || k === "fim" || k === "data") { if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return { erro: `${EN_LABEL[k]}: use o formato AAAA-MM-DD.` }; dados[k] = raw; }
    else if (k === "link" || k === "linkedin") { if (!safeUrl(raw)) return { erro: `${EN_LABEL[k]}: use um endereço http(s).` }; dados[k] = raw; }
    else dados[k] = raw;
  }
  if (!Object.keys(dados).length) return { erro: "Nada para aplicar: todos os campos estão vazios." };
  return { dados };
}

function enField(pr, k, v) {
  const id = `en-${pr.id}-${k}`, dis = pr.status !== "pendente" ? " disabled" : "";
  let ctl;
  if (EN_ENUM[k]) ctl = `<select id="${id}" data-k="${k}"${dis}>${opts(EN_ENUM[k][0], v, true, EN_ENUM[k][1])}</select>`;
  else if (k === "destaques" || k === "descricao") ctl = `<textarea id="${id}" data-k="${k}"${dis}>${esc(v)}</textarea>`;
  else if (k === "ano_inicio" || k === "ano_formatura") ctl = `<input id="${id}" data-k="${k}" type="number" min="1950" max="2100" value="${esc(v)}"${dis}>`;
  else if (k === "inicio" || k === "fim" || k === "data") ctl = `<input id="${id}" data-k="${k}" type="date" value="${esc(v)}"${dis}>`;
  else ctl = `<input id="${id}" data-k="${k}" value="${esc(Array.isArray(v) ? v.join(", ") : v)}" autocomplete="off"${dis}>`;
  const atual = pr.acao === "adicionar" ? "" : `<span class="muted small">Hoje: ${esc(enShow(k, pr.valor_atual?.[k]))}</span>`;
  return `<label class="full">${esc(EN_LABEL[k] || k)}${atual}${ctl}</label>`;
}

function enCard(pr) {
  const p = state.people.find(x => x.id === pr.pessoa_id);
  const row = p && pr.registro_id ? (p[EN_TABLE[pr.alvo]] || []).find(x => x.id === pr.registro_id) : null;
  const alvoTxt = row ? (row[EN_KEY[pr.alvo]] || "") : "";
  const link = safeUrl(pr.fonte);
  const fonte = link ? `<a href="${esc(link)}" target="_blank" rel="noopener noreferrer">${esc(link)}</a>` : esc(pr.fonte);
  const done = pr.status !== "pendente";
  return `<div class="prop${done ? " done" : ""}" data-id="${pr.id}">
    <div class="prop-head"><b>${esc(p ? p.nome : pr.pessoa_id)}</b> <span class="muted">${esc(pr.pessoa_id)}</span>
      <span class="tag">${esc(EN_ACAO[pr.acao])} · ${esc(EN_ALVO[pr.alvo])}${alvoTxt ? ": " + esc(alvoTxt) : ""}</span>
      ${pr.confianca ? `<span class="tag">confiança ${esc(EN_CONF[pr.confianca])}</span>` : ""}
      ${done ? `<span class="tag">${pr.status === "aprovada" ? "aprovada" : "rejeitada"}</span>` : ""}</div>
    ${pr.acao === "corrigir" && !done ? '<div class="warn">Correção: o campo já tem valor. Só substitui se você aprovar e confirmar.</div>' : ""}
    <div class="grid2 prop-fields">${Object.entries(pr.dados).map(([k, v]) => enField(pr, k, v)).join("")}</div>
    <div class="prop-src"><span class="muted">Fonte:</span> ${fonte}</div>
    ${pr.justificativa ? `<div class="prop-why">${esc(pr.justificativa)}</div>` : ""}
    ${done ? "" : `<div class="row-actions flush"><button class="primary" data-ap="${pr.id}">Aprovar e gravar</button><button data-rj="${pr.id}">Rejeitar</button><span class="muted small" role="status"></span></div>`}
  </div>`;
}

async function renderEnrich() {
  $("#view").innerHTML = `<div class="muted">Carregando propostas…</div>`;
  const { data, error } = await db.from("proposta_enriquecimento").select("*").order("id", { ascending: false }).limit(300);
  if (error) { $("#view").innerHTML = `<div class="card">Não foi possível carregar as propostas: ${esc(error.message)}</div>`; return; }
  EN.rows = data || [];
  const pend = EN.rows.filter(r => r.status === "pendente"), shown = EN.showDone ? EN.rows : pend;
  $("#view").innerHTML = `
    <div class="card enask">
      <b>Pedir sugestões à IA</b>
      <div class="muted">A IA recebe só o nome, o LinkedIn (para identificar, não é aberto) e os dados públicos do perfil, procura fontes na web e propõe o que falta ou está errado. Nunca vê aniversário, cidades, hobbies, notas nem interações. Cada proposta chega com a fonte e fica pendente até você aprovar.</div>
      <label>Pessoa<input id="enPessoa" list="dl-pessoa" autocomplete="off" placeholder="Nome ou id (T012)"></label>
      <label>Texto de apoio (opcional: cole uma página pública ou um currículo; a fonte vira “texto colado pelo dono”)<textarea id="enCtx" maxlength="4000"></textarea></label>
      <div class="row-actions flush"><button class="primary" id="enGo">Buscar sugestões</button><span id="enStatus" class="muted" role="status"></span></div>
    </div>
    <div class="row-actions flush"><span class="count flush" id="enCount" role="status">${pend.length} proposta(s) pendente(s)</span>
      <label class="inline"><input type="checkbox" id="enDone" ${EN.showDone ? "checked" : ""}> Mostrar também aprovadas e rejeitadas</label></div>
    <div id="enList" class="enlist">${shown.length ? shown.map(enCard).join("") : '<div class="card muted">Nenhuma proposta pendente.</div>'}</div>`;
  $("#enDone").onchange = e => { EN.showDone = e.target.checked; renderEnrich(); };
  $("#enGo").onclick = enRun;
  $("#enList").onclick = e => {
    const a = e.target.closest("button[data-ap]"), r = e.target.closest("button[data-rj]");
    if (a) enApprove(EN.rows.find(x => String(x.id) === a.dataset.ap), a.closest(".prop"));
    if (r) enReject(EN.rows.find(x => String(x.id) === r.dataset.rj));
  };
}

async function enRun() {
  const st = $("#enStatus"), go = $("#enGo"), escolha = $("#enPessoa").value.trim(), ctx = $("#enCtx").value.trim();
  const alvo = state.people.find(p => p.id.toLowerCase() === escolha.toLowerCase()) || state.people.find(p => norm(p.nome) === norm(escolha));
  if (!alvo) { st.textContent = "Escolha uma pessoa da base."; return; }
  go.disabled = true; st.textContent = "Pesquisando na web… pode levar até um minuto.";
  try {
    const { data, error } = await db.functions.invoke("enriquecer-ia", { body: { pessoa_id: alvo.id, contexto: ctx } });
    if (error) { let msg = error.message; try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch {} st.textContent = "Erro: " + msg; return; }
    if (data?.erro) { st.textContent = "Erro: " + data.erro; return; }
    const extra = [...(data.avisos || []), ...(data.notas ? ["Nota da IA: " + data.notas] : [])];
    await renderEnrich();
    const s2 = $("#enStatus"); if (s2) s2.textContent = `${data.criadas} proposta(s) nova(s).` + (extra.length ? " " + extra.join(" ") : "");
  } finally { const g = $("#enGo"); if (g) g.disabled = false; }
}

async function enDecide(pr, status, dados) {
  const { data: s } = await db.auth.getSession();
  const patch = { status, decidido_em: new Date().toISOString(), decidido_por: s.session?.user?.id ?? null };
  if (dados) patch.dados = dados;
  return run(db.from("proposta_enriquecimento").update(patch).eq("id", pr.id));
}
async function enReject(pr) {
  if (pr && await enDecide(pr, "rejeitada")) { toast("Proposta rejeitada"); renderEnrich(); }
}

async function enApprove(pr, card) {
  if (!pr) return;
  const msg = card.querySelector("[role=status]"), say = t => { if (msg) msg.textContent = t; };
  const btn = card.querySelector("button[data-ap]"); btn.disabled = true;
  try {
    await loadPeople();   // dados novos: nada de decidir em cima de uma cópia velha
    const p = state.people.find(x => x.id === pr.pessoa_id);
    if (!p) { say("A pessoa não existe mais."); return; }
    const r = enRead(card, pr); if (r.erro) { say(r.erro); return; }
    const dados = r.dados, hoje = new Date().toISOString().slice(0, 10);
    const fonte = `IA: ${pr.fonte}, aprovada ${hoje}`.slice(0, 500);
    const isRow = pr.alvo !== "pessoa";
    if (pr.acao === "adicionar") {
      const tbl = EN_TABLE[pr.alvo], key = EN_KEY[pr.alvo];
      const row = { ...dados, pessoa_id: p.id, fonte };
      if (pr.alvo === "formacao") { row.universidade = canonWrite("universidade", row.universidade); row.curso = canonWrite("curso", row.curso); row.principal = !(p.formacao || []).length; }
      if (pr.alvo === "experiencia") row.organizacao = canonWrite("organizacao", row.organizacao);
      if ((p[tbl] || []).some(x => norm(x[key]) === norm(row[key]))) { say(`"${row[key]}" já consta no perfil. Rejeite esta proposta.`); return; }
      if (!(await run(db.from(tbl).insert(row)))) return;
    } else {
      const cur = isRow ? (p[EN_TABLE[pr.alvo]] || []).find(x => x.id === pr.registro_id) : p;
      if (!cur) { say("O item ao qual a proposta se refere não existe mais."); return; }
      const patch = {};
      for (const [k, v] of Object.entries(dados)) {
        const now = enRaw(cur, k);
        if (pr.acao === "preencher") {
          if (!enEmpty(k, now)) { say(`${EN_LABEL[k]} já foi preenchido desde a proposta. Rejeite-a ou peça outra.`); return; }
        } else if (!enSame(now, pr.valor_atual?.[k])) { say(`${EN_LABEL[k]} mudou desde a proposta. Rejeite-a e peça outra.`); return; }
        patch[k] = k === "curso" ? canonWrite("curso", v) : v;
      }
      if (pr.acao === "corrigir") {
        const lista = Object.entries(patch).map(([k, v]) => `• ${EN_LABEL[k]}: ${enShow(k, enRaw(cur, k))} → ${enShow(k, v)}`).join("\n");
        if (!(await ask({ title: "Substituir o valor atual?", body: `${lista}\n\nFonte: ${pr.fonte}\n\nO valor antigo fica na aba Histórico e pode ser desfeito lá.`, ok: "Substituir" }))) return;
      }
      if (isRow) patch.fonte = (cur.fonte ? `${cur.fonte}; ${fonte}` : fonte).slice(0, 500);
      if (!(await run(db.from(isRow ? EN_TABLE[pr.alvo] : "pessoa").update(patch).eq("id", isRow ? pr.registro_id : p.id)))) return;
    }
    if (await enDecide(pr, "aprovada", dados)) toast("Aprovada e gravada"); else toast("Gravado, mas não foi possível marcar a proposta como aprovada.");
    await loadPeople(); renderEnrich();
  } finally { btn.disabled = false; }
}

// ----- stats -----
// Charts are plain inline SVG/CSS (no library), so the strict Content-Security-Policy still holds.
function renderStats() {
  const P = state.people, n = P.length;
  const tally = fn => { const m = {}; P.forEach(p => { [].concat(fn(p)).forEach(k => { if (k) m[k] = (m[k]||0)+1; }); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
  const scoreOf = p => { const v = priv(p).nota_indicador; return v == null || v === "" ? null : Number(v); };
  const scores = P.map(scoreOf).filter(x => x != null);
  const avg = scores.length ? (scores.reduce((a,b)=>a+b,0)/scores.length) : null;
  const pct = (a, b) => b ? Math.round(a/b*100) : 0;
  const founders = P.filter(p => /Founder/.test(p.status||"")).length;
  const fluent = P.filter(p => p.ingles_fluente === "Yes").length;
  const tile = (v, l) => `<div class="tile"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;

  // Linhas: [rótulo, valor, texto opcional, chave de filtro opcional]. Com `campo`, as barras que têm chave viram botões que filtram a lista de pessoas.
  const hbars = (title, rows, max=8, note="", campo=null) => { const r = rows.slice(0,max), top = Math.max(...r.map(x=>x[1]), 1);
    return `<div class="card"><b>${title}</b>${note ? `<div class="muted small">${note}</div>` : ""}${r.map(([k,v,d,key]) => {
      const inner = `<span title="${esc(k)}">${esc(k)}</span><svg class="barfill" viewBox="0 0 100 1" preserveAspectRatio="none" aria-hidden="true"><rect width="${(v/top*100).toFixed(1)}" height="1"/></svg><span>${esc(d ?? v)}</span>`;
      return campo && key ? `<button type="button" class="bar barbtn" data-drill="${campo}" data-key="${esc(key)}" data-label="${esc(k)}" aria-label="${esc(k)}: ${v}. Filtrar a lista de pessoas">${inner}</button>` : `<div class="bar">${inner}</div>`; }).join("") || '<div class="muted">sem dados</div>'}</div>`; };

  // Agrupa valores de texto livre sem diferenciar caixa nem acentos; o rótulo é a grafia mais usada. Conta pessoas, não ocorrências.
  const group = fn => { const m = new Map();
    P.forEach(p => { const seen = new Set(); [].concat(fn(p)).forEach(raw => { const lab = squash(raw); if (!lab) return; const k = norm(lab); if (seen.has(k)) return; seen.add(k);
      const g = m.get(k) || { k, n:0, labs:{} }; g.n++; g.labs[lab] = (g.labs[lab]||0)+1; m.set(k, g); }); });
    return [...m.values()].map(g => [Object.entries(g.labs).sort((a,b)=>b[1]-a[1])[0][0], g.n, undefined, g.k]).sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0])); };
  // Os N primeiros mais uma linha "Outros" (soma do resto, sem filtro por clique).
  const topOthers = (rows, max=8) => { if (rows.length <= max) return rows; const rest = rows.slice(max); return rows.slice(0,max).concat([[`Outros (${rest.length})`, rest.reduce((a,x)=>a+x[1],0)]]); };
  const comN = (x, noun) => `${x} de ${n} pessoas com ${noun} preenchidos`;

  const langs = group(p => p.idiomas || []), hobs = group(p => priv(p).hobbies || []);
  const cityNow = group(p => DRILL.cidade_atual.get(p)), cityBirth = group(p => DRILL.cidade_nasc.get(p));
  const moved = P.filter(p => { const a = DRILL.cidade_atual.get(p)[0], b = DRILL.cidade_nasc.get(p)[0]; return a && b && norm(a) !== norm(b); }).length;
  const bothCities = P.filter(p => DRILL.cidade_atual.get(p)[0] && DRILL.cidade_nasc.get(p)[0]).length;
  const nLang = [0,1,2,3].map(i => [i === 3 ? "3 ou mais" : String(i), P.filter(p => { const c = new Set((p.idiomas||[]).map(x => norm(squash(x))).filter(Boolean)).size; return i === 3 ? c >= 3 : c === i; }).length]);

  const donut = (title, rows) => {
    const total = rows.reduce((a,r)=>a+r[1],0); if (!total) return `<div class="card"><b>${title}</b><div class="muted">sem dados</div></div>`;
    let r = rows.slice(0,6); const rest = rows.slice(6).reduce((a,x)=>a+x[1],0); if (rest) r = r.concat([["Outros", rest]]);
    const R = 15.9155; let off = 25;
    const arcs = r.map(([k,v],i) => { const d = v/total*100, el = `<circle class="s${i}" r="${R}" cx="21" cy="21" fill="none" stroke-width="6" stroke-dasharray="${d} ${100-d}" stroke-dashoffset="${off}"><title>${esc(k)}: ${v}</title></circle>`; off -= d; return el; }).join("");
    return `<div class="card"><b>${title}</b><div class="donutwrap"><svg viewBox="0 0 42 42" class="donut" role="img" aria-label="${esc(title)}">${arcs}<text x="21" y="22.6" text-anchor="middle" class="dtot">${total}</text></svg>
      <ul class="legend">${r.map(([k,v],i)=>`<li><i class="sw s${i}"></i><span>${esc(k)}</span><em>${v} · ${pct(v,total)}%</em></li>`).join("")}</ul></div></div>`; };

  const columns = (title, items, note="") => {
    if (!items.length) return `<div class="card"><b>${title}</b><div class="muted">sem dados</div></div>`;
    const top = Math.max(...items.map(x=>x[1]), 1), W = 360, H = 150, g = W/items.length, bw = Math.min(g*0.7, 34), step = Math.max(1, Math.ceil(30 / g));
    const bars = items.map(([k,v],i) => { const h = v/top*(H-34), x = i*g+(g-bw)/2, y = H-18-h;
      return `<rect class="col" x="${x}" y="${y}" width="${bw}" height="${h}" rx="2"><title>${esc(k)}: ${v}</title></rect><text x="${x+bw/2}" y="${y-4}" text-anchor="middle" class="cv">${v}</text><text x="${x+bw/2}" y="${H-4}" text-anchor="middle" class="cl">${i % step === 0 ? esc(k) : ""}</text>`; }).join("");
    return `<div class="card"><b>${title}</b>${note ? `<div class="muted small">${note}</div>` : ""}<svg viewBox="0 0 ${W} ${H}" class="colchart" role="img" aria-label="${esc(title)}">${bars}</svg></div>`; };

  // score histogram, 0.5-point bins
  const lo = scores.length ? Math.floor(Math.min(...scores)*2)/2 : 0, bins = [];
  for (let x = lo; x < 10; x += 0.5) bins.push([x.toFixed(1), scores.filter(v => v >= x && (x >= 9.5 ? v <= 10 : v < x+0.5)).length]);
  const histo = columns("Distribuição das notas", bins, "Nota do indicador, faixas de 0,5");

  // graduation years (main education)
  const years = tally(p => mainEdu(p).ano_formatura ? String(mainEdu(p).ano_formatura) : null).sort((a,b)=>a[0]-b[0]);
  const yearChart = columns("Ano de formatura", years, "Formação principal");
  const langCount = columns("Idiomas por pessoa", nLang, "Quantos idiomas cada pessoa tem informados (0 = nada preenchido)");

  // average score by university
  const byUni = {}; P.forEach(p => { const u = mainEdu(p).universidade, s = scoreOf(p); if (u && s != null) (byUni[u] ||= []).push(s); });
  const uniAvg = Object.entries(byUni).filter(([,a]) => a.length >= 2).map(([u,a]) => { const m = a.reduce((x,y)=>x+y,0)/a.length; return [u, m, `${m.toFixed(2)} (n=${a.length})`]; }).sort((a,b)=>b[1]-a[1]);

  // data completeness
  const fill = [
    ["LinkedIn", p => p.linkedin], ["Nível", p => p.nivel], ["Status", p => p.status], ["Disponibilidade", p => p.disponibilidade],
    ["Destaques", p => p.destaques], ["Idiomas", p => (p.idiomas||[]).length], ["Nota", p => scoreOf(p) != null], ["Nascimento", p => priv(p).data_nascimento],
    ["Cidade atual", p => priv(p).cidade_atual], ["Hobbies", p => (priv(p).hobbies||[]).length], ["Formação", p => (p.formacao||[]).length], ["Experiência", p => (p.experiencia||[]).length]
  ].map(([l,f]) => { const c = P.filter(f).length; return [l, c, `${pct(c,n)}%`]; }).sort((a,b)=>a[1]-b[1]);

  const orgs = tally(p => [...new Set((p.experiencia||[]).map(e => e.organizacao))]);

  $("#view").innerHTML = `
    <div class="tiles">
      ${tile(n, "pessoas")}${tile(avg == null ? "–" : avg.toFixed(2), "nota média")}${tile(pct(founders,n)+"%", `founders (${founders})`)}
      ${tile(pct(fluent,n)+"%", `inglês fluente (${fluent})`)}${tile(new Set(P.map(p=>mainEdu(p).universidade).filter(Boolean)).size, "universidades")}
      ${tile(P.reduce((a,p)=>a+(p.iniciativa||[]).length,0), "iniciativas")}
    </div>
    <div class="charts">
      ${histo}${yearChart}
      ${donut("Status", tally(p => pt("status", p.status)))}${donut("Nível", tally(p => pt("nivel", p.nivel)))}
      ${donut("Inglês fluente", tally(p => pt("ingles", p.ingles_fluente)))}${donut("Disponibilidade", tally(p => pt("disp", p.disponibilidade)))}
      ${hbars("Universidades", tally(p => mainEdu(p).universidade), 8)}
      ${hbars("Nota média por universidade", uniAvg, 8, "Só universidades com 2+ pessoas com nota")}
      ${hbars("Cursos", tally(p => mainEdu(p).curso), 8)}
      ${hbars("Empresas e organizações", orgs, 8)}
      ${hbars("Idiomas", topOthers(langs), 9, comN(P.filter(p => (p.idiomas||[]).length).length, "idiomas") + ". Clique numa barra para filtrar a lista", "idioma")}${langCount}
      ${hbars("Hobbies", topOthers(hobs), 9, comN(P.filter(p => (priv(p).hobbies||[]).length).length, "hobbies") + ". Dado privado. Clique para filtrar", "hobby")}
      ${hbars("Cidade atual", topOthers(cityNow), 9, comN(P.filter(p => DRILL.cidade_atual.get(p)[0]).length, "cidade atual") + ". Dado privado. Clique para filtrar", "cidade_atual")}
      ${hbars("Cidade de nascimento", topOthers(cityBirth), 9, comN(P.filter(p => DRILL.cidade_nasc.get(p)[0]).length, "cidade de nascimento") + (bothCities ? `. ${moved} de ${bothCities} com as duas cidades moram fora da cidade natal` : "") + ". Clique para filtrar", "cidade_nasc")}
      ${hbars("Preenchimento dos dados", fill, 12, "Quantas pessoas têm cada campo preenchido (menos preenchidos primeiro)")}
    </div>`;
  animateStats($("#view"));
  $("#view").onclick = e => { const b = e.target.closest("button[data-drill]"); if (!b) return;
    state.filters.drill = { campo: b.dataset.drill, key: b.dataset.key, rotulo: b.dataset.label }; state.view = "people"; renderView(); };
}

// Animações da aba Números: barras, colunas e cards entram por CSS (classe .anim); números dos cards contam até o valor e as fatias das rosquinhas
// desenham uma depois da outra (Web Animations API, permitida pela CSP). Pessoas que pedem menos movimento no sistema não veem nada disso.
function animateStats(root) {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  root.classList.remove("anim"); void root.offsetWidth; root.classList.add("anim");
  const ease = t => 1 - Math.pow(1 - t, 3);
  root.querySelectorAll(".tile b").forEach((b, i) => {
    const m = /^(\d+(?:\.\d+)?)(.*)$/.exec(b.textContent.trim()); if (!m) return;
    const to = parseFloat(m[1]), dec = (m[1].split(".")[1] || "").length, suf = m[2], t0 = performance.now() + i * 70, dur = 900;
    b.textContent = (0).toFixed(dec) + suf;
    const tick = now => { const t = Math.min(1, Math.max(0, (now - t0) / dur)); b.textContent = (to * ease(t)).toFixed(dec) + suf; if (t < 1) requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  });
  root.querySelectorAll("svg.donut").forEach((svg, k) => {
    let delay = 150 + k * 90;
    svg.querySelectorAll("circle").forEach(c => {
      const [d, rest] = c.getAttribute("stroke-dasharray").split(" ").map(Number), dur = Math.max(250, d * 14);
      c.animate([{ strokeDasharray: `0 ${d + rest}` }, { strokeDasharray: `${d} ${rest}` }], { duration: dur, delay, easing: "cubic-bezier(.22,.8,.3,1)", fill: "backwards" });
      delay += dur * 0.7;
    });
  });
}

// ---------- drawer ----------
// Um só botão "Salvar" no rodapé grava o perfil e os dados privados de uma vez; itens de formação, experiência etc. têm o próprio "Adicionar".
const D = { dirty: { perfil: false, priv: false }, lastRow: null };
const anyDirty = () => D.dirty.perfil || D.dirty.priv;
function markDirty() {
  const s = $("#dState"); if (!s) return;
  s.textContent = anyDirty() ? "Alterações não salvas" : "Tudo salvo"; s.classList.toggle("dirty", anyDirty());
}
// Adicionar ou apagar um item recarrega o painel e descartaria o que está digitado nos formulários.
async function confirmLoseDirty() {
  if (!anyDirty()) return true;
  return ask({ title: "Há alterações não salvas", body: "Se continuar, o que você editou em Perfil e Dados privados será perdido. Clique em Cancelar e use Salvar antes.", ok: "Continuar sem salvar", danger: true });
}

function openDrawer(id) {
  const p = state.people.find(x => x.id === id); if (!p) return;
  const dr = $("#drawer"), same = state.openId === id && !dr.classList.contains("hidden");
  const prevScroll = same ? ($("#dBody")?.scrollTop || 0) : 0;
  if (!same) D.lastRow = document.activeElement?.closest?.("tr.row")?.dataset.id || null;
  D.dirty = { perfil: false, priv: false };
  state.openId = id;
  const pv = priv(p), url = safeUrl(p.linkedin);
  const ini = (p.nome || "?").trim().split(/\s+/).map(w => w[0]).slice(0, 2).join("");
  dr.classList.remove("hidden"); $("#scrim").classList.remove("hidden");
  dr.innerHTML = `
    <div class="dh">
      <span class="avatar big" aria-hidden="true">${esc(ini)}</span>
      <div class="dh-main"><h2>${esc(p.nome)}</h2>
        <div class="dmeta"><span>${esc(p.id)}</span><span class="dot ${p.visibilidade === "rede" ? "on" : ""}">${esc(pt("vis", p.visibilidade))}</span>${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ""}</div></div>
      <button class="icon" id="dClose" aria-label="Fechar painel">✕</button></div>
    <div class="dtabs" role="navigation" aria-label="Seções do perfil">${[["perfil","Perfil"],["priv","Privado"],["formacao","Formação"],["experiencia","Experiência"],["iniciativa","Iniciativas"],["interacao","Interações"]]
      .map(([k, l], i) => `<button data-go="s-${k}" class="${i ? "" : "on"}">${l}</button>`).join("")}</div>
    <div class="db" id="dBody">
    <section class="sec" id="s-perfil"><h3>Perfil</h3>
    <form id="fPerfil" class="grid2">
      <label class="full">Nome<input name="nome" required value="${esc(p.nome)}"></label>
      <label class="full">LinkedIn / contato<input name="linkedin" value="${esc(p.linkedin)}"></label>
      <label>Nível<select name="nivel">${opts(NIVEIS, p.nivel, true, PT.nivel)}</select></label>
      <label>Inglês fluente?<select name="ingles_fluente">${opts(INGLES, p.ingles_fluente, false, PT.ingles)}</select></label>
      <label>Status<select name="status">${opts(STATUS, p.status, true, PT.status)}</select></label>
      <label>Disponibilidade<select name="disponibilidade">${opts(DISP, p.disponibilidade, true, PT.disp)}</select></label>
      <label class="full">Idiomas (separe por vírgula)<input name="idiomas" value="${esc((p.idiomas||[]).join(", "))}"></label>
      <label class="full">Destaques<textarea name="destaques">${esc(p.destaques)}</textarea></label>
      <label class="full">Visibilidade no diretório da rede (“Na rede” só com autorização da pessoa)<select name="visibilidade">${opts(["privada","rede"], p.visibilidade, false, PT.vis)}</select></label>
    </form></section>

    <section class="sec" id="s-priv"><h3>Dados privados <span class="lock">só você vê</span></h3>
    <form id="fPriv" class="grid2">
      <label>Data de nascimento<input type="date" name="data_nascimento" value="${esc(pv.data_nascimento)}"></label>
      <label>Nota do indicador<input type="number" step="0.1" name="nota_indicador" value="${esc(pv.nota_indicador)}"></label>
      <label>Cidade de nascimento<input name="cidade_nascimento" list="dl-cidade" autocomplete="off" value="${esc(pv.cidade_nascimento)}"></label>
      <label>Cidade atual<input name="cidade_atual" list="dl-cidade" autocomplete="off" value="${esc(pv.cidade_atual)}"></label>
      <label>Idade ao sair da casa dos pais<input type="number" name="idade_saida_casa_pais" value="${esc(pv.idade_saida_casa_pais)}"></label>
      <label>Indicado por<input name="indicado_por" list="dl-pessoa" autocomplete="off" value="${esc(pv.indicado_por)}"></label>
      <label>Nível de ambição (1 a 5, sua avaliação)<input type="number" min="1" max="5" step="1" name="nivel_ambicao" value="${esc(pv.nivel_ambicao)}"></label>
      <label class="full">Hobbies (separe por vírgula)<input name="hobbies" value="${esc((pv.hobbies||[]).join(", "))}"></label>
      <label class="full">Resumo curto (a IA lê este texto ao sugerir conexões; até 600 caracteres)<textarea name="resumo" maxlength="600">${esc(pv.resumo)}</textarea></label>
      <label class="full">Suas notas<textarea name="notas">${esc(pv.notas)}</textarea></label>
    </form></section>

    ${section("formacao","Formação", p.formacao, f => `<b>${esc(f.universidade)}</b>${f.principal?' <span class="tag">principal</span>':""}<small>${esc([f.curso, f.ano_inicio&&"início "+f.ano_inicio, f.ano_formatura&&"formatura "+f.ano_formatura].filter(Boolean).join(" · "))}</small>`,
      `<label>Universidade<input name="universidade" required list="dl-uni" autocomplete="off"></label><label>Curso<input name="curso" list="dl-curso" autocomplete="off"></label>
       <label>Ano de início<input type="number" name="ano_inicio"></label><label>Ano de formatura<input type="number" name="ano_formatura"></label>
       <label><span>Principal</span><input type="checkbox" name="principal"></label>`)}
    ${section("experiencia","Experiência", p.experiencia, e => `<b>${esc(e.organizacao)}</b><small>${esc([e.cargo, e.tipo, (e.inicio||e.fim)&&`${e.inicio||"?"} → ${e.fim||"atual"}`].filter(Boolean).join(" · "))}</small>`,
      `<label>Organização<input name="organizacao" required list="dl-org" autocomplete="off"></label><label>Cargo<input name="cargo"></label>
       <label>Tipo (empresa, startup, liga…)<input name="tipo" list="dl-tipo-exp" autocomplete="off"></label><label>Início<input type="date" name="inicio"></label><label>Fim<input type="date" name="fim"></label>`)}
    ${section("iniciativa","Iniciativas", p.iniciativa, i => `<b>${esc(i.titulo)}</b><small>${esc([i.tipo, i.data].filter(Boolean).join(" · "))} ${esc(i.descricao)}</small>`,
      `<label>Título<input name="titulo" required></label><label>Tipo<input name="tipo" list="dl-tipo-ini" autocomplete="off"></label><label>Data<input type="date" name="data"></label>
       <label>Link<input name="link"></label><label class="full">Descrição<textarea name="descricao"></textarea></label>`)}
    ${section("interacao","Interações (seu histórico de contato)", (p.interacao||[]).slice().sort((a,b)=>String(b.data||"").localeCompare(String(a.data||""))),
      i => `<b>${esc(i.data||"sem data")}</b> ${i.canal?`<span class="tag">${esc(i.canal)}</span>`:""}<small>${esc(i.resumo)} ${i.proximo_passo?`→ ${esc(pt("prox", i.proximo_passo))}${i.data_proximo_passo?" ("+esc(i.data_proximo_passo)+")":""}`:""}</small>`,
      `<label>Data<input type="date" name="data"></label><label>Canal (WhatsApp, LinkedIn…)<input name="canal" list="dl-canal" autocomplete="off"></label>
       <label class="full">Resumo<textarea name="resumo"></textarea></label>
       <label>Próximo passo<select name="proximo_passo">${opts(PROX, "", true, PT.prox)}</select></label><label>Data do próximo passo<input type="date" name="data_proximo_passo"></label>`)}
    </div>
    <div class="df">
      <button class="danger txt" id="dDelete">Excluir pessoa</button><span class="grow"></span>
      <span class="state" id="dState" role="status">Tudo salvo</span>
      <button id="dCancel">Fechar</button><button class="primary" id="dSave">Salvar</button>
    </div>`;

  const body = $("#dBody");
  if (prevScroll) body.scrollTo({ top: prevScroll, behavior: "instant" });
  if (!same) dr.focus();

  // abas: rolam até a seção e acompanham a rolagem
  const tabs = [...dr.querySelectorAll(".dtabs button")];
  tabs.forEach(b => b.onclick = () => { const t = $("#" + b.dataset.go, dr); if (t) body.scrollTo({ top: t.offsetTop - body.offsetTop - 8 }); });
  body.addEventListener("scroll", () => {
    let cur = 0; [...body.querySelectorAll(".sec")].forEach((s, i) => { if (s.offsetTop - body.offsetTop - 24 <= body.scrollTop) cur = i; });
    tabs.forEach((b, i) => b.classList.toggle("on", i === cur));
  }, { passive: true });

  $("#fPerfil").addEventListener("input", () => { D.dirty.perfil = true; markDirty(); });
  $("#fPriv").addEventListener("input", () => { D.dirty.priv = true; markDirty(); });
  ["#fPerfil", "#fPriv"].forEach(s => { const f = $(s); f.onsubmit = e => e.preventDefault();
    f.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.tagName === "INPUT" && !e.isComposing) { e.preventDefault(); saveDrawer(p); } }); });
  $("#dClose").onclick = $("#dCancel").onclick = requestClose;
  $("#scrim").onclick = requestClose;
  $("#dSave").onclick = () => saveDrawer(p);

  dr.querySelectorAll("form[data-table]").forEach(f => f.onsubmit = async e => { e.preventDefault();
    if (!(await confirmLoseDirty())) return;
    const d = new FormData(f), row = { pessoa_id:id };
    for (const [k,v] of d.entries()) row[k] = ["ano_inicio","ano_formatura"].includes(k) ? num(v) : val(String(v).trim());
    if (f.dataset.table === "formacao") { row.principal = !!d.get("principal"); row.universidade = canonWrite("universidade", row.universidade); row.curso = canonWrite("curso", row.curso); }
    if (f.dataset.table === "experiencia") row.organizacao = canonWrite("organizacao", row.organizacao);
    if (await run(db.from(f.dataset.table).insert(row), "Adicionado")) reload(); });
  dr.querySelectorAll("button[data-del]").forEach(b => b.onclick = async () => {
    if (!(await confirmLoseDirty())) return;
    if (!(await ask({ title: "Apagar este item?", body: "Ele some do perfil. A aba Histórico guarda o registro e permite desfazer.", ok: "Apagar", danger: true }))) return;
    if (await run(db.from(b.dataset.table).delete().eq("id", b.dataset.del), "Apagado")) reload(); });
  $("#dDelete").onclick = async () => {
    const n = k => (p[k] || []).length;
    const ok = await ask({ title: `Apagar ${p.nome}?`, ok: "Apagar pessoa", danger: true,
      body: `Isso também apaga tudo ligado a esta pessoa:\n• ${n("formacao")} formação(ões)\n• ${n("experiencia")} experiência(s)\n• ${n("iniciativa")} iniciativa(s)\n• ${n("interacao")} interação(ões)\n\nNão dá para desfazer por completo.` });
    if (!ok) return;
    if (await run(db.from("pessoa").delete().eq("id", id), "Pessoa apagada")) { closeDrawer(); reload(false); } };
}
function section(table, title, items, render, formFields) {
  return `<section class="sec" id="s-${table}"><h3>${title}</h3>${(items||[]).map(i => `<div class="item"><div>${render(i)}</div><button class="danger txt" data-table="${table}" data-del="${esc(i.id)}">Apagar</button></div>`).join("") || '<div class="muted">Nada ainda.</div>'}
    <details class="addbox"><summary>Adicionar</summary><form data-table="${table}" class="grid2 addform">${formFields}<div class="full row-actions"><button class="primary">Adicionar</button></div></form></details></section>`;
}

async function savePerfil(p) {
  const id = p.id, d = new FormData($("#fPerfil"));
  const nomeNovo = squash(d.get("nome")), li = squash(d.get("linkedin"));
  if (!nomeNovo) { toast("O nome não pode ficar vazio."); return "error"; }
  if (li && li !== (p.linkedin || "")) {
    const dup = state.people.find(x => x.id !== id && x.linkedin && normLinkedin(x.linkedin) === normLinkedin(li));
    if (dup && !(await ask({ title: "Esse LinkedIn/contato já existe", body: `Já está em ${dup.id} · ${dup.nome}.`, ok: "Salvar mesmo assim" }))) return "cancel";
  }
  if (norm(nomeNovo) !== norm(p.nome)) {
    const sim = similarPeople(nomeNovo, id);
    if (sim.length && !(await ask({ title: "Já existe nome parecido", body: simText(sim), ok: "Salvar mesmo assim" }))) return "cancel";
  }
  const ok = await run(db.from("pessoa").update({ nome:nomeNovo, linkedin:val(li), nivel:val(d.get("nivel")), ingles_fluente:d.get("ingles_fluente"),
    status:val(d.get("status")), disponibilidade:val(d.get("disponibilidade")), idiomas:list(d.get("idiomas")), destaques:val(d.get("destaques")), visibilidade:d.get("visibilidade") }).eq("id", id));
  if (ok) D.dirty.perfil = false;
  return ok ? "ok" : "error";
}
async function savePriv(id) {
  const d = new FormData($("#fPriv"));
  const cn = canonCity(d.get("cidade_nascimento")), ca = canonCity(d.get("cidade_atual")), sem = [cn, ca].filter(c => c && !cityCoord(c));
  const ok = await run(db.from("pessoa_privado").upsert({ pessoa_id:id, data_nascimento:val(d.get("data_nascimento")), nota_indicador:num(d.get("nota_indicador")),
    cidade_nascimento:cn, cidade_atual:ca, idade_saida_casa_pais:num(d.get("idade_saida_casa_pais")),
    indicado_por:val(d.get("indicado_por")), hobbies:list(d.get("hobbies")), notas:val(d.get("notas")),
    nivel_ambicao:num(d.get("nivel_ambicao")), resumo:val(d.get("resumo")) }, { onConflict:"pessoa_id" }));
  if (ok) D.dirty.priv = false;
  return { st: ok ? "ok" : "error", sem };
}
async function saveDrawer(p) {
  if (!anyDirty()) { toast("Nada para salvar"); return; }
  const btn = $("#dSave"); btn.disabled = true;
  try {
    let sem = [];
    if (D.dirty.perfil && (await savePerfil(p)) !== "ok") { markDirty(); return; }
    if (D.dirty.priv) { const r = await savePriv(p.id); if (r.st !== "ok") { markDirty(); return; } sem = r.sem; }
    toast("Salvo" + (sem.length ? ` · ${[...new Set(sem)].join(", ")} não aparece(m) no globo (falta em CITY_DATA, viz.js)` : ""));
    await reload();
  } finally { const b = $("#dSave"); if (b) b.disabled = false; }
}

async function requestClose() {
  if (anyDirty() && !(await ask({ title: "Descartar alterações?", body: "Você editou este perfil e ainda não salvou.", ok: "Descartar", cancel: "Continuar editando", danger: true }))) return;
  closeDrawer();
}
function closeDrawer() {
  state.openId = null; D.dirty = { perfil: false, priv: false };
  $("#drawer").classList.add("hidden"); $("#scrim").classList.add("hidden");
  const row = D.lastRow && document.querySelector(`tr.row[data-id="${CSS.escape(D.lastRow)}"]`); if (row) row.focus();
}

// ---------- new person ----------
$("#btnNew").onclick = async () => {
  const nome = await ask({ title: "Nova pessoa", body: "Digite o nome completo.", ok: "Criar", input: { label: "Nome completo", placeholder: "Nome completo" } });
  if (!nome) return;
  const sim = similarPeople(nome);
  if (sim.length && !(await ask({ title: "Já existe nome parecido", body: simText(sim), ok: "Criar mesmo assim" }))) return;
  const id = nextId();
  if (await run(db.from("pessoa").insert({ id, nome:squash(nome) }), `Criada ${id}`)) { await loadPeople(); renderView(); openDrawer(id); }
};

// ---------- AI chat (the AI only proposes; this page saves after you confirm) ----------
const AI = { proposta: null };
const nextId = () => "T" + String(state.people.reduce((m,p) => Math.max(m, parseInt(String(p.id).replace(/\D/g,"")) || 0), 0) + 1).padStart(3, "0");
const S = v => (v == null ? null : (String(v).trim() || null));
const I = v => (v == null || v === "" || !Number.isInteger(Number(v)) ? null : Number(v));
const DT = v => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);
const compact = o => Object.fromEntries(Object.entries(o).filter(([,v]) => v != null && !(Array.isArray(v) && !v.length)));
const strs = a => (Array.isArray(a) ? a.map(S).filter(Boolean) : []);

function sanitize(p) {
  const avisos = strs(p.avisos);
  const pe = p.pessoa || {}, pv = p.privado || {};
  const pessoa = compact({ nome:S(pe.nome), linkedin:S(pe.linkedin), nivel:NIVEIS.includes(pe.nivel)?pe.nivel:null,
    ingles_fluente:INGLES.includes(pe.ingles_fluente)?pe.ingles_fluente:null, idiomas:strs(pe.idiomas),
    status:STATUS.includes(pe.status)?pe.status:null, disponibilidade:DISP.includes(pe.disponibilidade)?pe.disponibilidade:null, destaques:S(pe.destaques) });
  const nota = pv.nota_indicador == null || pv.nota_indicador === "" ? null : Number(pv.nota_indicador);
  const bd = pv.data_nascimento ? DT(pv.data_nascimento) : null;
  if (pv.data_nascimento && !bd) avisos.push("Data de nascimento descartada (formato inválido).");
  const privado = compact({ data_nascimento:bd, cidade_nascimento:canonCity(S(pv.cidade_nascimento)), cidade_atual:canonCity(S(pv.cidade_atual)),
    idade_saida_casa_pais:I(pv.idade_saida_casa_pais), hobbies:strs(pv.hobbies), indicado_por:S(pv.indicado_por), notas:S(pv.notas),
    nota_indicador:(nota != null && !isNaN(nota) && nota >= 0 && nota <= 10) ? nota : null });
  const arr = (a, fn, req) => (Array.isArray(a) ? a.map(x => compact(fn(x || {}))).filter(x => x[req]) : []);
  return {
    acao: p.acao === "atualizar" ? "atualizar" : "criar", pessoa_id: S(p.pessoa_id), pessoa, privado, avisos,
    formacao: arr(p.formacao, x => ({ universidade:canonWrite("universidade", S(x.universidade)), curso:canonWrite("curso", S(x.curso)), ano_inicio:I(x.ano_inicio), ano_formatura:I(x.ano_formatura), principal:x.principal === true ? true : null }), "universidade"),
    experiencia: arr(p.experiencia, x => ({ organizacao:canonWrite("organizacao", S(x.organizacao)), cargo:S(x.cargo), tipo:S(x.tipo), inicio:DT(x.inicio), fim:DT(x.fim), notas:S(x.notas) }), "organizacao"),
    iniciativa: arr(p.iniciativa, x => ({ titulo:S(x.titulo), descricao:S(x.descricao), tipo:S(x.tipo), data:DT(x.data), link:S(x.link) }), "titulo"),
    interacao: (Array.isArray(p.interacao) ? p.interacao : []).map(x => compact({ data:DT(x?.data), canal:S(x?.canal), resumo:S(x?.resumo),
      proximo_passo:PROX.includes(x?.proximo_passo)?x.proximo_passo:null, data_proximo_passo:DT(x?.data_proximo_passo) })).filter(x => Object.keys(x).length),
  };
}

function targetOf(p) { return p.acao === "atualizar" ? state.people.find(x => x.id === p.pessoa_id) : null; }

function renderPreview() {
  const p = AI.proposta, box = $("#aiPreview"); if (!p) { box.innerHTML = ""; return; }
  const alvo = targetOf(p), avisos = [...p.avisos];
  if (p.acao === "atualizar" && !alvo) avisos.push("A IA indicou atualizar uma pessoa que não existe; será criada como nova.");
  if (!p.pessoa.nome && !alvo) avisos.push("Sem nome: não dá para criar a pessoa.");
  if (!alvo && p.pessoa.nome) { const sim = similarPeople(p.pessoa.nome); if (sim.length) avisos.push("Já existe pessoa parecida (" + sim.map(x => x.id + " · " + x.nome).join("; ") + "). Se for a mesma, descarte e peça para atualizar."); }
  const L = { nome:"Nome", linkedin:"LinkedIn", nivel:"Nível", ingles_fluente:"Inglês fluente", idiomas:"Idiomas", status:"Status", disponibilidade:"Disponibilidade", destaques:"Destaques",
    data_nascimento:"Nascimento", cidade_nascimento:"Cidade de nascimento", cidade_atual:"Cidade atual", idade_saida_casa_pais:"Idade ao sair de casa", hobbies:"Hobbies",
    indicado_por:"Indicado por", notas:"Notas", nota_indicador:"Nota do indicador", universidade:"Universidade", curso:"Curso", ano_inicio:"Início", ano_formatura:"Formatura",
    principal:"Principal", organizacao:"Organização", cargo:"Cargo", tipo:"Tipo", inicio:"Início", fim:"Fim", titulo:"Título", descricao:"Descrição", data:"Data", link:"Link",
    canal:"Canal", resumo:"Resumo", proximo_passo:"Próximo passo", data_proximo_passo:"Data do próximo passo" };
  const dl = o => `<dl>${Object.entries(o).map(([k,v]) => `<dt>${esc(L[k]||k)}</dt><dd>${esc(Array.isArray(v) ? v.join(", ") : v === true ? "sim" : v)}</dd>`).join("")}</dl>`;
  const group = (t, items) => items.length ? `<h4>${t}</h4>${items.map(dl).join('<hr>')}` : "";
  const head = alvo ? `Atualizar <b>${esc(alvo.id)}</b> · ${esc(alvo.nome)}` : `Nova pessoa <b>${esc(nextId())}</b>`;
  box.innerHTML = `<div class="preview"><div>${head}</div>
      ${group("Perfil", Object.keys(p.pessoa).length ? [p.pessoa] : [])}${group("Dados privados", Object.keys(p.privado).length ? [p.privado] : [])}
      ${group("Formação", p.formacao)}${group("Experiência", p.experiencia)}${group("Iniciativas", p.iniciativa)}${group("Interações", p.interacao)}</div>
    ${avisos.map(a => `<div class="warn">${esc(a)}</div>`).join("")}
    <div class="row-actions"><button class="primary" id="aiSave" ${(!p.pessoa.nome && !alvo) ? "disabled" : ""}>Confirmar e salvar</button><button id="aiDiscard">Descartar</button></div>`;
  $("#aiDiscard").onclick = () => { AI.proposta = null; renderPreview(); };
  $("#aiSave").onclick = saveProposal;
}

async function analyze() {
  const texto = $("#aiText").value.trim(); if (!texto) return;
  const go = $("#aiGo"), st = $("#aiStatus"); go.disabled = true; st.textContent = "Analisando…"; AI.proposta = null; renderPreview();
  try {
    const { data, error } = await db.functions.invoke("cadastro-ia", { body: { texto } });
    if (error) { let msg = error.message; try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch {} st.textContent = "Erro: " + msg; return; }
    if (data?.erro) { st.textContent = "Erro: " + data.erro; return; }
    AI.proposta = sanitize(data.proposta || {}); st.textContent = "Confira abaixo antes de salvar."; renderPreview();
  } finally { go.disabled = false; }
}

async function saveProposal() {
  const p = AI.proposta; if (!p) return;
  const btn = $("#aiSave"); btn.disabled = true;
  let alvo = targetOf(p), id;
  const fail = () => { btn.disabled = false; return false; };
  if (alvo) {
    id = alvo.id;
    const patch = { ...p.pessoa }; delete patch.nome;
    if (patch.idiomas) patch.idiomas = [...new Set([...(alvo.idiomas || []), ...patch.idiomas])];
    if (Object.keys(patch).length && !(await run(db.from("pessoa").update(patch).eq("id", id)))) return fail();
  } else {
    id = nextId();
    if (!(await run(db.from("pessoa").insert({ id, ...p.pessoa })))) return fail();
  }
  const pvOld = alvo ? priv(alvo) : {};
  if (Object.keys(p.privado).length) {
    const pv = { ...p.privado }; if (pv.hobbies) pv.hobbies = [...new Set([...(pvOld.hobbies || []), ...pv.hobbies])];
    if (!(await run(db.from("pessoa_privado").upsert({ pessoa_id:id, ...pv }, { onConflict:"pessoa_id" })))) return fail();
  }
  const has = (items, key, v) => (items || []).some(x => String(x[key] || "").toLowerCase() === String(v).toLowerCase());
  const forms = p.formacao.filter(x => !alvo || !has(alvo.formacao, "universidade", x.universidade));
  const hadMain = alvo && (alvo.formacao || []).some(f => f.principal);
  forms.forEach((f, i) => { if (!hadMain && i === 0 && !forms.some(x => x.principal)) f.principal = true; if (hadMain) delete f.principal; });
  const batches = [["formacao", forms], ["experiencia", p.experiencia.filter(x => !alvo || !has(alvo.experiencia, "organizacao", x.organizacao))],
    ["iniciativa", p.iniciativa.filter(x => !alvo || !has(alvo.iniciativa, "titulo", x.titulo))], ["interacao", p.interacao]];
  for (const [table, rows] of batches) {
    if (rows.length && !(await run(db.from(table).insert(rows.map(r => ({ pessoa_id:id, ...r })))))) return fail();
  }
  AI.proposta = null; $("#aiText").value = ""; $("#aiStatus").textContent = ""; renderPreview();
  $("#ai").classList.add("hidden"); toast(alvo ? `${id} atualizada` : `${id} criada`);
  await loadPeople(); renderView(); openDrawer(id);
}

// ---- Sugerir conexões (função conectar-ia: só lê, não grava nada) ----
async function suggestConnections() {
  const st = $("#connStatus"), out = $("#connOut"), go = $("#connGo");
  const escolha = $("#connPessoa").value.trim(), desc = $("#connDesc").value.trim(), objetivo = $("#connObj").value.trim();
  let alvo = null;
  if (escolha) {
    alvo = state.people.find(p => p.id.toLowerCase() === escolha.toLowerCase()) || state.people.find(p => norm(p.nome) === norm(escolha));
    if (!alvo) { st.textContent = "Pessoa não encontrada na base. Escolha uma da lista ou limpe o campo."; return; }
  } else if (!desc) { st.textContent = "Escolha uma pessoa ou descreva-a."; return; }
  go.disabled = true; st.textContent = "Analisando…"; out.innerHTML = "";
  try {
    const body = alvo ? { pessoa_id: alvo.id, objetivo } : { descricao: desc, objetivo };
    const { data, error } = await db.functions.invoke("conectar-ia", { body });
    if (error) { let msg = error.message; try { const j = await error.context.json(); if (j?.erro) msg = j.erro; if (j?.diagnostico) msg += ` (parou por ${j.diagnostico.parou_por}; blocos: ${(j.diagnostico.blocos||[]).join(", ")}${j.diagnostico.texto ? "; texto: " + j.diagnostico.texto : ""})`; } catch {} st.textContent = "Erro: " + msg; return; }
    if (data?.erro) { st.textContent = "Erro: " + data.erro; return; }
    const sug = data.sugestoes || [];
    const u = data.uso || {};
    st.textContent = `${sug.length} sugestão(ões) · ${data.perfis_analisados} perfis analisados · ${(u.entrada||0)+(u.cache||0)} tokens de entrada (${u.cache||0} do cache), ${u.saida||0} de saída`;
    const dg = data.diagnostico;
    out.innerHTML = (sug.length ? "" : `<div class="muted">Nenhuma sugestão boa.${dg ? ` Diagnóstico: parou por ${esc(dg.parou_por)}; blocos: ${esc((dg.blocos||[]).join(", ") || "nenhum")}${dg.texto ? `; texto da IA: ${esc(dg.texto)}` : ""}.` : ""}</div>`) + sug.map(s => {
      const p = state.people.find(x => x.id === s.id);
      return `<div class="connItem" data-id="${esc(s.id)}"><div><b>${esc(p ? p.nome : (s.nome || s.id))}</b> <span class="muted">${esc(s.id)}</span></div>
        <div><span class="tag">${esc(s.relacao)}</span> ${s.papel ? `<span class="tag">${esc(s.papel)}</span> ` : ""}<span class="tag">confiança ${esc(s.confianca)}</span></div>
        <div>${esc(s.motivo)}</div></div>`; }).join("") + (data.observacao ? `<div class="muted">${esc(data.observacao)}</div>` : "");
  } finally { go.disabled = false; }
}
$("#btnConn").onclick = () => { $("#conn").classList.remove("hidden"); $("#connPessoa").focus(); };
$("#connClose").onclick = () => $("#conn").classList.add("hidden");
$("#connGo").onclick = suggestConnections;
$("#connOut").onclick = e => { const it = e.target.closest(".connItem"); if (it) { $("#conn").classList.add("hidden"); openDrawer(it.dataset.id); } };

$("#btnAI").onclick = () => { $("#ai").classList.remove("hidden"); $("#aiText").focus(); };
$("#aiClose").onclick = () => $("#ai").classList.add("hidden");
$("#aiGo").onclick = analyze;
$("#aiText").addEventListener("keydown", e => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) analyze(); });

// ---------- backup reminder (date is kept in this browser only) ----------
function updateBackupWarn() {
  let t = 0; try { t = Number(localStorage.getItem("talents_last_backup")) || 0; } catch {}
  const days = t ? Math.floor((Date.now() - t) / 86400000) : null, el = $("#backupWarn");
  if (days !== null && days < 7) { el.classList.add("hidden"); return; }
  el.textContent = days === null ? "Nenhum backup baixado neste navegador. O plano gratuito não faz backup automático: use o botão Backup."
    : `Último backup neste navegador: há ${days} dias. Use o botão Backup.`;
  el.classList.remove("hidden");
}

// ---------- "Padronizar nomes": alias rules ----------
function aliasPending() {
  const out = [];
  state.people.forEach(p => {
    (p.formacao || []).forEach(f => {
      if (f._u !== f.universidade) out.push({ table: "formacao", id: f.id, field: "universidade", from: f._u, to: f.universidade });
      if (f._c !== f.curso) out.push({ table: "formacao", id: f.id, field: "curso", from: f._c, to: f.curso });
    });
    (p.experiencia || []).forEach(e => { if (e._o !== e.organizacao) out.push({ table: "experiencia", id: e.id, field: "organizacao", from: e._o, to: e.organizacao }); });
  });
  return out;
}
function renderAlias() {
  const pend = aliasPending(), groups = {};
  pend.forEach(x => { const k = `${x.from} → ${x.to}`; groups[k] = (groups[k] || 0) + 1; });
  const rules = Object.entries(ALIAS_TIPOS).map(([t, label]) => {
    const rows = (state.aliasRows || []).filter(r => r.tipo === t);
    return rows.length ? `<h4 class="muted subh">${label}</h4>` + rows.map(r =>
      `<div class="arule"><span>${esc(r.alias)} <em>→</em> ${esc(r.canonico)}</span><button class="danger" data-adel="${esc(r.id)}">Remover</button></div>`).join("") : "";
  }).join("");
  $("#aliasBox").innerHTML = `
    <div class="boxhead"><h2>Padronizar nomes</h2><button id="aliasClose">Fechar</button></div>
    <div class="muted">Uma regra diz: “quando aparecer esta grafia, trate como o nome oficial”. Vale ao ler os dados, ao salvar e na IA de cadastro. Os registros antigos só mudam no banco se você pedir (botão abaixo).</div>
    <form id="aliasForm" class="grid2">
      <label>Tipo<select name="tipo">${Object.entries(ALIAS_TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
      <label>Grafia a substituir<input name="alias" required autocomplete="off" list="dl-uni"></label>
      <label class="full">Nome oficial<input name="canonico" required autocomplete="off" list="dl-uni"></label>
      <div class="full row-actions"><button class="primary">Adicionar regra</button></div>
    </form>
    ${pend.length ? `<div class="banner">${pend.length} registro(s) ainda gravados com a grafia antiga:<br>${Object.entries(groups).map(([k, n]) => `• ${esc(k)} (${n})`).join("<br>")}<div class="row-actions"><button class="primary" id="aliasApply">Aplicar no banco</button></div></div>` : ""}
    <div>${rules || '<div class="muted">Nenhuma regra ainda.</div>'}</div>`;
  const form = $("#aliasForm");
  form.tipo.onchange = () => form.querySelectorAll("input[list]").forEach(i => i.setAttribute("list", DL_BY_TIPO[form.tipo.value]));
  $("#aliasClose").onclick = () => $("#alias").classList.add("hidden");
  form.onsubmit = async e => {
    e.preventDefault(); const d = new FormData(form), tipo = d.get("tipo"), alias = squash(d.get("alias")), canonico = squash(d.get("canonico"));
    const rows = (state.aliasRows || []).filter(r => r.tipo === tipo);
    if (norm(alias) === norm(canonico)) { toast("A grafia e o nome oficial são iguais."); return; }
    if (rows.some(r => norm(r.alias) === norm(canonico))) { toast("Esse nome oficial já é grafia de outra regra. Use o nome final."); return; }
    if (rows.some(r => norm(r.canonico) === norm(alias))) { toast("Essa grafia já é nome oficial de outra regra. Remova a outra primeiro."); return; }
    if (await run(db.from("alias_nome").insert({ tipo, alias, canonico }), "Regra adicionada")) { await loadPeople(); renderView(); renderAlias(); }
  };
  $("#aliasBox").querySelectorAll("button[data-adel]").forEach(b => b.onclick = async () => {
    if (await run(db.from("alias_nome").delete().eq("id", b.dataset.adel), "Regra removida")) { await loadPeople(); renderView(); renderAlias(); } });
  const ap = $("#aliasApply");
  if (ap) ap.onclick = async () => {
    if (!(await ask({ title: `Atualizar ${pend.length} registro(s) no banco?`, ok: "Atualizar",
      body: `${Object.entries(groups).map(([k, n]) => `• ${k} (${n})`).join("\n")}\n\nCada mudança fica registrada na aba Histórico e pode ser desfeita lá.` }))) return;
    let ok = 0;
    for (const x of pend) { const { error } = await db.from(x.table).update({ [x.field]: x.to }).eq("id", x.id); if (error) { toast("Erro: " + error.message); break; } ok++; }
    toast(`${ok} registro(s) atualizado(s)`); await loadPeople(); renderView(); renderAlias();
  };
}
$("#btnAlias").onclick = () => { renderAlias(); $("#alias").classList.remove("hidden"); };

// ---------- start ----------
const showOnly = id => { ["#login", "#app"].forEach(s => $(s).classList.add("hidden")); $(id).classList.remove("hidden"); };
function showApp() { showOnly("#app"); }
function showLogin() { showOnly("#login"); }
document.querySelectorAll("nav button").forEach(b => b.onclick = () => { state.view = b.dataset.view; renderView(); });

// ---------- backup (downloads everything as one JSON file) ----------
async function fetchAll(table) {
  const rows = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await db.from(table).select("*").range(i, i + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data); if (data.length < 1000) return rows;
  }
}
async function backup() {
  const btn = $("#btnBackup"); btn.disabled = true;
  try {
    const out = { exportado_em: new Date().toISOString() };
    for (const t of ["pessoa", "pessoa_privado", "formacao", "experiencia", "iniciativa", "interacao", "historico", "alias_nome"]) out[t] = await fetchAll(t);
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
    a.download = `talents-backup-${out.exportado_em.slice(0, 10)}.json`; a.click();
    try { localStorage.setItem("talents_last_backup", String(Date.now())); } catch {}
    updateBackupWarn();
    toast(`Backup baixado (${out.pessoa.length} pessoas)`);
  } catch (e) { toast("Erro no backup: " + e.message); } finally { btn.disabled = false; }
}

// ---------- sign out after 30 minutes without activity ----------
let idleTimer = null, idleBound = false;
function startIdle() {
  const reset = () => { clearTimeout(idleTimer); idleTimer = setTimeout(logout, 30 * 60 * 1000); };
  if (!idleBound) { idleBound = true; ["click", "keydown", "mousemove", "touchstart"].forEach(ev => window.addEventListener(ev, () => { if (idleTimer) reset(); }, { passive: true })); }
  reset();
}
async function logout() {
  clearTimeout(idleTimer); idleTimer = null;
  await db.auth.signOut(); state.people = []; closeDrawer(); showLogin();
}

async function init() {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  $("#btnLogin").onclick = async () => {
    $("#loginMsg").textContent = "Entrando…";
    const { error } = await db.auth.signInWithPassword({ email:$("#email").value.trim(), password:$("#password").value });
    if (error) { $("#loginMsg").textContent = "E-mail ou senha incorretos."; return; }
    $("#password").value = ""; $("#loginMsg").textContent = ""; enter();
  };
  $("#password").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnLogin").click(); });
  $("#btnLogout").onclick = logout;
  $("#btnBackup").onclick = backup;
  bindMenus();
  const { data } = await db.auth.getSession();
  if (data.session) enter(); else showLogin();
}
// Mostra quem está logado (canto do cabeçalho). Hoje: inicial do e-mail; a foto entra no lugar da inicial no futuro.
async function showUser() {
  const { data } = await db.auth.getSession();
  const email = data.session?.user?.email || "";
  $("#userEmail").textContent = email;
  $("#userRole").textContent = "Administrador";
  $("#userAvatar").textContent = (email[0] || "?");
  $("#userBox").title = email;
}
async function enter() {
  showApp(); showUser(); if (await loadPeople()) renderView(); updateBackupWarn(); startIdle();
}
window.addEventListener("DOMContentLoaded", init);
