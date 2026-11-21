/*
 * 시의 결 — 화면 로직
 * 데이터: window.POEM_DATA(data/poems.js) → 없으면 data/poems.json을 fetch
 * 분석:   window.LEXICON(js/lexicon.js) + window.PoemEngine(js/engine.js)
 * 모든 글은 textContent로 넣는다(입력한 시도 HTML로 해석하지 않음).
 */
(function () {
  "use strict";

  // ---------------------------------------------------------------- 작은 도우미
  const $ = (id) => document.getElementById(id);
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    setAttrs(n, attrs);
    append(n, kids);
    return n;
  }
  const SVGNS = "http://www.w3.org/2000/svg";
  function sv(tag, attrs, ...kids) {
    const n = document.createElementNS(SVGNS, tag);
    setAttrs(n, attrs);
    append(n, kids);
    return n;
  }
  function setAttrs(n, attrs) {
    if (!attrs) return;
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "text") n.textContent = v;
      else if (k === "class") n.setAttribute("class", v);
      else if (k === "style") n.setAttribute("style", v);
      else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? "" : String(v));
    }
  }
  function append(n, kids) {
    for (const c of kids.flat(Infinity)) {
      if (c == null || c === false) continue;
      n.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    }
  }
  const clear = (n) => { while (n.firstChild) n.removeChild(n.firstChild); return n; };
  const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
  const OLD_HANGUL = /[ᄀ-ᇿꥠ-꥿ힰ-퟿]/;
  const link = (href, text) => el("a", { href, target: "_blank", rel: "noopener noreferrer", text });
  // 키보드로도 누를 수 있는 SVG 요소
  function pressable(node, label, fn) {
    node.setAttribute("tabindex", "0");
    node.setAttribute("role", "button");
    node.setAttribute("aria-label", label);
    node.addEventListener("click", fn);
    node.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(e); } });
    return node;
  }

  // ---------------------------------------------------------------- 상태
  const S = {
    poems: [], byId: new Map(), EMOS: [], K: [], emo: new Map(), matcher: null,
    lex: new Map(), phat: new Map(), fin: new Map(),
    w: 0.5, sel: null, line: null, focus: null, marks: true, orig: false, query: "", mine: null,
  };

  function fail(msg) {
    const box = $("loadError");
    clear(box);
    append(box, [
      el("strong", { text: "시 데이터를 불러오지 못했습니다. " }), msg,
      el("br"),
      el("span", { class: "small", text: "data/poems.js와 data/poems.json이 저장소에 있는지, 파일 이름의 대소문자가 맞는지 확인해 주세요. 새로 고침하면 다시 시도합니다." }),
    ]);
    box.hidden = false;
    $("poemTitle").textContent = "불러오기 실패";
  }

  function boot() {
    if (!window.LEXICON || !window.PoemEngine) { fail("분석 스크립트(js/lexicon.js, js/engine.js)가 없습니다."); return; }
    if (Array.isArray(window.POEM_DATA) && window.POEM_DATA.length) { start(window.POEM_DATA); return; }
    // 스크립트가 없으면 JSON을 직접 읽어 본다(http로 열었을 때만 가능)
    fetch("data/poems.json", { cache: "no-store" })
      .then((r) => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then((d) => { if (!Array.isArray(d) || !d.length) throw new Error("형식 오류"); start(d); })
      .catch((e) => fail(`(${window.__dataScriptFailed ? "poems.js 없음, " : ""}poems.json: ${e.message})`));
  }

  function start(poems) {
    const L = window.LEXICON, E = window.PoemEngine;
    try {
      S.EMOS = L.EMOS; S.K = L.EMOS.map((e) => e.k);
      S.EMOS.forEach((e) => S.emo.set(e.k, e));
      S.matcher = E.buildMatcher(L.EMOS, L.LEX, L.BLOCK);
      S.poems = poems.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      for (const p of S.poems) {
        S.byId.set(p.id, p);
        S.lex.set(p.id, E.analyzeText(p.text, { EMOS: S.EMOS, matcher: S.matcher }, p.id));
        S.phat.set(p.id, E.profileVector(p.profile, S.K));
      }
    } catch (e) { fail("분석 준비 중 오류: " + e.message); return; }
    S.memoOK = storageOK();
    recompute();
    bindStatic();
    renderMethod();
    const q = new URLSearchParams(location.search).get("p");
    selectPoem(S.byId.has(q) ? q : S.poems[0].id, { fromLoad: true });
  }

  function recompute() {
    const E = window.PoemEngine;
    for (const p of S.poems) S.fin.set(p.id, E.combine(S.lex.get(p.id).vec, S.phat.get(p.id), S.w));
  }
  const finOf = (id) => S.fin.get(id).vec;
  const pct = (vec) => window.PoemEngine.percents(vec, 1);
  const isZero = (vec) => !vec.some((x) => x > 0);
  const dominantOf = (vec) => window.PoemEngine.dominantOf(vec, S.K);
  const LOW_EVIDENCE = 3;
  const mark = (k) => S.emo.get(k).name[0];   // 이름 첫 글자(슬·기·평·희·사·부·그·분·불·허)는 서로 다르다

  function methodLabel(p) {
    const lx = S.lex.get(p.id);
    if (!S.phat.get(p.id)) return "사전만(이 작품에는 해석 프로필이 없음)";
    const wp = Math.round(S.w * 100);
    if (wp >= 100) return "사전 100%";
    if (lx.total === 0) return `사전 감지 0건이라 해석 프로필만 반영(사전 ${wp}%)`;
    if (wp <= 0) return "해석 프로필 100%";
    return `사전 ${wp}% + 해석 프로필 ${100 - wp}%`;
  }

  // ---------------------------------------------------------------- 고정 이벤트
  function bindStatic() {
    $("q").addEventListener("input", (e) => { S.query = e.target.value; renderList(); });
    $("w").addEventListener("input", (e) => {
      S.w = Number(e.target.value) / 100;
      $("wOut").textContent = e.target.value + "%";
      recompute();
      renderWeightViews();
    });
    $("btnMarks").addEventListener("click", () => {
      S.marks = !S.marks;
      $("btnMarks").setAttribute("aria-pressed", String(S.marks));
      $("poemBox").classList.toggle("nomarks", !S.marks);
    });
    $("btnOrig").addEventListener("click", () => { S.orig = !S.orig; renderPoem(); });
    $("btnClearFocus").addEventListener("click", () => setFocus(null));
    $("mineRun").addEventListener("click", runMine);
    $("mineClear").addEventListener("click", () => { $("mineText").value = ""; S.mine = null; clear($("mineOut")); $("mineText").focus(); });
    window.addEventListener("popstate", () => {
      const q = new URLSearchParams(location.search).get("p");
      if (q && S.byId.has(q) && q !== S.sel) selectPoem(q, { fromLoad: true });
    });
  }

  // ---------------------------------------------------------------- 작품 선택
  function selectPoem(id, opt = {}) {
    const t0 = performance.now();
    S.sel = id; S.line = null; S.focus = null; S.orig = false;
    if (!opt.fromLoad) {
      const u = new URL(location.href);
      u.searchParams.set("p", id);
      u.hash = "";
      try { history.pushState(null, "", u); } catch (e) { /* file:// 등에서 주소를 못 바꿔도 화면은 그대로 동작 */ }
    }
    renderList();
    renderPoem();
    renderBiblio();
    renderFlow();
    renderWeightViews();
    renderLineInfo();
    renderMemo();
    document.title = `${S.byId.get(id).title} — 시의 결`;
    document.body.dataset.renderMs = String(Math.round(performance.now() - t0));
    if (opt.scrollTop) document.getElementById("reading").scrollIntoView({ block: "start" });
    // 휴대폰 가로 목록에서 선택한 시가 보이게(세로 스크롤은 건드리지 않음)
    const btn = document.querySelector(`#poemList button[data-id="${id}"]`);
    if (btn && btn.parentElement) {
      const ul = $("poemList");
      const li = btn.parentElement;
      if (ul.scrollWidth > ul.clientWidth) ul.scrollLeft = Math.max(0, li.offsetLeft - ul.clientWidth / 2 + li.offsetWidth / 2);
    }
  }

  // 가중치에 따라 바뀌는 화면(행별 감지 수·본문 표시는 그대로)
  function renderWeightViews() {
    renderAnalysis();
    renderCompare();
    renderRadar();
    renderDiagram();
    renderRecs();
    renderHeat();
    renderPCA();
    renderMineRecs();
    updateFocusNote();
  }

  // ---------------------------------------------------------------- F-01 시 목록
  function renderList() {
    const ul = clear($("poemList"));
    const q = S.query.trim().replace(/\s+/g, "").toLowerCase();
    let shown = 0;
    for (const p of S.poems) {
      const hay = (p.title + p.poet).replace(/\s+/g, "").toLowerCase();
      if (q && !hay.includes(q)) continue;
      shown++;
      ul.appendChild(el("li", null, el("button", {
        type: "button", "data-id": p.id, "aria-pressed": String(p.id === S.sel),
        onclick: () => selectPoem(p.id),
      }, el("span", { class: "t", text: p.title }), el("span", { class: "p", text: p.poet }))));
    }
    $("listEmpty").hidden = shown > 0;
    $("listCount").textContent = q ? `${S.poems.length}편 중 ${shown}편` : "";
  }

  // ---------------------------------------------------------------- F-02 본문(+ F-04 행별 감정 표시)
  function renderPoem() {
    const p = S.byId.get(S.sel);
    const lx = S.lex.get(p.id);
    $("poemTitle").textContent = p.title;
    const meta = [`${p.poet}`, `발표 ${p.year}`, p.edition.label];
    if (p.titleInEdition) meta.push(`판본 제목 「${p.titleInEdition}」`);
    $("poemMeta").textContent = meta.join(" · ");
    const box = clear($("poemBox"));
    const canOrig = !!p.orig;
    $("btnOrig").hidden = !canOrig;
    $("btnOrig").setAttribute("aria-pressed", String(S.orig && canOrig));
    $("origNote").hidden = !(S.orig && canOrig);
    box.classList.toggle("nomarks", !S.marks);
    if (S.orig && canOrig) {
      box.classList.toggle("old", OLD_HANGUL.test(p.orig));
      for (const st of p.orig.split(/\n\s*\n/)) {
        const d = el("div", { class: "stanza" });
        st.split("\n").forEach((t) => d.appendChild(el("div", { class: "ln", style: "cursor:default" }, el("span", { class: "no" }), el("span", { class: "tx", text: t }))));
        box.appendChild(d);
      }
      return;
    }
    box.classList.toggle("old", OLD_HANGUL.test(p.text));
    let cur = null, curSt = 0;
    for (const l of lx.lines) {
      if (l.stanza !== curSt) { cur = el("div", { class: "stanza" }); box.appendChild(cur); curSt = l.stanza; }
      cur.appendChild(lineButton(l));
    }
    updateLineClasses();
  }

  function lineSegments(l, litWord) {
    const out = [];
    let pos = 0;
    for (const h of l.hits) {
      if (h.start > pos) out.push(l.text.slice(pos, h.start));
      const e = S.emo.get(h.k);
      out.push(el("span", {
        class: "hit" + (litWord && h.w === litWord ? " lit" : ""), style: `--c:${e.color}`, "data-w": h.w,
      }, h.shown, el("sup", { "aria-hidden": "true", text: mark(h.k) })));
      pos = h.end;
    }
    if (pos < l.text.length) out.push(l.text.slice(pos));
    return out;
  }
  function countsText(counts) {
    return S.K.map((k, j) => (counts[j] ? `${mark(k)}${counts[j]}` : "")).filter(Boolean).join(" ");
  }
  function countsLong(counts) {
    return S.K.map((k, j) => (counts[j] ? `${S.emo.get(k).name} ${counts[j]}` : "")).filter(Boolean).join(", ");
  }
  function lineButton(l) {
    const label = `${l.no}행. ${l.text}. ` + (l.hits.length ? `감지: ${l.hits.map((h) => `${h.shown}(${S.emo.get(h.k).name})`).join(", ")}` : "사전에서 감지한 시어 없음");
    return el("button", {
      type: "button", class: "ln", "data-no": l.no, "aria-label": label,
      onclick: () => selectLine(S.line === l.no ? null : l.no),
    }, el("span", { class: "no", "aria-hidden": "true", text: l.no }),
       el("span", { class: "tx", "aria-hidden": "true" }, lineSegments(l)),
       el("span", { class: "cnt", "aria-hidden": "true", text: countsText(l.counts) }));
  }

  function lineMatches(l) {
    const f = S.focus;
    if (!f) return false;
    if (f.type === "emo") return l.counts[S.K.indexOf(f.k)] > 0;
    return l.hits.some((h) => h.w === f.w);
  }
  function updateLineClasses() {
    const lx = S.lex.get(S.sel);
    for (const b of $("poemBox").querySelectorAll("button.ln")) {
      const l = lx.lines[Number(b.dataset.no) - 1];
      const m = lineMatches(l);
      b.classList.toggle("sel", S.line === l.no);
      b.classList.toggle("lit", !!S.focus && m);
      b.classList.toggle("dim", !!S.focus && !m);
      b.setAttribute("aria-pressed", String(S.line === l.no));
      for (const h of b.querySelectorAll(".hit")) h.classList.toggle("lit", !!S.focus && S.focus.type === "word" && h.dataset.w === S.focus.w);
    }
  }
  function scrollLineIntoBox(no) {
    const box = $("poemBox");
    const b = box.querySelector(`button.ln[data-no="${no}"]`);
    if (!b) return;
    const top = b.offsetTop - box.offsetTop;
    if (top < box.scrollTop || top > box.scrollTop + box.clientHeight - b.offsetHeight) box.scrollTop = Math.max(0, top - box.clientHeight / 3);
  }

  // ---------------------------------------------------------------- 계산과 해석 사이 A: 행·감정·시어 강조
  function selectLine(no, opt = {}) {
    if (S.orig) { S.orig = false; renderPoem(); }
    S.line = no;
    updateLineClasses();
    if (no && opt.scroll) scrollLineIntoBox(no);
    renderLineInfo();
    renderMemo();
    updateFlowSel();
  }
  function setFocus(f) {
    if (S.orig && f) { S.orig = false; renderPoem(); }
    const same = f && S.focus && f.type === S.focus.type && (f.k === S.focus.k && f.w === S.focus.w);
    S.focus = same ? null : f;
    updateLineClasses();
    renderLineInfo();
    renderAnalysis();
    renderDiagram();
    updateFocusNote();
    if (S.focus) {
      const first = S.lex.get(S.sel).lines.find(lineMatches);
      if (first) scrollLineIntoBox(first.no);
    }
  }
  function updateFocusNote() {
    const note = $("focusNote");
    $("btnClearFocus").hidden = !S.focus;
    if (!S.focus) { note.hidden = true; return; }
    const n = S.lex.get(S.sel).lines.filter(lineMatches).length;
    let t;
    if (S.focus.type === "emo") {
      const e = S.emo.get(S.focus.k);
      const j = S.K.indexOf(S.focus.k);
      const v = pct(finOf(S.sel))[j];
      t = n ? `‘${e.name}’ 시어가 감지된 행 ${n}개를 강조했습니다.`
            : `사전이 ‘${e.name}’으로 감지한 행은 없습니다.` + (v > 0 ? ` 지금 보이는 ${fmt(v)}%는 해석 프로필에서 온 값입니다.` : "");
    } else {
      t = `시어 ‘${S.focus.label || S.focus.w}’이(가) 나온 행 ${n}개를 강조했습니다.`;
    }
    note.textContent = t;
    note.hidden = false;
  }

  function renderLineInfo() {
    const box = clear($("lineInfo"));
    const lx = S.lex.get(S.sel);
    if (!S.line) {
      box.appendChild(el("p", { class: "small muted", text: `행을 누르면 그 행에서 감지된 시어와 범주별 개수를 봅니다. 분석 행 ${lx.lines.length}개 가운데 ${lx.lines.filter((l) => l.hits.length).length}개 행에서 시어가 감지됐습니다.` }));
      return;
    }
    const l = lx.lines[S.line - 1];
    box.appendChild(el("p", { class: "small muted", text: `${l.no}행 · ${l.stanza}연` }));
    box.appendChild(el("p", { class: "q", style: "margin:2px 0" }, lineSegments(l, S.focus && S.focus.type === "word" ? S.focus.w : null)));
    if (!l.hits.length) {
      box.appendChild(el("p", { class: "small", text: "사전에서 감지한 시어 없음 — 감정이 없다는 뜻이 아니라, 이 사전의 시어가 이 행에 나오지 않았다는 뜻입니다." }));
    } else {
      box.appendChild(el("p", { class: "small", style: "margin:4px 0 0", text: `범주별 개수: ${countsLong(l.counts)}` }));
      const ul = el("ul", { class: "chips", "aria-label": "이 행의 감지 시어(누르면 같은 시어가 나온 행을 강조)" });
      l.hits.forEach((h) => {
        const e = S.emo.get(h.k);
        const on = S.focus && S.focus.type === "word" && S.focus.w === h.w;
        ul.appendChild(el("li", null, el("button", {
          type: "button", class: "chip", "aria-pressed": String(!!on), style: `--c:${e.color}`,
          onclick: () => setFocus({ type: "word", w: h.w, label: h.shown }),
        }, el("span", { class: "sw", "aria-hidden": "true" }), `${h.shown} → ${e.name}`)));
      });
      box.appendChild(ul);
    }
    const bl = lx.blocked.filter((b) => b.no === l.no);
    if (bl.length) box.appendChild(el("p", { class: "small muted", text: `차단어 일치: ${bl.map((b) => `‘${b.w}’`).join(", ")} — 부분 문자열 오탐을 막으려고 감정으로 세지 않았습니다.` }));
  }

  // ---------------------------------------------------------------- 서지(본문 출처와 판본)
  function renderBiblio() {
    const p = S.byId.get(S.sel);
    const b = clear($("biblioBody"));
    const dl = el("dl");
    const row = (k, ...v) => { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", null, v)); };
    row("본문 출처", p.source, " ", link(p.sourceUrl, "위키문헌 문서"));
    row("판본", p.edition.label + (p.edition.scan ? ` — ${p.edition.scan}` : "") + (p.edition.proofreadLevel ? ` (판독 상태 level ${p.edition.proofreadLevel})` : ""));
    row("옮긴 방법", p.textMethod);
    if (p.fixes && p.fixes.length) {
      row("고친 곳", el("ul", null, p.fixes.map((f) => el("li", null,
        `‘${f.from}’ → ‘${f.to}’ (${f.count}곳) — ${f.why}`,
        (f.evidence || []).map((ev) => [" ", link(ev.url, ev.label)])))));
    } else row("고친 곳", "없음(내려받은 본문 그대로)");
    row("발표 연도", `${p.year} — ${p.yearBasis}`);
    row("발표 지면", p.firstPub);
    if (p.created) row("창작 연도", p.created);
    if (p.collected) row("시집 수록", p.collected);
    row("발표 근거", (p.pubSources || []).map((s, i) => [i ? " · " : "", link(s.url, s.label)]));
    row("시인 사망", `${p.poetDeath}년 `, (p.deathSources || []).map((s, i) => [i ? " · " : "", link(s.url, s.label)]));
    if (p.titleNote) row("제목", p.titleNote);
    if (p.epigraph) row("부제", p.epigraph);
    if (p.afterword) row("부기", p.afterword);
    b.appendChild(dl);
    if (p.notes && p.notes.length) b.appendChild(el("ul", null, p.notes.map((n) => el("li", { text: n }))));
  }

  // ---------------------------------------------------------------- F-03, F-05
  function renderAnalysis() {
    const p = S.byId.get(S.sel);
    const vec = finOf(p.id);
    const ps = pct(vec);
    const dom = dominantOf(vec);
    const ties = window.PoemEngine.tiesOf(vec, S.K);
    const d = clear($("dominant"));
    d.appendChild(el("span", { class: "lab", text: "지배 정서" }));
    if (!dom) {
      d.appendChild(el("span", { class: "nm", text: "계산하지 않음" }));
      d.appendChild(el("span", { class: "tie", text: "사전에서 감지한 시어가 없어 비율과 지배 정서를 만들지 않았습니다. 가중치를 100% 아래로 내리면 사람이 정한 해석 프로필로 볼 수 있습니다." }));
    } else {
      const e = S.emo.get(dom);
      d.appendChild(el("span", { class: "sw", style: `--c:${e.color};width:14px;height:14px`, "aria-hidden": "true" }));
      d.appendChild(el("span", { class: "nm", text: e.name }));
      d.appendChild(el("span", { class: "pc", text: fmt(ps[S.K.indexOf(dom)]) + "%" }));
      if (ties.length > 1) d.appendChild(el("span", { class: "tie", text: `동률: ${ties.map((k) => S.emo.get(k).name).join(" · ")} — 범주 순서상 앞의 것을 지배 정서로 표시합니다.` }));
    }
    // 근거가 적은 결과 경고(검증 사례 2에서 추가): 감지 시어 1~2개면 비율이 한두 낱말에 좌우된다
    const lxT = S.lex.get(p.id).total;
    if (lxT > 0 && lxT < LOW_EVIDENCE) d.appendChild(el("span", { class: "tie low-ev", text: `주의: 사전이 감지한 시어가 ${lxT}개뿐이라 사전 비율이 한두 낱말에 크게 좌우됩니다.` }));
    $("ratioMethod").textContent = "· " + methodLabel(p);
    const ul = clear($("ratios"));
    S.EMOS.forEach((e, j) => {
      const on = S.focus && S.focus.type === "emo" && S.focus.k === e.k;
      ul.appendChild(el("li", null,
        el("button", { type: "button", "aria-pressed": String(!!on), "aria-label": `${e.name} ${dom ? fmt(ps[j]) + "%" : "값 없음"}. 누르면 이 감정이 감지된 행을 강조`, onclick: () => setFocus({ type: "emo", k: e.k }) },
          el("span", { class: "sw", style: `--c:${e.color}`, "aria-hidden": "true" }), e.name),
        el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: `--c:${e.color};width:${dom ? ps[j] : 0}%` })),
        el("span", { class: "v", text: dom ? fmt(ps[j]) + "%" : "—" })));
    });
    const it = clear($("interp"));
    const dl = el("dl");
    const row = (k, v) => { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", null, v)); };
    row("주제", p.theme);
    if (p.speaker) row("화자", p.speaker);
    if (p.devices && p.devices.length) row("표현", p.devices.join(", "));
    if (p.key && p.key.length) row("핵심 구절", el("span", { class: "keyline", text: p.key.join(" / ") }));
    it.appendChild(dl);
    it.appendChild(el("h3", { class: "mini-title", text: "해석" }));
    it.appendChild(el("p", { class: "body", text: p.interp }));
  }

  // ---------------------------------------------------------------- 계산과 해석 사이 B: 사전만 vs 결합
  function renderCompare() {
    const p = S.byId.get(S.sel);
    const lx = S.lex.get(p.id);
    const ph = S.phat.get(p.id);
    const fv = finOf(p.id);
    const lp = pct(lx.vec), pp = ph ? pct(ph) : null, fp = pct(fv);
    const lz = isZero(lx.vec), fz = isZero(fv);
    const wp = Math.round(S.w * 100);
    const t = clear($("compare"));
    t.appendChild(el("caption", { class: "small muted", style: "text-align:left;caption-side:top", text: `사전 감지 ${lx.total}개 · 분석 행 ${lx.lines.length}개 중 ${lx.lines.filter((l) => l.hits.length).length}개 행에서 감지 · 가중치 ${wp}%` }));
    t.appendChild(el("thead", null, el("tr", null,
      el("th", { scope: "col", text: "감정" }), el("th", { scope: "col", text: "사전만" }), el("th", { scope: "col", text: "해석 프로필" }),
      el("th", { scope: "col", text: `결합(${wp}%)` }), el("th", { scope: "col", text: "차이(%p)" }))));
    const tb = el("tbody");
    S.EMOS.forEach((e, j) => {
      let diff = "—", cls = "";
      if (!lz && !fz) {
        const dv = (fv[j] - lx.vec[j]) * 100;
        const r = Math.round(dv * 10) / 10;
        diff = (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r).toFixed(1);
        cls = r > 0 ? "pos" : r < 0 ? "neg" : "";
      }
      tb.appendChild(el("tr", null,
        el("th", { scope: "row", style: "text-align:left;font-weight:500" }, el("span", { class: "sw", style: `--c:${e.color};margin-right:6px`, "aria-hidden": "true" }), e.name),
        el("td", { text: lz ? "—" : fmt(lp[j]) }), el("td", { text: pp ? fmt(pp[j]) : "없음" }),
        el("td", { text: fz ? "—" : fmt(fp[j]) }), el("td", { class: cls, text: diff })));
    });
    const sum = (a) => fmt(a.reduce((s, x) => s + x, 0));
    tb.appendChild(el("tr", null, el("th", { scope: "row", style: "text-align:left", text: "합계" }),
      el("td", { text: lz ? "—" : sum(lp) }), el("td", { text: pp ? sum(pp) : "—" }), el("td", { text: fz ? "—" : sum(fp) }), el("td")));
    t.appendChild(tb);
    const ld = dominantOf(lx.vec), fd = dominantOf(fv);
    const nm = (k) => (k ? S.emo.get(k).name : "없음");
    const note = clear($("profileNote"));
    append(note, [
      el("strong", { text: "지배 정서: " }), `사전만 ${nm(ld)} → 결합 ${nm(fd)}`, ld !== fd ? " (달라짐)" : " (같음)", el("br"),
      el("strong", { text: "해석 프로필의 근거: " }), p.profileNote || "프로필 없음", el("br"),
      el("span", { class: "muted", text: "해석 프로필은 사람이 정한 0~1 값이며 모델이 계산한 결과가 아닙니다. 작품을 고를 때 붙인 분류 라벨로 만들지 않았습니다." }),
    ]);
  }

  // ---------------------------------------------------------------- 계산과 해석 사이 C: 독자 메모(localStorage)
  const MEMO_KEY = "sigyeol.memo.v1";
  function storageOK() {
    try { const k = "__sigyeol_test"; localStorage.setItem(k, "1"); localStorage.removeItem(k); return true; } catch (e) { return false; }
  }
  function memoLoad() {
    try { const v = JSON.parse(localStorage.getItem(MEMO_KEY) || "{}"); return v && typeof v === "object" ? v : {}; } catch (e) { return {}; }
  }
  function memoSave(all) {
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }
  function renderMemo() {
    const box = clear($("memo"));
    box.appendChild(el("p", { class: "small muted", text: "메모는 이 기기의 이 브라우저에만 저장됩니다. 감정 계산이나 정답 판정에 쓰지 않으며, 다른 기기나 서버로 보내지 않습니다." }));
    if (!S.memoOK) { box.appendChild(el("p", { class: "notice small", text: "이 브라우저에서는 저장 공간을 쓸 수 없어 메모 기능을 끕니다(사생활 보호 모드 등)." })); return; }
    const all = memoLoad();
    const mine = all[S.sel] || {};
    if (S.line) {
      const l = S.lex.get(S.sel).lines[S.line - 1];
      const ta = el("textarea", { id: "memoText", rows: "3", maxlength: "1000", "aria-label": `${l.no}행 메모` });
      ta.value = mine[l.no] || "";
      const status = el("span", { class: "small muted", "aria-live": "polite" });
      box.appendChild(el("p", { class: "small", style: "margin:4px 0", text: `${l.no}행에 남길 메모` }));
      box.appendChild(ta);
      box.appendChild(el("div", { class: "row-btns" },
        el("button", { type: "button", class: "btn", onclick: () => {
          const a = memoLoad(); const v = ta.value.trim();
          a[S.sel] = a[S.sel] || {};
          if (v) a[S.sel][l.no] = v; else delete a[S.sel][l.no];
          status.textContent = memoSave(a) ? (v ? "저장했습니다." : "빈 메모라 지웠습니다.") : "저장하지 못했습니다.";
          renderMemoList(box, a[S.sel] || {});
        } }, "저장"),
        el("button", { type: "button", class: "tbtn", onclick: () => {
          const a = memoLoad();
          if (a[S.sel]) delete a[S.sel][l.no];
          memoSave(a); ta.value = ""; status.textContent = "지웠습니다.";
          renderMemoList(box, a[S.sel] || {});
        } }, "삭제"),
        status));
    } else {
      box.appendChild(el("p", { class: "small", text: "본문에서 행을 고르면 그 행에 메모를 남길 수 있습니다." }));
    }
    renderMemoList(box, mine);
  }
  function renderMemoList(box, mine) {
    const old = box.querySelector(".memo-list-wrap");
    if (old) old.remove();
    const keys = Object.keys(mine).map(Number).sort((a, b) => a - b);
    if (!keys.length) return;
    const lx = S.lex.get(S.sel);
    const wrap = el("div", { class: "memo-list-wrap" }, el("p", { class: "small muted", style: "margin:10px 0 0", text: `이 시에 남긴 메모 ${keys.length}개` }));
    const ul = el("ul", { class: "memo-list" });
    keys.forEach((no) => {
      const l = lx.lines[no - 1];
      ul.appendChild(el("li", null, el("button", { type: "button", onclick: () => selectLine(no, { scroll: true }) }, `${no}행`), ` ${l ? "「" + l.text.slice(0, 18) + (l.text.length > 18 ? "…" : "") + "」" : ""} — `, mine[no]));
    });
    wrap.appendChild(ul);
    box.appendChild(wrap);
  }

  // ---------------------------------------------------------------- F-06 레이더
  function renderRadar() {
    const p = S.byId.get(S.sel);
    const fv = finOf(p.id), lv = S.lex.get(p.id).vec, ph = S.phat.get(p.id);
    const fp = pct(fv), lp = pct(lv);
    const box = clear($("radar"));
    const W = 380, H = 360, cx = W / 2, cy = H / 2 + 4, R = 128;
    const n = S.K.length;
    const mx = Math.max(...fp, ...lp, 1);
    const top = Math.min(100, Math.ceil(mx / 20) * 20);
    const ang = (j) => -Math.PI / 2 + (2 * Math.PI * j) / n;
    const pt = (j, v) => [cx + Math.cos(ang(j)) * R * (v / top), cy + Math.sin(ang(j)) * R * (v / top)];
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-labelledby": "radarDesc" });
    svg.appendChild(sv("title", { id: "radarDesc", text: `${p.title} 감정 프로필 레이더 차트. 결합 결과와 사전만 결과. 눈금 최대 ${top}%. 값은 아래 표에 있습니다.` }));
    for (let r = 1; r <= 4; r++) {
      const v = (top * r) / 4;
      const pts = S.K.map((_, j) => pt(j, v).join(",")).join(" ");
      svg.appendChild(sv("polygon", { points: pts, fill: "none", stroke: "#d8cfbe", "stroke-width": 1 }));
      svg.appendChild(sv("text", { x: cx + 3, y: cy - R * (r / 4) - 2, "font-size": 10, fill: "#6b6359", text: `${v}%` }));
    }
    S.EMOS.forEach((e, j) => {
      const [x, y] = pt(j, top);
      svg.appendChild(sv("line", { x1: cx, y1: cy, x2: x, y2: y, stroke: "#e2d9c8" }));
      const [lx2, ly2] = [cx + Math.cos(ang(j)) * (R + 18), cy + Math.sin(ang(j)) * (R + 18)];
      const anchor = Math.abs(Math.cos(ang(j))) < 0.2 ? "middle" : Math.cos(ang(j)) > 0 ? "start" : "end";
      svg.appendChild(sv("text", { x: lx2, y: ly2 + 4, "text-anchor": anchor, "font-size": 12, text: e.name }));
    });
    const poly = (vals, attrs) => sv("polygon", Object.assign({ points: S.K.map((_, j) => pt(j, vals[j]).join(",")).join(" ") }, attrs));
    if (!isZero(lv)) svg.appendChild(poly(lp, { fill: "none", stroke: "#4a433c", "stroke-width": 1.6, "stroke-dasharray": "5 4" }));
    if (!isZero(fv)) {
      svg.appendChild(poly(fp, { fill: "rgba(124,59,42,.16)", stroke: "#7c3b2a", "stroke-width": 2.2 }));
      fp.forEach((v, j) => { const [x, y] = pt(j, v); svg.appendChild(sv("circle", { cx: x, cy: y, r: 2.6, fill: "#7c3b2a" })); });
    }
    if (isZero(lv) && isZero(fv)) svg.appendChild(sv("text", { x: cx, y: cy + 4, "text-anchor": "middle", "font-size": 13, text: "표시할 값이 없습니다(사전 감지 0건)" }));
    box.appendChild(svg);
    box.appendChild(el("ul", { class: "legend small" },
      el("li", null, el("span", { class: "key-solid", style: "border-color:#7c3b2a" }), `결합 결과(${methodLabel(p)})`),
      el("li", null, el("span", { class: "key-dash" }), "사전만")));
    const t = clear($("radarTable"));
    t.appendChild(el("caption", { class: "sr-label", text: "감정 프로필 값(%)" }));
    t.appendChild(el("thead", null, el("tr", null, el("th", { text: "감정" }), el("th", { text: "결합" }), el("th", { text: "사전만" }), el("th", { text: "해석 프로필" }))));
    const tb = el("tbody");
    const pp = ph ? pct(ph) : null;
    S.EMOS.forEach((e, j) => tb.appendChild(el("tr", null, el("td", { text: e.name }),
      el("td", { text: isZero(fv) ? "—" : fmt(fp[j]) }), el("td", { text: isZero(lv) ? "—" : fmt(lp[j]) }), el("td", { text: pp ? fmt(pp[j]) : "없음" }))));
    t.appendChild(tb);
  }

  // ---------------------------------------------------------------- F-07 행별 감정 흐름
  function renderFlow() {
    const lx = S.lex.get(S.sel);
    const box = clear($("flow"));
    const n = lx.lines.length;
    const maxC = Math.max(1, ...lx.lines.map((l) => l.counts.reduce((a, b) => a + b, 0)));
    const padL = 34, padR = 10, padT = 12, padB = 40, ch = 170;
    // 상자 폭에 맞춰 막대 폭을 정하고, 너무 좁아지면(8px 미만) 상자 안에서 가로 스크롤
    const avail = Math.max(300, (box.clientWidth || 600) - 4);
    const slot = Math.max(12, Math.min(34, (avail - padL - padR) / Math.max(n, 1)));
    const gap = Math.max(3, Math.round(slot * 0.22)), bw = slot - gap;
    const W = Math.max(300, padL + padR + n * slot), H = padT + ch + padB;
    const y = (v) => padT + ch - (ch * v) / maxC;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: "max-width:none", "aria-label": `행별 감정 흐름. 분석 행 ${n}개, 한 행 최대 ${maxC}개 감지` });
    for (let v = 0; v <= maxC; v++) {
      if (maxC > 6 && v % 2) continue;
      svg.appendChild(sv("line", { x1: padL - 4, x2: W - padR, y1: y(v), y2: y(v), stroke: v ? "#ece5d8" : "#bdb2a0" }));
      svg.appendChild(sv("text", { x: padL - 8, y: y(v) + 4, "text-anchor": "end", "font-size": 10.5, text: v }));
    }
    svg.appendChild(sv("text", { x: 10, y: padT + ch / 2, "font-size": 11, "text-anchor": "middle", transform: `rotate(-90 10 ${padT + ch / 2})`, text: "감지 수" }));
    svg.appendChild(sv("text", { x: padL + (W - padL - padR) / 2, y: H - 4, "font-size": 11, "text-anchor": "middle", text: "분석 행 번호" }));
    const used = new Set();
    lx.lines.forEach((l, i) => {
      const x = padL + i * slot + gap / 2;
      if (i > 0 && l.stanza !== lx.lines[i - 1].stanza) svg.appendChild(sv("line", { x1: x - gap / 2, x2: x - gap / 2, y1: padT, y2: padT + ch, stroke: "#cfc4b0", "stroke-dasharray": "2 3" }));
      const tot = l.counts.reduce((a, b) => a + b, 0);
      const g = sv("g", { class: "flow-bar" + (S.line === l.no ? " sel" : ""), "data-no": l.no });
      g.appendChild(sv("rect", { class: "hitbox", x: x - 2, y: padT, width: bw + 4, height: ch, fill: "transparent", rx: 3 }));
      let acc = 0;
      S.K.forEach((k, j) => {
        const c = l.counts[j];
        if (!c) return;
        used.add(k);
        g.appendChild(sv("rect", { x, y: y(acc + c), width: bw, height: y(acc) - y(acc + c) - 1, fill: S.emo.get(k).color, rx: 2 }));
        acc += c;
      });
      if (!tot) g.appendChild(sv("rect", { x, y: y(0) - 2, width: bw, height: 2, fill: "#cfc4b0" }));
      if (n <= 24 || l.no % 2 === 1 || l.no === n) svg.appendChild(sv("text", { x: x + bw / 2, y: padT + ch + 14, "text-anchor": "middle", "font-size": 10, text: l.no }));
      pressable(g, `${l.no}행, 감지 ${tot}개${tot ? ": " + countsLong(l.counts) : ""}`, () => { selectLine(l.no, { scroll: true }); });
      g.addEventListener("focus", () => showFlowPick(l));
      svg.appendChild(g);
    });
    box.appendChild(svg);
    const lg = clear($("flowLegend"));
    if (!used.size) lg.appendChild(el("li", { text: "이 시에서는 사전이 감지한 시어가 없습니다." }));
    S.EMOS.filter((e) => used.has(e.k)).forEach((e) => lg.appendChild(el("li", null, el("span", { class: "sw", style: `--c:${e.color}`, "aria-hidden": "true" }), e.name)));
    if (lx.stanzas > 1) lg.appendChild(el("li", { class: "muted", text: "┆ 점선: 연 경계" }));
    showFlowPick(S.line ? lx.lines[S.line - 1] : null);
  }
  function showFlowPick(l) {
    const box = clear($("flowPick"));
    if (!l) { box.textContent = "막대를 고르면 그 행의 본문과 감지 시어가 여기에 보입니다."; return; }
    append(box, [el("strong", { text: `${l.no}행 ` }), `「${l.text}」 `,
      l.hits.length ? `— ${l.hits.map((h) => `${h.shown}(${S.emo.get(h.k).name})`).join(", ")}` : "— 사전에서 감지한 시어 없음"]);
  }
  function updateFlowSel() {
    for (const g of $("flow").querySelectorAll(".flow-bar")) g.classList.toggle("sel", Number(g.dataset.no) === S.line);
    const lx = S.lex.get(S.sel);
    showFlowPick(S.line ? lx.lines[S.line - 1] : null);
  }

  // ---------------------------------------------------------------- F-08 시어 → 감정 → 주제
  function renderDiagram() {
    const p = S.byId.get(S.sel);
    const lx = S.lex.get(p.id);
    const fp = pct(finOf(p.id));
    const box = clear($("dia"));
    // 시어 노드: 실제 감지된 시어(정규형 기준)만
    const words = new Map();
    for (const l of lx.lines) for (const h of l.hits) {
      const o = words.get(h.w) || { w: h.w, shown: h.shown, k: h.k, n: 0 };
      o.n++; words.set(h.w, o);
    }
    let wl = [...words.values()].sort((a, b) => S.K.indexOf(a.k) - S.K.indexOf(b.k) || b.n - a.n);
    const MAXW = 14;
    const hidden = wl.length > MAXW ? wl.length - MAXW : 0;
    if (hidden) wl = wl.slice().sort((a, b) => b.n - a.n).slice(0, MAXW).sort((a, b) => S.K.indexOf(a.k) - S.K.indexOf(b.k) || b.n - a.n);
    const themes = p.themeLinks || [];
    const emoSet = new Set([...words.values()].map((o) => o.k));
    themes.forEach((t) => t.emos.forEach((k) => emoSet.add(k)));
    const emos = S.K.filter((k) => emoSet.has(k));
    const rowH = 30;
    const rows = Math.max(wl.length, emos.length, themes.length * 2, 3);
    const W = 760, H = 46 + rows * rowH;
    const colW = { x: 10, r: 170 }, colE = { x: 290, w: 150 }, colT = { x: 548, w: 205 };
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: "max-width:none", "aria-label": "시어, 감정, 주제 연결 다이어그램" });
    const head = (x, t, a) => svg.appendChild(sv("text", { x, y: 16, "font-size": 12, "font-weight": 700, "text-anchor": a, text: t }));
    head(colW.r, "감지 시어(계산)", "end"); head(colE.x + colE.w / 2, "감정", "middle"); head(colT.x, "주제(해석)", "start");
    const yW = (i) => 40 + i * ((H - 50) / Math.max(wl.length, 1)) + ((H - 50) / Math.max(wl.length, 1)) / 2;
    const yE = (i) => 40 + i * ((H - 50) / Math.max(emos.length, 1)) + ((H - 50) / Math.max(emos.length, 1)) / 2;
    const yT = (i) => 40 + i * ((H - 50) / Math.max(themes.length, 1)) + ((H - 50) / Math.max(themes.length, 1)) / 2;
    const curve = (x1, y1, x2, y2) => `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
    // 연결선 먼저
    wl.forEach((o, i) => {
      const e = S.emo.get(o.k);
      svg.appendChild(sv("path", { d: curve(colW.r + 6, yW(i), colE.x, yE(emos.indexOf(o.k))), fill: "none", stroke: e.color, "stroke-opacity": 0.75, "stroke-width": Math.min(1.2 + o.n * 0.9, 7) }));
    });
    themes.forEach((t, ti) => t.emos.forEach((k) => {
      svg.appendChild(sv("path", { d: curve(colE.x + colE.w, yE(emos.indexOf(k)), colT.x - 6, yT(ti)), fill: "none", stroke: "#8a8072", "stroke-width": 1.4, "stroke-dasharray": "5 4" }));
    }));
    // 시어 노드
    wl.forEach((o, i) => {
      const g = sv("g", { class: "dia-node" });
      const on = S.focus && S.focus.type === "word" && S.focus.w === o.w;
      g.appendChild(sv("rect", { x: colW.x, y: yW(i) - 11, width: colW.r - colW.x + 4, height: 22, rx: 4, fill: on ? "#f0e2d6" : "transparent", stroke: "none" }));
      g.appendChild(sv("text", { x: colW.r, y: yW(i) + 4, "text-anchor": "end", "font-size": 13, text: `${o.shown}${o.n > 1 ? " ×" + o.n : ""}` }));
      pressable(g, `시어 ${o.shown}, ${o.n}회, ${S.emo.get(o.k).name}. 누르면 이 시어가 나온 행을 강조`, () => setFocus({ type: "word", w: o.w, label: o.shown }));
      svg.appendChild(g);
    });
    if (!wl.length) svg.appendChild(sv("text", { x: colW.r, y: 50, "text-anchor": "end", "font-size": 12.5, fill: "#6b6359", text: "사전 감지 시어 없음" }));
    // 감정 노드
    emos.forEach((k, i) => {
      const e = S.emo.get(k), j = S.K.indexOf(k);
      const on = S.focus && S.focus.type === "emo" && S.focus.k === k;
      const g = sv("g", { class: "dia-node" });
      g.appendChild(sv("rect", { x: colE.x, y: yE(i) - 13, width: colE.w, height: 26, rx: 13, fill: on ? "#f0e2d6" : "#fffdf8", stroke: e.color, "stroke-width": 2 }));
      const lexN = lx.totals[j];
      g.appendChild(sv("text", { x: colE.x + colE.w / 2, y: yE(i) + 4.5, "text-anchor": "middle", "font-size": 12.5, text: `${e.name} ${isZero(finOf(p.id)) ? "—" : fmt(fp[j]) + "%"}` }));
      pressable(g, `${e.name}: 사전 감지 ${lexN}개, 최종 ${fmt(fp[j])}%. 누르면 해당 행 강조`, () => setFocus({ type: "emo", k }));
      svg.appendChild(g);
    });
    // 주제 노드(해석, 누를 수 없음)
    themes.forEach((t, ti) => {
      const lines = wrap(t.label, 13);
      const g = sv("g");
      g.appendChild(sv("rect", { x: colT.x, y: yT(ti) - 9 - lines.length * 8, width: colT.w, height: 18 + lines.length * 16, rx: 6, fill: "#f4eee3", stroke: "#cfc4b0", "stroke-dasharray": "4 3" }));
      lines.forEach((ln, li) => g.appendChild(sv("text", { x: colT.x + 10, y: yT(ti) + 4 - (lines.length - 1) * 8 + li * 16, "font-size": 12.5, text: ln })));
      svg.appendChild(g);
    });
    box.appendChild(svg);
    if (hidden) box.appendChild(el("p", { class: "small muted", text: `감지 시어 ${words.size}종 가운데 많이 나온 ${MAXW}종만 그렸습니다(${hidden}종 생략). 감정 비율 계산에는 모두 들어갑니다.` }));
    if (!themes.length) box.appendChild(el("p", { class: "small muted", text: "이 작품에는 감정–주제 연결(해석)이 없습니다." }));
  }
  function wrap(s, n) {
    if (s.length <= n) return [s];
    const cut = s.lastIndexOf(" ", n);
    const i = cut > 4 ? cut : n;
    return [s.slice(0, i).trim(), s.slice(i).trim()];
  }

  // ---------------------------------------------------------------- F-09 추천
  function itemsAll() { return S.poems.map((p) => ({ id: p.id, vec: finOf(p.id), order: p.order ?? 0 })); }
  function recCards(vec, excludeId, target) {
    const r = window.PoemEngine.recommend(vec, itemsAll(), excludeId, 3);
    clear(target);
    if (r.reason === "zero") {
      target.appendChild(el("li", { class: "notice small", style: "grid-column:1/-1", text: "기준이 되는 감정 벡터가 모두 0이라 유사도를 계산할 수 없어 추천하지 않습니다." + (excludeId && S.phat.get(excludeId) ? " 가중치를 100% 아래로 내리면 해석 프로필로 추천을 볼 수 있습니다." : "") }));
      return r;
    }
    if (!r.list.length) { target.appendChild(el("li", { class: "notice small", style: "grid-column:1/-1", text: "비교할 수 있는 다른 작품이 없습니다." })); return r; }
    r.list.forEach((it, i) => {
      const q = S.byId.get(it.id);
      const d = dominantOf(finOf(it.id));
      target.appendChild(el("li", null, el("button", { type: "button", onclick: () => selectPoem(it.id, { scrollTop: true }), "aria-label": `${i + 1}위 ${q.title}, ${q.poet}, 유사도 ${(it.sim * 100).toFixed(1)}%. 누르면 이 시로 이동` },
        el("span", { class: "small muted", text: `${i + 1}위` }),
        el("span", { class: "rt", text: q.title }),
        el("span", { class: "small muted", text: `${q.poet} · 지배 정서 ${d ? S.emo.get(d).name : "없음"}` }), el("br"),
        el("span", { class: "rs", text: (it.sim * 100).toFixed(1) + "%" }), el("span", { class: "small muted", text: " 유사도" }))));
    });
    if (r.tieAtCut) target.appendChild(el("li", { class: "small muted", style: "grid-column:1/-1", text: "3위와 유사도가 같은 작품이 더 있어 수록 순서가 앞선 작품을 보였습니다." }));
    return r;
  }
  function renderRecs() { recCards(finOf(S.sel), S.sel, $("recList")); }

  // ---------------------------------------------------------------- F-10 히트맵
  function renderHeat() {
    const box = clear($("heatBox"));
    const t = el("table", { class: "heat" });
    t.appendChild(el("caption", { class: "sr-label", text: `작품별 최종 감정 비율(%), 가중치 ${Math.round(S.w * 100)}%` }));
    t.appendChild(el("thead", null, el("tr", null, el("th", { class: "row", scope: "col", text: "작품" }), S.EMOS.map((e) => el("th", { scope: "col", title: e.def, text: e.name })))));
    const tb = el("tbody");
    for (const p of S.poems) {
      const v = finOf(p.id), z = isZero(v), ps = pct(v);
      const tr = el("tr", { class: p.id === S.sel ? "sel" : null });
      tr.appendChild(el("th", { class: "row", scope: "row" }, el("button", { type: "button", onclick: () => selectPoem(p.id, { scrollTop: true }), "aria-label": `${p.title} 보기` }, p.title)));
      ps.forEach((x) => {
        const a = z ? 0 : Math.min(1, x / 60);
        tr.appendChild(el("td", { style: `background:rgba(124,59,42,${(a * 0.85).toFixed(3)});color:${a > 0.55 ? "#fbf8f1" : "#2a2521"}`, text: z ? "—" : x.toFixed(0) }));
      });
      tb.appendChild(tr);
    }
    t.appendChild(tb);
    box.appendChild(t);
    const zeros = S.poems.filter((p) => isZero(finOf(p.id)));
    if (zeros.length) box.appendChild(el("p", { class: "small muted", text: `‘—’: 최종 벡터가 0인 작품(${zeros.map((p) => p.title).join(", ")}). 사전 감지가 0건이고 사전 100%로 볼 때 생깁니다.` }));
    box.appendChild(el("p", { class: "small muted", text: "칸 숫자는 반올림한 정수라 한 행 합계가 99~101이 될 수 있습니다. 정확한 값은 위의 비교 표에 있습니다." }));
  }

  // ---------------------------------------------------------------- F-12 감성 지도(PCA)
  function renderPCA() {
    const box = clear($("pca"));
    const axesP = clear($("pcaAxes"));
    const pts = S.poems.filter((p) => !isZero(finOf(p.id)));
    const skipped = S.poems.filter((p) => isZero(finOf(p.id)));
    if (pts.length < 3) { box.appendChild(el("p", { class: "notice small", text: "감정 벡터가 있는 작품이 3편 미만이라 지도를 그리지 않습니다." })); return; }
    const res = window.PoemEngine.pca2(pts.map((p) => finOf(p.id)));
    const W = 640, H = 440, pad = 46;
    const xs = res.coords.map((c) => c[0]), ys = res.coords.map((c) => c[1]);
    const ext = (a) => { const m = Math.max(...a.map(Math.abs), 1e-6); return m * 1.12; };
    const ex = ext(xs), ey = ext(ys);
    const X = (v) => W / 2 + (v / ex) * (W / 2 - pad);
    const Y = (v) => H / 2 - (v / ey) * (H / 2 - pad);
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, style: "min-width:520px", "aria-label": "감성 지도(주성분분석 2차원)" });
    svg.appendChild(sv("rect", { x: 0, y: 0, width: W, height: H, fill: "#fffdf8", rx: 8 }));
    svg.appendChild(sv("line", { x1: pad / 2, x2: W - pad / 2, y1: H / 2, y2: H / 2, stroke: "#d8cfbe" }));
    svg.appendChild(sv("line", { y1: pad / 2, y2: H - pad / 2, x1: W / 2, x2: W / 2, stroke: "#d8cfbe" }));
    const axisName = (comp, sign) => {
      const idx = comp.map((v, j) => [v * sign, j]).filter((x) => x[0] > 0.15).sort((a, b) => b[0] - a[0]).slice(0, 2);
      return idx.length ? idx.map((x) => S.EMOS[x[1]].name).join(", ") : "뚜렷한 감정 없음";
    };
    const c1 = res.comps[0], c2 = res.comps[1];
    const lab = (x, y, t, a) => svg.appendChild(sv("text", { x, y, "text-anchor": a, "font-size": 11.5, fill: "#7c3b2a", text: t }));
    lab(W - 8, H / 2 - 6, `${axisName(c1, 1)} →`, "end");
    lab(8, H / 2 - 6, `← ${axisName(c1, -1)}`, "start");
    lab(W / 2 + 6, 16, `↑ ${axisName(c2, 1)}`, "start");
    lab(W / 2 + 6, H - 8, `↓ ${axisName(c2, -1)}`, "start");
    // 점을 먼저 모두 그리고, 이름표는 겹치지 않는 자리(오른쪽·왼쪽·위·아래)에만 붙인다.
    const P = pts.map((p, i) => ({ p, x: X(res.coords[i][0]), y: Y(res.coords[i][1]), d: dominantOf(finOf(p.id)) }));
    const boxes = P.map((q) => ({ x1: q.x - 6, y1: q.y - 6, x2: q.x + 6, y2: q.y + 6 }));
    const overlaps = (b) => boxes.some((o) => !(b.x2 < o.x1 || b.x1 > o.x2 || b.y2 < o.y1 || b.y1 > o.y2)) || b.x1 < 2 || b.x2 > W - 2 || b.y1 < 2 || b.y2 > H - 2;
    const omitted = [];
    const labelLayer = sv("g");
    const order = P.slice().sort((a, b) => (b.p.id === S.sel) - (a.p.id === S.sel));
    for (const q of order) {
      const sel = q.p.id === S.sel;
      const fs = sel ? 12.5 : 11;
      const tw = q.p.title.length * fs * 0.98 + 2, th = fs + 2;
      const cand = [
        { x: q.x + 9, y: q.y + 4, a: "start", b: { x1: q.x + 8, y1: q.y - th / 2, x2: q.x + 9 + tw, y2: q.y + th / 2 } },
        { x: q.x - 9, y: q.y + 4, a: "end", b: { x1: q.x - 9 - tw, y1: q.y - th / 2, x2: q.x - 8, y2: q.y + th / 2 } },
        { x: q.x, y: q.y - 10, a: "middle", b: { x1: q.x - tw / 2, y1: q.y - 10 - th, x2: q.x + tw / 2, y2: q.y - 8 } },
        { x: q.x, y: q.y + 19, a: "middle", b: { x1: q.x - tw / 2, y1: q.y + 8, x2: q.x + tw / 2, y2: q.y + 10 + th } },
      ];
      const c = cand.find((k) => !overlaps(k.b)) || (sel ? cand[0] : null);
      if (!c) { omitted.push(q.p.title); continue; }
      boxes.push(c.b);
      if (sel) labelLayer.appendChild(sv("rect", { x: c.b.x1 - 2, y: c.b.y1 - 1, width: c.b.x2 - c.b.x1 + 4, height: c.b.y2 - c.b.y1 + 3, fill: "#fffdf8", "fill-opacity": 0.9, rx: 3 }));
      labelLayer.appendChild(sv("text", { x: c.x, y: c.y, "text-anchor": c.a, "font-size": fs, "font-weight": sel ? 700 : 400, "pointer-events": "none", text: q.p.title }));
    }
    P.forEach((q) => {
      const sel = q.p.id === S.sel;
      const g = sv("g", { class: "pca-pt" });
      g.appendChild(sv("title", { text: q.p.title }));
      g.appendChild(sv("circle", { cx: q.x, cy: q.y, r: sel ? 8 : 5.5, fill: S.emo.get(q.d).color, stroke: sel ? "#2a2521" : "#fffdf8", "stroke-width": sel ? 2.5 : 1.5 }));
      pressable(g, `${q.p.title}, 지배 정서 ${S.emo.get(q.d).name}. 누르면 이 시로 이동`, () => selectPoem(q.p.id, { scrollTop: true }));
      svg.appendChild(g);
    });
    svg.appendChild(labelLayer);
    box.appendChild(svg);
    const e1 = (res.explained[0] * 100).toFixed(1), e2 = (res.explained[1] * 100).toFixed(1);
    append(axesP, [
      el("strong", { text: "가로축" }), ` (분산의 ${e1}%): 오른쪽일수록 ${axisName(c1, 1)}, 왼쪽일수록 ${axisName(c1, -1)} 비중이 큽니다. `,
      el("strong", { text: "세로축" }), ` (분산의 ${e2}%): 위일수록 ${axisName(c2, 1)}, 아래일수록 ${axisName(c2, -1)}. `,
      "점 색은 각 작품의 지배 정서입니다.",
      omitted.length ? ` 이름표가 겹쳐 생략한 점: ${omitted.join(", ")}(점에 마우스를 올리거나 키보드로 고르면 이름이 나옵니다).` : "",
      skipped.length ? ` 최종 벡터가 0인 작품(${skipped.map((p) => p.title).join(", ")})은 지도에서 뺐습니다.` : "",
      " 가중치를 바꾸면 축의 뜻도 달라질 수 있습니다.",
    ]);
  }

  // ---------------------------------------------------------------- F-11 내 시 분석
  function runMine() {
    const raw = $("mineText").value;
    const out = clear($("mineOut"));
    S.mine = null;
    if (!raw.trim()) {
      out.appendChild(el("p", { class: "notice", text: "분석할 시를 입력해 주세요. 한 행에 한 줄씩 쓰고, 연 사이는 빈 줄로 띄우면 됩니다." }));
      $("mineText").focus();
      return;
    }
    const r = window.PoemEngine.analyzeText(raw, { EMOS: S.EMOS, matcher: S.matcher }, "mine");
    S.mine = r;
    if (r.total === 0) {
      out.appendChild(el("p", { class: "notice", text: `분석 행 ${r.lines.length}개에서 사전이 감지한 시어가 없습니다. 감정이 없다는 뜻이 아니라, 이 사전에 든 시어가 나오지 않았다는 뜻입니다. 그래서 비율과 추천을 만들지 않았습니다.` }));
      return;
    }
    const ps = pct(r.vec);
    const dom = r.dominant;
    const grid = el("div", { class: "mine-grid" });
    const left = el("div", null,
      el("p", null, el("strong", { text: "지배 정서 " }), `${S.emo.get(dom).name} ${fmt(ps[S.K.indexOf(dom)])}%`, el("span", { class: "small muted", text: ` · 사전만 · 감지 ${r.total}개` })),
      r.total < LOW_EVIDENCE ? el("p", { class: "small low-ev", text: `주의: 감지 시어가 ${r.total}개뿐이라 비율이 한두 낱말에 크게 좌우됩니다.` }) : null);
    const ul = el("ul", { class: "ratios", "aria-label": "입력한 시의 감정 비율" });
    S.EMOS.forEach((e, j) => ul.appendChild(el("li", null,
      el("span", { style: "display:flex;gap:6px;align-items:center;font-size:13.5px" }, el("span", { class: "sw", style: `--c:${e.color}`, "aria-hidden": "true" }), e.name),
      el("div", { class: "bar", "aria-hidden": "true" }, el("i", { style: `--c:${e.color};width:${ps[j]}%` })),
      el("span", { class: "v", text: fmt(ps[j]) + "%" }))));
    left.appendChild(ul);
    left.appendChild(el("h3", { class: "mini-title", text: "비슷한 시" }));
    left.appendChild(el("p", { class: "small muted", text: "입력한 시의 사전 벡터와 수록작의 최종 벡터(현재 가중치)를 비교합니다." }));
    const rl = el("ol", { class: "rec-list", id: "mineRecs", style: "grid-template-columns:1fr" });
    left.appendChild(rl);
    const right = el("div", null, el("h3", { class: "mini-title", style: "margin-top:0", text: "행별 감지" }));
    const lu = el("ul", { class: "mine-lines" });
    r.lines.forEach((l) => lu.appendChild(el("li", null,
      el("span", { class: "meta", text: `${l.no}행 · ${l.stanza}연 · ${l.hits.length ? countsLong(l.counts) : "사전에서 감지한 시어 없음"}` }),
      lineSegments(l))));
    right.appendChild(lu);
    grid.appendChild(left); grid.appendChild(right);
    out.appendChild(grid);
    renderMineRecs();
  }
  function renderMineRecs() {
    if (!S.mine || S.mine.total === 0) return;
    const rl = $("mineRecs");
    if (rl) recCards(S.mine.vec, null, rl);
  }

  // ---------------------------------------------------------------- 범주와 사전
  function renderMethod() {
    const L = window.LEXICON;
    const b = clear($("methodBody"));
    b.appendChild(el("p", { class: "small", text: `감정 범주 ${S.EMOS.length}개와 범주별 사전(${L.LEX_VERSION}). 한 시어는 한 범주에만 넣고, 긴 시어부터 하나의 정규식으로 찾아 같은 자리를 두 번 세지 않습니다. 같은 시어가 다른 자리에 또 나오면 나온 만큼 셉니다. 옛 표기의 ㅅ계 합용병서(예: ‘ᄯᅥᆯ며’)와 반복 부호 々는 분석용 사본에서만 된소리·앞 글자로 바꾸고 화면 본문은 그대로 둡니다.` }));
    const grid = el("div", { class: "method-cats" });
    S.EMOS.forEach((e) => grid.appendChild(el("article", null,
      el("h3", null, el("span", { class: "sw", style: `--c:${e.color}`, "aria-hidden": "true" }), `${e.name}`, el("span", { class: "small muted", text: ` ${e.k} · 시어 ${L.LEX[e.k].length}개` })),
      el("p", { text: e.def }),
      el("p", { class: "words", text: L.LEX[e.k].join(" · ") }))));
    b.appendChild(grid);
    b.appendChild(el("h3", { class: "mini-title", text: "가까운 범주를 가르는 기준" }));
    b.appendChild(el("ul", { class: "small" }, L.BOUNDARIES.map((t) => el("li", { text: t }))));
    b.appendChild(el("h3", { class: "mini-title", text: "차단어" }));
    b.appendChild(el("p", { class: "small", text: `${L.BLOCK.map((w) => `‘${w}’`).join(", ")} — ‘바라(희망)’가 ‘바라보다’ 속에서 잘못 잡히는 것을 막으려고 넣은 말입니다. 차단어가 일치한 자리는 어떤 감정으로도 세지 않습니다.` }));
    b.appendChild(el("h3", { class: "mini-title", text: "계산식" }));
    b.appendChild(el("ul", { class: "small" },
      el("li", { text: "사전 벡터 v_lex(e) = Σ 행별 감지 수 c(l, e) ÷ 전체 감지 수. 감지가 0이면 모두 0으로 두고 지배 정서를 정하지 않습니다." }),
      el("li", { text: "최종 벡터 v = normalize((1 − w)·p̂ + w·v_lex). p̂는 해석 프로필을 합이 1이 되게 나눈 값, w는 사전 가중치. 프로필이 없거나 w = 100%면 v = v_lex." }),
      el("li", { text: "추천: 최종 벡터끼리 코사인 유사도, 자기 자신 제외 상위 3편. 영벡터는 유사도를 정의하지 않아 제외하고, 동률이면 수록 순서가 앞선 작품을 먼저 둡니다." }),
      el("li", { text: "화면의 백분율은 최대 나머지 방식으로 반올림해 합계가 정확히 100.0%가 되게 했습니다." })));
  }

  // ---------------------------------------------------------------- 시작
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
