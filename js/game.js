(() => {
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const NS = "http://www.w3.org/2000/svg", CX = 200, CY = 220, R = 180;

// ---------- Ajustes (se guardan en el dispositivo) ----------
const PREF_KEY = "lazona:prefs";
// Semiancho de la zona central (en % de la ruleta) según la dificultad: más pequeño = más difícil.
const WIDTHS = { easy: 2.5, normal: 1.75, hard: 1.25 };
const DEFAULTS = { theme: "dark", difficulty: "normal", goal: 10, hints: true, sound: true, vibrate: true, reduceMotion: false };
let P = Object.assign({}, DEFAULTS);
try { Object.assign(P, JSON.parse(localStorage.getItem(PREF_KEY) || "{}")); } catch {}
function sanitizePrefs() {
  if (!["light", "dark", "auto"].includes(P.theme)) P.theme = DEFAULTS.theme;
  if (!["easy", "normal", "hard"].includes(P.difficulty)) P.difficulty = DEFAULTS.difficulty;
  P.goal = [10, 15, 0].includes(Number(P.goal)) ? Number(P.goal) : DEFAULTS.goal;   // 0 = infinito
  ["hints", "sound", "vibrate", "reduceMotion"].forEach(k => { if (typeof P[k] !== "boolean") P[k] = DEFAULTS[k]; });
}
sanitizePrefs();
const savePrefs = () => { try { localStorage.setItem(PREF_KEY, JSON.stringify(P)); } catch {} };

// W es el ancho de zona de la ronda en curso; cambia al empezar cada ronda.
let W = WIDTHS[P.difficulty];
const bandsFor = w => [[w, 2, "z2", -4 * w], [w, 3, "z3", -2 * w], [w, 4, "z4", 0], [w, 3, "z3", 2 * w], [w, 2, "z2", 4 * w]];
const DEFAULT_NAMES = ["Jugador 1", "Jugador 2"];
let NAMES = DEFAULT_NAMES.slice();
const S = { phase: "wait", guess: 50, target: 50, scores: [0, 0], psychic: 0, last: -1, card: null, over: false };
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
  el("path", { d: wedge(0, 100), class: "dial-face" }, dial);

  // Escudo que tapa la zona hasta que se revela la posición. Se crea antes de las zonas
  // para que, al ocultarse, nunca pueda quedar por encima de ellas.
  const sh = el("g", { id: "shield" }, dial);
  el("path", { d: wedge(0, 100), class: "dial-shield" }, sh);
  el("text", { x: CX, y: 135, class: "q" }, sh).textContent = "?";

  // Zona de puntuación: 2 - 3 - 4 - 3 - 2.
  // Importante: NO recortamos las zonas en 0/100. Si el 4 cae en un extremo,
  // la franja continúa por debajo del borde, igual que en una ruleta física.
  // Después dibujamos el aro exterior por encima para ocultar la parte que queda fuera.
  const z = el("g", { id: "zones" }, dial);
  let bands = bandsFor(W);
  if (S.target <= 5 * W) {
    bands = bands.map(([w, score, c, o]) => [w, score, c, Math.abs(o)]);
  } else if (S.target >= 100 - 5 * W) {
    bands = bands.map(([w, score, c, o]) => [w, score, c, -Math.abs(o)]);
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

  el("circle", { cx: CX, cy: CY, r: 15, fill: "url(#brass)", class: "dial-hub", "stroke-width": 3 }, dial);

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
  // Con el panel de ajustes abierto, el juego no reacciona al teclado.
  if (panelOpen) { onPanelKey(e); return; }
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
let curHint = "";
const paintHint = () => { $("#hint").textContent = P.hints ? curHint : ""; };
function ui(title, sub, btn, hint = "") {
  $c.innerHTML = `<small>${sub}</small>${title}`; $b.textContent = btn; curHint = hint; paintHint();
  $c.style.animation = "none"; void $c.offsetWidth; $c.style.animation = "";
  players(); paint();
}
function newRound() {
  S.psychic = S.last < 0 ? Math.floor(Math.random() * 2) : 1 - S.last; S.last = S.psychic;
  S.card = CAT.slice();
  W = WIDTHS[P.difficulty];   // la dificultad elegida se aplica al empezar cada ronda
  S.target = Math.random() * 100; S.guess = 50; S.phase = "wait";
  $v.textContent = ""; $v.className = "verdict";
  build();
  ui(`Turno de ${NAMES[S.psychic]}`, `${NAMES[1 - S.psychic]}, aparta la vista`, `Soy ${NAMES[S.psychic]}: ver posición`);
}
function act() {
  const g = 1 - S.psychic;
  if (S.phase === "wait") { S.phase = "psychic"; ui("Memoriza la posición", `${NAMES[S.psychic]}, solo tú miras · piensa una pista`, `Ocultar y pasar a ${NAMES[g]}`, "Di tu pista en voz alta, sin números ni posiciones"); }
  else if (S.phase === "psychic") { S.phase = "guess"; ui(`${NAMES[g]}, ¿dónde está?`, `Pista de ${NAMES[S.psychic]}`, "Fijar respuesta", COARSE ? "Toca o arrastra la ruleta · Pulsa el botón para confirmar" : "Arrastra la aguja o usa las flechas · Enter para confirmar"); }
  else if (S.phase === "guess") reveal();
  else if (S.over) { S.over = false; S.scores = [0, 0]; S.last = -1; newRound(); }
  else newRound();
}
function reveal() {
  const g = 1 - S.psychic, d = Math.abs(S.guess - S.target);
  const pts = d <= W ? 4 : d <= 3 * W ? 3 : d <= 5 * W ? 2 : 0;
  S.scores[g] += pts; S.phase = "reveal";
  const [a, b] = S.scores, won = P.goal > 0 && Math.max(a, b) >= P.goal && a !== b ? (a > b ? 0 : 1) : -1;
  S.over = won >= 0;
  feedback(won >= 0 ? "win" : pts);
  $v.textContent = won >= 0 ? `${NAMES[won]} gana la partida` : ["Lejos. Sin puntos.", "", "Casi: +2 puntos", "Muy cerca: +3 puntos", "¡Diana! +4 puntos"][pts];
  $v.className = "verdict show p" + (won >= 0 ? 4 : pts);
  ui(won >= 0 ? "Fin de la partida" : "Resultado", `${NAMES[g]} suma ${pts}`, won >= 0 ? "Nueva partida" : "Siguiente ronda");
}
$b.addEventListener("click", act);

// ---------- Aplicar ajustes: tema, animaciones, sonido y vibración ----------
const COARSE = matchMedia("(pointer: coarse)").matches;   // pantalla táctil
const mqLight = matchMedia("(prefers-color-scheme: light)");

function applyTheme() {
  const t = P.theme === "auto" ? (mqLight.matches ? "light" : "dark") : P.theme;
  document.documentElement.setAttribute("data-theme", t);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", t === "light" ? "#f3eee2" : "#060914");
}
function applyPrefs() {
  applyTheme();
  if (P.reduceMotion) document.documentElement.setAttribute("data-reduce", "1");
  else document.documentElement.removeAttribute("data-reduce");
  paintHint();
}
const onSchemeChange = () => { if (P.theme === "auto") applyTheme(); };
if (mqLight.addEventListener) mqLight.addEventListener("change", onSchemeChange); else mqLight.addListener(onSchemeChange);

let AC = null;
function tone(seq) {
  if (!P.sound) return;
  try {
    AC = AC || new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === "suspended") AC.resume();
    const t0 = AC.currentTime;
    seq.forEach(([f, start, dur]) => {
      const o = AC.createOscillator(), g = AC.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + start);
      g.gain.exponentialRampToValueAtTime(0.16, t0 + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + start + dur);
      o.connect(g); g.connect(AC.destination);
      o.start(t0 + start); o.stop(t0 + start + dur + 0.05);
    });
  } catch {}
}
function buzz(pattern) {
  if (!P.vibrate || !("vibrate" in navigator)) return;
  try { navigator.vibrate(pattern); } catch {}
}
// Aviso al revelar: "win" o los puntos conseguidos (0, 2, 3, 4).
function feedback(kind) {
  const snd = {
    win: [[523, 0, .12], [659, .12, .12], [784, .24, .12], [1047, .36, .35]],
    4: [[523, 0, .12], [659, .1, .12], [784, .2, .24]],
    3: [[523, 0, .12], [659, .1, .22]],
    2: [[523, 0, .2]],
    0: [[220, 0, .28]]
  }[kind];
  const vib = { win: [60, 40, 60, 40, 140], 4: [50, 30, 50], 3: [40], 2: [25], 0: [15] }[kind];
  if (snd) tone(snd);
  if (vib) buzz(vib);
}

// ---------- Panel de ajustes (superpuesto) ----------
const $ov = $("#overlay"), $sheet = $("#settingsPanel"), $gear = $("#gear"), $head = $(".sheet-head");
let panelOpen = false, ignorePop = false, lastFocus = null, hideTimer = 0;

function syncPanel() {
  $$('input[name="theme"]').forEach(i => { i.checked = i.value === P.theme; });
  $$('input[name="difficulty"]').forEach(i => { i.checked = i.value === P.difficulty; });
  $$('input[name="goal"]').forEach(i => { i.checked = Number(i.value) === P.goal; });
  $("#optHints").checked = P.hints;
  $("#optSound").checked = P.sound;
  $("#optVibrate").checked = P.vibrate;
  $("#optMotion").checked = P.reduceMotion;
  $("#rowVibrate").hidden = !("vibrate" in navigator);   // p. ej. iPhone no soporta vibración
}
function openPanel() {
  if (panelOpen) return;
  panelOpen = true; lastFocus = document.activeElement;
  clearTimeout(hideTimer);
  syncPanel();
  $ov.hidden = false;
  void $ov.offsetWidth;                       // fuerza el estado inicial para que la animación se vea
  $ov.classList.add("open");
  document.body.classList.add("modal-open");
  $gear.setAttribute("aria-expanded", "true");
  history.pushState({ modal: true }, "");     // el botón/gesto "atrás" del móvil cierra el panel
  $sheet.focus({ preventScroll: true });
}
function closePanel(fromPop) {
  if (!panelOpen) return;
  panelOpen = false;
  $ov.classList.remove("open");
  document.body.classList.remove("modal-open");
  $gear.setAttribute("aria-expanded", "false");
  hideTimer = setTimeout(() => { if (!panelOpen) $ov.hidden = true; }, 260);
  if (!fromPop && history.state && history.state.modal) { ignorePop = true; history.back(); }
  if (lastFocus && lastFocus.isConnected && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
function onPanelKey(e) {
  if (e.key === "Escape") { e.preventDefault(); closePanel(); return; }
  if (e.key !== "Tab") return;
  // Mantiene el foco dentro del panel mientras está abierto.
  const first = $("#sheetClose"), last = $("#resetPrefs");
  if (e.shiftKey && (document.activeElement === first || document.activeElement === $sheet)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

$gear.addEventListener("click", openPanel);
$("#sheetClose").addEventListener("click", () => closePanel());
let downOnBackdrop = false;
$ov.addEventListener("pointerdown", e => { downOnBackdrop = e.target === $ov; });
$ov.addEventListener("click", e => { if (downOnBackdrop && e.target === $ov) closePanel(); });

// Deslizar hacia abajo la cabecera cierra el panel (solo en móvil, donde es una hoja inferior).
let sheetY0 = null, sheetDY = 0;
const isSheet = () => matchMedia("(max-width: 640px)").matches;
$head.addEventListener("pointerdown", e => {
  if (e.target.closest("button") || !isSheet()) return;
  sheetY0 = e.clientY; sheetDY = 0;
  $head.setPointerCapture(e.pointerId);
  $sheet.style.transition = "none";
});
$head.addEventListener("pointermove", e => {
  if (sheetY0 === null) return;
  sheetDY = Math.max(0, e.clientY - sheetY0);
  $sheet.style.transform = `translateY(${sheetDY}px)`;
});
const endSheetDrag = () => {
  if (sheetY0 === null) return;
  const close = sheetDY > 80;
  sheetY0 = null; sheetDY = 0;
  $sheet.style.transition = ""; $sheet.style.transform = "";
  if (close) closePanel();
};
$head.addEventListener("pointerup", endSheetDrag);
$head.addEventListener("pointercancel", endSheetDrag);

$sheet.addEventListener("change", e => {
  const t = e.target;
  if (t.name === "theme") P.theme = t.value;
  else if (t.name === "difficulty") P.difficulty = t.value;
  else if (t.name === "goal") P.goal = Number(t.value);
  else if (t.id === "optHints") P.hints = t.checked;
  else if (t.id === "optSound") { P.sound = t.checked; tone([[660, 0, .09]]); }
  else if (t.id === "optVibrate") { P.vibrate = t.checked; buzz(30); }
  else if (t.id === "optMotion") P.reduceMotion = t.checked;
  else return;
  sanitizePrefs(); applyPrefs(); savePrefs();
});
$("#resetPrefs").addEventListener("click", () => {
  P = Object.assign({}, DEFAULTS);
  applyPrefs(); savePrefs(); syncPanel();
});

applyPrefs();

// ---------- Pantalla de inicio: nombres y categoría escritos a mano ----------
const KEY = "lazona:ajustes";
const $form = $("#setupForm"), $n = [$("#name0"), $("#name1")], $cat = [$("#catL"), $("#catR")];
let CAT = ["", ""];

const clean = (s, max = 14) => s.replace(/[<>&"'`]/g, "").replace(/\s+/g, " ").trim().slice(0, max);
try { localStorage.removeItem(KEY); } catch {}  // limpia ajustes guardados por versiones anteriores

// Vuelve al menú y reinicia jugadores, categoría y marcador (nada se guarda entre sesiones).
function showSetup() {
  NAMES = DEFAULT_NAMES.slice();
  CAT = ["", ""];
  S.scores = [0, 0]; S.last = -1; S.phase = "wait"; S.over = false;
  $n.forEach(inp => { inp.value = ""; });
  $cat.forEach(inp => { inp.value = ""; });
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
  S.scores = [0, 0]; S.last = -1; S.over = false;
  document.body.classList.remove("in-setup");
  history.pushState({ game: true }, "");   // permite usar el botón/gesto "atrás"
  newRound();
});

// Botón "atrás" del móvil/navegador: desde la partida vuelve al menú.
addEventListener("popstate", () => {
  if (ignorePop) { ignorePop = false; return; }       // lo provocó el cierre del panel con su botón
  if (panelOpen) { closePanel(true); return; }         // "atrás" con el panel abierto: solo lo cierra
  if (document.body.classList.contains("in-setup")) return;
  if ((S.scores[0] + S.scores[1]) > 0 && !confirm("Se perderá la partida en curso. ¿Volver al inicio?")) {
    history.pushState({ game: true }, "");  // cancela: seguimos en la partida
    return;
  }
  showSetup();
});

// Botón de la esquina superior izquierda: vuelve al menú.
const goBack = () => {
  if (history.state && history.state.game) history.back();  // pasa por popstate (con confirmación)
  else showSetup();
};
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
