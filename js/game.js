(() => {
const $ = s => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg", CX = 200, CY = 220, R = 180;
// Semiancho de la zona central (en % de la ruleta). Antes 2.5; más pequeño = más difícil.
const W = 1.75;
const BANDS = [[W, 2, "z2", -4 * W], [W, 3, "z3", -2 * W], [W, 4, "z4", 0], [W, 3, "z3", 2 * W], [W, 2, "z2", 4 * W]];
const GOAL = 1000000, DEFAULT_NAMES = ["Jugador 1", "Jugador 2"];
let NAMES = DEFAULT_NAMES.slice();
const S = { phase: "wait", guess: 50, target: 50, scores: [0, 0], psychic: 0, last: -1, card: null };
const dial = $("#dial");

const pt = (v, r) => { const a = Math.PI * (1 - v / 100); return [CX + r * Math.cos(a), CY - r * Math.sin(a)]; };
const el = (t, a, p) => { const n = document.createElementNS(NS, t); for (const k in a) n.setAttribute(k, a[k]); p.appendChild(n); return n; };
const wedge = (a, b, r = R) => { const [x0, y0] = pt(Math.max(0, a), r), [x1, y1] = pt(Math.min(100, b), r); return `M${CX} ${CY}L${x0} ${y0}A${r} ${r} 0 0 1 ${x1} ${y1}Z`; };
const clamp = v => Math.min(100, Math.max(0, v));

function build() {
  dial.innerHTML = `<defs>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3d58a"/><stop offset="1" stop-color="#d6a443"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.5" stdDeviation="2" flood-color="#000" flood-opacity=".4"/></filter></defs>`;
  el("path", { d: wedge(0, 100, R + 9), fill: "url(#brass)" }, dial);
  el("path", { d: wedge(0, 100), fill: "#0d1330" }, dial);

  // Escudo que tapa la zona hasta que se revela la posición. Se crea antes de las zonas
  // para que, al ocultarse, nunca pueda quedar por encima de ellas.
  const sh = el("g", { id: "shield" }, dial);
  el("path", { d: wedge(0, 100), fill: "#161d4a" }, sh);
  el("text", { x: CX, y: 135, class: "q" }, sh).textContent = "?";

  // Zona de puntuación: 2 - 3 - 4 - 3 - 2.
  // Importante: NO recortamos las zonas en 0/100. Si el 4 cae en un extremo,
  // la franja continúa por debajo del borde, igual que en una ruleta física.
  // Después dibujamos el aro exterior por encima para ocultar la parte que queda fuera.
  const z = el("g", { id: "zones" }, dial);
  let bands = BANDS;
  if (S.target <= 5 * W) {
    bands = BANDS.map(([w, score, c, o]) => [w, score, c, Math.abs(o)]);
  } else if (S.target >= 100 - 5 * W) {
    bands = BANDS.map(([w, score, c, o]) => [w, score, c, -Math.abs(o)]);
  }
  bands.forEach(([w, score, c, o]) => {
    const center = S.target + o;
    const lo = center - w;
    const hi = center + w;
    el("path", { d: wedge(Math.min(lo, hi), Math.max(lo, hi)), class: c }, z);

    // Los números siempre quedan dentro de la cara, aunque la zona esté parcialmente
    // escondida bajo el borde en los extremos.
    const labelValue = clamp(center);
    const [x, y] = pt(labelValue, R * .72);
    el("text", { x, y, class: "zl" }, z).textContent = score;
  });

  // Aro delantero: se pinta DESPUÉS de las zonas para que tape su parte exterior.
  // Así parece que las bandas pasan por debajo del borde, en vez de cortarse.
  const rim = el("g", { id: "frontRim" }, dial);
  el("path", {
    d: `M${CX - R - 9} ${CY}A${R + 9} ${R + 9} 0 0 1 ${CX + R + 9} ${CY}`,
    fill: "none", stroke: "url(#brass)", "stroke-width": 14, "stroke-linecap": "round"
  }, rim);

  // Indicador de la posición secreta: una aguja fija que apunta al centro de la zona.
  const targetPointer = el("g", { id: "targetPointer", filter: "url(#glow)" }, dial);
  const [tx, ty] = pt(S.target, R - 5);
  el("line", { x1: CX, y1: CY, x2: tx, y2: ty, class: "target-needle" }, targetPointer);
  el("circle", { cx: tx, cy: ty, r: 8, class: "target-point" }, targetPointer);

  for (let v = 0; v <= 100; v += 2.5) {
    const M = v % 25 === 0, [a, b] = pt(v, R - (M ? 16 : 8)), [c, d] = pt(v, R - 2);
    el("line", { x1: a, y1: b, x2: c, y2: d, class: M ? "tick m" : "tick" }, dial);
  }
  const n = el("g", { id: "needle", filter: "url(#glow)" }, dial);
  el("line", { x1: CX, y1: CY, x2: CX, y2: CY - R + 6, class: "needle" }, n);
  el("circle", { cx: CX, cy: CY - R + 14, r: 7, class: "knob" }, n);

  // Marcadores que solo aparecen al revelar el resultado.
  const markers = el("g", { id: "resultMarkers" }, dial);

  const targetMarker = el("g", { class: "result-marker target-marker" }, markers);
  el("line", { class: "marker-line" }, targetMarker);
  el("circle", { class: "marker-dot", r: 7 }, targetMarker);
  el("text", { class: "marker-label" }, targetMarker).textContent = "OBJETIVO";

  const guessMarker = el("g", { class: "result-marker guess-marker" }, markers);
  el("line", { class: "marker-line" }, guessMarker);
  el("circle", { class: "marker-dot", r: 6 }, guessMarker);
  el("text", { class: "marker-label" }, guessMarker).textContent = "TU RESPUESTA";

  el("circle", { cx: CX, cy: CY, r: 15, fill: "url(#brass)", stroke: "#0d1330", "stroke-width": 3 }, dial);

  // Extremos del espectro (la carta de la ronda)
  if (S.card) {
    el("text", { x: 4, y: 243, class: "end-label end-l" }, dial).textContent = S.card[0];
    el("text", { x: 396, y: 243, class: "end-label end-r" }, dial).textContent = S.card[1];
  }
}
function paintTargetPointer() {
  const group = $("#targetPointer");
  if (!group) return;
  const [x, y] = pt(S.target, R - 5);
  const line = group.querySelector(".target-needle");
  const dot = group.querySelector(".target-point");
  line.setAttribute("x2", x);
  line.setAttribute("y2", y);
  dot.setAttribute("cx", x);
  dot.setAttribute("cy", y);
  group.classList.toggle("on", S.phase === "psychic" || S.phase === "reveal");
}

function paintResultMarkers() {
  const group = $("#resultMarkers");
  if (!group) return;

  const visible = S.phase === "reveal";
  group.classList.toggle("on", visible);
  if (!visible) return;

  const setMarker = (selector, value, radius, labelOffset) => {
    const marker = group.querySelector(selector);
    const [x, y] = pt(value, radius);
    const [lx, ly] = pt(value, radius + labelOffset);
    const line = marker.querySelector(".marker-line");
    const dot = marker.querySelector(".marker-dot");
    const label = marker.querySelector(".marker-label");

    line.setAttribute("x1", x);
    line.setAttribute("y1", y);
    line.setAttribute("x2", lx);
    line.setAttribute("y2", ly);
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", y);
    label.setAttribute("x", lx);
    label.setAttribute("y", ly - 5);
  };

  // Los dos puntos se colocan exactamente sobre la escala de la ruleta.
  setMarker(".target-marker", S.target, R - 18, 28);
  setMarker(".guess-marker", S.guess, R - 34, 52);
}

function paint() {
  const show = S.phase === "psychic" || S.phase === "reveal";
  $("#zones").classList.toggle("on", show);
  $("#shield").classList.toggle("off", show);
  $("#needle").classList.toggle("gone", S.phase === "wait" || S.phase === "psychic");
  $("#needle").style.transform = `rotate(${S.guess * 1.8 - 90}deg)`;
  paintTargetPointer();
  paintResultMarkers();
  dial.setAttribute("aria-valuenow", Math.round(S.guess));
  dial.classList.toggle("live", S.phase === "guess");
}

// ---------- Entrada ----------
let drag = false;
function fromPointer(e) {
  const p = dial.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
  const q = p.matrixTransform(dial.getScreenCTM().inverse());
  let a = Math.atan2(CY - q.y, q.x - CX);
  if (a < 0) a = q.x > CX ? 0 : Math.PI;
  S.guess = clamp((1 - a / Math.PI) * 100); paint();
}
dial.addEventListener("pointerdown", e => { if (S.phase !== "guess") return; drag = true; dial.setPointerCapture(e.pointerId); dial.classList.add("drag"); fromPointer(e); });
dial.addEventListener("pointermove", e => drag && fromPointer(e));
const end = () => { drag = false; dial.classList.remove("drag"); };
dial.addEventListener("pointerup", end); dial.addEventListener("pointercancel", end);
addEventListener("keydown", e => {
  if (S.phase === "guess") {
    const d = { ArrowLeft: -1.5, ArrowDown: -1.5, ArrowRight: 1.5, ArrowUp: 1.5 }[e.key];
    if (d) { e.preventDefault(); S.guess = clamp(S.guess + (e.shiftKey ? d * 4 : d)); paint(); return; }
  }
  if (document.body.classList.contains("in-setup")) return;
  if (e.key === "Enter" && document.activeElement.tagName !== "BUTTON") { e.preventDefault(); act(); }
});

// ---------- Rondas por turnos ----------
const $c = $("#clue"), $b = $("#action"), $v = $("#verdict");
function players() {
  $("#players").innerHTML = NAMES.map((n, i) => {
    const role = S.phase === "reveal" ? "" : i === S.psychic ? "psíquico" : "adivina";
    return `<div class="pl p${i}${(S.phase !== "reveal" && i === S.psychic) || (S.phase === "reveal" && i !== S.psychic) ? " on" : ""}"><span>${n}<small>${role}</small></span><b>${S.scores[i]}</b></div>`;
  }).join("");
}
function ui(title, sub, btn, hint = "") {
  $c.innerHTML = `<small>${sub}</small>${title}`; $b.textContent = btn; $("#hint").textContent = hint;
  $c.style.animation = "none"; void $c.offsetWidth; $c.style.animation = "";
  players(); paint();
}
function newRound() {
  S.psychic = S.last < 0 ? Math.floor(Math.random() * 2) : 1 - S.last; S.last = S.psychic;
  S.card = CAT.slice();
  S.target = Math.random() * 100; S.guess = 50; S.phase = "wait";
  $v.textContent = ""; $v.className = "verdict";
  build();
  ui(`Turno de ${NAMES[S.psychic]}`, `${NAMES[1 - S.psychic]}, aparta la vista`, `Soy ${NAMES[S.psychic]}: ver posición`);
}
function act() {
  const g = 1 - S.psychic;
  if (S.phase === "wait") { S.phase = "psychic"; ui("Memoriza la posición", `${NAMES[S.psychic]}, solo tú miras · piensa una pista`, `Ocultar y pasar a ${NAMES[g]}`, "Di tu pista en voz alta, sin números ni posiciones"); }
  else if (S.phase === "psychic") { S.phase = "guess"; ui(`${NAMES[g]}, ¿dónde está?`, `Pista de ${NAMES[S.psychic]}`, "Fijar respuesta", "Arrastra la aguja o usa las flechas · Enter para confirmar"); }
  else if (S.phase === "guess") reveal();
  else if (S.scores.some(s => s >= GOAL) && S.scores[0] !== S.scores[1]) { S.scores = [0, 0]; S.last = -1; newRound(); }
  else newRound();
}
function reveal() {
  const g = 1 - S.psychic, d = Math.abs(S.guess - S.target);
  const pts = d <= W ? 4 : d <= 3 * W ? 3 : d <= 5 * W ? 2 : 0;
  S.scores[g] += pts; S.phase = "reveal";
  const [a, b] = S.scores, won = Math.max(a, b) >= GOAL && a !== b ? (a > b ? 0 : 1) : -1;
  $v.textContent = won >= 0 ? `${NAMES[won]} gana la partida` : ["Lejos. Sin puntos.", "", "Casi: +2 puntos", "Muy cerca: +3 puntos", "¡Diana! +4 puntos"][pts];
  $v.className = "verdict show p" + (won >= 0 ? 4 : pts);
  ui(won >= 0 ? "Fin de la partida" : "Resultado", `${NAMES[g]} suma ${pts}`, won >= 0 ? "Nueva partida" : "Siguiente ronda");
}
$b.addEventListener("click", act);

// ---------- Pantalla de inicio: nombres y categoría escritos a mano ----------
const KEY = "lazona:ajustes";
const $form = $("#setupForm"), $n = [$("#name0"), $("#name1")], $cat = [$("#catL"), $("#catR")], $set = $("#settings");
let CAT = ["", ""];

const clean = (s, max = 14) => s.replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
try { localStorage.removeItem(KEY); } catch {}  // limpia ajustes guardados por versiones anteriores

// Vuelve al menú y reinicia jugadores, categoría y marcador (nada se guarda entre sesiones).
function showSetup() {
  NAMES = DEFAULT_NAMES.slice();
  CAT = ["", ""];
  S.scores = [0, 0]; S.last = -1; S.phase = "wait";
  $n.forEach(inp => { inp.value = ""; });
  $cat.forEach(inp => { inp.value = ""; });
  $set.textContent = "⚙ Ajustes";
  document.body.classList.add("in-setup");
  scrollTo(0, 0);
  if (matchMedia("(pointer: fine)").matches) $n[0].focus();
}

$form.addEventListener("submit", e => {
  e.preventDefault();
  const a = clean($n[0].value) || DEFAULT_NAMES[0];
  let b = clean($n[1].value) || DEFAULT_NAMES[1];
  if (b.toLowerCase() === a.toLowerCase()) b += " 2";
  const l = clean($cat[0].value, 18), r = clean($cat[1].value, 18);
  if (!l || !r) { (l ? $cat[1] : $cat[0]).focus(); return; }
  NAMES = [a, b];
  CAT = [l, r];
  S.scores = [0, 0]; S.last = -1;
  $set.textContent = `⚙ Ajustes · ${l} – ${r}`;
  document.body.classList.remove("in-setup");
  history.pushState({ game: true }, "");   // permite usar el botón/gesto "atrás"
  newRound();
});

// Botón "atrás" del móvil/navegador: desde la partida vuelve al menú.
addEventListener("popstate", () => {
  if (document.body.classList.contains("in-setup")) return;
  if ((S.scores[0] + S.scores[1]) > 0 && !confirm("Se perderá la partida en curso. ¿Volver al inicio?")) {
    history.pushState({ game: true }, "");  // cancela: seguimos en la partida
    return;
  }
  showSetup();
});

// Botón de la esquina superior izquierda (y "Ajustes"): vuelve al menú.
const goBack = () => {
  if (history.state && history.state.game) history.back();  // pasa por popstate (con confirmación)
  else showSetup();
};
$set.addEventListener("click", goBack);
$("#back").addEventListener("click", goBack);

history.replaceState(null, "");
showSetup();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./service-worker.js")
            .then(() => {
                console.log("Service Worker registrado");
            })
            .catch(error => {
                console.error("Error registrando Service Worker:", error);
            });
    });
}

})();
