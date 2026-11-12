// Grupos: agrupa as pessoas por traços em comum (k-means esférico, tudo calculado aqui no navegador).
// Nada sai desta página: nenhum serviço externo, nenhuma IA (regra 9 de docs/PRIVACIDADE.md). Só usa dados que o painel já carregou.
// Usa globais de app.js e viz.js: state, $, esc, priv, pt, norm, openDrawer.

// Grupos de traços; o peso (0 a 3) diz o quanto cada grupo conta na hora de agrupar.
const CL_GROUPS = [
  { key: "uni",     label: "Universidade",        w: 1 },
  { key: "curso",   label: "Curso",               w: 1 },
  { key: "org",     label: "Empresas e organizações", w: 1 },
  { key: "perfil",  label: "Nível, status e inglês", w: 1 },
  { key: "atuacao", label: "Iniciativas e tipo de experiência", w: 1 },
  { key: "idioma",  label: "Idiomas",             w: 0.5 },
  { key: "hobby",   label: "Hobbies",             w: 0.5 },
  { key: "destaque", label: "Palavras dos destaques", w: 0.5 },
];
const CL_STOP = new Set(("para com uma uns umas dos das nos nas pelo pela pelos pelas que como mais muito sobre entre desde quando onde mesmo ainda também foi foram ser tem tinha pessoa " +
  "the and for with from that this have been was were are").split(" "));
const cl = { k: 5, w: null };
const clWeights = () => cl.w || (cl.w = Object.fromEntries(CL_GROUPS.map(g => [g.key, g.w])));

// Traços de uma pessoa: lista de { g: grupo, id: chave estável, label: texto exibido }.
function clTraits(p) {
  const out = [], seen = new Set();
  const add = (g, label) => {
    const s = String(label ?? "").replace(/\s+/g, " ").trim(); if (!s) return;
    const id = g + ":" + norm(s); if (seen.has(id)) return; seen.add(id); out.push({ g, id, label: s });
  };
  (p.formacao || []).forEach(f => { add("uni", f.universidade); add("curso", f.curso); });
  (p.experiencia || []).forEach(e => { add("org", e.organizacao); add("atuacao", e.tipo && "Experiência: " + e.tipo); });
  add("perfil", pt("nivel", p.nivel)); add("perfil", pt("status", p.status));
  if (p.ingles_fluente === "Yes") add("perfil", "Inglês fluente");
  const ini = p.iniciativa || [];
  if (ini.length) add("atuacao", "Tem iniciativas");
  ini.forEach(i => add("atuacao", i.tipo && "Iniciativa: " + i.tipo));
  (p.idiomas || []).forEach(l => add("idioma", l));
  (priv(p).hobbies || []).forEach(h => add("hobby", h));
  String(p.destaques || "").split(/[^\p{L}\p{N}]+/u).forEach(w => { const n = norm(w); if (n.length >= 5 && !CL_STOP.has(n)) add("destaque", n); });
  return out;
}

// Gerador pseudoaleatório com semente fixa: o mesmo pedido sempre dá os mesmos grupos.
function clRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// Núcleo puro (sem DOM): recebe pessoas, k e pesos; devolve { groups: [{ ids, traits }], loose: [ids sem traços úteis] }.
function clusterPeople(people, k, weights) {
  const n = people.length, tr = people.map(clTraits);
  const df = new Map(), label = new Map();
  tr.forEach(ts => ts.forEach(t => { df.set(t.id, (df.get(t.id) || 0) + 1); if (!label.has(t.id)) label.set(t.id, t); }));
  // Traços que só uma pessoa tem, ou que todos têm, não ajudam a separar ninguém.
  const useful = id => df.get(id) >= 2 && df.get(id) < n;
  const index = new Map(); [...df.keys()].filter(useful).sort().forEach((id, i) => index.set(id, i));
  const F = index.size;
  // Vetor esparso por pessoa: peso do grupo x IDF, dividido para que cada grupo contribua no máximo com o seu peso.
  const vec = tr.map(ts => {
    const byG = {}; ts.filter(t => index.has(t.id)).forEach(t => (byG[t.g] ||= []).push(t));
    const e = [];
    for (const [g, arr] of Object.entries(byG)) {
      const w = weights[g] ?? 0; if (w <= 0) continue;
      const parts = arr.map(t => [index.get(t.id), Math.log(n / df.get(t.id))]);
      const nrm = Math.sqrt(parts.reduce((a, [, v]) => a + v * v, 0)) || 1;
      parts.forEach(([i, v]) => e.push([i, w * v / nrm]));
    }
    const L = Math.sqrt(e.reduce((a, [, v]) => a + v * v, 0));
    return L ? e.map(([i, v]) => [i, v / L]) : [];
  });
  const loose = [], act = []; vec.forEach((v, i) => (v.length ? act : loose).push(i));
  const K = Math.max(1, Math.min(k, act.length));
  if (!act.length) return { groups: [], loose: people.map(p => p.id) };
  const dot = (v, c) => { let s = 0; for (const [i, x] of v) s += x * c[i]; return s; };
  const dense = v => { const c = new Float64Array(F); for (const [i, x] of v) c[i] = x; return c; };
  const run = seed => {
    const rnd = clRng(seed);
    // k-means++ com distância 1 - cosseno
    let cent = [dense(vec[act[Math.floor(rnd() * act.length)]])];
    while (cent.length < K) {
      const d = act.map(i => Math.max(0, 1 - Math.max(...cent.map(c => dot(vec[i], c)))));
      const tot = d.reduce((a, b) => a + b, 0); if (tot <= 1e-9) break;
      let r = rnd() * tot, pick = 0; for (let j = 0; j < d.length; j++) { r -= d[j]; if (r <= 0) { pick = j; break; } }
      cent.push(dense(vec[act[pick]]));
    }
    let asg = new Array(n).fill(-1);
    for (let it = 0; it < 40; it++) {
      let changed = false;
      for (const i of act) { let b = 0, bs = -2; cent.forEach((c, j) => { const s = dot(vec[i], c); if (s > bs + 1e-12) { bs = s; b = j; } }); if (asg[i] !== b) { asg[i] = b; changed = true; } }
      if (!changed) break;
      cent = cent.map((_, j) => { const c = new Float64Array(F); let any = false; for (const i of act) if (asg[i] === j) { any = true; for (const [t, x] of vec[i]) c[t] += x; } if (!any) return cent[j]; const L = Math.sqrt(c.reduce((a, b) => a + b * b, 0)) || 1; return c.map(x => x / L); });
    }
    const score = act.reduce((a, i) => a + dot(vec[i], cent[asg[i]]), 0);
    return { asg, score };
  };
  let best = null; for (let s = 1; s <= 8; s++) { const r = run(s * 7919); if (!best || r.score > best.score + 1e-9) best = r; }
  const members = new Map(); act.forEach(i => { const j = best.asg[i]; if (!members.has(j)) members.set(j, []); members.get(j).push(i); });
  const groups = [...members.values()].map(ix => {
    const cnt = new Map(); ix.forEach(i => tr[i].forEach(t => cnt.set(t.id, (cnt.get(t.id) || 0) + 1)));
    // Traço dominante: aparece em boa parte do grupo (e em pelo menos 2 pessoas) e é mais comum aqui do que na base toda.
    const traits = [...cnt].filter(([id, c]) => c >= 2 && (weights[label.get(id).g] ?? 0) > 0 && c / ix.length >= 0.4 && (c / ix.length) / (df.get(id) / n) > 1.2)
      .map(([id, c]) => ({ label: label.get(id).label, g: label.get(id).g, c, share: c / ix.length, lift: (c / ix.length) / (df.get(id) / n) }))
      .sort((a, b) => b.share * Math.log(1 + b.lift) - a.share * Math.log(1 + a.lift) || a.label.localeCompare(b.label)).slice(0, 8);
    return { ids: ix.map(i => people[i].id), traits };
  }).sort((a, b) => b.ids.length - a.ids.length);
  return { groups, loose: loose.map(i => people[i].id) };
}

function renderGroups() {
  const W = clWeights(), N = state.people.length;
  const maxK = Math.max(2, Math.min(10, N));
  cl.k = Math.max(2, Math.min(cl.k, maxK));
  $("#view").innerHTML = `
    <div class="card cl-controls">
      <label class="cl-k">Número de grupos: <b id="clKv">${cl.k}</b>
        <input type="range" id="clK" min="2" max="${maxK}" step="1" value="${cl.k}" aria-label="Número de grupos"></label>
      <details class="cl-weights" open><summary>Peso de cada tipo de traço <span class="muted">(0 ignora; maior conta mais)</span></summary>
        <div class="cl-wgrid">${CL_GROUPS.map(g => `<label>${esc(g.label)}: <b id="clWv-${g.key}">${W[g.key]}</b>
          <input type="range" data-w="${g.key}" min="0" max="3" step="0.5" value="${W[g.key]}" aria-label="Peso: ${esc(g.label)}"></label>`).join("")}</div>
        <button type="button" id="clReset">Restaurar pesos</button></details>
      <p class="muted small">Calculado neste navegador, só com o que já está carregado: nada é enviado a serviços externos nem à IA. Quem tem poucos dados preenchidos fica em “Sem traços suficientes”.</p>
    </div>
    <div id="clOut"></div>`;
  const draw = () => {
    if (state.people.length < 3) { $("#clOut").innerHTML = '<div class="card muted">São necessárias pelo menos 3 pessoas para agrupar.</div>'; return; }
    const r = clusterPeople(state.people, cl.k, W);
    const byId = new Map(state.people.map(p => [p.id, p]));
    const member = id => { const p = byId.get(id); return p ? `<button type="button" class="vl-p" data-id="${esc(p.id)}">${esc(p.nome)}${p.visibilidade === "rede" ? "" : ' <span class="muted">(privada)</span>'}</button>` : ""; };
    $("#clOut").innerHTML = `<div class="cl-grid">${r.groups.map((g, i) => `
      <section class="card cl-card" aria-label="Grupo ${i + 1}">
        <h3>Grupo ${i + 1} <span class="muted">· ${g.ids.length} ${g.ids.length === 1 ? "pessoa" : "pessoas"}</span></h3>
        <div class="cl-traits">${g.traits.length ? g.traits.map(t => `<span class="tag" title="${Math.round(t.share * 100)}% do grupo, ${t.lift.toFixed(1)}× mais comum que na base">${esc(t.label)} <span class="muted">${t.c} de ${g.ids.length}</span></span>`).join(" ")
          : '<span class="muted">Sem traço dominante: grupo misto.</span>'}</div>
        <div class="vl-people">${g.ids.map(member).join("")}</div>
      </section>`).join("")}</div>
      ${r.loose.length ? `<section class="card cl-card" aria-label="Sem traços suficientes"><h3>Sem traços suficientes <span class="muted">· ${r.loose.length}</span></h3>
        <p class="muted small">Faltam dados (ou os traços são únicos) para agrupar essas pessoas.</p><div class="vl-people">${r.loose.map(member).join("")}</div></section>` : ""}`;
  };
  draw();
  $("#clOut").onclick = e => { const b = e.target.closest(".vl-p"); if (b) openDrawer(b.dataset.id); };
  $("#clK").oninput = e => { cl.k = +e.target.value; $("#clKv").textContent = cl.k; draw(); };
  $("#view").querySelectorAll("input[data-w]").forEach(inp => inp.oninput = () => { W[inp.dataset.w] = +inp.value; $("#clWv-" + inp.dataset.w).textContent = W[inp.dataset.w]; draw(); });
  $("#clReset").onclick = () => { cl.w = null; renderGroups(); };
}
