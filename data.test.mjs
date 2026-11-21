// 데이터 점검 — 실행: node tests/data.test.mjs
// data/poems.json과 data/poems.js가 같고, 필수 필드·저작권·출처·해석 조건을 지키는지 본다.
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../js/engine.js");
const L = require("../js/lexicon.js");
const poems = JSON.parse(fs.readFileSync(new URL("../data/poems.json", import.meta.url), "utf8"));
const base = JSON.parse(fs.readFileSync(new URL("../tools/poems.base.json", import.meta.url), "utf8"));

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log("PASS  " + name); }
  catch (e) { fail++; console.log("FAIL  " + name + " — " + e.message); }
}
const K = L.EMOS.map((e) => e.k);
const EXAMPLE = ["진달래꽃", "초혼", "산유화", "서시", "자화상", "님의 침묵", "광야", "향수", "모란이 피기까지는", "유리창 1"];

t("수록 15편 이상, id 중복 없음", () => {
  assert.ok(poems.length >= 15);
  assert.equal(new Set(poems.map((p) => p.id)).size, poems.length);
});
t("예시 앱에 없는 새 작품 5편 이상", () => {
  assert.ok(poems.filter((p) => !EXAMPLE.includes(p.title)).length >= 5);
});
t("모든 시인 사망 연도 1962년 이하 + 사망 연도 출처 링크", () => {
  for (const p of poems) {
    assert.ok(Number.isInteger(p.poetDeath) && p.poetDeath <= 1962, p.id);
    assert.ok(p.deathSources.length && p.deathSources.every((s) => /^https:\/\//.test(s.url)), p.id);
  }
});
t("필수 필드: id·title·poet·year(문자열 4자리)·source·sourceUrl·text·theme·interp", () => {
  for (const p of poems) {
    for (const f of ["id", "title", "poet", "year", "source", "sourceUrl", "text", "theme", "interp", "textMethod"]) assert.ok(p[f], `${p.id}.${f}`);
    assert.match(p.year, /^\d{4}$/);
    assert.ok(p.yearBasis, `${p.id}.yearBasis`);
  }
});
t("해석은 3문장 이상", () => {
  for (const p of poems) assert.ok(p.interp.split(/(?<=다\.)\s+/).filter(Boolean).length >= 3, p.id);
});
t("핵심 구절은 본문의 한 행과 글자 그대로 같다", () => {
  for (const p of poems) { const ls = p.text.split("\n"); for (const k of p.key) assert.ok(ls.includes(k), `${p.id}: ${k}`); }
});
t("해석 프로필 값 0~1, 범주 k만 사용, themeLinks도 범주 k만", () => {
  for (const p of poems) {
    for (const [k, v] of Object.entries(p.profile)) assert.ok(K.includes(k) && v >= 0 && v <= 1, `${p.id}.${k}`);
    for (const tl of p.themeLinks) for (const k of tl.emos) assert.ok(K.includes(k), `${p.id}: ${k}`);
  }
});
t("group(선정 라벨)으로 프로필을 만들지 않았다: 프로필 최댓값 범주 ≠ group인 작품이 있다", () => {
  const diff = poems.filter((p) => { const v = E.profileVector(p.profile, K); return K[v.indexOf(Math.max(...v))] !== p.group; });
  assert.ok(diff.length > 0);
});
t("본문은 빌드 원본(tools/poems.base.json)과 글자까지 같다", () => {
  const b = new Map(base.map((p) => [p.id, p]));
  for (const p of poems) assert.equal(p.text, b.get(p.id).text, p.id);
});
t("고친 곳(fixes): 고친 뒤 표기는 본문에 있고 고치기 전 표기는 없다", () => {
  for (const p of poems) for (const f of p.fixes) {
    assert.ok(p.text.includes(f.to), `${p.id}: ${f.to}`);
    assert.ok(!p.text.includes(f.from), `${p.id}: ${f.from}`);
  }
});
t("본문에 앞뒤 공백 행·연속 빈 줄 3개 이상·탭이 없다", () => {
  for (const p of poems) {
    assert.ok(!/\n\s*\n\s*\n/.test(p.text), p.id);
    assert.ok(!/\t/.test(p.text), p.id);
    assert.equal(p.text, p.text.trim(), p.id);
  }
});
t("data/poems.js의 내용이 data/poems.json과 같다", () => {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(new URL("../data/poems.js", import.meta.url), "utf8"), ctx);
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.POEM_DATA)), poems);
});
t("비밀 정보 없음: 저장소 코드·데이터에 API 키·토큰 형태 문자열이 없다", () => {
  const files = ["index.html", "js/app.js", "js/engine.js", "js/lexicon.js", "data/poems.json"];
  for (const f of files) {
    const s = fs.readFileSync(new URL("../" + f, import.meta.url), "utf8");
    assert.ok(!/(api[_-]?key|secret|password|token)\s*[:=]\s*["'][^"']{8,}/i.test(s), f);
    assert.ok(!/AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}/.test(s), f);
  }
});
t("20편 모두 분석: 감지가 있으면 합계 1, 없으면 영벡터·지배 정서 없음", () => {
  const m = E.buildMatcher(L.EMOS, L.LEX, L.BLOCK);
  for (const p of poems) {
    const r = E.analyzeText(p.text, { EMOS: L.EMOS, matcher: m }, p.id);
    const s = r.vec.reduce((a, b) => a + b, 0);
    if (r.total) assert.ok(Math.abs(s - 1) < 1e-9, p.id); else { assert.equal(s, 0); assert.equal(r.dominant, null); }
  }
});
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
