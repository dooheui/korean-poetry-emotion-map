/*
 * 분석 엔진 — 기술명세서 5장(5.1~5.5)을 따른다.
 * 브라우저(window.PoemEngine)와 Node(tests) 양쪽에서 같은 코드를 쓴다.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------- 표기 정규화(분석용 사본만)
  // 원전의 옛한글 합용병서(ᄭ ᄯ ᄲ ᄶ)를 된소리로 바꾸고 첫·가·끝소리 조합을 한 글자로 합친다.
  // 반복 부호 々는 앞 글자로 편다. 화면 본문은 바꾸지 않고, 일치 위치는 원래 본문 위치로 되돌린다.
  const SIOS = { "ᄭ": "ᄁ", "ᄯ": "ᄄ", "ᄲ": "ᄈ", "ᄶ": "ᄍ" };
  const isL = (c) => (c >= 0x1100 && c <= 0x115f) || (c >= 0xa960 && c <= 0xa97f);
  const isV = (c) => (c >= 0x1160 && c <= 0x11a7) || (c >= 0xd7b0 && c <= 0xd7c6);
  const isT = (c) => (c >= 0x11a8 && c <= 0x11ff) || (c >= 0xd7cb && c <= 0xd7fb);

  function normalizeLine(s) {
    let a = "";
    const map = []; // map[i] = [start, end) : 분석용 i번째 글자가 원래 줄에서 차지하는 범위
    let i = 0;
    while (i < s.length) {
      const c = s.charCodeAt(i);
      if (isL(c)) {
        let j = i + 1;
        while (j < s.length && isL(s.charCodeAt(j))) j++;
        while (j < s.length && isV(s.charCodeAt(j))) j++;
        while (j < s.length && isT(s.charCodeAt(j))) j++;
        let cluster = s.slice(i, j).split("").map((ch) => SIOS[ch] || ch).join("").normalize("NFC");
        for (const ch of cluster) { a += ch; map.push([i, j]); }
        i = j;
        continue;
      }
      if (s[i] === "々" && a.length) {
        a += a[a.length - 1];
        map.push([i, i + 1]);
        i++;
        continue;
      }
      a += s[i];
      map.push([i, i + 1]);
      i++;
    }
    return { a, map };
  }

  // ---------------------------------------------------------------- 매처(5.2)
  const escapeRe = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  function buildMatcher(EMOS, LEX, BLOCK) {
    const lookup = new Map();
    for (const e of EMOS) for (const w of LEX[e.k] || []) {
      if (lookup.has(w) && lookup.get(w) !== e.k) throw new Error(`시어 중복: ${w}`);
      lookup.set(w, e.k);
    }
    for (const w of BLOCK || []) lookup.set(w, null);
    const words = [...lookup.keys()].sort((x, y) => y.length - x.length || (x < y ? -1 : x > y ? 1 : 0));
    const re = new RegExp(words.map(escapeRe).join("|"), "gu");
    return { re, lookup, words };
  }

  // ---------------------------------------------------------------- 시 한 편 분석(5.1~5.3)
  function analyzeText(text, ctx, id = null) {
    const { EMOS, matcher } = ctx;
    const K = EMOS.map((e) => e.k);
    const raw = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    const lines = [];
    const blocked = [];
    let stanza = 1, prevBlank = false, no = 0;
    for (const rawLine of raw) {
      const line = rawLine.trim();
      if (!line) { if (no > 0) prevBlank = true; continue; }
      if (prevBlank) { stanza++; prevBlank = false; }
      no++;
      const { a, map } = normalizeLine(line);
      const counts = new Array(K.length).fill(0);
      const hits = [];
      matcher.re.lastIndex = 0;
      let m;
      while ((m = matcher.re.exec(a)) !== null) {
        const w = m[0];
        const k = matcher.lookup.get(w);
        const start = map[m.index][0];
        const end = map[m.index + w.length - 1][1];
        if (k == null) { blocked.push({ no, w, start, end }); continue; }
        counts[K.indexOf(k)]++;
        hits.push({ w, k, start, end, shown: line.slice(start, end) });
      }
      lines.push({ no, stanza, text: line, counts, hits });
    }
    const totals = K.map((_, j) => lines.reduce((s, l) => s + l.counts[j], 0));
    const total = totals.reduce((s, x) => s + x, 0);
    const vec = total ? totals.map((x) => x / total) : totals.map(() => 0);
    return {
      id, vec, dominant: dominantOf(vec, K), lines, method: "lexicon",
      totals, total, blocked, stanzas: lines.length ? lines[lines.length - 1].stanza : 0,
    };
  }

  // ---------------------------------------------------------------- 해석 프로필 결합(5.4)
  function profileVector(profile, K) {
    if (!profile) return null;
    const p = K.map((k) => Math.max(0, Number(profile[k]) || 0));
    const s = p.reduce((a, b) => a + b, 0);
    return s > 0 ? p.map((x) => x / s) : null;
  }

  function combine(vLex, pHat, w) {
    if (!pHat) return { vec: vLex.slice(), method: "lexicon" };
    if (w >= 1) return { vec: vLex.slice(), method: "lexicon" }; // 사전 100%: 프로필이 덮어쓰지 않는다
    const mix = vLex.map((x, j) => (1 - w) * pHat[j] + w * x);
    const s = mix.reduce((a, b) => a + b, 0);
    return { vec: s > 0 ? mix.map((x) => x / s) : mix.map(() => 0), method: w <= 0 ? "profile" : "hybrid" };
  }

  // ---------------------------------------------------------------- 지배 정서
  // 모두 0이면 null. 최댓값이 같은 범주가 여럿이면 범주 순서상 앞의 것을 고르고 ties에 모두 남긴다.
  function dominantOf(vec, K) {
    const max = Math.max(...vec);
    if (!(max > 0)) return null;
    return K[vec.findIndex((x) => Math.abs(x - max) < 1e-12)];
  }
  function tiesOf(vec, K) {
    const max = Math.max(...vec);
    if (!(max > 0)) return [];
    return K.filter((_, j) => Math.abs(vec[j] - max) < 1e-12);
  }

  // ---------------------------------------------------------------- 유사도·추천(5.5)
  function cosine(a, b) {
    let dot = 0, na = 0, nb = 0;
    for (let j = 0; j < a.length; j++) { dot += a[j] * b[j]; na += a[j] * a[j]; nb += b[j] * b[j]; }
    if (na === 0 || nb === 0) return null; // 영벡터: 정의하지 않는다
    return dot / (Math.sqrt(na) * Math.sqrt(nb));
  }

  // items: [{id, vec, order}] — order는 수록 순서. 동률이면 수록 순서가 앞선 작품을 먼저 둔다.
  function recommend(vec, items, excludeId, n = 3) {
    if (!vec.some((x) => x > 0)) return { list: [], reason: "zero" };
    const scored = [];
    for (const it of items) {
      if (it.id === excludeId) continue;
      const s = cosine(vec, it.vec);
      if (s === null) continue;
      scored.push({ id: it.id, sim: s, order: it.order });
    }
    scored.sort((x, y) => (y.sim - x.sim) || (x.order - y.order));
    const list = scored.slice(0, n);
    const tieAtCut = scored.length > n && Math.abs(scored[n - 1].sim - scored[n].sim) < 1e-9;
    return { list, reason: list.length ? null : "none", tieAtCut };
  }

  // ---------------------------------------------------------------- 표시용 백분율(최대 나머지 방식: 표시 합계가 정확히 100.0)
  function percents(vec, digits = 1) {
    const total = vec.reduce((a, b) => a + b, 0);
    if (!(total > 0)) return vec.map(() => 0);
    const unit = Math.pow(10, digits);
    const scaled = vec.map((x) => (x / total) * 100 * unit);
    const floor = scaled.map(Math.floor);
    let rest = 100 * unit - floor.reduce((a, b) => a + b, 0);
    const order = scaled.map((x, j) => [x - Math.floor(x), j]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
    for (let r = 0; r < rest; r++) floor[order[r % order.length][1]]++;
    return floor.map((x) => x / unit);
  }

  // ---------------------------------------------------------------- 감성 지도(5.6, 확장)
  function pca2(vectors) {
    const n = vectors.length, d = vectors[0].length;
    const mean = new Array(d).fill(0);
    vectors.forEach((v) => v.forEach((x, j) => (mean[j] += x / n)));
    const X = vectors.map((v) => v.map((x, j) => x - mean[j]));
    const C = Array.from({ length: d }, () => new Array(d).fill(0));
    for (const r of X) for (let i = 0; i < d; i++) for (let j = 0; j < d; j++) C[i][j] += (r[i] * r[j]) / (n - 1 || 1);
    const comps = [], vals = [];
    let M = C.map((r) => r.slice());
    for (let c = 0; c < 2; c++) {
      let v = new Array(d).fill(0).map((_, j) => 1 + j * 0.01);
      let lambda = 0;
      for (let it = 0; it < 500; it++) {
        const w = M.map((row) => row.reduce((s, x, j) => s + x * v[j], 0));
        const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0)) || 1;
        v = w.map((x) => x / norm);
        lambda = norm;
      }
      // 부호 고정: 절댓값이 가장 큰 적재값이 양수가 되게
      const big = v.reduce((bi, x, j) => (Math.abs(x) > Math.abs(v[bi]) ? j : bi), 0);
      if (v[big] < 0) v = v.map((x) => -x);
      comps.push(v); vals.push(lambda);
      M = M.map((row, i) => row.map((x, j) => x - lambda * v[i] * v[j]));
    }
    const traceC = C.reduce((s, row, i) => s + row[i], 0) || 1;
    const coords = X.map((r) => comps.map((v) => r.reduce((s, x, j) => s + x * v[j], 0)));
    return { coords, comps, explained: vals.map((l) => l / traceC), mean };
  }

  const api = { normalizeLine, buildMatcher, analyzeText, profileVector, combine, dominantOf, tiesOf, cosine, recommend, percents, pca2 };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PoemEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
