"""docs/text-verification.md 생성: python3 tools/make_verification.py (data/poems.json 기준)"""
import json, pathlib, re
ROOT = pathlib.Path(__file__).resolve().parent.parent
P = json.loads((ROOT / "data/poems.json").read_text())

def shape(t):
    st = [s for s in re.split(r"\n\s*\n", t.strip()) if s.strip()]
    return len(st), sum(len([l for l in s.split("\n") if l.strip()]) for s in st)

out = []
w = out.append
w("# 본문 대조 기록\n")
w("이 문서는 `data/poems.json`의 본문을 어디서, 어떻게 옮겼고, 무엇을 실제로 대조했는지 적은 기록이다. `tools/make_verification.py`가 데이터에서 만든다.\n")
w("## 원칙\n")
w("- 본문은 기억으로 쓰거나 다듬지 않았다. 위키문헌(ko.wikisource.org) 문서를 MediaWiki API로 내려받아 `tools/raw/`에 그대로 저장하고, `tools/build_poems.py`가 그 파일에서 본문을 뽑는다.")
w("- 한 작품에는 한 판본만 쓴다. 판본을 섞지 않았다.")
w("- 이상의 붙여쓰기, 옛 표기, 한자, 문장부호는 판본 그대로 둔다. 현대어로 고친 판본은 위키문헌 편집자가 옮긴 것이고, 어느 문서인지 작품마다 적었다.")
w("- 고친 곳은 모두 `fixes`에 ‘고치기 전 → 고친 뒤’, 횟수, 근거와 함께 남겼다. 근거를 찾지 못한 의심 표기는 고치지 않고 `notes`에 적었다.")
w("- ‘대조했다’는 말은 스캔 이미지를 실제로 열어 한 줄씩 본 작품(아래 표의 ‘스캔 대조’)에만 쓴다. 나머지 작품은 위키문헌 본문을 그대로 옮긴 것이고 원전과 대조하지 못했다.\n")
w("## 스캔 대조 방법\n")
w("위키문헌의 스캔 판독본(Page: 이름공간) 작품은 판독문과 같은 쪽의 스캔 이미지(위키미디어 공용, 960px 또는 500px 섬네일)를 내려받아 화면에서 한 줄씩 비교했다. 쪽이 넘어가는 자리에서는 판독자의 `{{nop}}` 표시가 있으면 연 구분으로, 없으면 행이 이어지는 것으로 처리했고, 스캔에서 행간을 함께 확인했다.\n")
w("## 작품별 요약\n")
w("| 작품 | 시인 | 판본 | 대조 수준 | 연/행 | 고친 곳 |")
w("|---|---|---|---|---|---|")
for p in P:
    e = p["edition"]
    lvl = "스캔 대조" if e.get("scanChecked") else "위키문헌 본문 그대로(원전 미대조)"
    if e.get("proofreadLevel"):
        lvl += f" · 판독 level {e['proofreadLevel']}"
    s, l = shape(p["text"])
    w(f"| {p['title']} | {p['poet']} | {e['label']} | {lvl} | {s}연 {l}행 | {len(p['fixes'])} |")
w("")
for p in P:
    e = p["edition"]
    s, l = shape(p["text"])
    w(f"### {p['title']} — {p['poet']}\n")
    w(f"- 본문 출처: {p['source']}  ")
    w(f"  <{p['sourceUrl']}>")
    if e.get("scan"):
        w(f"- 스캔: {e['scan']} (판독 상태 level {e.get('proofreadLevel')}) — 스캔 이미지를 열어 대조함")
    w(f"- 옮긴 방법: {p['textMethod']}")
    w(f"- 표시 본문: {s}연 {l}행" + (f", 판본 제목 「{p['titleInEdition']}」" if p.get("titleInEdition") else ""))
    if p["fixes"]:
        w("- 고친 곳:")
        for f in p["fixes"]:
            ev = "; ".join(f"[{x['label']}]({x['url']})" for x in f.get("evidence") or [])
            w(f"  - `{f['from']}` → `{f['to']}` ({f['count']}곳) — {f['why']}" + (f" 근거: {ev}" if ev else ""))
    else:
        w("- 고친 곳: 없음")
    if p.get("orig"):
        w("- 원문 표기: `orig`에 함께 보관(화면의 ‘원문 표기 보기’). 분석은 표시 본문으로 한다.")
    for n in p["notes"]:
        w(f"- 참고: {n}")
    w("")
w("## 학생이 확인할 것\n")
w("- 「그날이 오면」 ‘끊지기’: 오자로 보이지만 근거 자료를 찾지 못해 위키문헌 표기를 그대로 두었다. 도서관 시집이나 전집으로 확인 후 고치면 `fixes`에 근거와 함께 적는다.")
w("- 「남으로 창을 내겠소」: 백과사전은 ‘3연 10행’, 위키문헌 본문은 6연 12행이다. 원전 행 나눔을 확인하면 좋다.")
w("- 「나는 왕이로소이다」: 백과사전은 ‘9연 45행’, 위키문헌 본문은 9연 29행이다(산문시의 긴 줄 처리 차이로 보임).")
w("- 원전 미대조 작품(위 표 참고)은 가능하면 시집·전집 지면과 한 번 더 대조한다.")
(ROOT / "docs/text-verification.md").write_text("\n".join(out) + "\n")
print("ok")
