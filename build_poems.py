"""시 20편 데이터를 만든다 (판본 재확정판).

원칙
1. 작품마다 실제로 내려받은 판본 하나를 표시 본문(text)으로 쓴다. 손으로 옮겨 쓰거나 기억으로 고치지 않는다.
2. 위키문헌 본문을 프로그램으로 그대로 가져온다. 바꾸는 것은 줄 끝 공백 정리와 아래 FIX 목록뿐이다.
3. FIX는 스캔 이미지 대조 또는 재수록본 대조 근거가 있을 때만 넣고, 바꾸기 전후와 근거를 남긴다.
4. 스캔 판독문의 쪽 경계는 판독자가 남긴 {{nop}} 표시가 있으면 연 구분, 없으면 행이 이어지는 것으로 본다.
"""
import json, re, pathlib

HERE = pathlib.Path(__file__).resolve().parent
RAW = HERE / "raw"
WS = "https://ko.wikisource.org/wiki/"
EK = "https://encykorea.aks.ac.kr/Article/"

def ws_url(page):
    return WS + page.replace(" ", "_").replace("(", "%28").replace(")", "%29")

def poem_blocks(key):
    return re.findall(r"<poem>(.*?)</poem>", (RAW / f"{key}.wiki").read_text(), flags=re.S)

def tidy(s):
    s = re.sub(r"\{\{옛한글/(시작|끝)\}\}", "", s)
    s = re.sub(r"<center>.*?</center>", "", s)
    s = re.sub(r"<ref>.*?</ref>", "", s)
    s = re.sub(r"\[\d+\]", "", s)                       # 각주 번호
    s = re.sub(r"<br\s*/?>", "", s)
    s = re.sub(r"(?m)^:+", "", s)
    s = s.replace(" ", " ").replace("​", "")
    s = re.sub(r"[ \t]+$", "", s, flags=re.M)
    s = re.sub(r"(?m)^[ \t]+$", "", s)
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip("\n")

def page_text(key):
    """스캔 판독문을 이어 붙인다. 쪽 끝 {{nop}} = 연 구분."""
    w = (RAW / f"page_{key}.wiki").read_text()
    w = re.sub(r"<br\s*/?>\s*\n", "\n", w)
    pages = w.split("<<PAGE>>")
    out = []
    for i, pg in enumerate(pages):
        nop_end = bool(re.search(r"\{\{nop\}\}\s*(<noinclude>.*?</noinclude>)?\s*$", pg.strip(), flags=re.S))
        pg = re.sub(r"<noinclude>.*?</noinclude>", "", pg, flags=re.S)
        pg = re.sub(r"==[^=\n]+==", "", pg)
        pg = re.sub(r"\{\{c\|.*?\}\}\}*", "", pg)
        pg = re.sub(r"\{\{(크게|더크게|더더크게)\|[^}]*\}\}", "", pg)
        pg = pg.replace("{{nop}}", "")
        pg = re.sub(r"\{\{sic\|([^|]*)\|[^}]*\}\}", r"\1", pg)
        pg = re.sub(r"(?m)^::::\(.*$", "", pg)           # 끝의 창작 날짜 표기(본문 아님)
        pg = re.sub(r"(?m)^::\d+\s*$", "", pg)            # 시집 내 작품 번호
        pg = pg.replace("<poem>", "").replace("</poem>", "")
        out.append((tidy(pg), nop_end))
    text = ""
    for i, (t, nop_end) in enumerate(out):
        if not t:
            continue
        if text:
            text += ("\n\n" if out[i - 1][1] else "\n")
        text += t
    return text

# ---------------------------------------------------------------- 근거 출처
SRC = {
 "ek_wang": ("한국민족문화대백과사전 「나는 왕이로소이다」", EK + "E0011306"),
 "ek_jeopdong": ("한국민족문화대백과사전 「접동새」", EK + "E0071333"),
 "ek_geunal_book": ("한국민족문화대백과사전 「그날이 오면」(시집)", EK + "E0007317"),
 "khan_geunal": ("주간경향 「그날이 오면-짧은 생애 ‘상록수’로 산 의인을 기리며」", "https://weekly.khan.co.kr/article/201901211453351"),
 "ltikorea_young": ("한국문학번역원 전자도서관 「김영랑」", "https://library.ltikorea.or.kr/node/74"),
 "ek_nameuro": ("한국민족문화대백과사전 「남으로 창을 내겠소」", EK + "E0012085"),
 "ek_goyangi": ("한국민족문화대백과사전 「봄은 고양이로다」", EK + "E0023782"),
 "ek_jeoljeong": ("한국민족문화대백과사전 「절정」", EK + "E0049814"),
 "ek_cheongpodo": ("한국민족문화대백과사전 「청포도」", EK + "E0056822"),
 "ek_chimsil": ("한국민족문화대백과사전 「나의 침실로」", EK + "E0011428"),
 "ek_alsu": ("한국민족문화대백과사전 「알 수 없어요」", EK + "E0035136"),
 "ek_swipge": ("한국민족문화대백과사전 「쉽게 씌여진 시」", EK + "E0071398"),
 "ek_byeol": ("한국민족문화대백과사전 「별 헤는 밤」", EK + "E0071330"),
 "ek_hanul": ("한국민족문화대백과사전 「하늘과 바람과 별과 시」", EK + "E0060561"),
 "ek_saseum": ("한국민족문화대백과사전 「사슴」", EK + "E0025764"),
 "ek_nongae": ("한국민족문화대백과사전 「논개」", EK + "E0013010"),
 "ek_ppaeat": ("한국민족문화대백과사전 「빼앗긴 들에도 봄은 오는가」", EK + "E0025323"),
 "ek_ogamdo": ("한국민족문화대백과사전 「오감도」", EK + "E0038074"),
 "ek_geoul": ("한국민족문화대백과사전 「거울」", EK + "E0001861"),
 "ek_mokma_book": ("한국민족문화대백과사전 「목마와 숙녀」(시집)", EK + "E0018624"),
 "ek_inhwan_sel": ("한국민족문화대백과사전 「박인환 선시집」", EK + "E0021081"),
 "hk_sewol": ("한국경제 고두현의 아침 시편 「‘세월이 가면’에서 ‘목마와 숙녀’까지」", "https://sgsg.hankyung.com/article/2023110315701"),
 # 사망 연도
 "d_hong": ("한국민족문화대백과사전 「홍사용」", EK + "E0064122"),
 "d_sowol": ("Wikipedia “Kim Sowol”", "https://en.wikipedia.org/wiki/Kim_Sowol"),
 "d_sim": ("한국민족문화대백과사전 「심훈」", EK + "E0033979"),
 "d_young": ("한국민족문화대백과사전 「김영랑」", EK + "E0009839"),
 "d_sangyong": ("한국민족문화대백과사전 「김상용」", EK + "E0009362"),
 "d_janghee": ("한국민족문화대백과사전 「이장희」", EK + "E0045714"),
 "d_yuksa": ("한국민족문화대백과사전 「이육사」", EK + "E0045444"),
 "d_sanghwa": ("서울신문 「이상화 시·수필, 이광수 단편소설 발굴」(이상화 1901-1943)", "https://m.seoul.co.kr/news/2013/02/06/20130206800034"),
 "d_yongun": ("한국문학번역원 KLWAVE “Han Yong-un”", "https://klwave.or.kr/klw/directories/200657/authorsView.do"),
 "d_yun": ("한국민족문화대백과사전 「윤동주」", EK + "E0042294"),
 "d_noh": ("한국민족문화대백과사전 「노천명」", EK + "E0012918"),
 "d_byeon": ("한국민족문화대백과사전 「변영로」", EK + "E0022940"),
 "d_isang": ("한국민족문화대백과사전 「이상」", EK + "E0044568"),
 "d_inhwan": ("한국민족문화대백과사전 「박인환」", EK + "E0021080"),
 # 오자 근거
 "thewiki_sim": ("더위키 「심훈」 문서의 「그날이 오면」 인용", "https://thewiki.kr/w/심훈"),
 "cafe_sim": ("다음 카페 ‘빈들의소리’ 심대섭 게시글의 「그날이 오면」 인용", "https://m.cafe.daum.net/woorinart/6VKm/1396"),
}
def S(*keys):
    return [{"label": SRC[k][0], "url": SRC[k][1]} for k in keys]

# ---------------------------------------------------------------- 작품
# ed: ws-modern(위키문헌 현대 표기본) / ws-parallel(위키문헌 현대어 대역) / scan(스캔 판독본) / ws-orig(위키문헌 원문, 스캔 미연결)
P = []
def add(**k): P.append(k)

add(id="wang", title="나는 왕이로소이다", poet="홍사용", poetDeath=1947, death=S("d_hong"),
    year="1923", yearBasis="최초 발표", firstPub="『백조』 3호(1923.9)", pubSrc=S("ek_wang"),
    ed="ws-modern", page="나는 왕이로소이다", block=0,
    source="『백조』 3호(1923.9) 발표작 — 위키문헌 현대 표기본",
    notes=["백과사전은 ‘전체 9연 45행’으로 적는다. 위키문헌 본문은 9연 29행으로, 산문시의 긴 줄을 나누는 방식이 다른 것으로 보인다. 원전 스캔은 대조하지 못했다.",
           "‘젖먹는 왕의 빰에’의 ‘빰’은 ‘뺨’의 오자일 수 있으나 원전으로 확인하지 못해 위키문헌 표기대로 두었다."])
add(id="jeopdong", title="접동새", poet="김소월", poetDeath=1934, death=S("d_sowol"),
    year="1923", yearBasis="최초 발표(제목 「졉동」, 뒤에 개작)", firstPub="『배재』 2호(1923.3)에 「졉동」으로 발표", collected="시집 『진달래꽃』(매문사, 1925)", pubSrc=S("ek_jeopdong"),
    ed="ws-parallel", page="진달래꽃 (시집)/접동새", block=0, origBlock=1,
    source="시집 『진달래꽃』(매문사, 1925) 수록본 — 위키문헌 현대어 대역",
    notes=["백과사전에 따르면 1925년 시집에 실으며 제목을 바꾸고 4~5연을 일부 고쳤다. 표시 본문은 1925년 시집본 계열이며 1923년 「졉동」과는 다르다.",
           "현대어 대역은 위키문헌 편집자가 원문을 현대 표기로 옮긴 것이다. 원문(옛 표기)은 ‘원문 보기’로 함께 제공한다."])
add(id="geunal", title="그날이 오면", poet="심훈", poetDeath=1936, death=S("d_sim"),
    year="1949", yearBasis="시집 간행(최초 지면 발표는 미확인)", created="1930", firstPub="유고 시집 『그날이 오면』(한성도서, 1949)", pubSrc=S("ek_geunal_book", "khan_geunal"),
    ed="ws-modern", page="그날이 오면/그날이 오면", block=0,
    source="유고 시집 『그날이 오면』(한성도서, 1949) 수록작 — 위키문헌 현대 표기본",
    fixes=[("하거던든", "하거든", "중복 음절 오자로 판단. 재수록본 두 곳이 모두 ‘하거든’", S("thewiki_sim", "cafe_sim"))],
    notes=["본문 끝 날짜 ‘1930.3.1’로 창작 연도를 적었다.",
           "위키문헌 설명은 1932년 5월 『신생』에 「단장2수」라는 제목으로 실렸다고 하지만 다른 출처로 확인하지 못해 발표 연도로 쓰지 않았다.",
           "‘이 목숨이 끊지기 전에’의 ‘끊지기’는 오자로 보이나, 확인 근거를 확보하지 못해 위키문헌 표기대로 두었다(학생 확인 필요)."])
add(id="doldam", title="돌담에 속삭이는 햇발", titleNote="시집에는 제목 없이 번호 ‘2’로 실렸다. 제목은 첫 행에서 딴 통칭이다.", poet="김영랑", poetDeath=1950, death=S("d_young"),
    year="1935", yearBasis="시집 수록(최초 지면 발표는 미확인)", firstPub="『영랑시집』(시문학사, 1935)", pubSrc=S("ltikorea_young"),
    ed="scan", page="영랑시집/돌담에 속삭이는 햇발", scan="김윤식(김영랑) 영랑시집 (1935).pdf, 7쪽", scanLevel=3, scanChecked=True,
    source="『영랑시집』(시문학사, 1935) 초판 — 위키문헌 스캔 판독본",
    notes=["1930년 『시문학』 창간호에 처음 실렸다는 서술이 있으나 신뢰할 출처로 확인하지 못해 발표 연도로 쓰지 않았다."])
add(id="nameuro", title="남으로 창을 내겠소", poet="김상용", poetDeath=1951, death=S("d_sangyong"),
    year="1934", yearBasis="최초 발표", firstPub="『문학』 2호(1934.2)", collected="시집 『망향』(문장사, 1939)", pubSrc=S("ek_nameuro"),
    ed="ws-modern", page="망향 (시집)/남으로 창을 내겠소", block=0,
    source="『문학』 2호(1934.2) 발표작 — 위키문헌 현대 표기본(『망향』 수록면)",
    notes=["백과사전은 ‘3연 10행’이라고 적지만 위키문헌 본문은 6연 12행이다. 어느 판본의 행 나눔인지 원전으로 확인하지 못해, 내려받은 위키문헌 본문을 그대로 썼다.",
           "시집 『망향』 간행 연도는 백과사전 「김상용」 항목이 1938년, 「망향」 항목이 1939년으로 서로 다르다."])
add(id="goyangi", title="봄은 고양이로다", poet="이장희", poetDeath=1929, death=S("d_janghee"),
    year="1924", yearBasis="최초 발표", firstPub="『금성』 3호(1924.5)", pubSrc=S("ek_goyangi"),
    ed="ws-modern", page="봄은 고양이로다", block=0,
    source="『금성』 3호(1924.5) 발표작 — 위키문헌 현대 표기본",
    notes=["위키문헌 설명은 ‘『금성』 1호’라고 적었으나 백과사전에 따라 3호로 바로잡았다(본문과 무관한 서지 정보)."])
add(id="jeoljeong", title="절정", poet="이육사", poetDeath=1944, death=S("d_yuksa"),
    year="1940", yearBasis="최초 발표", firstPub="『문장』(1940.1)", pubSrc=S("ek_jeoljeong"),
    ed="ws-modern", page="절정", block=0, source="『문장』(1940.1) 발표작 — 위키문헌 현대 표기본", notes=[])
add(id="cheongpodo", title="청포도", poet="이육사", poetDeath=1944, death=S("d_yuksa"),
    year="1939", yearBasis="최초 발표", firstPub="『문장』(1939.8)", collected="『육사시집』(1946)", pubSrc=S("ek_cheongpodo"),
    ed="ws-modern", page="청포도", block=0, source="『문장』(1939.8) 발표작 — 위키문헌 현대 표기본", notes=[])
add(id="chimsil", title="나의 침실로", poet="이상화", poetDeath=1943, death=S("d_sanghwa"),
    year="1923", yearBasis="최초 발표", firstPub="『백조』 3호(1923.9)", pubSrc=S("ek_chimsil"),
    ed="ws-orig", page="나의 침실로", block=0,
    source="『백조』 3호(1923.9) 발표 원문 — 위키문헌 원문(옛 표기)",
    epigraph="―『가장 아름답고 오-랜 것은 오직 ᄭᅮᆷ 속에만 잇서라』― 『내 말』", afterword="―『비음(緋音) 가온대서』―",
    notes=["위키문헌에 현대어본이 없어 원문 표기를 그대로 쓴다. 옛한글(ᄲᅡᆯ리, ᄭᅮᆷ 등)은 글꼴에 따라 풀어져 보일 수 있다.",
           "제목 아래 부제와 작품 끝의 부기는 본문이 아니므로 분석에서 빼고 판본 정보에만 적었다.",
           "위키문헌 원문이 어느 지면을 판독했는지(스캔 연결)는 확인하지 못했다."])
add(id="alsu", title="알 수 없어요", poet="한용운", poetDeath=1944, death=S("d_yongun"),
    year="1926", yearBasis="최초 발표(시집)", firstPub="시집 『님의 침묵』(회동서관, 1926)", pubSrc=S("ek_alsu"),
    ed="ws-parallel", page="님의 침묵/알 수 없어요", block=1, origBlock=0,
    source="시집 『님의 침묵』(회동서관, 1926) — 위키문헌 현대어 대역",
    notes=["현대어 대역의 ‘돌뿌리’, ‘구비구비’는 위키문헌 표기 그대로다. 원문은 ‘원문 보기’로 함께 제공한다."])
add(id="swipge", title="쉽게 씌어진 시", titleInEdition="쉽게 씨워진 詩", poet="윤동주", poetDeath=1945, death=S("d_yun"),
    year="1947", yearBasis="최초 발표", created="1942", firstPub="『경향신문』(1947.2.13)", collected="유고 시집 『하늘과 바람과 별과 시』(정음사, 1948)", pubSrc=S("ek_swipge"),
    ed="scan", page="하늘과 바람과 별과 시 (1948년)/쉽게 씨워진 시", scan="윤동주 하늘과 바람과 별과 시 (초판본, 1948).pdf, 50–51쪽", scanLevel=1, scanChecked=True,
    source="『하늘과 바람과 별과 시』(정음사, 1948) 초판 — 위키문헌 스캔 판독본(스캔 대조 교정)",
    fixes=[("적어 볼가,", "적어볼까,", "초판 50쪽 스캔에 ‘적어볼까,’로 인쇄됨(판독문 오류)", []),
           ("것일가?", "것일까?", "초판 51쪽 스캔에 ‘것일까?’로 인쇄됨(판독문 오류)", [])],
    notes=["이전 데이터는 출처 표시가 없는 위키문헌 현대어 문서를 썼다. 같은 시집의 「참회록」·「별 헤는 밤」과 판본을 맞추려고 1948년 초판 판독본으로 바꿨다.",
           "위키문헌 판독문은 ‘교정 전(level 1)’ 상태여서 스캔 이미지와 한 줄씩 대조했다.",
           "백과사전 기준 10연 21행이며 표시 본문도 10연 21행이다."])
add(id="chamhoe", title="참회록", poet="윤동주", poetDeath=1945, death=S("d_yun"),
    year="1948", yearBasis="시집 수록(이전 지면 발표는 확인 못 함)", created="1942", firstPub="유고 시집 『하늘과 바람과 별과 시』(정음사, 1948)", pubSrc=S("ek_hanul"),
    ed="scan", page="하늘과 바람과 별과 시 (1948년)/참회록", scan="윤동주 하늘과 바람과 별과 시 (초판본, 1948).pdf, 62–63쪽", scanLevel=1, scanChecked=True,
    source="『하늘과 바람과 별과 시』(정음사, 1948) 초판 — 위키문헌 스캔 판독본(스캔 대조 교정)",
    fixes=[("욕될가", "욕될까", "초판 62쪽 스캔에 ‘욕될까’로 인쇄됨(판독문 오류)", []),
           ("흘로", "홀로", "초판 63쪽 스캔에 ‘홀로’로 인쇄됨(판독문 오류)", [])],
    notes=["초판 끝의 창작 날짜는 ‘(1924)’로 잘못 인쇄되어 있다(위키문헌은 1942의 오식으로 표시). 날짜 줄은 본문에서 뺐다.",
           "62→63쪽 경계는 판독자의 {{nop}} 표시에 따라 연 구분으로 처리했다."])
add(id="byeol", title="별 헤는 밤", poet="윤동주", poetDeath=1945, death=S("d_yun"),
    year="1948", yearBasis="시집 수록(유작)", created="1941", firstPub="유고 시집 『하늘과 바람과 별과 시』(정음사, 1948)", pubSrc=S("ek_byeol"),
    ed="scan", page="하늘과 바람과 별과 시 (1948년)/별 헤는 밤", scan="윤동주 하늘과 바람과 별과 시 (초판본, 1948).pdf, 40–42쪽", scanLevel=1, scanChecked=True,
    source="『하늘과 바람과 별과 시』(정음사, 1948) 초판 — 위키문헌 스캔 판독본(스캔 대조 교정)",
    fixes=[("이름과, 佩", "이름과 佩", "초판 41쪽 스캔에 쉼표 없음(판독문에 쉼표가 더해짐)", []),
           ("쨤”, “라이넬", "쨤” “라이넬", "초판 41쪽 스캔에 쉼표 없음(판독문에 쉼표가 더해짐)", [])],
    notes=["40→41쪽, 41→42쪽 경계에는 {{nop}} 표시가 없어 행이 이어지는 것으로 처리했다. 백과사전의 ‘10연 30행’과 일치한다."])
add(id="saseum", title="사슴", poet="노천명", poetDeath=1957, death=S("d_noh"),
    year="1938", yearBasis="시집 수록(이전 지면 발표는 확인 못 함)", firstPub="시집 『산호림』(한성도서, 1938)", pubSrc=S("ek_saseum"),
    ed="scan", page="산호림/사슴", scan="노천명 시집 산호림 (1938).pdf, 85–86쪽(인쇄 쪽수 79–80)", scanLevel=3, scanChecked=True,
    source="시집 『산호림』(한성도서, 1938) 초판 — 위키문헌 스캔 판독본",
    notes=["세로쓰기 판본이다. 판독문과 스캔이 일치했다."])
add(id="nongae", title="논개", poet="변영로", poetDeath=1961, death=S("d_byeon"),
    year="1922", yearBasis="최초 발표", firstPub="『신생활』 4월호(1922)", collected="시집 『조선의 마음』(평문관, 1924)", pubSrc=S("ek_nongae"),
    ed="ws-parallel", page="논개", block=1, origBlock=0,
    source="『신생활』(1922) 발표작 — 위키문헌 현대어 대역",
    notes=["위키문헌 설명은 ‘1923년 3월 『신생활』 3호’로 적었으나 백과사전 작품 항목의 1922년 4월호를 따랐다.",
           "시집 『조선의 마음』 간행 연도는 백과사전 「변영로」 항목(1924)과 「논개」 항목(1923)이 서로 다르다."])
add(id="ppaeat", title="빼앗긴 들에도 봄은 오는가", poet="이상화", poetDeath=1943, death=S("d_sanghwa"),
    year="1926", yearBasis="최초 발표", firstPub="『개벽』 70호(1926.6)", pubSrc=S("ek_ppaeat"),
    ed="ws-orig", page="빼앗긴 들에도 봄은 오는가", block=0,
    source="『개벽』 70호(1926.6) 발표 원문 — 위키문헌 원문(옛 표기)",
    notes=["위키문헌 현대어 대역은 ‘맨드램이 들마ᄭᅩᆺ’을 ‘민들레 제비꽃’으로, ‘지심매든 그들이라’를 ‘김을 매는 그 들이라’로 낱말 자체를 바꾸어 쓰지 않았다.",
           "옛한글(ᄯᅡᆼ, ᄲᅢ앗긴 등)은 글꼴에 따라 풀어져 보일 수 있다."])
add(id="ogamdo", title="오감도 시제1호", titleInEdition="烏瞰圖 詩第一號", poet="이상", poetDeath=1937, death=S("d_isang"),
    year="1934", yearBasis="최초 발표", firstPub="『조선중앙일보』(1934.7.24)", pubSrc=S("ek_ogamdo"),
    ed="scan", page="오감도", scan="이상 오감도 조선중앙일보(1934).pdf, 1쪽", scanLevel=3, scanChecked=True,
    source="『조선중앙일보』(1934.7.24) 지면 — 위키문헌 스캔 판독본",
    fixes=[(".", "。", "신문 지면 스캔에는 고리점(。)으로 인쇄됨. 판독문은 마침표(.)로 적었다", [])],
    notes=["붙여쓰기와 한자는 지면 그대로 둔다. 제10과 제11 사이의 빈 줄은 지면의 행간에서도 확인된다."])
add(id="geoul", title="거울", poet="이상", poetDeath=1937, death=S("d_isang"),
    year="1933", yearBasis="최초 발표", firstPub="『가톨닉청년』 통권 5호(1933.10)", pubSrc=S("ek_geoul"),
    ed="ws-orig", page="거울", block=0,
    source="『가톨닉청년』(1933.10) 발표 원문 — 위키문헌 원문(옛 표기)",
    notes=["백과사전의 ‘6연 13행’과 일치한다. 붙여쓰기는 원문 그대로다.",
           "위키문헌 원문이 어느 지면을 판독했는지(스캔 연결)는 확인하지 못했다."])
add(id="mokma", title="목마와 숙녀", poet="박인환", poetDeath=1956, death=S("d_inhwan"),
    year="1955", yearBasis="시집 수록(이전 지면 발표는 확인 못 함)", firstPub="『박인환 선시집』(산호장, 1955)", pubSrc=S("ek_inhwan_sel", "ek_mokma_book"),
    ed="ws-modern", page="목마와 숙녀/목마와 숙녀", block=0,
    source="위키문헌 「목마와 숙녀」(시집 『목마와 숙녀』(근역서재, 1976) 수록면) 현대 표기본",
    notes=["위키문헌 본문은 연 구분 없는 32행이다. 재수록본 가운데에는 연을 나누거나 ‘거저’를 ‘그저’로 바꾼 것이 있으나 내려받은 본문을 그대로 썼다.",
           "위키문헌 문서에 판본 설명이 없어, 같은 묶음의 「세월이 가면」 출전(1976 근역서재)으로 추정했다. 원전 스캔은 대조하지 못했다."])
add(id="sewol", title="세월이 가면", poet="박인환", poetDeath=1956, death=S("d_inhwan"),
    year="1976", yearBasis="시집 수록(최초 지면 발표는 미확인)", created="1956", firstPub="시집 『목마와 숙녀』(근역서재, 1976)", pubSrc=S("hk_sewol", "d_inhwan"),
    ed="ws-modern", page="목마와 숙녀/세월이 가면", block=0,
    source="시집 『목마와 숙녀』(근역서재, 1976) — 위키문헌 현대 표기본",
    notes=["1956년 작고 직전에 쓰여 노래로 먼저 알려졌고, 1955년 『선시집』에는 없으며 1976년 시집에 실렸다. 그 사이의 지면 발표는 확인하지 못했다."])

ED_LABEL = {"ws-modern": "위키문헌 현대 표기본", "ws-parallel": "위키문헌 현대어 대역", "scan": "스캔 판독본", "ws-orig": "위키문헌 원문(옛 표기)"}

out = []
for p in P:
    page = p["page"]
    if p["ed"] == "scan":
        key = {"doldam":"doldam","swipge":"swipge","chamhoe":"chamhoe","byeol":"byeol","saseum":"saseum","ogamdo":"ogamdo"}[p["id"]]
        text = page_text(key)
    else:
        text = tidy(poem_blocks(p["id"])[p["block"]])
    if p["id"] == "jeopdong" or p["id"] == "alsu":
        pass
    fixes = []
    for a, b, why, src in p.get("fixes", []):
        n = text.count(a)
        assert n >= 1, (p["id"], a)
        text = text.replace(a, b)
        fixes.append({"from": a, "to": b, "count": n, "why": why, "evidence": src})
    orig = None
    if "origBlock" in p:
        orig = tidy(poem_blocks(p["id"])[p["origBlock"]])
        if p["id"] == "jeopdong":
            orig = re.sub(r"\[[가-힣 ]+\]", "", orig)   # 위키문헌이 덧붙인 독음
        if p["id"] == "nongae":
            orig = orig.replace("더푸른\n\n그물결", "더푸른\n그물결")
    if p["id"] == "alsu":
        # 위키문헌 원문 칸은 스캔 쪽(<pages>)을 끌어오는 태그뿐이라, 렌더링된 문서(raw/alsu.txt)에서 원문을 뽑는다.
        rendered = (RAW / "alsu.txt").read_text()
        body = rendered.split("알ㅅ수업서요[편집]", 1)[1].split("현대어[편집]", 1)[0]
        body = body.replace("\u200b", "")
        orig = "\n".join(l.strip() for l in body.splitlines() if l.strip())
        assert orig.count("\n") == 5, orig
    if p["id"] == "nongae":
        text = text.strip()
    assert p["poetDeath"] <= 1962
    rec = {k: p[k] for k in ("id", "title", "poet", "year", "poetDeath") }
    rec.update({
        "yearBasis": p["yearBasis"], "created": p.get("created"), "firstPub": p["firstPub"], "collected": p.get("collected"),
        "pubSources": p["pubSrc"], "deathSources": p["death"],
        "source": p["source"], "sourceUrl": ws_url(page),
        "edition": {"type": p["ed"], "label": ED_LABEL[p["ed"]], "scan": p.get("scan"), "proofreadLevel": p.get("scanLevel"), "scanChecked": p.get("scanChecked", False)},
        "titleInEdition": p.get("titleInEdition"), "titleNote": p.get("titleNote"),
        "epigraph": p.get("epigraph"), "afterword": p.get("afterword"),
        "text": text, "orig": orig, "fixes": fixes, "notes": p["notes"],
    })
    out.append(rec)

(HERE / "poems.base.json").write_text(json.dumps(out, ensure_ascii=False, indent=1))
print("ok", len(out))
