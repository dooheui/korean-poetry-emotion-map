// 데이터 조립: tools/poems.base.json(본문·서지, build_poems.py 출력) + tools/editorial.json(주제·해석·프로필)
//   → data/poems.json(정본), data/poems.js(브라우저용 같은 내용), docs/runs/results.json(사전 분석 결과 기록)
// 실행: node tools/build_data.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const E = require("../js/engine.js");
const L = require("../js/lexicon.js");

const base = JSON.parse(fs.readFileSync(path.join(HERE, "poems.base.json"), "utf8"));
const ed = JSON.parse(fs.readFileSync(path.join(HERE, "editorial.json"), "utf8"));
const K = L.EMOS.map((e) => e.k);
const errors = [];
const need = (cond, msg) => { if (!cond) errors.push(msg); };

// 선정할 때 염두에 둔 정서(편집용 라벨). 분석·프로필·결과 어디에도 쓰지 않는다.
const GROUP = {
  wang: "sad", jeopdong: "sad", geunal: "joy", doldam: "joy", nameuro: "calm", goyangi: "calm",
  jeoljeong: "hope", cheongpodo: "hope", chimsil: "love", alsu: "love", swipge: "shame", chamhoe: "shame",
  byeol: "long", saseum: "long", nongae: "anger", ppaeat: "anger", ogamdo: "fear", geoul: "fear",
  mokma: "void", sewol: "void",
};
// 교수님 예시 앱의 10편(새 작품 확인용)
const EXAMPLE_TITLES = ["진달래꽃", "초혼", "산유화", "서시", "자화상", "님의 침묵", "광야", "향수", "모란이 피기까지는", "유리창 1"];

function textMethod(p) {
  const e = p.edition;
  const nf = p.fixes.length;
  if (e.type === "scan") {
    const lv = e.proofreadLevel === 3 ? "판독문은 위키문헌에서 ‘교정 완료(level 3)’ 상태" : "판독문은 위키문헌에서 ‘교정 전(level 1)’ 상태";
    return `위키문헌 스캔 판독문(Page: 이름공간)을 API로 내려받아 옮기고, 같은 쪽의 스캔 이미지(${e.scan})를 열어 한 줄씩 대조했다. ${lv}. ` +
      (nf ? `대조에서 판독 오류 ${nf}가지를 찾아 스캔대로 고쳤다(fixes).` : "대조 결과 판독문과 스캔이 일치해 고친 곳이 없다.");
  }
  const common = "원전 스캔과는 대조하지 못했다.";
  if (e.type === "ws-modern") return `위키문헌 현대 표기본 문서의 본문을 API로 내려받아 글자·문장부호·행·연을 바꾸지 않고 옮겼다. ${common}` + (nf ? ` 오자 ${nf}가지는 근거를 두고 고쳤다(fixes).` : "");
  if (e.type === "ws-parallel") return `위키문헌 원문·현대어 대역 문서에서 현대어 칸을 그대로 옮기고, 원문 칸은 orig에 따로 보관했다. 현대어 칸은 위키문헌 편집자가 옮긴 것이다. ${common}`;
  if (e.type === "ws-orig") return `위키문헌 원문(옛 표기) 문서를 그대로 옮겼다. 현대어로 바꾸지 않았다. ${common}`;
  return "";
}

const matcher = E.buildMatcher(L.EMOS, L.LEX, L.BLOCK);
const out = [];
const results = [];
const ids = new Set();
base.forEach((p, order) => {
  const x = ed[p.id];
  need(x, `${p.id}: editorial 없음`);
  if (!x) return;
  need(!ids.has(p.id), `${p.id}: id 중복`); ids.add(p.id);
  need(/^[a-z][a-z0-9-]*$/.test(p.id), `${p.id}: id 형식`);
  need(p.poetDeath <= 1962, `${p.id}: 사망 연도 ${p.poetDeath}`);
  need(p.deathSources && p.deathSources.length, `${p.id}: 사망 연도 출처 없음`);
  need(typeof p.year === "string" && /^\d{4}$/.test(p.year), `${p.id}: year 형식`);
  need(p.text && p.text.trim().length > 0, `${p.id}: 본문 없음`);
  need(!EXAMPLE_TITLES.includes(p.title), `${p.id}: 예시 앱과 같은 작품`);
  const lines = p.text.split("\n");
  for (const k of x.key) need(lines.includes(k), `${p.id}: 핵심 구절이 본문의 한 행과 일치하지 않음 — ${k}`);
  const sentences = x.interp.split(/(?<=다\.)\s+/).filter((s) => s.trim());
  need(sentences.length >= 3, `${p.id}: 해석 ${sentences.length}문장`);
  for (const [k, v] of Object.entries(x.profile)) need(K.includes(k) && v >= 0 && v <= 1, `${p.id}: profile ${k}=${v}`);
  for (const t of x.themeLinks) for (const k of t.emos) need(K.includes(k), `${p.id}: themeLinks ${k}`);

  const rec = {
    id: p.id, order, title: p.title, poet: p.poet,
    year: p.year, yearBasis: p.yearBasis, created: p.created, firstPub: p.firstPub, collected: p.collected,
    poetDeath: p.poetDeath,
    source: p.source, sourceUrl: p.sourceUrl, edition: p.edition, textMethod: textMethod(p),
    titleInEdition: p.titleInEdition, titleNote: p.titleNote, epigraph: p.epigraph, afterword: p.afterword,
    text: p.text, orig: p.orig, fixes: p.fixes,
    note: p.notes.join(" "), notes: p.notes,
    pubSources: p.pubSources, deathSources: p.deathSources,
    inExample: false,
    group: GROUP[p.id],
    groupNote: "작품을 고를 때 염두에 둔 정서(편집용 라벨). 분석 결과나 해석 프로필에 쓰지 않는다.",
    theme: x.theme, speaker: x.speaker, devices: x.devices, key: x.key, interp: x.interp,
    profile: x.profile, profileNote: x.profileNote, profileBy: "사람이 정한 해석 값(초안: AI 작성, 학생 검토 필요). 모델 출력이 아니다.",
    themeLinks: x.themeLinks, interpRefs: [],
  };
  out.push(rec);
  const r = E.analyzeText(p.text, { EMOS: L.EMOS, matcher }, p.id);
  results.push({
    id: p.id, title: p.title, lexicon: L.LEX_VERSION, method: r.method, total: r.total,
    vec: r.vec.map((v) => +v.toFixed(6)), percents: E.percents(r.vec, 1), dominant: r.dominant, ties: E.tiesOf(r.vec, K),
    lines: r.lines.map((l) => ({ no: l.no, stanza: l.stanza, counts: l.counts, hits: l.hits.map((h) => h.shown + "→" + h.k) })),
    blocked: r.blocked,
  });
});

if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
fs.mkdirSync(path.join(ROOT, "data"), { recursive: true });
fs.mkdirSync(path.join(ROOT, "docs/runs"), { recursive: true });
const json = JSON.stringify(out, null, 1);
fs.writeFileSync(path.join(ROOT, "data/poems.json"), json + "\n");
fs.writeFileSync(path.join(ROOT, "data/poems.js"),
  "// data/poems.json과 같은 내용. file://로 열어도 동작하도록 스크립트로도 제공한다(tools/build_data.mjs가 생성).\n" +
  "window.POEM_DATA = " + json + ";\n");
fs.writeFileSync(path.join(ROOT, "docs/runs/results.json"), JSON.stringify({ lexicon: L.LEX_VERSION, categoryOrder: K, results }, null, 1) + "\n");
console.log(`ok: ${out.length}편, 오류 0, 새 작품 ${out.filter((p) => !p.inExample).length}편`);
