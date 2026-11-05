# 검증 기록

실행일: 2026-11-06 KST. macOS, Node 22.15.1, Next.js 16.4.5, React-PDF 10.5.0, 설치된 Google Chrome.

| 검증 | 결과 | 범위 |
| --- | --- | --- |
| `npm install` | 통과 | PDF.js CMap / 폰트 / WASM 자동 복사 포함 |
| `npm run lint` | 통과 | ESLint 오류·경고 없음 |
| `npm run typecheck` | 통과 | TypeScript 오류 없음 |
| `npm test` | 32개 통과 | Google 호출은 모의 응답. 오류 코드, 키 누락, 유효성 검증 포함 |
| `npm run test:e2e` | 5개 통과 | 실제 PDF.js·Chrome·3페이지 2단 PDF·마우스 드래그. 번역과 URL 응답은 모의 |
| `npm run build` | 통과 | Next 프로덕션 빌드. `/` 정적, `/api/translate` 서버 Route |
| `npm audit` | 0건 | 전체 의존성, 개발 도구 포함 |
| `.env.local` | Git 제외 확인 | `.env.example`만 커밋 대상으로 유지 |

## 실제 외부 연동 (`npm run test:live`)

기본 테스트와 분리하여 실제 Google 및 외부 사이트에 접속했습니다. 이 테스트는 임의의 성공 응답을 사용하지 않습니다.

- **arXiv 실제 PDF 표시 성공**: `https://arxiv.org/abs/1706.03762` → `/pdf/1706.03762` 변환 후 Chrome에서 PDF.js 캔버스 / Text Layer 표시 확인.
- **W3C PDF 직접 열기 제한**: `https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf`는 해당 실행 환경에서 직접 가져오지 못했습니다. CORS / 접근 제한 / 네트워크 원인과 파일 업로드 대안이 표시됨을 확인했습니다. 이를 PDF 표시 성공으로 집계하지 않습니다.
- **Google 실제 번역은 설정 때문에 실패**: 전달된 키로 실제 PDF 문장을 선택 → 버튼 → `/api/translate` → Google까지 요청을 보냈으나 Google이 HTTP 403 `PERMISSION_DENIED`, `API_KEY_SERVICE_BLOCKED`, service `translate.googleapis.com`을 반환했습니다. 앱은 HTTP 502 `GOOGLE_CONFIGURATION`으로 안내했으며 번역 결과를 생성하지 않았습니다.
- 해당 키의 Credentials → API restrictions에서 **Cloud Translation API 허용** 후 `npm run test:live`를 다시 실행해야 실제 한국어 번역 완료를 확인할 수 있습니다. 성공으로 기록하지 않았습니다.

실제 외부 테스트 총 3개 중 arXiv 표시 / 접근 실패 안내 2개는 통과, Google 실제 번역 1개는 위 이유로 실패했습니다. 이 실패는 기본 모의 테스트와 별개입니다.

## UI 검증 범위

- 로컬 파일 선택, 실제 드래그 앤 드롭, 잘못된 PDF 안내
- HTTPS 외 URL 거부, arXiv abstract 변환, URL로 연 PDF도 같은 뷰어 사용
- 실제 마우스의 여러 줄 선택, 선택만으로 요청하지 않음, 선택된 원문과 요청 본문의 일치
- 번역 버튼 클릭 뒤 선택 보존, 로딩 상태 / 버튼 잠금, 같은 문장 캐시 재사용
- 120% 확대 뒤 선택, 2페이지로 스크롤 뒤 선택, 기록의 페이지 링크로 1페이지 복귀
- 결과 누적, 개별 / 전체 삭제, 새 PDF의 기록 초기화
- 모바일 폭 390px의 논문 / Translation 탭, 페이지 링크 복귀
- 번역의 HTML처럼 생긴 문자열을 일반 문자로 표시, PDF 밖 선택에서 버튼 미표시
- 2,000자를 초과하는 실제 PDF 선택의 API 호출 차단, Escape로 선택 버튼 닫기
- Google 할당량 초과 모의 응답의 오류 표시 및 가짜 결과 미생성

데스크톱 / 모바일 스크린샷을 직접 확인했습니다. PDF 원본 2단 레이아웃과 우측 번역 카드가 유지됩니다. 실기기 터치 제스처와 모든 PDF의 문자 순서를 보장하는 검증은 포함하지 않습니다.

## 배포 검증 범위

로컬 `npm run build`와 프로덕션 산출물 생성을 검증했습니다. Vercel 계정의 프로젝트 Import / 운영 배포 / All Deployments 설정은 사용자가 직접 설정해야 하며, Vercel에 실제 배포됐다고 주장하지 않습니다. 배포 후 로그인하지 않은 운영 주소와 API 요청이 차단되는지 확인하세요.
