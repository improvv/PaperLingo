# PaperLingo

A personal PDF research paper reader with instant English-to-Korean translation.

영어 논문을 읽는 한국인 대학생을 위한 개인용 PDF 리더입니다. 문장을 드래그한 뒤 **번역**을 누르면 오른쪽 Translation에 한국어 번역이 쌓입니다. PDF 전체 번역, OCR, 데이터베이스, 회원가입은 포함하지 않습니다.

## 주요 기능

- 로컬 파일 선택 / 드래그 앤 드롭, HTTPS PDF URL, arXiv `/abs/` → `/pdf/` 변환
- 최대 20MB, PDF 시그니처 검사, 다운로드 중 실제 크기 제한, 로딩·오류 안내
- React-PDF / PDF.js 원본 렌더링, Text Layer, 여러 페이지·2단 논문, 60–200% 확대·축소
- 선택 영역을 보존하는 플로팅 번역 버튼, 스크롤 후 좌표 갱신, 화면 경계 보정
- 버튼을 누를 때만 번역, 최대 2,000자, 중복 실행 차단, 동일 문장 메모리 캐시
- 원문 / 한국어 / 페이지별 기록, 페이지 이동, 번역문 복사, 개별·전체 삭제
- 데스크톱 약 70:30 레이아웃, 작은 화면에서는 논문 / Translation 탭
- API 키 누락, Google 설정·할당량·네트워크·시간 초과 오류 구분

PDF는 브라우저 메모리에서만 읽습니다. URL도 브라우저가 직접 가져옵니다. 파일을 서버에 보내거나 저장하지 않습니다. **선택한 영어 텍스트만** 앱의 `/api/translate`를 거쳐 Google로 전송합니다. 번역 결과는 일반 텍스트로 표시합니다.

## 기술 스택 / 폴더 구조

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, React-PDF 10 / PDF.js, Lucide(오픈소스 아이콘), Google Cloud Translation Basic v2 NMT, Vercel Hobby. 의존성 버전은 `package-lock.json`에 고정됩니다.

```text
paper-lingo/
├── src/
│   ├── app/
│   │   ├── api/translate/route.ts   # 서버 전용 Google API, 입력 검증
│   │   ├── globals.css            # 반응형 읽기 화면
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── reader.tsx             # 파일/URL, 선택, 캐시, 번역 사이드바
│   │   └── pdf-viewer.tsx         # PDF 렌더링 및 Text Layer
│   └── lib/
│       ├── pdf.ts                 # HTTPS/arXiv, 크기·형식 검증
│       └── text.ts                # 줄바꿈 정리와 글자 수
├── scripts/copy-pdf-assets.mjs    # PDF.js 폰트·CMap·WASM 로컬 복사
├── tests/{unit,e2e}/
├── .github/workflows/ci.yml
├── .env.example
├── .env.local                    # 개인 키, Git 제외, 직접 생성
└── README.md
```

## 로컬 실행

Node.js **22.12 이상**(22 LTS 권장), npm이 필요합니다.

```bash
git clone https://github.com/improvv/PaperLingo.git paper-lingo
cd paper-lingo
npm install
cp .env.example .env.local
# .env.local에 본인의 API 키 입력
npm run dev
```

이미 `.env.local`을 설정했다면 `cp`로 덮어쓰지 마세요. <http://localhost:3000>에서 PDF를 엽니다. `npm install`의 postinstall이 PDF.js 보조 파일을 `public/pdf-assets/`에 복사합니다. 이 생성 디렉터리는 Git에서 제외되며 CDN에 의존하지 않습니다. Worker도 설치된 PDF.js와 동일 버전으로 빌드됩니다.

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Google Cloud Translation 활성화

1. [Google Cloud Console](https://console.cloud.google.com/)에서 개인 공부용 프로젝트를 만듭니다. 다른 프로젝트의 번역 사용량과 분리하면 관리하기 쉽습니다.
2. 결제 계정을 연결합니다. 무료 사용량을 사용하더라도 **결제 연결이 필요**합니다.
3. APIs & Services → Library → **Cloud Translation API** (`translate.googleapis.com`)를 활성화합니다.
4. APIs & Services → Credentials → Create credentials → **API key**로 키를 만듭니다.
5. 키 편집 → **API restrictions → Restrict key → Cloud Translation API만 허용** → 저장합니다. 호출 엔드포인트는 `translation.googleapis.com/language/translate/v2`입니다.
6. 서버에서 호출하므로 웹사이트 HTTP referrer 제한을 사용하지 마세요. 서버용 클라이언트 제한은 고정 송신 IP가 있을 때 IP 제한을 사용합니다. 기본 Vercel Hobby 함수는 고정 송신 IP를 전제로 할 수 없으므로 임의의 IP 제한은 요청을 차단할 수 있습니다. API 제한, 일일 할당량, Vercel Authentication으로 보호합니다.

[공식 설정](https://docs.cloud.google.com/translate/docs/setup) · [키 제한](https://docs.cloud.google.com/api-keys/docs/add-restrictions-api-keys)

`.env.local`:

```dotenv
GOOGLE_TRANSLATE_API_KEY=your_private_api_key
```

키는 Route Handler에서만 읽으며 `NEXT_PUBLIC_` 접두사를 사용하지 않습니다. `.env*`는 `.gitignore`로 제외하고 값이 없는 `.env.example`만 추적합니다. 키를 변경하면 개발 서버를 재시작하세요. 누락 시 API는 `503 / NOT_CONFIGURED`를 반환하며 번역 성공을 꾸며 내지 않습니다. 키와 원문을 애플리케이션 로그에 출력하지 않습니다.

`API_KEY_SERVICE_BLOCKED` 오류가 나오면 해당 키의 API restrictions 목록에서 **Cloud Translation API를 허용**해야 합니다. API를 프로젝트에서 활성화하는 것과 키에서 그 API를 허용하는 것은 별개입니다. 변경 후 잠시 기다린 뒤 다시 번역하세요.

## 하루 12,000자 할당량 설정

앱의 2,000자 제한은 **한 번의 요청 제한**입니다. 하루 예산 제한은 Google Console에서 별도로 설정해야 합니다.

1. Google Cloud Console → **IAM & Admin → Quotas & System Limits**(또는 Cloud Translation API → Quotas & System Limits)를 엽니다.
2. PaperLingo에 연결한 프로젝트인지 확인하고 Service를 **Cloud Translation API**로 필터링합니다.
3. **Characters sent to general model per project per day (v2 and v3)**(프로젝트당 일일 일반 모델 문자 수) 항목을 찾습니다. 분당 요청 수나 문자 수를 대신 수정하지 마세요.
4. 해당 항목 선택 → Edit quotas → 새 값을 **12000**으로 설정하고 저장합니다. 권한이 없으면 프로젝트의 할당량 수정 권한이 필요합니다.
5. 저장된 한도가 12,000인지 확인합니다. 반영에는 시간이 걸릴 수 있습니다. 일일 초기화는 **미국 태평양 시간 자정**이며 한국 시간 자정이 아닙니다.

이 한도는 프로젝트의 다른 v2/v3 일반 모델 호출과 공유됩니다. 무료 한도나 예산 알림이 자동으로 요청을 막아 주는 것으로 생각하지 마세요. Google의 실제 사용량·결제 화면이 기준이며 앱에는 과금 측정기로 오해할 사용량 카운터를 두지 않았습니다.

[공식 할당량 설명](https://docs.cloud.google.com/translate/quotas)

## 무료 조건 / 과금 주의

2026-11-06 확인 기준 Basic NMT는 **월 첫 500,000자**가 매월 $10 크레딧으로 상쇄되고, 이를 넘으면 **100만 자당 $20**입니다. 사용량 집계·공유 조건은 [공식 가격표](https://cloud.google.com/products/translate/pricing?hl=en)가 우선합니다. 별도 API나 프로젝트의 호출도 과금 조건을 확인하세요.

하루 12,000자 × 31일 = 372,000자로 월 무료 범위에 여유를 두지만, 이 계산만으로 과금이 절대 없음을 보장하지 않습니다. Console의 프로젝트와 실제 한도를 확인하고 Billing 예산 알림도 설정하세요. 예산 알림은 강제 차단 장치가 아닙니다.

앱은 `source=en`, `target=ko`, `format=text`, **`model=nmt`**를 명시합니다. LLM, 문서 전체 번역 API, OCR, 유료 UI, 저장소 서비스는 호출하지 않습니다. 동일 문장 캐시 적중은 Google을 다시 호출하지 않습니다. 새로고침·다른 탭·기기는 캐시를 공유하지 않습니다.

## GitHub 연결

사용자 제공 저장소는 **improvv/PaperLingo**입니다. 로컬 폴더 / npm / Vercel 프로젝트 이름은 `paper-lingo`로 사용합니다. 기존 GitHub 저장소를 자동으로 이름 변경하지 않습니다. GitHub에서도 정확히 `paper-lingo` 이름을 원하면 Repository → Settings → General → Repository name에서 변경 후 remote를 업데이트하세요.

```bash
git remote -v
git check-ignore .env.local
git add .
git diff --cached --stat
git commit -m "Build PaperLingo PDF reader and Korean translation MVP"
git push origin main
```

커밋 전에 키가 staging에 들어가지 않았는지 확인하세요. GitHub Actions는 push / pull request에서 lint, 단위 테스트, 프로덕션 빌드를 수행합니다. 키 없이도 빌드됩니다. UI 통합 테스트는 로컬에서 실행하며 실제 Google API를 사용하는 테스트는 CI에서 실행하지 않습니다.

## Vercel Hobby 배포

1. Vercel 개인 Hobby 계정 → Add New → Project → GitHub를 연결하고 **improvv/PaperLingo**를 Import합니다.
2. Project Name: `paper-lingo`, Framework Preset: **Next.js**, Root Directory: 저장소 루트.
3. Node.js Version을 **22.x**로 설정합니다. Install Command는 `npm install` 또는 기본값, Build Command는 `npm run build`, Output Directory는 Next.js 기본값으로 둡니다. `--ignore-scripts`를 사용하면 PDF.js 보조 파일 복사가 빠집니다.
4. **키를 추가하기 전에 아래 Vercel Authentication을 All Deployments로 활성화**해 운영 주소와 API를 보호합니다. 최초 배포 화면에서 설정할 수 없다면 우선 키 없이 배포하고 보호 설정 후 키를 추가합니다.
5. Project Settings → Environment Variables → `GOOGLE_TRANSLATE_API_KEY`를 **Sensitive** 환경변수로 등록합니다. Production과 사용할 Preview 환경에 적용합니다. Development는 필요할 때 별도 등록합니다. 공개 환경변수로 만들지 마세요.
6. Deploy 또는 Redeploy합니다. 환경변수 변경은 이미 배포된 빌드에 소급 적용되지 않습니다.
7. 제공되는 `https://paper-lingo-....vercel.app`에서 로그인 후 PDF를 열고 짧은 문장을 번역합니다.
8. Settings → Git에서 Production Branch가 `main`인지 확인합니다. 이후 GitHub `main` push마다 운영 배포, PR/다른 브랜치는 Preview 배포가 자동 실행됩니다.

별도 서버, 데이터베이스, 커스텀 도메인이 필요 없습니다. Hobby는 개인·비상업적 사용 범위와 리소스 한도가 적용됩니다. 코드의 로컬 프로덕션 빌드 통과와 실제 Vercel 계정의 배포 완료는 구분해야 합니다.

## Vercel Authentication — 반드시 All Deployments

Vercel의 **2026-09-09 공식 변경 공지**에서 모든 플랜에 운영 배포 보호가 무료로 제공됨을 확인했습니다. 예전 문서의 Hobby는 운영 주소 보호 불가라는 설명과 구분하세요.

1. Vercel 프로젝트 → **Security → Deployment Protection**(UI에 따라 Settings → Deployment Protection).
2. **Vercel Authentication**을 활성화합니다.
3. 보호 범위를 **All Deployments**로 선택하고 저장합니다. **Standard Protection만 선택하면 운영 기본 도메인이 공개될 수 있습니다.**
4. 프로젝트 접근이 허용된 본인의 Vercel 계정만 사용하도록 유지합니다. 공개 Shareable Link나 불필요한 bypass token / 예외를 만들지 마세요.
5. 시크릿 창 / 로그아웃 상태에서 운영 `.vercel.app`, 개별 Preview 주소 및 `/api/translate` 접근에 Vercel 로그인 또는 접근 거부가 적용되는지 확인합니다. POST API도 실제 요청으로 확인합니다. API에는 GET 핸들러가 없으므로 로그인 후 GET 405는 정상입니다.
6. 로그인 후 번역을 확인합니다. 보호 범위 변경은 Google 프로젝트의 일일 할당량을 대신하지 않습니다.

이 앱에는 별도의 로그인이나 서버의 영구적인 속도 제한 저장소가 없습니다. Origin 검사와 클라이언트 중복 차단만으로 공개 API의 비용을 보호할 수는 없습니다. **배포 보호와 Google 일일 한도 설정을 모두 완료**하세요.

[공식 무료 운영 보호 공지](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan) · [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)

## URL / arXiv / CORS

- HTTPS만 허용하며 URL의 사용자명·암호를 거부합니다. arXiv abstract 주소와 구형 `hep-th/...` 식별자도 PDF 경로로 변환합니다.
- 외부 PDF는 **브라우저에서 직접 fetch**합니다. 서버에서 임의 URL을 프록시하는 API는 없습니다. 외부 사이트로 Google API 키나 앱 쿠키를 보내지 않습니다.
- 유효한 URL도 외부 서버가 CORS를 허용하지 않거나, 로그인·일시적 접근 제한·인증서·네트워크 문제가 있으면 열리지 않을 수 있습니다. arXiv도 해당 사이트의 응답 정책에 따라 다릅니다. 브라우저는 CORS 실패와 네트워크 실패를 완전히 구별해 주지 않으므로 가능한 원인을 함께 안내합니다.
- 이런 경우 논문 제공 사이트에서 합법적으로 PDF를 내려받고 **Upload PDF**로 여세요. 유료 사이트의 인증 / 접근 제한을 우회하지 않습니다.
- HTML 로그인 화면을 PDF URL로 입력하면 형식 오류를 안내합니다. 다운로드는 30초 후 취소하며 Content-Length 유무와 관계없이 20MB를 제한합니다.

## 테스트

```bash
npm test                    # Google 네트워크를 모의한 단위 테스트
npm run test:e2e             # 실제 Chrome + 실제 2단 PDF, 번역/URL 응답은 모의
npm run test:live            # 선택 실행: 실제 Google API와 외부 PDF 사이트, 실제 할당량 소비
```

Playwright는 기본적으로 설치된 Google Chrome을 사용합니다. Chrome이 없다면 설치하거나 `playwright.config.ts`의 `channel: "chrome"`을 제거하고 `npx playwright install chromium`을 실행하세요.

단위 테스트는 API 키 누락, 빈 입력·2,000자·실제 본문 크기 제한, 출처 검사, NMT 요청 형식, 엔티티 디코딩, Google 할당량·설정·네트워크·시간 초과 오류, URL 변환, PDF 형식·크기를 확인합니다.

UI 테스트는 생성한 **실제 3페이지 2단 PDF**를 PDF.js로 렌더링하고 마우스로 여러 줄을 드래그합니다. 선택만으로 호출하지 않음, 원문 전달, 클릭 후 선택 보존, 중복 요청 차단, 캐시, 확대·스크롤 후 선택, 페이지 이동, 삭제, 모바일 탭, HTML 문자 안전 표시를 확인합니다. 기본 UI 테스트의 번역은 모의 응답이므로 실제 Google 번역 성공의 근거가 아닙니다.

실제 API / URL 테스트는 별도 `test:live`로 분리했습니다. 외부 사이트 테스트가 CORS 안내를 확인했다면 그 결과는 **PDF 표시 성공으로 해석하지 마세요**. 실행 기록은 [docs/verification.md](docs/verification.md)를 참고하세요. 스크린샷·트레이스는 `test-results/`에 생성되며 Git에서 제외됩니다.

## 현재 제한

- OCR / 암호화 PDF 미지원. 텍스트가 없거나 폰트의 문자 매핑이 잘못된 PDF는 선택이 어렵습니다.
- 2단 PDF의 표시 레이아웃은 보존하지만, 열을 가로질러 선택할 때 텍스트 순서는 원본 PDF의 Text Layer 순서를 따릅니다. 한 번에 한 열의 문장을 선택하세요.
- 영어 줄바꿈과 명확한 `compu-\ntational` 같은 단어만 정리합니다. 수식·인용·하이픈 용어를 의미에 맞게 재작성하지 않습니다. PDF에 따라 줄 끝 하이픈 복원은 완전하지 않을 수 있습니다.
- 번역 기록은 현재 PDF의 최신 200개, 문장 캐시는 현재 탭의 500개까지 메모리에 유지합니다. 새 PDF를 열면 기록은 초기화하고 캐시는 재사용합니다. 새로고침하면 PDF·기록·캐시가 모두 지워집니다.
- 화면 근처의 페이지만 캔버스로 렌더링해 메모리를 줄입니다. 페이지 크기가 서로 다른 PDF에서 처음 이동할 때 스크롤 위치가 조금 조정될 수 있습니다.
- 모바일은 탭 UI를 제공하며 실제 터치 선택의 세부 동작은 기기·브라우저에 따라 다를 수 있습니다.
