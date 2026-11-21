// 검증 사례용 수치 계산: node tools/cases.cjs
const E = require("../js/engine.js"), L = require("../js/lexicon.js");
const poems = require("../data/poems.json");
const K = L.EMOS.map(e => e.k), name = k => L.EMOS.find(e => e.k === k).name;
const m = E.buildMatcher(L.EMOS, L.LEX, L.BLOCK);
const ctx = { EMOS: L.EMOS, matcher: m };
const A = Object.fromEntries(poems.map(p => [p.id, E.analyzeText(p.text, ctx, p.id)]));
const fin = (w) => Object.fromEntries(poems.map(p => [p.id, E.combine(A[p.id].vec, E.profileVector(p.profile, K), w).vec]));
const show = (vec) => { const ps = E.percents(vec, 1); return K.map((k, j) => ps[j] ? `${name(k)} ${ps[j]}` : "").filter(Boolean).join(", ") || "(영벡터)"; };
const dom = v => { const d = E.dominantOf(v, K); return d ? name(d) : "없음"; };
function rec(id, w) {
  const F = fin(w);
  const r = E.recommend(F[id], poems.map(p => ({ id: p.id, vec: F[p.id], order: p.order })), id, 3);
  return r.reason === "zero" ? "추천 없음(영벡터)" : r.list.map(x => `${poems.find(p => p.id === x.id).title} ${(x.sim * 100).toFixed(1)}%`).join(" / ");
}
for (const id of ["jeoljeong", "nameuro", "ppaeat", "ogamdo", "doldam", "mokma", "byeol", "sewol", "geunal", "chamhoe", "jeopdong"]) {
  const p = poems.find(x => x.id === id), a = A[id];
  console.log(`\n## ${p.title} (${id}) 감지 ${a.total}개, 감지 행 ${a.lines.filter(l => l.hits.length).length}/${a.lines.length}`);
  console.log("  사전만 :", show(a.vec), "| 지배", dom(a.vec));
  console.log("  프로필 :", show(E.profileVector(p.profile, K)));
  for (const w of [0.5, 0]) { const v = fin(w)[id]; console.log(`  w=${w * 100}% :`, show(v), "| 지배", dom(v)); }
  console.log("  추천 w=100%:", rec(id, 1)); console.log("  추천 w=50% :", rec(id, 0.5));
}
// 오감도 반복 제거 실험(구현하지 않음, 비교용): 같은 행 문자열을 한 번만 세면?
const og = poems.find(p => p.id === "ogamdo");
const uniq = [...new Set(og.text.split("\n").map(s => s.replace(/第[一二三四五六七八九十]+의/, "")))].join("\n");
const u = E.analyzeText(uniq, ctx);
console.log("\n[실험] 오감도에서 ‘第N의’만 다른 행을 한 번만 세면: 감지", u.total, "→", show(u.vec));
// 부정 표현 뒤따름 조사(규칙 미구현, 규모 확인)
console.log("\n[조사] 감지 시어 뒤 8글자 안에 부정 표현(없/않/못/말/아니)이 오는 경우");
for (const p of poems) for (const l of A[p.id].lines) for (const h of l.hits) {
  const tail = l.text.slice(h.end, h.end + 8);
  if (/(없|않|않|못|말|아니)/.test(tail)) console.log(`  ${p.title} ${l.no}행: …${l.text.slice(Math.max(0, h.start - 6), h.end + 8)}… [${h.shown}→${name(h.k)}]`);
}
