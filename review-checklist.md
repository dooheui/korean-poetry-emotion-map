# 제출 전 확인과 LMS 제출 안내

## 1. 학생이 직접 확인·수정할 것

| 항목 | 위치 | 할 일 |
|---|---|---|
| 해석·주제·화자·표현(20편) | `tools/editorial.json` | AI 초안입니다. 직접 읽고 자기 말로 고칩니다(과제지시서: 해석은 자기 말로). 고친 뒤 `node tools/build_data.mjs` 실행 |
| 해석 프로필 값과 근거(`profile`, `profileNote`) | `tools/editorial.json` | 자기 해석에 맞게 조정합니다. 바꾸면 README 8장의 가중치 50%·프로필 수치를 `node tools/cases.cjs`로 다시 확인 |
| 검증 사례의 ‘문학적 해석’ 문장 | README 8장 | 자기 말로 고칩니다. 수치·행은 실행 기록(`docs/runs/`)과 맞춰 두었습니다 |
| 「그날이 오면」 ‘끊지기’ | 본문 | 오자로 보이나 근거를 못 찾아 그대로 둠. 도서관 시집·전집으로 확인되면 `tools/build_poems.py`의 fixes에 근거와 함께 추가 |
| 「남으로 창을 내겠소」 연·행 | 본문 | 백과사전 ‘3연 10행’ ↔ 위키문헌 6연 12행. 가능하면 원전 확인 |
| 「나는 왕이로소이다」 연·행 | 본문 | 백과사전 ‘9연 45행’ ↔ 위키문헌 9연 29행 |
| 원전 미대조 14편 | `docs/text-verification.md` | 시간이 되면 시집·전집 지면과 대조. 대조하지 않았으면 ‘대조했다’고 쓰지 않기 |
| AI 사용 내역의 ‘학생이 검토·수정한 부분’ | README 12장 | 실제로 한 일을 적기 |
| 실제 기기 확인 | README 11장 | 휴대폰·Edge/Safari에서 직접 열어 보고, 확인한 것만 표에 추가 |

## 2. GitHub에 올리기

1. GitHub에서 **New repository** → 이름 `korean-poetry-emotion-map`, **Public** → Create.
2. 이 폴더 안의 파일을 모두 올립니다(**Add file → Upload files**로 끌어다 놓아도 됩니다). 저장소 최상위에 `index.html`, `README.md`, `.nojekyll`이 보여야 합니다.
   - `.nojekyll`처럼 점으로 시작하는 파일은 탐색기에서 숨김일 수 있습니다. 빠져도 동작에는 큰 문제가 없지만 올리는 것을 권장합니다.
3. **Settings → Pages → Source: Deploy from a branch → Branch: `main`, 폴더 `/ (root)` → Save**.
4. 1~2분 뒤 `https://<아이디>.github.io/korean-poetry-emotion-map/`를 PC와 휴대폰에서 열어 봅니다. 안 열리면 **Actions** 탭의 *pages build and deployment*를 확인하고, 기록이 없으면 아무 파일이나 고쳐 커밋을 하나 더 올립니다.
5. README 맨 위의 두 자리표시자(`<아이디>`)를 실제 주소로 바꿔 커밋합니다.

API 키·비밀번호·토큰은 어떤 파일에도 넣지 않습니다(현재 없음, `tests/data.test.mjs`가 검사).

## 3. LMS 제출(3가지)

| 제출 칸 | 넣을 것 |
|---|---|
| README.md | 저장소의 `README.md` 파일(또는 주소 `https://github.com/<아이디>/korean-poetry-emotion-map/blob/main/README.md`) |
| GitHub 저장소 주소 | `https://github.com/<아이디>/korean-poetry-emotion-map` |
| 웹앱 주소 | `https://<아이디>.github.io/korean-poetry-emotion-map/` |

마감: 2026-11-30(월) 23:59. 제출 전에 웹앱 주소를 **로그아웃한 브라우저(시크릿 창)**에서 열어 보면 공개 여부를 확인할 수 있습니다.

## 4. 과제지시서 체크리스트

- [x] 시 15편 이상(20편), 새 작품 5편 이상(20편 모두 새 작품)
- [x] 모든 시인 사망 1962년 이전, 사망 연도 근거 링크
- [x] 모든 작품 본문 출처
- [x] 범주 6~10개(10개) + 한 문장 정의
- [x] 시마다 비율·행별 감정·지배 정서·주제·해석(3문장 이상)
- [x] 검증 사례 3개 이상(7개, 실제 실행값)
- [x] 기본 기능 4개 이상(F-06~F-11 6개 모두)
- [ ] PC·휴대폰에서 실제 주소로 열림 ← 배포 후 직접 확인
- [x] README 6항목(주소·사용법 / 작품 목록 / 범주·방법 / 검증 / 한계 / AI 사용)
- [x] 비밀 정보 없음
- [ ] 해석·사례 문장 자기 말로 검토 ← 직접
