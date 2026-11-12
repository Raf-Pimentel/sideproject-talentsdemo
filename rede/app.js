// Read-only directory. Public values only: project URL and publishable key.
// What a signed-in member may see is decided in the database (function rede_diretorio),
// not in this file.
const SUPABASE_URL = "https://qcovgqjrznplhhwtmwht.supabase.co";
const SUPABASE_KEY = "sb_publishable_R0lWsNzYAuuH_LfA-MJBjA_O30_Q7me";

// Rótulos em português só para exibir; os valores no banco continuam em inglês.
const PT = {
  nivel: { "Not graduated":"Cursando", "Recent graduate":"Recém-formado(a)", "Graduated":"Formado(a)", "Master's":"Mestrado", "Dropout":"Abandonou" },
  status: { "Employed":"Empregado(a)", "Employed + Founder":"Empregado(a) e founder", "Founder":"Founder", "Unemployed":"Desempregado(a)", "Exchange program":"Intercâmbio" },
  disp: { "On-site":"Presencial", "Remote":"Remoto", "On-site/Remote":"Presencial ou remoto" },
  ingles: { "Yes":"Sim", "No":"Não", "Unknown":"Não confirmado" },
  prox: { "Send message":"Enviar mensagem", "Wait for reply":"Aguardar resposta", "Schedule call":"Marcar conversa", "Discard":"Descartar" },
};
const pt = (map, v) => (v == null || v === "" ? v : (PT[map][v] ?? v));

let db = null;
let all = [];

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || "") ? u : null);
const main = p => (p.formacao || [])[0] || {};

function showApp() { $("#login").classList.add("hidden"); $("#app").classList.remove("hidden"); }
function showLogin() { $("#app").classList.add("hidden"); $("#login").classList.remove("hidden"); }

async function load() {
  const { data, error } = await db.rpc("rede_diretorio");
  if (error) {
    all = [];
    $("#list").innerHTML = `<div class="empty">${error.code === "42501" || /permiss/i.test(error.message)
      ? "Esta conta não tem acesso ao diretório."
      : error.code === "54000" ? "Muitas consultas seguidas. Tente de novo mais tarde." : "Não foi possível carregar o diretório."}</div>`;
    $("#count").textContent = "";
    return;
  }
  all = data || [];
  fillFilters();
  render();
}

function fillFilters() {
  const unis = [...new Set(all.flatMap(p => (p.formacao || []).map(f => f.universidade)))].filter(Boolean).sort();
  const niveis = [...new Set(all.map(p => p.nivel))].filter(Boolean).sort();
  $("#funi").innerHTML = `<option value="">Universidade: todas</option>` + unis.map(u => `<option value="${esc(u)}">${esc(u)}</option>`).join("");
  $("#fnivel").innerHTML = `<option value="">Nível: todos</option>` + niveis.map(n => `<option value="${esc(n)}">${esc(pt("nivel", n))}</option>`).join("");
  // A nota do indicador só vem para admins; sem ela, o filtro de nota não faz sentido.
  const temNota = all.some(p => p.nota != null);
  $("#fnmin").hidden = !temNota;
  $("#fnmax").hidden = !temNota;
}

function render() {
  const q = $("#fq").value.trim().toLowerCase(), uni = $("#funi").value, nv = $("#fnivel").value;
  const rows = all.filter(p => {
    const hay = [p.nome, p.destaques, ...(p.formacao || []).flatMap(f => [f.universidade, f.curso]),
      ...(p.experiencia || []).flatMap(e => [e.organizacao, e.cargo]), ...(p.iniciativa || []).map(i => i.titulo)].join(" ").toLowerCase();
    const mn = $("#fnmin").value, mx = $("#fnmax").value, n = p.nota == null ? null : Number(p.nota);
    const notaOk = (mn === "" && mx === "") || (n !== null && (mn === "" || n >= Number(mn)) && (mx === "" || n <= Number(mx)));
    return (!q || hay.includes(q)) && (!nv || p.nivel === nv) && (!uni || (p.formacao || []).some(f => f.universidade === uni)) && notaOk;
  });
  $("#count").textContent = all.length ? `${rows.length} de ${all.length} pessoas` : "";
  if (!all.length) { $("#list").innerHTML = `<div class="empty">Ainda não há pessoas no diretório.</div>`; return; }
  if (!rows.length) { $("#list").innerHTML = `<div class="empty">Nenhuma pessoa encontrada.</div>`; return; }

  $("#list").innerHTML = rows.map(p => {
    const f = main(p), url = safeUrl(p.linkedin);
    const orgs = [...new Set((p.experiencia || []).map(e => e.organizacao).filter(Boolean))];
    const pv = p.privado || {};
    const extra = [["Status", pt("status", p.status)], ["Disponibilidade", pt("disp", p.disponibilidade)], ["Inglês fluente", pt("ingles", p.ingles_fluente)],
      ["Idiomas", (p.idiomas || []).join(", ")], ["Nascimento", pv.data_nascimento], ["Cidade de nascimento", pv.cidade_nascimento],
      ["Cidade atual", pv.cidade_atual], ["Idade ao sair de casa", pv.idade_saida_casa_pais], ["Hobbies", (pv.hobbies || []).join(", ")],
      ["Nota do indicador", pv.nota_indicador], ["Indicado por", pv.indicado_por], ["Notas", pv.notas]].filter(([, v]) => v !== null && v !== undefined && v !== "");
    const inter = p.interacoes || [];
    const hasMore = p.destaques || (p.formacao || []).length > 1 || (p.experiencia || []).length || (p.iniciativa || []).length || extra.length || inter.length;
    return `<article class="person">
      <h2>${esc(p.nome)}${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ""}</h2>
      <p class="line">${esc([f.universidade, f.curso, pt("nivel", p.nivel), p.nota != null && "nota " + p.nota].filter(Boolean).join(" · "))}</p>
      ${orgs.length ? `<p class="line muted">${esc(orgs.slice(0, 6).join(", "))}</p>` : ""}
      ${hasMore ? `<details><summary>Detalhes</summary>
        ${p.destaques ? `<h3>Destaques</h3><p>${esc(p.destaques)}</p>` : ""}
        ${extra.length ? `<h3>Detalhes pessoais</h3><ul>${extra.map(([k, v]) => `<li><span class="muted">${esc(k)}:</span> ${esc(v)}</li>`).join("")}</ul>` : ""}
        ${inter.length ? `<h3>Interações</h3><ul>${inter.map(x => `<li>${esc([x.data, x.canal, x.resumo].filter(Boolean).join(" · "))}${x.proximo_passo ? ` <span class="muted">(${esc(pt("prox", x.proximo_passo))}${x.data_proximo_passo ? " até " + esc(x.data_proximo_passo) : ""})</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${(p.formacao || []).length > 1 ? `<h3>Formação</h3><ul>${p.formacao.map(x => `<li>${esc([x.universidade, x.curso, x.ano_formatura && "formatura " + x.ano_formatura].filter(Boolean).join(" · "))}</li>`).join("")}</ul>` : ""}
        ${(p.experiencia || []).length ? `<h3>Experiência</h3><ul>${p.experiencia.map(x => `<li>${esc([x.organizacao, x.cargo, x.tipo].filter(Boolean).join(" · "))}${x.inicio || x.fim ? ` <span class="muted">(${esc(x.inicio || "?")} a ${esc(x.fim || "atual")})</span>` : ""}</li>`).join("")}</ul>` : ""}
        ${(p.iniciativa || []).length ? `<h3>Iniciativas</h3><ul>${p.iniciativa.map(x => { const l = safeUrl(x.link);
          return `<li>${l ? `<a href="${esc(l)}" target="_blank" rel="noopener noreferrer">${esc(x.titulo)}</a>` : esc(x.titulo)}${x.tipo || x.data ? ` <span class="muted">${esc([x.tipo, x.data].filter(Boolean).join(" · "))}</span>` : ""}${x.descricao ? `<br>${esc(x.descricao)}` : ""}</li>`; }).join("")}</ul>` : ""}
      </details>` : ""}
    </article>`;
  }).join("");
}

// Sign out after 30 minutes without activity.
let idleTimer = null, idleBound = false;
function startIdle() {
  const reset = () => { clearTimeout(idleTimer); idleTimer = setTimeout(logout, 30 * 60 * 1000); };
  if (!idleBound) { idleBound = true; ["click", "keydown", "mousemove", "touchstart"].forEach(ev => window.addEventListener(ev, () => { if (idleTimer) reset(); }, { passive: true })); }
  reset();
}
async function logout() {
  clearTimeout(idleTimer); idleTimer = null;
  await db.auth.signOut(); all = []; $("#list").innerHTML = ""; $("#conn").classList.add("hidden"); $("#connOut").innerHTML = ""; $("#btnConn").classList.add("hidden"); $("#pw").classList.add("hidden"); showLogin();
}

// ---- Sugerir conexões (função conectar-ia: só lê, não grava nada). O banco decide quem pode usar. ----
async function checkMatch() {
  $("#btnConn").classList.add("hidden");
  const { data, error } = await db.rpc("pode_usar_match");
  if (!error && data === true) $("#btnConn").classList.remove("hidden");
}
async function suggestConnections() {
  const st = $("#connStatus"), out = $("#connOut"), go = $("#connGo");
  const escolha = $("#connPessoa").value.trim(), desc = $("#connDesc").value.trim(), objetivo = $("#connObj").value.trim();
  if (!escolha && !desc) { st.textContent = "Escolha uma pessoa ou descreva-a."; return; }
  if (escolha && !all.some(p => (p.nome || "").toLowerCase() === escolha.toLowerCase())) { st.textContent = "Pessoa não encontrada no diretório. Escolha uma da lista ou limpe o campo."; return; }
  go.disabled = true; st.textContent = "Analisando…"; out.innerHTML = "";
  try {
    const body = escolha ? { pessoa_nome: escolha, objetivo } : { descricao: desc, objetivo };
    const { data, error } = await db.functions.invoke("conectar-ia", { body });
    if (error) {
      let msg = "não foi possível concluir.";
      try { const j = await error.context.json(); if (j?.erro) msg = j.erro; } catch {}
      st.textContent = "Erro: " + msg; return;
    }
    if (data?.erro) { st.textContent = "Erro: " + data.erro; return; }
    const sug = data.sugestoes || [];
    st.textContent = `${sug.length} sugestão(ões) · ${data.perfis_analisados} perfis analisados`;
    out.innerHTML = (sug.length ? "" : `<div class="muted">Nenhuma sugestão boa.</div>`) + sug.map(s => {
      const url = safeUrl(s.linkedin);
      return `<div class="connItem"><div><b>${esc(s.nome || s.id)}</b>${url ? ` <a href="${esc(url)}" target="_blank" rel="noopener noreferrer">LinkedIn</a>` : ""}</div>
        <div><span class="tag">${esc(s.relacao)}</span> ${s.papel ? `<span class="tag">${esc(s.papel)}</span> ` : ""}<span class="tag">confiança ${esc(s.confianca)}</span></div>
        <div>${esc(s.motivo)}</div></div>`; }).join("") + (data.observacao ? `<div class="muted">${esc(data.observacao)}</div>` : "");
  } finally { go.disabled = false; }
}

// Mostra quem está logado (canto do cabeçalho). Hoje: inicial do e-mail; a foto entra no lugar da inicial no futuro.
async function showUser() {
  const { data } = await db.auth.getSession();
  const email = data.session?.user?.email || "";
  $("#userEmail").textContent = email;
  $("#userAvatar").textContent = (email[0] || "?");
  $("#userBox").title = email;
  // Só admin lê a tabela admin (RLS): se vier uma linha, é admin; senão, membro.
  const { data: adm } = await db.from("admin").select("user_id").limit(1);
  $("#userRole").textContent = adm && adm.length ? "Administrador" : "Membro";
}
async function enter() { showApp(); showUser(); await load(); startIdle(); checkMatch(); }

// ---- menu da conta e atalhos de teclado ----
function closeMenus() {
  document.querySelectorAll(".pop").forEach(m => m.classList.add("hidden"));
  document.querySelectorAll("[aria-haspopup]").forEach(b => b.setAttribute("aria-expanded", "false"));
}
function bindMenus() {
  $("#btnAccount").addEventListener("click", e => {
    e.stopPropagation();
    const m = $("#accountMenu"), open = m.classList.contains("hidden");
    closeMenus();
    if (open) { m.classList.remove("hidden"); $("#btnAccount").setAttribute("aria-expanded", "true"); m.querySelector("button")?.focus(); }
  });
  $("#accountMenu").addEventListener("click", e => { if (e.target.closest("button")) closeMenus(); });
  document.addEventListener("click", e => { if (!e.target.closest(".pop")) closeMenus(); });
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("#accountMenu").classList.contains("hidden")) { closeMenus(); $("#btnAccount").focus(); return; }
    if (!$("#conn").classList.contains("hidden")) $("#conn").classList.add("hidden");
  });
  $("#conn").addEventListener("mousedown", e => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });
}

async function init() {
  db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  bindMenus();
  $("#btnLogin").onclick = async () => {
    $("#loginMsg").textContent = "Entrando…";
    const { error } = await db.auth.signInWithPassword({ email: $("#email").value.trim(), password: $("#password").value });
    if (error) { $("#loginMsg").textContent = "E-mail ou senha incorretos."; return; }
    $("#password").value = ""; $("#loginMsg").textContent = ""; enter();
  };
  $("#password").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnLogin").click(); });
  $("#btnLogout").onclick = logout;
  $("#btnPw").onclick = () => { $("#pw").classList.toggle("hidden"); $("#pwMsg").textContent = ""; $("#newPw").value = ""; };
  $("#pwCancel").onclick = () => $("#pw").classList.add("hidden");
  $("#pwSave").onclick = async () => {
    const pw = $("#newPw").value;
    if (pw.length < 12) { $("#pwMsg").textContent = "Use pelo menos 12 caracteres."; return; }
    const { error } = await db.auth.updateUser({ password: pw });
    if (error) { $("#pwMsg").textContent = "Não foi possível alterar: " + error.message; return; }
    $("#newPw").value = ""; $("#pwMsg").textContent = "Senha alterada."; setTimeout(() => $("#pw").classList.add("hidden"), 1500);
  };
  $("#btnConn").onclick = () => {
    $("#dl-conn").innerHTML = all.map(p => `<option value="${esc(p.nome)}"></option>`).join("");
    $("#conn").classList.remove("hidden"); $("#connPessoa").focus();
  };
  $("#connClose").onclick = () => $("#conn").classList.add("hidden");
  $("#connGo").onclick = suggestConnections;
  ["#fq", "#funi", "#fnivel", "#fnmin", "#fnmax"].forEach(s => $(s).addEventListener("input", render));
  const { data } = await db.auth.getSession();
  if (data.session) enter(); else showLogin();
}
window.addEventListener("DOMContentLoaded", init);
