# DMZ 망 도메인 관리 사이트

DMZ 망 내 도메인을 통합 관리하는 웹 기반 도메인 관리 시스템입니다.

## 프로젝트 개요

DMZ(Demilitarized Zone) 망 내에 존재하는 도메인 정보를 한 곳에서 등록, 조회, 관리할 수 있는 시스템입니다. 운영자가 도메인 현황과 각종 보안/결재 처리 상태를 한눈에 추적할 수 있도록 웹 UI와 JSON API를 제공합니다.

## 주요 기능

- 도메인 수동 등록 / 수정 / 삭제
- 도메인별 처리 상태 추적: 웹방화벽, 웹SSL, 취약점진단, DNS결재 관리 상태
- 도메인 구분 관리: 한화시스템 / ICT 운영 도메인 vs 외부 도메인
- 로그인 인증 (초기 계정: `admin` / `admin`)
- 요약 통계 대시보드, 검색 및 필터 기능

## 기술 스택

- Node.js
- Express
- 정적 프론트엔드 (vanilla JS)
- JSON 파일 기반 데이터 저장

## 로컬 실행

```bash
cd app
npm install
PORT=3000 npm start
```

실행 후 브라우저에서 http://localhost:3000 에 접속하고 `admin` / `admin` 으로 로그인합니다.

## Docker 빌드 / 실행

```bash
docker build -t <image> app/
docker run -p 80:80 <image>
```

컨테이너는 80번 포트에서 동작합니다.

## 데이터 저장 위치

도메인 데이터는 환경변수 `DATA_FILE` 로 지정한 경로의 JSON 파일에 저장됩니다. (기본값: `/data/domains.json`)

## Kubernetes 배포

개발 환경과 운영 환경 매니페스트가 각각 `develop-deploy/`, `operate-deploy/` 디렉터리에 있습니다.

```bash
# 개발 환경
kubectl apply -f develop-deploy/deployment.yaml
kubectl apply -f develop-deploy/service.yaml

# 운영 환경
kubectl apply -f operate-deploy/deployment.yaml
kubectl apply -f operate-deploy/service.yaml
```

각 Deployment 는 컨테이너 80번 포트에 대해 `/login.html` 경로로 readiness/liveness probe 를 수행합니다. Service 는 LoadBalancer 타입으로 80번 포트를 노출합니다.

## 보안 주의

초기 관리자 계정의 비밀번호(`admin` / `admin`)는 **최초 로그인 후 반드시 변경**해야 합니다.
