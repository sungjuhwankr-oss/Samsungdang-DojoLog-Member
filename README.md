# Samsungdang DojoLog - 수련자

Android/iPhone 공통 PWA로 개발하는 개인 아이키도 수련기록 도구입니다.

## Phase 1 범위

현재 단계는 공개 PWA 기반과 `/import/` 진입경로 검증 전용입니다.

구현됨:

- Next.js App Router + TypeScript skeleton
- static export (`output: "export"`)
- GitHub Pages project-site subpath 대응
- `/import/` route
- `#session=test123` fragment 진단
- Web App Manifest
- Service Worker 기반 최소 offline shell
- 192/512/maskable/Apple touch icons
- 브라우저/PWA diagnostics
- GitHub Pages Actions workflow

의도적으로 미구현:

- Session Share Payload decode/validation
- IndexedDB
- 수련기록 저장
- 회원정보/승급이력/통계
- backup/restore
- 지도자용 DojoLog 연결

## Local development

```bash
npm install
npm run dev
```

## Local production build

```bash
npm test
npm run lint
npm run build
npm run validate:phase1
```

GitHub Pages project-site build는 workflow에서 `GITHUB_PAGES=true`를 설정하여 `/Samsungdang-DojoLog-Member` basePath를 적용합니다.

## Reproducible build

GitHub Pages workflow는 `package-lock.json`을 전제로 `npm ci`를 사용합니다. 최초 배포 전에 네트워크가 가능한 개발 환경에서 lockfile을 생성하고 검증한 뒤 커밋해야 합니다.
