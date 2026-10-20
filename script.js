/* ============================================================
   WILLIAM — edit his personality right here 👇
   ============================================================ */
const SYSTEM_PROMPT = `You are William, a friendly, funny, chill AI buddy chatting on a website.
- Talk casual and teen-friendly, like a cool older friend. Emojis are fine, but don't overdo them.
- Keep replies SHORT by default: 1-4 sentences. Go longer only when someone asks for detail or a step-by-step explanation.
- You help with homework, ideas, jokes, advice, and random questions.
- For homework: explain step by step so they actually learn it. If it looks like a test or quiz, give hints and teach the method instead of just handing over the answer.
- Keep everything clean and age-appropriate. The person you're talking to is a teen.
- You are an AI. Never claim to be human.
- If someone asks who made you or who built you, say: "Naz built me."
- Your name is William. You can use simple markdown (bold, lists, code) when it helps.
- Write math in plain text (like 2x + 6 = 14, x = 4, 3/4, x^2). Never use LaTeX.`;

const AI_URL = "https://text.pollinations.ai/openai"; // free, no key needed
const AI_MODEL = "openai";
const HISTORY_LIMIT = 16;      // how many recent messages William remembers
const TIMEOUT_MS = 45000;      // give up after 45 seconds
const STORE_KEY = "william-chat";
const THEME_KEY = "william-theme";

const THEMES = [
  { id: "modern",  name: "Modern",   sw: ["#0b0d14", "#6d5cff", "#22d3ee"], meta: "#0b0d14" },
  { id: "ironman", name: "Iron Man", sw: ["#1c0a0a", "#c8102e", "#f2b632"], meta: "#0d0606" },
  { id: "neon",    name: "Neon",     sw: ["#06060c", "#ff2bd6", "#00f0ff"], meta: "#06060c" },
  { id: "ocean",   name: "Ocean",    sw: ["#03131c", "#0ea5e9", "#2dd4bf"], meta: "#03131c" },
  { id: "light",   name: "Light",    sw: ["#ffffff", "#3b82f6", "#8b5cf6"], meta: "#f4f5f9" },
];

/* ============================================================ */
const $ = (s) => document.querySelector(s);
const chatEl = $("#chat"), msgsEl = $("#messages"), form = $("#form"), input = $("#input"),
      sendBtn = $("#send"), chips = $("#chips"), statusEl = $("#status");
const AVATAR = document.querySelector(".avatar svg").outerHTML.replace(/id="g"/, 'id="gm"').replace(/url\(#g\)/, "url(#gm)");

let messages = load();
let busy = false;

function load() {
  try {
    const m = JSON.parse(localStorage.getItem(STORE_KEY) || "[]");
    return Array.isArray(m) ? m.filter((x) => x && (x.role === "user" || x.role === "assistant") && typeof x.content === "string") : [];
  } catch { return []; }
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-200))); } catch {} }

/* ---------- tiny safe markdown ---------- */
function esc(s) { return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function inline(s) {
  // s is already escaped
  return s
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_\n]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}
function delatex(s) {
  // the AI sometimes writes school math in LaTeX — turn it into plain readable text
  return s
    .replace(/\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/\\(?:d|t)?frac\{([^{}]*)\}\{([^{}]*)\}/g, "($1)/($2)")
    .replace(/\\sqrt\{([^{}]*)\}/g, "√($1)")
    .replace(/\\(?:Longrightarrow|Rightarrow|implies)/g, "⟹").replace(/\\(?:rightarrow|to)\b/g, "→")
    .replace(/\\times/g, "×").replace(/\\cdot/g, "·").replace(/\\div/g, "÷").replace(/\\pm/g, "±")
    .replace(/\\le(q)?\b/g, "≤").replace(/\\ge(q)?\b/g, "≥").replace(/\\neq/g, "≠").replace(/\\approx/g, "≈").replace(/\\pi\b/g, "π")
    .replace(/\\text\{([^{}]*)\}/g, "$1").replace(/\\[;,:!quad ]+/g, " ").replace(/\^\{([^{}]*)\}/g, "^$1")
    .replace(/\(([A-Za-z0-9]+)\)\/\(([A-Za-z0-9]+)\)/g, "$1/$2");
}
function md(text) {
  const parts = String(text).split(/```/);
  let html = "";
  parts.forEach((part, i) => {
    if (i % 2 === 1) { // code block
      const code = part.replace(/^[\w+-]*\n/, "");
      html += "<pre><code>" + esc(code.replace(/\n$/, "")) + "</code></pre>";
      return;
    }
    const lines = esc(delatex(part)).split("\n");
    let list = null, para = [];
    const flushP = () => { if (para.length) { html += "<p>" + inline(para.join("<br>")) + "</p>"; para = []; } };
    const flushL = () => { if (list) { html += `<${list.t}${list.start > 1 ? ` start="${list.start}"` : ""}>` + list.items.map((x) => "<li>" + inline(x) + "</li>").join("") + `</${list.t}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trimEnd();
      let m;
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) { flushP(); if (!list || list.t !== "ul") { flushL(); list = { t: "ul", items: [] }; } list.items.push(m[1]); }
      else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)/))) { flushP(); if (!list || list.t !== "ol") { flushL(); list = { t: "ol", items: [], start: +m[1] }; } list.items.push(m[2]); }
      else if ((m = line.match(/^#{1,6}\s+(.*)/))) { flushP(); flushL(); html += "<h4>" + inline(m[1]) + "</h4>"; }
      else if (!line.trim()) { if (!list) flushP(); }
      else if (list && /^\s{2,}\S/.test(line)) { list.items[list.items.length - 1] += "<br>" + line.trim(); }
      else { flushL(); para.push(line); }
    }
    flushP(); flushL();
  });
  return html;
}

/* ---------- rendering ---------- */
function bubble(role, content, extraClass = "") {
  const row = document.createElement("div");
  row.className = "row " + (role === "user" ? "me" : "bot") + (extraClass ? " " + extraClass : "");
  const b = document.createElement("div");
  b.className = "bubble";
  if (role === "user") b.textContent = content; else b.innerHTML = md(content);
  if (role !== "user") { const a = document.createElement("div"); a.className = "mini"; a.innerHTML = AVATAR; row.appendChild(a); }
  row.appendChild(b);
  msgsEl.appendChild(row);
  return row;
}
function renderAll() {
  msgsEl.innerHTML = "";
  messages.forEach((m) => bubble(m.role, m.content));
  updateState();
  scrollDown(false);
}
function updateState() {
  const has = messages.length > 0 || msgsEl.children.length > 0;
  document.body.classList.toggle("has-msgs", has);
  chips.classList.toggle("hide", has);
}
function scrollDown(smooth = true) {
  requestAnimationFrame(() => chatEl.scrollTo({ top: chatEl.scrollHeight, behavior: smooth ? "smooth" : "auto" }));
}
function setStatus(typing) {
  statusEl.textContent = typing ? "typing…" : "online";
  statusEl.classList.toggle("typing", typing);
}

/* ---------- talking to the AI ---------- */
async function askAI(onWait) {
  const history = messages.slice(-HISTORY_LIMIT).map((m) => ({ role: m.role, content: m.content }));
  const payload = { model: AI_MODEL, messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history] };
  let lastErr, waits = 0, fails = 0;
  while (true) {
    payload.seed = Math.floor(Math.random() * 1e9); // fresh answer every time (no repeated jokes)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(AI_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: ctrl.signal });
      if (res.status === 402 || res.status === 429) {
        // free version allows about 1 reply every 30 s — wait it out, then try again
        let secs = parseInt(res.headers.get("Retry-After"), 10);
        if (!secs) { const t = await res.text().catch(() => ""); const m = t.match(/after (\d+)\s*s/i); secs = m ? +m[1] : 20; }
        secs = Math.min(Math.max(secs, 1), 40) + 1;
        if (++waits > 3) throw new Error("rate limited");
        clearTimeout(timer);
        await onWait(secs);
        continue;
      }
      if (!res.ok) throw new Error("http " + res.status);
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (typeof text !== "string" || !text.trim()) throw new Error("empty");
      return text.trim();
    } catch (e) {
      lastErr = e;
      if (e.name === "AbortError" || e.message === "rate limited") throw e;
      if (++fails >= 2) throw e;
      await new Promise((r) => setTimeout(r, 1800)); // one quick retry
    } finally { clearTimeout(timer); }
  }
}

function waitWithCountdown(secs) {
  return new Promise((resolve) => {
    let left = secs;
    const tick = () => {
      if (left <= 0) { setStatus(true); return resolve(); }
      statusEl.textContent = `catching his breath… ${left}s`;
      left--; setTimeout(tick, 1000);
    };
    tick();
  });
}

async function reply() {
  busy = true; setStatus(true); sendBtn.disabled = true;
  const typing = document.createElement("div");
  typing.className = "row bot typing-row";
  typing.innerHTML = '<div class="mini">' + AVATAR + '</div><div class="bubble typing-b" aria-label="William is typing"><i></i><i></i><i></i></div>';
  msgsEl.appendChild(typing); scrollDown();
  try {
    const text = await askAI(waitWithCountdown);
    typing.remove();
    messages.push({ role: "assistant", content: text }); save();
    bubble("assistant", text);
  } catch (e) {
    typing.remove();
    const row = bubble("assistant", e && e.name === "AbortError" ? "William's thinking too hard (took too long). Try again?" : "William's thinking too hard, try again 😅", "err");
    const btn = document.createElement("button");
    btn.className = "retry"; btn.type = "button"; btn.textContent = "↻ Try again";
    btn.onclick = () => { row.remove(); reply(); };
    row.querySelector(".bubble").appendChild(btn);
  } finally {
    busy = false; setStatus(false); updateSend(); scrollDown();
  }
}

function send(text) {
  text = text.trim();
  if (!text || busy) return;
  document.querySelectorAll(".row.err").forEach((r) => r.remove());
  messages.push({ role: "user", content: text }); save();
  bubble("user", text); updateState();
  input.value = ""; grow(); updateSend();
  reply();
}

/* ---------- input ---------- */
function grow() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 140) + "px"; }
function updateSend() { sendBtn.disabled = busy || !input.value.trim(); }
input.addEventListener("input", () => { grow(); updateSend(); });
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
});
input.addEventListener("focus", () => setTimeout(() => scrollDown(), 300));
form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
chips.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (c) send(c.textContent); });
$("#newBtn").addEventListener("click", () => {
  if (busy) return;
  messages = []; save(); msgsEl.innerHTML = ""; updateState(); input.focus();
});
if (window.visualViewport) visualViewport.addEventListener("resize", () => scrollDown(false));

/* ---------- themes ---------- */
const sheetBg = $("#sheetBg"), themesEl = $("#themes");
function currentTheme() { return document.documentElement.dataset.theme || "modern"; }
function applyTheme(id) {
  const t = THEMES.find((x) => x.id === id) || THEMES[0];
  document.documentElement.dataset.theme = t.id;
  document.querySelector('meta[name="theme-color"]').setAttribute("content", t.meta);
  try { localStorage.setItem(THEME_KEY, t.id); } catch {}
  drawThemes();
}
function drawThemes() {
  const cur = currentTheme();
  themesEl.innerHTML = THEMES.map((t) =>
    `<button class="theme${t.id === cur ? " on" : ""}" data-id="${t.id}" type="button">
       <span class="sw" style="background:linear-gradient(135deg,${t.sw[0]} 0 40%,${t.sw[1]} 40% 72%,${t.sw[2]} 72%)"></span>
       ${t.name}${t.id === cur ? '<span class="ck">✓</span>' : ""}</button>`).join("");
}
$("#themeBtn").addEventListener("click", () => { drawThemes(); sheetBg.hidden = false; });
sheetBg.addEventListener("click", (e) => { if (e.target === sheetBg) sheetBg.hidden = true; });
themesEl.addEventListener("click", (e) => { const b = e.target.closest(".theme"); if (b) { applyTheme(b.dataset.id); setTimeout(() => (sheetBg.hidden = true), 180); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") sheetBg.hidden = true; });

applyTheme(currentTheme());
renderAll();
