"""
브라우저 테스트(헤드리스 Chrome + Playwright). 기술명세서 T-01~T-07과 추가 점검.
실행 전: 저장소 상위 폴더를 /korean-poetry-emotion-map/ 하위 경로로 서빙한다(GitHub Pages와 같은 경로 구조).
  mkdir -p /tmp/site && ln -sfn "$PWD" /tmp/site/korean-poetry-emotion-map
  (cd /tmp/site && python3 -m http.server 8765)
  python3 tests/browser_test.py http://localhost:8765/korean-poetry-emotion-map/
"""
import json, sys, time, pathlib
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8765/korean-poetry-emotion-map/"
ROOT = pathlib.Path(__file__).resolve().parent.parent
POEMS = json.loads((ROOT / "data/poems.json").read_text())
CHROME = "/usr/bin/google-chrome"

results = []
def check(name, ok, detail=""):
    results.append(("PASS" if ok else "FAIL", name, detail))
    print(("PASS" if ok else "FAIL"), name, detail, flush=True)

def ratio_sum(pg):
    vals = pg.eval_on_selector_all("#ratios .v", "els => els.map(e => e.textContent)")
    if all(v == "—" for v in vals):
        return None
    return round(sum(float(v.rstrip("%")) for v in vals), 1)

def set_w(pg, v):
    pg.eval_on_selector("#w", "(e, v) => { e.value = v; e.dispatchEvent(new Event('input', {bubbles:true})); }", v)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])

    # ------------------------------------------------------------ PC 1366×900
    pg = b.new_page(viewport={"width": 1366, "height": 900})
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
    pg.goto(BASE, wait_until="networkidle")
    check("하위 경로(/korean-poetry-emotion-map/)에서 로드, 콘솔 오류 없음", pg.text_content("#poemTitle") == POEMS[0]["title"] and not errs, "; ".join(errs))

    # T-01 + 1초 안 갱신
    slow, wrong = [], []
    for poem in POEMS:
        t0 = time.perf_counter()
        pg.click(f'#poemList button[data-id="{poem["id"]}"]')
        pg.wait_for_function("t => document.getElementById('poemTitle').textContent === t", arg=poem["title"])
        dt = (time.perf_counter() - t0) * 1000
        n_lines = pg.eval_on_selector_all("#poemBox button.ln", "e => e.length")
        expect = len([l for l in poem["text"].split("\n") if l.strip()])
        pressed = pg.get_attribute(f'#poemList button[data-id="{poem["id"]}"]', "aria-pressed")
        if n_lines != expect or pressed != "true": wrong.append(poem["id"])
        if dt > 1000: slow.append(f'{poem["id"]}:{dt:.0f}ms')
        render_ms = int(pg.evaluate("document.body.dataset.renderMs"))
        if render_ms > 1000: slow.append(f'{poem["id"]}:render {render_ms}ms')
    check("T-01 20편을 차례로 눌러 본문·행 수·선택 표시가 바뀜", not wrong, ",".join(wrong))
    check("N-03 시 전환 후 1초 안에 갱신(클릭~제목 변경 실측)", not slow, ",".join(slow))

    # T-02 비율 합 100%(가중치 0/50/100)
    bad = []
    zero_cases = []
    for w in (0, 50, 100):
        set_w(pg, w)
        for poem in POEMS:
            pg.click(f'#poemList button[data-id="{poem["id"]}"]')
            s = ratio_sum(pg)
            if s is None: zero_cases.append(f'{poem["id"]}@{w}')
            elif s != 100.0: bad.append(f'{poem["id"]}@{w}={s}')
    check("T-02 표시 비율 합계 = 100.0%(20편 × 가중치 0·50·100%)", not bad, ",".join(bad))
    check("감지 0건 + 사전 100%일 때만 비율을 만들지 않음", zero_cases == ["jeoljeong@100"], ",".join(zero_cases))

    # 가중치 양 끝
    pg.click('#poemList button[data-id="jeoljeong"]')
    set_w(pg, 100)
    dom = pg.text_content("#dominant")
    rec = pg.text_content("#recList")
    check("가중치 100% + 감지 0건(절정): 지배 정서·균등 비율을 만들지 않고 추천도 하지 않음", "계산하지 않음" in dom and "계산할 수 없어" in rec)
    set_w(pg, 0)
    rows = pg.eval_on_selector_all("#compare tbody tr", "trs => trs.map(t => [...t.children].map(c => c.textContent))")
    same = all(r[2] == r[3] for r in rows[:10])
    check("가중치 0%: 결합 결과 = 해석 프로필(절정)", same)
    pg.click('#poemList button[data-id="nameuro"]')
    set_w(pg, 100)
    rows = pg.eval_on_selector_all("#compare tbody tr", "trs => trs.map(t => [...t.children].map(c => c.textContent))")
    check("가중치 100%: 결합 결과 = 사전만(프로필이 덮어쓰지 않음, 남으로 창을 내겠소)", all(r[1] == r[3] for r in rows[:10]) and "기쁨" in pg.text_content("#dominant"))
    raw_before = pg.eval_on_selector_all("#poemBox .cnt", "e => e.map(x => x.textContent)")
    set_w(pg, 30)
    raw_after = pg.eval_on_selector_all("#poemBox .cnt", "e => e.map(x => x.textContent)")
    check("가중치를 바꿔도 행별 감지 수는 그대로", raw_before == raw_after)
    heat_row = pg.eval_on_selector_all("#heatBox tr.sel td", "e => e.map(x => x.textContent)")
    set_w(pg, 100)
    heat_row2 = pg.eval_on_selector_all("#heatBox tr.sel td", "e => e.map(x => x.textContent)")
    check("가중치를 바꾸면 히트맵 값이 다시 계산됨", heat_row != heat_row2)
    set_w(pg, 50)

    # 최장 일치·반복 계수(화면 값)
    pg.click('#poemList button[data-id="ogamdo"]')
    cap = pg.text_content("#compare caption")
    check("반복 계수: 오감도 사전 감지 19개(같은 말이 나온 만큼 셈)", "사전 감지 19개" in cap, cap)
    pg.click('#poemList button[data-id="wang"]')
    hit_words = pg.eval_on_selector_all("#poemBox .hit", "e => e.map(x => x.dataset.w)")
    check("최장 일치: ‘구슬픈’이 ‘슬픈’으로 따로 세지지 않음", "구슬픈" in hit_words and "슬픈" not in hit_words)

    # 계산과 해석 사이 A: 감정·시어·행
    pg.click('#poemList button[data-id="ogamdo"]')
    pg.click("#ratios li:nth-child(9) button")  # 불안·공포
    lit = pg.eval_on_selector_all("#poemBox button.ln.lit", "e => e.length")
    note = pg.text_content("#focusNote")
    check("감정 이름을 누르면 해당 행 강조(오감도 불안·공포 18행)", lit == 18 and "18개" in note, note)
    pg.click("#btnClearFocus")
    pg.click('#poemBox button.ln[data-no="1"]')
    info = pg.text_content("#lineInfo")
    check("감지 없는 행을 누르면 ‘사전에서 감지한 시어 없음’ 표시", "사전에서 감지한 시어 없음" in info, info[:60])
    pg.click('#poemBox button.ln[data-no="3"]')
    info = pg.text_content("#lineInfo")
    check("행을 누르면 시어·범주·개수 표시", "무섭" in info and "불안·공포 1" in info, info[:80])
    pg.click("#lineInfo .chip")
    check("시어를 누르면 같은 시어가 나온 행 강조", pg.eval_on_selector_all("#poemBox button.ln.lit", "e => e.length") == 13)

    # 계산과 해석 사이 C: 메모
    pg.fill("#memoText", "테스트 메모")
    pg.click("#memo .btn")
    pg.reload(wait_until="networkidle")
    pg.click('#poemList button[data-id="ogamdo"]')
    has = "테스트 메모" in pg.text_content("#memo")
    pg.click('#poemBox button.ln[data-no="3"]')
    pg.click("#memo .row-btns .tbtn")
    gone = "테스트 메모" not in pg.text_content("#memo .memo-list-wrap") if pg.query_selector("#memo .memo-list-wrap") else True
    check("독자 메모: 새로 고침 뒤에도 남고, 삭제하면 사라짐(localStorage)", has and gone)

    # T-05 추천 클릭
    pg.click('#poemList button[data-id="sewol"]')
    first = pg.text_content("#recList li:first-child .rt")
    pg.click("#recList li:first-child button")
    pg.wait_for_function("t => document.getElementById('poemTitle').textContent === t", arg=first)
    recs = pg.eval_on_selector_all("#recList .rt", "e => e.map(x => x.textContent)")
    check("T-05 추천을 누르면 그 시로 이동하고 추천이 다시 계산됨(자기 자신 제외)", first not in recs and len(recs) == 3 and "p=" in pg.url, f"{first} → {recs}")
    pcts = pg.eval_on_selector_all("#recList .rs", "e => e.map(x => x.textContent)")
    check("F-09 추천 3편에 유사도(%) 표시", len(pcts) == 3 and all(x.endswith("%") for x in pcts), ",".join(pcts))

    # T-03, T-04, 입력 안전
    pg.fill("#mineText", "")
    pg.click("#mineRun")
    check("T-04 빈 입력이면 분석하지 않고 입력 요청", "입력해 주세요" in pg.text_content("#mineOut"))
    pg.fill("#mineText", "오늘은 버스를 타고 학교에 갔다\n점심으로 국수를 먹었다")
    pg.click("#mineRun")
    out = pg.text_content("#mineOut")
    check("T-03 감지 시어가 없으면 안내 문구(비율·추천 없음)", "감지한 시어가 없습니다" in out and "유사도" not in out)
    pg.fill("#mineText", "<img src=x onerror=\"window.__xss=1\">눈물이 흐르네\n\n그리운 고향")
    pg.click("#mineRun")
    imgs = pg.eval_on_selector_all("#mineOut img", "e => e.length")
    xss = pg.evaluate("window.__xss || 0")
    out = pg.text_content("#mineOut")
    check("F-11 입력을 HTML로 해석하지 않음(img 요소 없음, 원문 글자로 표시)", imgs == 0 and xss == 0 and "<img" in out)
    check("F-11 같은 엔진으로 비율·행·추천 표시", "지배 정서" in out and "2연" in out and len(pg.eval_on_selector_all("#mineRecs .rt", "e=>e")) == 3)
    req = []
    pg.on("request", lambda r: req.append(r.url))
    pg.click("#mineRun")
    pg.wait_for_timeout(300)
    check("F-11 분석할 때 외부로 요청을 보내지 않음", not req, ",".join(req))

    # 키보드
    pg.focus('#poemList button[data-id="geoul"]')
    pg.keyboard.press("Enter")
    ok1 = pg.text_content("#poemTitle") == "거울"
    pg.focus("#flow .flow-bar[data-no='2']")
    pick = pg.text_content("#flowPick")
    pg.keyboard.press("Enter")
    ok2 = pg.get_attribute('#poemBox button.ln[data-no="2"]', "aria-pressed") == "true"
    check("키보드: 목록 Enter로 선택, 흐름 막대 초점 시 행 정보 표시·Enter로 행 선택", ok1 and ok2 and "2행" in pick, pick[:40])

    # 검색
    pg.fill("#q", "윤동주")
    n = pg.eval_on_selector_all("#poemList button", "e => e.length")
    pg.fill("#q", "없는시인")
    empty_visible = pg.is_visible("#listEmpty")
    pg.fill("#q", "")
    check("검색: 시인 이름으로 걸러지고, 결과 없음 안내", n == 3 and empty_visible)
    pg.close()

    # ------------------------------------------------------------ 휴대폰 390×844
    m = b.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
    m.goto(BASE, wait_until="networkidle")
    over = []
    for poem in POEMS:
        m.evaluate("id => document.querySelector(`#poemList button[data-id='${id}']`).click()", poem["id"])
        sw = m.evaluate("document.documentElement.scrollWidth")
        if sw > 390: over.append(f'{poem["id"]}:{sw}')
    m.fill("#mineText", "눈물 " * 200)
    m.click("#mineRun")
    sw = m.evaluate("document.documentElement.scrollWidth")
    if sw > 390: over.append(f"mine:{sw}")
    check("T-06 390px: 20편 모두·긴 입력 뒤에도 페이지 가로 스크롤 없음", not over, ",".join(over))
    list_scroll = m.evaluate("(() => { const u = document.getElementById('poemList'); return u.scrollWidth > u.clientWidth && getComputedStyle(u).overflowX === 'auto'; })()")
    check("휴대폰: 시 목록은 목록 안에서 가로 스크롤", list_scroll)
    m.tap("#flow .flow-bar[data-no='1']")
    check("휴대폰: 흐름 막대를 터치하면 행 정보 표시", "1행" in m.text_content("#flowPick"))
    m.screenshot(path=str(ROOT / "docs/screens/mobile-390.png"), full_page=False)
    m.close()

    # ------------------------------------------------------------ T-07 화면 본문 = 데이터 본문(판본 글자 그대로)
    pg = b.new_page(viewport={"width": 1366, "height": 900})
    pg.goto(BASE, wait_until="networkidle")
    mism = []
    for poem in POEMS:
        pg.click(f'#poemList button[data-id="{poem["id"]}"]')
        shown = pg.eval_on_selector_all("#poemBox .stanza", """sts => sts.map(st => [...st.querySelectorAll('button.ln .tx')].map(tx => {
            const c = tx.cloneNode(true); c.querySelectorAll('sup').forEach(s => s.remove()); return c.textContent; }).join('\\n')).join('\\n\\n')""")
        if shown != poem["text"]: mism.append(poem["id"])
    check("T-07 화면 본문이 데이터 본문과 글자·행·연까지 일치(20편)", not mism, ",".join(mism))
    pg.screenshot(path=str(ROOT / "docs/screens/desktop-1366.png"), full_page=False)
    pg.close()

    # ------------------------------------------------------------ 오류 상황
    pg = b.new_page(viewport={"width": 1366, "height": 900})
    pg.route("**/data/poems.*", lambda r: r.abort())
    pg.goto(BASE, wait_until="load")
    pg.wait_for_timeout(500)
    check("데이터 불러오기 실패 시 안내 문구", pg.is_visible("#loadError") and "불러오지 못했습니다" in pg.text_content("#loadError"))
    pg.close()
    pg = b.new_page(viewport={"width": 1366, "height": 900})
    pg.route("**/fonts.googleapis.com/**", lambda r: r.abort())
    pg.route("**/fonts.gstatic.com/**", lambda r: r.abort())
    pg.goto(BASE, wait_until="load")
    pg.wait_for_timeout(300)
    check("웹 글꼴을 못 받아도 본문이 보임", pg.eval_on_selector_all("#poemBox button.ln", "e => e.length") > 0 and pg.is_visible("#poemBox"))
    pg.close()
    pg = b.new_page(viewport={"width": 1366, "height": 900})
    pg.goto((ROOT / "index.html").as_uri(), wait_until="load")
    pg.wait_for_timeout(300)
    check("file://로 index.html을 바로 열어도 동작(poems.js)", pg.text_content("#poemTitle") == POEMS[0]["title"])
    pg.close()
    b.close()

passed = sum(1 for r in results if r[0] == "PASS")
lines = [f"{s}  {n}" + (f"  ({d})" if d else "") for s, n, d in results]
lines.append(f"\n{passed} passed, {len(results) - passed} failed — Chrome(headless) {time.strftime('%Y-%m-%d')}")
(ROOT / "tests/browser-results.txt").write_text("\n".join(lines) + "\n")
print(lines[-1])
sys.exit(0 if passed == len(results) else 1)
