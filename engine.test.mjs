// 분석 엔진 단위 테스트 — 실행: node tests/engine.test.mjs
// 외부 라이브러리 없이 Node 기본 assert만 쓴다.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const E = require("../js/engine.js");
const L = require("../js/lexicon.js");

let pass = 0, fail = 0;
const results = [];
function t(name, fn) {
  try { fn(); pass++; results.push(["PASS", name]); }
  catch (err) { fail++; results.push(["FAIL", name + " — " + err.message]); }
}

const K = L.EMOS.map((e) => e.k);
const matcher = E.buildMatcher(L.EMOS, L.LEX, L.BLOCK);
const ctx = { EMOS: L.EMOS, matcher };
const idx = (k) => K.indexOf(k);
const run = (text) => E.analyzeText(text, ctx, "t");

t("범주 순서: 10개 범주, k 중복 없음, 정의·색 있음", () => {
  assert.equal(K.length, 10);
  assert.equal(new Set(K).size, 10);
  for (const e of L.EMOS) { assert.ok(e.name && e.def && /^#[0-9A-F]{6}$/i.test(e.color), e.k); }
});

t("사전: 범주마다 시어 10개 이상", () => {
  for (const k of K) assert.ok(L.LEX[k].length >= 10, `${k}: ${L.LEX[k].length}`);
});

t("사전: 한 시어는 한 범주에만 속한다(중복 시 buildMatcher가 오류)", () => {
  assert.throws(() => E.buildMatcher([{ k: "a" }, { k: "b" }], { a: ["눈물"], b: ["눈물"] }, []), /중복/);
});

t("가장 긴 시어 우선: '눈'과 '눈물'이 함께 있으면 '눈물'만 센다", () => {
  const m = E.buildMatcher([{ k: "a" }, { k: "b" }], { a: ["눈"], b: ["눈물"] }, []);
  const r = E.analyzeText("눈물이 난다", { EMOS: [{ k: "a" }, { k: "b" }], matcher: m });
  assert.deepEqual(r.totals, [0, 1]);
});

t("가장 긴 시어 우선(실제 사전): '구슬픈'은 '슬픈'과 겹쳐 세지 않고 1회", () => {
  const r = run("구슬픈 노래");
  assert.equal(r.total, 1);
  assert.equal(r.lines[0].hits[0].w, "구슬픈");
});

t("기본형 ‘슬픔’·‘기쁘다’·‘괴로움’도 감지(v3)", () => {
  const r = run("슬픔이 기쁘다가 괴로움이 된다");
  assert.equal(r.totals[idx("sad")], 2);
  assert.equal(r.totals[idx("joy")], 1);
});

t("반복 등장은 실제 횟수만큼 센다", () => {
  const r = run("눈물 눈물 눈물");
  assert.equal(r.totals[idx("sad")], 3);
});

t("정규식 특수문자·띄어쓰기가 있는 시어도 그대로 일치('못 잊')", () => {
  const r = run("어찌 못 잊으랴");
  assert.equal(r.totals[idx("long")], 1);
});

t("감지가 있으면 vec 합계 = 1", () => {
  const r = run("눈물과 기쁨과 고요\n그리운 고향");
  const s = r.vec.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s - 1) < 1e-12, String(s));
});

t("감지 0건: vec 전부 0, dominant null(균등 비율을 만들지 않음)", () => {
  const r = run("가나다라\n마바사");
  assert.ok(r.vec.every((x) => x === 0));
  assert.equal(r.dominant, null);
  assert.equal(r.total, 0);
});

t("빈 줄은 연 구분으로만 쓰고 분석 행에서 제외", () => {
  const r = run("첫 줄\n\n\n둘째 연 첫 줄\n둘째 연 둘째 줄\n\n셋째 연");
  assert.equal(r.lines.length, 4);
  assert.deepEqual(r.lines.map((l) => l.stanza), [1, 2, 2, 3]);
  assert.deepEqual(r.lines.map((l) => l.no), [1, 2, 3, 4]);
});

t("행별 counts·hits·위치 저장, shown은 원문 그대로", () => {
  const r = run("아아 눈물이여");
  const h = r.lines[0].hits[0];
  assert.equal(h.k, "sad");
  assert.equal(r.lines[0].text.slice(h.start, h.end), "눈물");
});

t("옛한글 합용병서: 'ᄯᅥᆯ며'를 '떨며'로 감지하고 화면 표기는 원래 글자", () => {
  const line = "가슴이 ᄯᅥᆯ며 기다린다";
  const r = run(line);
  const h = r.lines[0].hits.find((x) => x.w === "떨며");
  assert.ok(h, "떨며 미감지");
  assert.equal(h.shown, "ᄯᅥᆯ며");
  assert.equal(line.slice(h.start, h.end), "ᄯᅥᆯ며");
});

t("차단어: '바라보고'는 희망으로 세지 않고, '바라는'은 센다", () => {
  assert.equal(run("하늘을 바라보고").totals[idx("hope")], 0);
  assert.equal(run("내가 바라는 손님").totals[idx("hope")], 1);
  assert.equal(run("하늘을 바라보고").blocked.length, 1);
});

t("결합: 프로필이 없으면 v_lex 그대로", () => {
  const v = run("눈물").vec;
  assert.deepEqual(E.combine(v, null, 0.3).vec, v);
});

t("결합: w=1(사전 100%)이면 프로필이 덮어쓰지 않음", () => {
  const v = run("눈물 기쁨").vec;
  const p = E.profileVector({ hope: 1 }, K);
  assert.deepEqual(E.combine(v, p, 1).vec, v);
});

t("결합: w=0이면 정규화된 프로필, 합계 1", () => {
  const v = run("눈물").vec;
  const p = E.profileVector({ hope: 0.6, sad: 0.2 }, K);
  const c = E.combine(v, p, 0).vec;
  assert.ok(Math.abs(c[idx("hope")] - 0.75) < 1e-12);
  assert.ok(Math.abs(c.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

t("결합: 감지 0건 + 프로필 + 0<w<1 이면 프로필 비율", () => {
  const v = run("가나다").vec;
  const p = E.profileVector({ hope: 1 }, K);
  const c = E.combine(v, p, 0.4).vec;
  assert.ok(Math.abs(c[idx("hope")] - 1) < 1e-12);
});

t("코사인: 영벡터는 null", () => {
  assert.equal(E.cosine([0, 0], [1, 0]), null);
  assert.ok(Math.abs(E.cosine([1, 0], [1, 0]) - 1) < 1e-12);
});

t("추천: 자기 자신 제외, 상위 3편, 영벡터 작품 제외", () => {
  const items = [
    { id: "a", vec: [1, 0, 0], order: 0 },
    { id: "b", vec: [0.9, 0.1, 0], order: 1 },
    { id: "c", vec: [0, 1, 0], order: 2 },
    { id: "d", vec: [0, 0, 0], order: 3 },
    { id: "e", vec: [0.5, 0.5, 0], order: 4 },
  ];
  const r = E.recommend([1, 0, 0], items, "a", 3);
  assert.deepEqual(r.list.map((x) => x.id), ["b", "e", "c"]);
  assert.ok(!r.list.some((x) => x.id === "a" || x.id === "d"));
});

t("추천: 기준 벡터가 영벡터면 추천하지 않음(reason=zero)", () => {
  const r = E.recommend([0, 0, 0], [{ id: "b", vec: [1, 0, 0], order: 0 }], "a");
  assert.equal(r.list.length, 0);
  assert.equal(r.reason, "zero");
});

t("추천: 유사도 동률이면 수록 순서가 앞선 작품 먼저, 경계 동률 표시", () => {
  const items = [
    { id: "x", vec: [0, 1], order: 5 },
    { id: "y", vec: [0, 2], order: 1 },
    { id: "z", vec: [0, 3], order: 3 },
  ];
  const r = E.recommend([0, 1], items, null, 2);
  assert.deepEqual(r.list.map((x) => x.id), ["y", "z"]);
  assert.equal(r.tieAtCut, true);
});

t("표시 백분율: 무작위 벡터 2,000개 모두 합계 정확히 100.0", () => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let n = 0; n < 2000; n++) {
    const v = K.map(() => (rnd() < 0.4 ? 0 : rnd()));
    if (!v.some((x) => x > 0)) continue;
    const p = E.percents(v, 1);
    const s = Math.round(p.reduce((a, b) => a + b, 0) * 10);
    assert.equal(s, 1000, JSON.stringify(p));
  }
});

t("표시 백분율: 1/3씩이면 33.4·33.3·33.3", () => {
  assert.deepEqual(E.percents([1, 1, 1], 1), [33.4, 33.3, 33.3]);
});

t("지배 정서 동률: 범주 순서상 앞, tiesOf는 모두 반환", () => {
  const v = K.map(() => 0); v[idx("sad")] = 0.5; v[idx("void")] = 0.5;
  assert.equal(E.dominantOf(v, K), "sad");
  assert.deepEqual(E.tiesOf(v, K), ["sad", "void"]);
});

t("PCA: 좌표 수 = 작품 수, 설명 분산 비율 0~1", () => {
  const vs = [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.5, 0.5, 0]];
  const p = E.pca2(vs);
  assert.equal(p.coords.length, 4);
  assert.ok(p.explained.every((x) => x >= 0 && x <= 1 + 1e-9));
});

for (const [s, n] of results) console.log(`${s}  ${n}`);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
