// 사용: node tools/inspect.cjs [v1|v2] [poems.base.json]  — 20편의 감지 시어와 비율 출력. v1 = 차단어(BLOCK) 없이, v2 = 현재 사전 그대로
const fs = require("fs");
const L = require("../js/lexicon.js"), E = require("../js/engine.js");
const ver = process.argv[2] || "v2";
const poems = JSON.parse(fs.readFileSync(process.argv[3] || "/home/claude/poems/data/poems.base.json", "utf8"));
const matcher = E.buildMatcher(L.EMOS, L.LEX, ver === "v1" ? [] : L.BLOCK);
const K = L.EMOS.map(e => e.k), N = L.EMOS.map(e => e.name);
for (const p of poems) {
  const r = E.analyzeText(p.text, { EMOS: L.EMOS, matcher }, p.id);
  const pc = E.percents(r.vec);
  console.log(`\n## ${p.title}  총 ${r.total}개  지배:${r.dominant ? N[K.indexOf(r.dominant)] : "없음"}`);
  console.log("   " + K.map((k, j) => r.totals[j] ? `${N[j]} ${r.totals[j]}(${pc[j]}%)` : "").filter(Boolean).join(" · "));
  for (const l of r.lines) if (l.hits.length) console.log(`   ${l.no}행: ` + l.hits.map(h => `${h.shown}[${h.w}→${N[K.indexOf(h.k)]}]`).join(", "));
  if (r.blocked.length) console.log("   차단: " + r.blocked.map(b => `${b.no}행 ${b.w}`).join(", "));
  const none = r.lines.filter(l => !l.hits.length).length;
  console.log(`   감지 없는 행 ${none}/${r.lines.length}`);
}
