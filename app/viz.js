// Network graph and 3D globe for the admin panel. Plain canvas, no libraries (the strict CSP stays as is).
// Uses globals from app.js: state, $, esc, priv, mainEdu, openDrawer, STATUS.
// Privacy: city names are matched against the table below, in the browser. Nothing is sent to any service.

const viz = { raf: 0, off: [] };
function vizStop() { cancelAnimationFrame(viz.raf); viz.off.forEach(f => f()); viz.off = []; }
const vizOn = (el, ev, fn, opt) => { el.addEventListener(ev, fn, opt); viz.off.push(() => el.removeEventListener(ev, fn, opt)); };
const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const FONT = '-apple-system, "Segoe UI", system-ui, Roboto, Helvetica, Arial, sans-serif';
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
function fitCanvas(c, h) {
  const dpr = window.devicePixelRatio || 1, w = c.parentElement.clientWidth;
  c.style.width = w + "px"; c.style.height = h + "px"; c.width = w * dpr; c.height = h * dpr;
  c.getContext("2d").setTransform(dpr, 0, 0, dpr, 0, 0);
  return { w, h };
}
const vizHeight = () => Math.max(460, Math.min(680, window.innerHeight - 200));
const STATUS_COLOR = { "Employed": 0, "Founder": 1, "Employed + Founder": 2, "Exchange program": 3, "Unemployed": 4 };
const statusColor = (s, c) => c[STATUS_COLOR[s] ?? 6];

// =====================================================================
// NETWORK GRAPH: people connected through shared universities, companies and courses
// =====================================================================
const gOpt = { uni: true, org: true, curso: false };

function renderGraph() {
  vizStop();
  $("#view").innerHTML = `
    <div class="vizbar">
      <label class="chk"><input type="checkbox" id="gUni" ${gOpt.uni ? "checked" : ""}> Universidades ■</label>
      <label class="chk"><input type="checkbox" id="gOrg" ${gOpt.org ? "checked" : ""}> Empresas ◆</label>
      <label class="chk"><input type="checkbox" id="gCurso" ${gOpt.curso ? "checked" : ""}> Cursos ▲</label>
      <input id="gQ" placeholder="Achar pessoa…" autocomplete="off">
      <span class="muted small" id="gInfo"></span>
    </div>
    <div class="vizwrap"><canvas id="gCanvas" role="img" aria-label="Grafo da rede: pessoas ligadas por universidades, empresas e cursos em comum. A mesma informação está na lista abaixo."></canvas><div id="gTip" class="viztip hidden"></div></div>
    <div class="muted small vizhelp">Cada ponto é uma pessoa (cor = status). Os símbolos maiores são grupos em comum: quem compartilha um grupo fica ligado a ele. Arraste os pontos, use a roda para zoom, clique num grupo para destacar seus membros e numa pessoa para abrir a ficha.</div>
    <div class="legend-row" id="gLegend"></div>
    <details class="vizlist"><summary>Ver como lista (sem mouse)</summary><div id="gList"></div></details>`;

  const cv = $("#gCanvas"), tip = $("#gTip"), ctx = cv.getContext("2d");
  let W = 0, H = 0, nodes = [], links = [], alpha = 1, sel = null, hover = null, hidden = 0;
  const view = { x: 0, y: 0, k: 1 };
  const size = () => { const s = fitCanvas(cv, vizHeight()); W = s.w; H = s.h; };
  size(); vizOn(window, "resize", size);

  const KIND = { uni: "Universidade", org: "Empresa", curso: "Curso" };
  const renderList = hubNodes => {
    const hs = hubNodes.slice().sort((a, b) => b.deg - a.deg || a.label.localeCompare(b.label));
    $("#gList").innerHTML = hs.map(h => `<section class="vl-group"><h4>${esc(h.label)} <span class="muted">${KIND[h.kind]} · ${h.deg} pessoas</span></h4>
      <div class="vl-people">${h.ids.map(id => { const p = state.people.find(x => x.id === id); return p ? `<button type="button" class="vl-p" data-id="${esc(p.id)}">${esc(p.nome)}</button>` : ""; }).join("")}</div></section>`).join("")
      || '<div class="muted">Nenhum grupo em comum com as opções marcadas.</div>';
  };
  $("#gList").onclick = e => { const b = e.target.closest(".vl-p"); if (b) openDrawer(b.dataset.id); };

  const build = () => {
    nodes = []; links = []; sel = null; hover = null;
    const byId = new Map(), hubs = new Map();
    const uniNames = new Set(state.people.flatMap(p => (p.formacao || []).map(f => f.universidade).filter(Boolean).map(u => norm(String(u).replace(/\s*\(.*?\)\s*/g, " ").trim()))));
    state.people.forEach(p => {
      const n = { id: p.id, kind: "p", label: p.nome, status: p.status, x: (Math.random() - .5) * 400, y: (Math.random() - .5) * 400, vx: 0, vy: 0, r: 4.5, deg: 0 };
      byId.set(p.id, n);
      // "USP (Poli)" and "USP" are the same group; an organization named like a university is not a second group
      const base = v => String(v).replace(/\s*\(.*?\)\s*/g, " ").trim();
      const add = (type, vals, skip) => [...new Set(vals.filter(Boolean).map(base).filter(v => v && !(skip && skip.has(norm(v)))))].forEach(v => {
        const k = type + "|" + norm(v); if (!hubs.has(k)) hubs.set(k, { type, label: v, ids: [] }); hubs.get(k).ids.push(p.id); });
      if (gOpt.uni) add("uni", (p.formacao || []).map(f => f.universidade));
      if (gOpt.org) add("org", (p.experiencia || []).map(e => e.organizacao), uniNames);
      if (gOpt.curso) add("curso", (p.formacao || []).map(f => f.curso));
    });
    const hubNodes = [];
    hubs.forEach((h, k) => {
      if (h.ids.length < 2) return;
      const n = { id: k, kind: h.type, label: h.label, ids: h.ids, x: (Math.random() - .5) * 200, y: (Math.random() - .5) * 200, vx: 0, vy: 0, deg: h.ids.length, r: 6 + Math.sqrt(h.ids.length) * 2.4 };
      hubNodes.push(n); h.ids.forEach(id => { const pn = byId.get(id); links.push({ a: pn, b: n }); pn.deg++; });
    });
    const people = [...byId.values()].filter(n => n.deg > 0);
    hidden = byId.size - people.length;
    nodes = people.concat(hubNodes);
    nodes.forEach(n => n.adj = new Set());
    links.forEach(l => { l.a.adj.add(l.b); l.b.adj.add(l.a); });
    alpha = 1; view.x = view.y = 0; view.k = 1;
    renderList(hubNodes);
    $("#gInfo").textContent = `${people.length} pessoas · ${hubNodes.length} grupos` + (hidden ? ` · ${hidden} sem nenhum grupo em comum (ocultas)` : "");
  };
  build();

  $("#gLegend").innerHTML = [...Object.entries(STATUS_COLOR), ["Sem status", 6]].map(([s, i]) => `<span><i class="sw s${i}"></i> ${esc(pt("status", s))}</span>`).join("");
  const rebuild = () => { gOpt.uni = $("#gUni").checked; gOpt.org = $("#gOrg").checked; gOpt.curso = $("#gCurso").checked; build(); };
  ["#gUni", "#gOrg", "#gCurso"].forEach(id => $(id).onchange = rebuild);

  const tick = () => {
    if (alpha < 0.02) return;
    const N = nodes.length;
    for (let i = 0; i < N; i++) { const a = nodes[i];
      for (let j = i + 1; j < N; j++) { const b = nodes[j];
        let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
        if (d2 > 360000) continue;
        if (d2 < 1) { dx = Math.random() - .5; dy = Math.random() - .5; d2 = 1; }
        const d = Math.sqrt(d2), f = (a.kind !== "p" || b.kind !== "p" ? 5000 : 1200) / d2 * alpha;
        a.vx += dx / d * f; a.vy += dy / d * f; b.vx -= dx / d * f; b.vy -= dy / d * f; } }
    links.forEach(l => { const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, d = Math.sqrt(dx * dx + dy * dy) || 1, f = (d - (55 + l.b.r * 2.2)) * 0.06 * alpha;
      l.a.vx += dx / d * f; l.a.vy += dy / d * f; l.b.vx -= dx / d * f; l.b.vy -= dy / d * f; });
    nodes.forEach(n => { if (n.fixed) { n.vx = n.vy = 0; return; }
      n.vx -= n.x * 0.0018 * alpha; n.vy -= n.y * 0.0018 * alpha; n.vx *= 0.8; n.vy *= 0.8; n.x += n.vx; n.y += n.vy; });
    alpha *= 0.992;
  };

  const shape = (n) => {
    ctx.beginPath();
    if (n.kind === "p") ctx.arc(n.x, n.y, n.r, 0, 6.2832);
    else if (n.kind === "uni") ctx.rect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
    else if (n.kind === "org") { const r = n.r * 1.3; ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y); ctx.lineTo(n.x, n.y + r); ctx.lineTo(n.x - r, n.y); ctx.closePath(); }
    else { const r = n.r * 1.2; ctx.moveTo(n.x, n.y - r); ctx.lineTo(n.x + r, n.y + r * .8); ctx.lineTo(n.x - r, n.y + r * .8); ctx.closePath(); }
  };

  const draw = () => {
    const c = [0, 1, 2, 3, 4, 5, 6].map(i => cssv("--c" + i)), text = cssv("--text"), line = cssv("--line-strong"), panel = cssv("--panel"), muted = cssv("--muted");
    ctx.clearRect(0, 0, W, H); ctx.save(); ctx.translate(W / 2 + view.x, H / 2 + view.y); ctx.scale(view.k, view.k);
    const focus = sel || hover, near = n => !focus || n === focus || focus.adj.has(n);
    ctx.lineWidth = 1 / view.k; ctx.strokeStyle = line;
    links.forEach(l => { ctx.globalAlpha = !focus || l.a === focus || l.b === focus ? .75 : .07; ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y); ctx.lineTo(l.b.x, l.b.y); ctx.stroke(); });
    nodes.forEach(n => {
      ctx.globalAlpha = near(n) ? 1 : .15;
      shape(n);
      if (n.kind === "p") { ctx.fillStyle = statusColor(n.status, c); ctx.fill(); }
      else { ctx.fillStyle = panel; ctx.fill(); ctx.lineWidth = 2 / view.k; ctx.strokeStyle = n === focus ? c[1] : text; ctx.stroke(); }
    });
    ctx.font = `${13 / view.k}px ${FONT}`; ctx.textAlign = "center"; ctx.lineJoin = "round";
    nodes.forEach(n => {
      const show = n.kind !== "p" ? near(n) : (n === focus || (focus && focus.adj.has(n) && view.k > .8) || view.k > 2.2);
      if (!show) return;
      ctx.globalAlpha = 1; const ty = n.y + n.r * (n.kind === "p" ? 1 : 1.4) + 14 / view.k;
      ctx.lineWidth = 3 / view.k; ctx.strokeStyle = panel; ctx.strokeText(n.label, n.x, ty);
      ctx.fillStyle = n.kind === "p" ? text : muted; ctx.fillText(n.label, n.x, ty);
    });
    ctx.restore(); ctx.globalAlpha = 1;
  };

  const loop = () => { tick(); draw(); viz.raf = requestAnimationFrame(loop); };
  loop();

  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const world = m => ({ x: (m.x - W / 2 - view.x) / view.k, y: (m.y - H / 2 - view.y) / view.k });
  const hit = m => { const w = world(m); let best = null, bd = 1e9;
    nodes.forEach(n => { const d = Math.hypot(n.x - w.x, n.y - w.y), lim = n.r * (n.kind === "p" ? 1 : 1.3) + 4 / view.k; if (d < lim && d < bd) { best = n; bd = d; } });
    return best; };
  let drag = null, moved = 0;
  const ptrs = new Map(); let pinch = null; // pinca de dois dedos para zoom no celular
  const span = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  vizOn(cv, "pointercancel", endPtr);
  vizOn(cv, "pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { if (drag && drag.n) drag.n.fixed = false; drag = null; pinch = { d: span(), k: view.k }; return; }
    const n = hit(pos(e)); drag = { n, sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y }; moved = 0; if (n) n.fixed = true; });
  vizOn(cv, "pointermove", e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { view.k = Math.min(4, Math.max(.3, pinch.k * span() / pinch.d)); return; }
    const m = pos(e);
    if (drag) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy; moved = Math.max(moved, Math.hypot(dx, dy));
      if (drag.n) { const w = world(m); drag.n.x = w.x; drag.n.y = w.y; alpha = Math.max(alpha, .3); } else { view.x = drag.vx + dx; view.y = drag.vy + dy; }
      return;
    }
    hover = hit(m); cv.classList.toggle("is-hit", !!hover);
    if (hover) { tip.textContent = hover.kind === "p" ? `${hover.label}${hover.status ? " · " + pt("status", hover.status) : ""} · ${hover.deg} grupo(s)` : `${hover.label} · ${hover.deg} pessoas`;
      tip.style.left = m.x + 12 + "px"; tip.style.top = m.y + 12 + "px"; tip.classList.remove("hidden"); } else tip.classList.add("hidden");
  });
  vizOn(cv, "pointerup", e => {
    endPtr(e);
    if (!drag) return; const n = drag.n; if (n) n.fixed = false;
    if (moved < 4) { if (!n) sel = null; else if (n.kind === "p") { sel = n; openDrawer(n.id); } else sel = sel === n ? null : n; }
    drag = null;
  });
  vizOn(cv, "pointerleave", () => { hover = null; tip.classList.add("hidden"); });
  vizOn(cv, "wheel", e => { e.preventDefault(); const m = pos(e), w = world(m), k = Math.min(4, Math.max(.3, view.k * Math.exp(-e.deltaY * .0015)));
    view.x = m.x - W / 2 - w.x * k; view.y = m.y - H / 2 - w.y * k; view.k = k; }, { passive: false });
  $("#gQ").oninput = e => { const q = norm(e.target.value); if (!q) { sel = null; return; }
    const n = nodes.find(x => x.kind === "p" && norm(x.label).includes(q)); if (n) { sel = n; view.k = Math.max(view.k, 1.4); view.x = -n.x * view.k; view.y = -n.y * view.k; } };
}

// =====================================================================
// 3D GLOBE: where people live (or were born)
// =====================================================================
// Cities as "Name|lat|lon|alias;alias". Add more here when a city is not recognised.
const CITY_DATA = `São Paulo|-23.55|-46.63|sp;sampa
Rio de Janeiro|-22.91|-43.17|rio
Belo Horizonte|-19.92|-43.94|bh
Brasília|-15.79|-47.88
Salvador|-12.97|-38.5
Fortaleza|-3.73|-38.52
Recife|-8.05|-34.88
Porto Alegre|-30.03|-51.23
Curitiba|-25.43|-49.27
Florianópolis|-27.6|-48.55|floripa
Manaus|-3.12|-60.02
Belém|-1.46|-48.5
Goiânia|-16.68|-49.25
Campinas|-22.9|-47.06
Vitória|-20.32|-40.34
Natal|-5.79|-35.21
João Pessoa|-7.12|-34.86
Maceió|-9.67|-35.74
Aracaju|-10.91|-37.07
São Luís|-2.53|-44.3
Teresina|-5.09|-42.8
Cuiabá|-15.6|-56.1
Campo Grande|-20.47|-54.62
Porto Velho|-8.76|-63.9
Rio Branco|-9.97|-67.81
Macapá|0.03|-51.07
Boa Vista|2.82|-60.67
Palmas|-10.18|-48.33
Santos|-23.96|-46.33
Ribeirão Preto|-21.17|-47.81
São José dos Campos|-23.22|-45.9
Niterói|-22.88|-43.1
Uberlândia|-18.92|-48.28
Londrina|-23.31|-51.16
Joinville|-26.3|-48.85
Sorocaba|-23.5|-47.46
Santo André|-23.66|-46.53
São Bernardo do Campo|-23.69|-46.56
Osasco|-23.53|-46.79
Guarulhos|-23.45|-46.53
Piracicaba|-22.73|-47.65
Santa Maria|-29.69|-53.81
Caxias do Sul|-29.17|-51.18
Blumenau|-26.92|-49.07
Juiz de Fora|-21.76|-43.35
São Carlos|-22.02|-47.89
Bauru|-22.31|-49.06
Jundiaí|-23.19|-46.88
Barueri|-23.51|-46.88
San Francisco|37.77|-122.42|sao francisco;sf;sao francisco california;bay area
Palo Alto|37.44|-122.14
Stanford|37.43|-122.17
Mountain View|37.39|-122.08
San Jose|37.34|-121.89
Berkeley|37.87|-122.27
New York|40.71|-74.0|nova york;nyc;new york city
Boston|42.36|-71.06
Cambridge|42.37|-71.11
Los Angeles|34.05|-118.24
Chicago|41.88|-87.63
Miami|25.76|-80.19
Austin|30.27|-97.74
Seattle|47.61|-122.33
Washington|38.9|-77.04|washington dc
Toronto|43.65|-79.38
Vancouver|49.28|-123.12
Montreal|45.5|-73.57
Mexico City|19.43|-99.13|cidade do mexico
Buenos Aires|-34.6|-58.38
Santiago|-33.45|-70.67
Bogotá|4.71|-74.07
Lima|-12.05|-77.04
Montevidéu|-34.9|-56.16|montevideo
London|51.51|-0.13|londres
Oxford|51.75|-1.26
Paris|48.86|2.35
Alès|44.12|4.08|ales
Lisboa|38.72|-9.14|lisbon
Porto|41.15|-8.61
Madrid|40.42|-3.7
Barcelona|41.39|2.17
Berlin|52.52|13.4|berlim
Munique|48.14|11.58|munich
Amsterdam|52.37|4.9|amsterda
Zurique|47.38|8.54|zurich
Genebra|46.2|6.14|geneva
Milão|45.46|9.19|milan
Roma|41.9|12.5|rome
Dublin|53.35|-6.26
Moscou|55.76|37.62|moscow;moskva;moscovo
Estocolmo|59.33|18.07|stockholm
Copenhague|55.68|12.57|copenhagen
Singapura|1.35|103.82|singapore
Hong Kong|22.32|114.17
Tóquio|35.68|139.69|tokyo
Xangai|31.23|121.47|shanghai
Pequim|39.9|116.4|beijing
Seul|37.57|126.98|seoul
Dubai|25.2|55.27
Tel Aviv|32.08|34.78
Bangalore|12.97|77.59
Mumbai|19.08|72.88
Sydney|-33.87|151.21|sidney
Cidade do Cabo|-33.92|18.42|cape town`;
const CITIES = new Map(), CITY_ALIAS = new Map();
CITY_DATA.split("\n").forEach(l => { const [name, lat, lon, al] = l.split("|"); const key = norm(name);
  CITIES.set(key, { key, label: name, lat: +lat, lon: +lon });
  (al || "").split(";").filter(Boolean).forEach(a => CITY_ALIAS.set(norm(a), key)); });
const toVec = (lon, lat) => { const a = lon * Math.PI / 180, b = lat * Math.PI / 180; return [Math.cos(b) * Math.sin(a), Math.sin(b), Math.cos(b) * Math.cos(a)]; };
function cityCoord(raw) {
  const full = norm(raw); if (!full) return null;
  for (const c of [full, norm(full.split(/[,\/\-–(]/)[0])]) { const k = CITY_ALIAS.get(c) || c, city = CITIES.get(k); if (city) return { ...city, v: toVec(city.lon, city.lat) }; }
  return null;
}

// Coarse continent outlines ("lon,lat" pairs). Only used to paint a dotted land mask, so simple is fine.
const LAND_DATA = [
  "-168,66 -162,70 -156,71 -141,70 -128,70 -115,68 -95,72 -85,70 -82,66 -90,62 -94,58 -88,56 -82,52 -79,55 -77,60 -70,60 -65,58 -61,55 -56,52 -60,47 -66,45 -70,43 -70,41.5 -74,40 -76,37 -76,35 -81,31 -80,26 -82,26 -84,30 -89,30 -94,29.5 -97,26 -97.5,22 -96,19 -94,18 -91,19 -90.5,21 -87,21.5 -88,16 -84,15.5 -83.5,11 -82,9 -79,9 -77.5,8.5 -78,7 -80,7.5 -83,8.5 -85.5,10 -87.5,13 -92,14.5 -95,16 -98,16 -103,18.5 -105.5,20.5 -105.5,23 -109,25.5 -112.5,29.5 -114.7,31.7 -116.5,31 -117,32.5 -120.5,34.5 -122.5,37.5 -124,40.5 -124,46 -124.5,48.5 -128,51 -131,54.5 -135,58 -140,60 -147,60.5 -152,59 -158,57 -163,55 -158,58.5 -162,60 -165,62 -165,64",
  "-90,73 -78,74 -68,70 -62,66.5 -66,62.5 -74,64 -80,64 -86,67 -90,70",
  "-55,60 -44,60 -40,65 -22,70 -20,76 -18,81 -35,83.5 -60,82 -70,78 -58,75.5 -52,70 -54,66",
  "-77.5,8.5 -72,12 -64,10.5 -60,8.5 -52,5 -50,0 -44,-2.5 -35,-5 -35,-9 -38.5,-13 -39,-18 -41,-22 -45,-23.5 -48.5,-26 -48.8,-28.5 -52,-33 -54,-34.5 -57,-35 -57,-38 -62,-39 -65,-41 -64,-43 -67.5,-46 -66,-48 -69,-51.5 -68.5,-53 -71,-54 -74.5,-50 -75.5,-46 -73.5,-40 -73.5,-37 -71.5,-30 -70.5,-22 -70.5,-18 -76,-14 -79.5,-8 -81,-5 -80,-2 -80,1 -78,3 -77.5,6",
  "-9,37 -9,43 -2,43.5 -1.5,46 -4.5,48.5 2,51 4,52 8,54 8.5,57 10.5,57.5 10,54.5 14,54 19,54.5 21,57 24,59.5 30,60 22,60.5 21,63 25,65.5 22,66 17.5,62 19,59.5 16,56 12.5,56 11,59 8,58 5,60 5.5,62 14,67.5 20,70 28,71 40,67.5 44,68 60,69 68,69 73,72.5 80,73 87,75 100,77 112,76 113,73.5 130,71 140,72.5 150,71 160,69.5 170,70 180,69 180,65 178,64.5 170,60 164,60 163,57 156,51 156,57 160,61 156,61.5 148,59.5 141,59 136,54 141,53 140,48 135,43.5 130,42.5 129.5,40 127.5,39.5 129,36 126.5,34.5 126,37.5 125,39.5 121.5,39 122,40.5 118.5,39 119,37.5 122.5,37 120,35 121.5,32 122,29.5 119.5,25.5 116,22.8 110,21 108,21.5 106.5,19 109,15 109,11.5 105,8.5 103,10.5 100.5,13 99.5,10 100.5,6.5 103.5,1.5 101,3 98.5,8.5 98.5,14 97.5,17 94,19 94,16 91.5,22.5 88,21.5 86.5,20 84.5,19 80.5,15.5 80,10 77.5,8 75.5,12 73,17.5 72.8,21 70,21 67,24.5 62,25 57,25.5 56.5,27 51.5,28 48.5,30 50,26.5 51.5,25 56,26 56.5,24 59.5,22.5 55,17 52,16 45,13 43,13 39,21.5 35,28 34.5,29.5 32.5,30 35,32 36,36.5 30,36.5 27,37 26,40.5 23,40 23.5,38 23,36.5 21.5,38 19.5,41.5 18.5,40.2 16.5,38 15.8,38 15.6,40 12,42 10,44 8.5,44.2 6.5,43 3,43.2 3,42 0.5,40.5 -0.5,38.5 -2,36.7 -5.5,36",
  "-17,21 -16,28 -10,30 -6,35.8 10,37 11,33 15,32.5 20,32 24,32 32,31.3 32.5,30 35,24 38,18 43,12 51,12 51,10.5 48,5 41,-2 40,-10 40.5,-15 35,-20 35.5,-24 32.5,-26.5 32,-29 27,-33.5 20,-34.8 18,-32 15,-27 14.5,-22 12,-17 13.5,-12 12,-6 9,-1 9.5,3.5 6,4.3 3,6.3 -2,4.7 -7.5,4.4 -12,7.5 -15,11 -17,14.7 -16.5,19",
  "44,-25 47,-25 50,-15 49.5,-12 47,-15 44,-20",
  "114,-22 114,-34 118,-35 124,-33.5 131,-31.5 135,-35 138,-35 140,-38 146,-39 150,-37 153,-31 153,-25 146,-19 142.5,-10.5 141.5,-17 136,-15 137,-12 131,-11.5 126,-14 122,-18",
  "172.5,-34.5 178,-37.5 175,-41.5 173,-39", "172.5,-41 174.5,-41.5 170.5,-46.5 166.5,-46",
  "130.8,31.5 131.5,34 135,35.5 140,40 141.5,41.5 142,39 141,36 139.5,35 135,33.5", "140,42 142,45.5 145.5,43.5 143,42", "142,46 143,49.5 143.5,54 142,53 142,50",
  "-5.5,50 1.5,51 1.5,53 -2,57.5 -3,58.6 -6,58 -5,55 -3,54.5 -4.5,53 -5,51.5", "-10,52 -6,52 -6,55 -8,55 -10,54", "-24,65.5 -18,66.2 -14,65 -19,63.4 -22,63.8",
  "95.5,5.5 98,4 104,-1.5 106,-6 102,-4 96,2", "109,1.5 111,2 117.5,7 119,5 117.5,1 116,-4 111,-3 110,-1", "105.5,-6.5 114.5,-7.7 114.5,-8.7 106,-7.5",
  "131,-1 141,-2.5 148,-6 150.5,-10.5 143,-9 138,-8 134,-4", "120,18.5 122,18.5 122,14 124,13 120.5,14", "122,7 126,9.5 126,6.5 124,6",
  "80,9.5 82,7 81,6 80,6.5", "120,22.5 121.8,25 121,22", "-85,22 -80,23.2 -74,20 -78,20 -82,22.7", "-74.5,18.5 -72,19.8 -68.5,18.6 -71,17.8"
].map(s => s.split(" ").map(p => p.split(",").map(Number)));

function inPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
let landDots = null;
function buildLand() {
  const boxes = LAND_DATA.map(p => ({ p, x0: Math.min(...p.map(a => a[0])), x1: Math.max(...p.map(a => a[0])), y0: Math.min(...p.map(a => a[1])), y1: Math.max(...p.map(a => a[1])) }));
  const pts = [], step = 1.6;
  for (let lat = -58; lat <= 84; lat += step) {
    const ls = step / Math.max(.2, Math.cos(lat * Math.PI / 180));
    for (let lon = -180; lon < 180; lon += ls)
      if (boxes.some(b => lon >= b.x0 && lon <= b.x1 && lat >= b.y0 && lat <= b.y1 && inPoly(lon, lat, b.p))) pts.push(toVec(lon, lat));
  }
  return pts;
}

const gl = { mode: "atual", arcs: false, auto: true, zoom: 1 };

function renderGlobe(host = "#view", height = vizHeight()) {
  vizStop();
  landDots = landDots || buildLand();
  const P = state.people, groups = new Map(), unmatched = new Map(); let empty = 0;
  const field = p => gl.mode === "atual" ? priv(p).cidade_atual : priv(p).cidade_nascimento;
  P.forEach(p => {
    const raw = field(p); if (!raw) { empty++; return; }
    const c = cityCoord(raw); if (!c) { unmatched.set(raw, (unmatched.get(raw) || 0) + 1); return; }
    if (!groups.has(c.key)) groups.set(c.key, { ...c, people: [] }); groups.get(c.key).people.push(p);
  });
  const arcs = [];
  if (gl.arcs) P.forEach(p => { const a = cityCoord(priv(p).cidade_nascimento), b = cityCoord(priv(p).cidade_atual); if (a && b && a.key !== b.key) arcs.push([a.v, b.v]); });
  const list = [...groups.values()].sort((a, b) => b.people.length - a.people.length);
  const placed = list.reduce((s, g) => s + g.people.length, 0);

  $(host).innerHTML = `
    <div class="vizbar">
      <select id="glMode" aria-label="Mostrar"><option value="atual" ${gl.mode === "atual" ? "selected" : ""}>Cidade atual</option><option value="nasc" ${gl.mode === "nasc" ? "selected" : ""}>Cidade de nascimento</option></select>
      <label class="chk"><input type="checkbox" id="glArcs" ${gl.arcs ? "checked" : ""}> Trajetória (nascimento → atual)</label>
      <label class="chk"><input type="checkbox" id="glAuto" ${gl.auto ? "checked" : ""}> Girar sozinho</label>
      <span class="muted small">${placed} de ${P.length} pessoas no mapa</span>
    </div>
    <div class="vizlayout">
      <div class="vizwrap globe"><canvas id="glCanvas" role="img" aria-label="Globo com as cidades das pessoas. A mesma informação está na lista ao lado."></canvas><div id="glTip" class="viztip hidden"></div></div>
      <div class="gside" id="glSide"></div>
    </div>`;

  const cv = $("#glCanvas"), tip = $("#glTip"), ctx = cv.getContext("2d");
  let W = 0, H = 0, sel = null, drag = null, vlon = 0, target = null, hover = null;
  let cam = gl.cam;
  if (!cam) { cam = gl.cam = { lon: -47, lat: -10 }; const top = list[0]; if (top) { cam.lon = top.lon; cam.lat = Math.max(-50, Math.min(60, top.lat * .6)); } }
  const size = () => { const s = fitCanvas(cv, height); W = s.w; H = s.h; };
  size(); vizOn(window, "resize", size);
  const radius = () => Math.min(W, H) / 2 * .88 * gl.zoom;

  const side = () => {
    const g = sel ? groups.get(sel) : null;
    $("#glSide").innerHTML = `<b>${gl.mode === "atual" ? "Onde estão" : "Onde nasceram"}</b>
      ${list.map(x => `<button type="button" class="gloc ${x.key === sel ? "sel" : ""}" data-k="${esc(x.key)}" aria-expanded="${x.key === sel}"><span>${esc(x.label)}</span><span class="muted">${x.people.length}</span></button>
        ${x.key === sel ? x.people.map(p => `<button type="button" class="gperson" data-id="${esc(p.id)}">${esc(p.nome)}</button>`).join("") : ""}`).join("") || '<div class="muted">Nenhuma cidade reconhecida ainda.</div>'}
      <div class="muted small gnote">${empty} sem cidade preenchida${unmatched.size ? `<br>Sem coordenada na tabela: ${[...unmatched].map(([k, v]) => esc(k) + (v > 1 ? " (" + v + ")" : "")).join(", ")}. Para incluir, adicione a cidade em <code>CITY_DATA</code> (viz.js).` : ""}</div>`;
  };
  side();
  $("#glSide").style.maxHeight = height + "px";
  $("#glSide").onclick = e => {
    const pe = e.target.closest(".gperson"); if (pe) { openDrawer(pe.dataset.id); return; }
    const l = e.target.closest(".gloc"); if (!l) return;
    sel = sel === l.dataset.k ? null : l.dataset.k; if (sel) { const g = groups.get(sel); target = { lon: g.lon, lat: g.lat }; gl.auto = false; $("#glAuto").checked = false; } side();
  };
  $("#glMode").onchange = e => { gl.mode = e.target.value; renderGlobe(host, height); };
  $("#glArcs").onchange = e => { gl.arcs = e.target.checked; renderGlobe(host, height); };
  $("#glAuto").onchange = e => { gl.auto = e.target.checked; };

  const rad = Math.PI / 180;
  const proj = (v, s = 1) => {
    const cl = Math.cos(cam.lon * rad), sl = Math.sin(cam.lon * rad), cp = Math.cos(cam.lat * rad), sp = Math.sin(cam.lat * rad);
    const x1 = v[0] * cl - v[2] * sl, z1 = v[0] * sl + v[2] * cl, y2 = v[1] * cp - z1 * sp, z2 = v[1] * sp + z1 * cp, R = radius() * s;
    return { x: W / 2 + R * x1, y: H / 2 - R * y2, z: z2 };
  };

  const draw = (t) => {
    const text = cssv("--text"), muted = cssv("--muted"), line = cssv("--line-strong"), panel = cssv("--panel"), accent = cssv("--c1"), arc = cssv("--c0");
    const R = radius();
    ctx.clearRect(0, 0, W, H);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, R, 0, 6.2832); ctx.fillStyle = panel; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = line; ctx.stroke();
    ctx.fillStyle = muted; const d = Math.min(4, Math.max(1.5, R / 140));
    for (const v of landDots) { const p = proj(v); if (p.z <= 0) continue; ctx.globalAlpha = .3 + .6 * p.z; ctx.fillRect(p.x - d / 2, p.y - d / 2, d, d); }
    ctx.globalAlpha = 1;
    if (arcs.length) { ctx.strokeStyle = arc; ctx.lineWidth = 1.4; ctx.globalAlpha = .75;
      arcs.forEach(([a, b]) => { const om = Math.acos(Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))), so = Math.sin(om); if (so < 1e-4) return;
        ctx.beginPath(); let pen = false;
        for (let i = 0; i <= 40; i++) { const k = i / 40, f1 = Math.sin((1 - k) * om) / so, f2 = Math.sin(k * om) / so, v = [0, 1, 2].map(j => a[j] * f1 + b[j] * f2);
          const p = proj(v, 1 + .14 * Math.sin(Math.PI * k) * Math.min(1, om)); if (p.z > 0) { pen ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); pen = true; } else pen = false; }
        ctx.stroke(); });
      ctx.globalAlpha = 1; }
    const pulse = (t / 1400) % 1;
    list.forEach(g => { const p = proj(g.v); g.sx = p.x; g.sy = p.y; g.vis = p.z > .02; if (!g.vis) return;
      const mk = Math.min(1, 1.7 / Math.sqrt(gl.zoom)), r = Math.max(g.people.length > 1 ? 9 : 0, (3.5 + Math.min(7, Math.sqrt(g.people.length) * 1.6)) * mk), isSel = g.key === sel || g === hover;
      ctx.globalAlpha = (1 - pulse) * .6; ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(p.x, p.y, r + pulse * 12 * mk, 0, 6.2832); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.2832); ctx.fill();
      if (isSel) { ctx.strokeStyle = text; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, 6.2832); ctx.stroke(); }
      if (g.people.length > 1) { ctx.fillStyle = panel; ctx.font = `600 13px ${FONT}`; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(g.people.length, p.x, p.y + .5); }
      if (isSel) { ctx.fillStyle = text; ctx.font = `13px ${FONT}`; ctx.textBaseline = "alphabetic"; ctx.lineWidth = 3; ctx.strokeStyle = panel; ctx.strokeText(g.label, p.x, p.y - r - 8); ctx.fillText(g.label, p.x, p.y - r - 8); }
    });
  };

  let last = 0;
  const loop = (t) => {
    const dt = Math.min(50, t - (last || t)); last = t;
    if (target) { const dl = ((target.lon - cam.lon + 540) % 360) - 180, dt2 = Math.max(-60, Math.min(60, target.lat)) - cam.lat; cam.lon += dl * .12; cam.lat += dt2 * .12; if (Math.abs(dl) < .01 && Math.abs(dt2) < .01) target = null; }
    else if (!drag) { if (gl.auto) cam.lon += dt * .006; cam.lon += vlon; vlon *= .93; if (Math.abs(vlon) < .005) vlon = 0; }
    cam.lon = ((cam.lon + 540) % 360) - 180;
    draw(t); viz.raf = requestAnimationFrame(loop);
  };
  viz.raf = requestAnimationFrame(loop);

  const pos = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  const hitG = m => { let best = null, bd = 11; list.forEach(g => { if (!g.vis) return; const d = Math.hypot(g.sx - m.x, g.sy - m.y); if (d < bd) { best = g; bd = d; } }); return best; };
  let moved = 0;
  const ptrs = new Map(); let pinch = null; // pinca de dois dedos para zoom no celular
  const span = () => { const [a, b] = [...ptrs.values()]; return Math.hypot(a.x - b.x, a.y - b.y) || 1; };
  const endPtr = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  vizOn(cv, "pointercancel", endPtr);
  vizOn(cv, "pointerdown", e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) { drag = null; pinch = { d: span(), z: gl.zoom }; return; }
    drag = { x: e.clientX, y: e.clientY }; moved = 0; target = null; cv.classList.add("is-drag"); });
  vizOn(cv, "pointermove", e => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && ptrs.size === 2) { gl.zoom = Math.min(14, Math.max(.6, pinch.z * span() / pinch.d)); return; }
    const m = pos(e);
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; moved += Math.abs(dx) + Math.abs(dy); const s = 57.3 / radius();
      cam.lon -= dx * s; cam.lat = Math.max(-80, Math.min(80, cam.lat + dy * s)); vlon = -dx * s * .5; drag = { x: e.clientX, y: e.clientY }; return; }
    hover = hitG(m); cv.classList.toggle("is-hit", !!hover);
    if (hover) { tip.textContent = `${hover.label} · ${hover.people.length} pessoa(s)`; tip.style.left = m.x + 12 + "px"; tip.style.top = m.y + 12 + "px"; tip.classList.remove("hidden"); } else tip.classList.add("hidden");
  });
  vizOn(cv, "pointerup", e => {
    endPtr(e); cv.classList.remove("is-drag");
    if (drag && moved < 4) { const g = hitG(pos(e)); sel = g ? (sel === g.key ? null : g.key) : null; side(); }
    drag = null;
  });
  vizOn(cv, "pointerleave", () => { hover = null; tip.classList.add("hidden"); });
  vizOn(cv, "wheel", e => { e.preventDefault(); gl.zoom = Math.min(14, Math.max(.6, gl.zoom * Math.exp(-e.deltaY * .0015))); }, { passive: false });
}
