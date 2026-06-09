# 운영 서버 배포 가이드

dev 환경(`dev-api.puzmu.com`)이 이미 떠있는 상태에서, **같은 Oracle VM에 운영 환경 추가** 배포하는 절차.

## 최종 구조

```
같은 Oracle VM (도쿄, ARM 4/24GB)
│
├── ~/game-project-be/           ← dev (develop 브랜치)
│   ├── .env (APP_PORT=3001, MYSQL_DATABASE=game_project_dev)
│   └── 컨테이너: dev-app, dev-db
│
└── ~/game-project-prod/         ← prod (main 브랜치) ✨ 신규
    ├── .env (APP_PORT=3000, MYSQL_DATABASE=game_project)
    └── 컨테이너: prod-app, prod-db

Nginx
├── dev-api.puzmu.com  → 127.0.0.1:3001 (이미 있음)
└── api.puzmu.com      → 127.0.0.1:3000 ✨ 신규

GitHub Actions
├── develop push → dev 배포 (이미 있음: .github/workflows/deploy.yml)
└── main push    → prod 배포 ✨ 신규: .github/workflows/deploy-prod.yml
```

---

## Phase 1: 운영용 GitHub Actions 워크플로우 추가

`.github/workflows/deploy-prod.yml` 생성:

```yaml
name: Deploy Prod to Oracle VM

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.ORACLE_HOST }}
          username: ${{ secrets.ORACLE_USER }}
          key: ${{ secrets.ORACLE_SSH_KEY }}
          script: |
            cd ~/game-project-prod
            git pull origin main
            docker compose -f docker-compose.prod.yml --env-file .env up -d --build
            docker image prune -f
```

---

## Phase 2: 서버에 운영용 폴더 생성

SSH 접속 후:

```bash
cd ~
git clone https://github.com/kcjfgnl9205/game-project-be.git game-project-prod
cd game-project-prod
git checkout main
```

> Private 레포면 deploy key 또는 PAT 필요

---

## Phase 3: 운영용 .env 작성

```bash
# 비밀번호 4개 새로 생성 (dev와 다르게!)
openssl rand -hex 32      # MYSQL_ROOT_PASSWORD
openssl rand -hex 32      # MYSQL_PASSWORD
openssl rand -base64 64   # JWT_ACCESS_SECRET
openssl rand -base64 64   # JWT_REFRESH_SECRET

# .env 작성
cp .env.example .env
nano .env
```

내용:

```env
COMPOSE_PROJECT_NAME=prod
APP_PORT=3000
MYSQL_PORT=3306

CORS_ORIGINS=https://puzmu.com,https://admin.puzmu.com

MYSQL_ROOT_PASSWORD=<생성한 값 1>
MYSQL_DATABASE=game_project
MYSQL_USER=nest
MYSQL_PASSWORD=<생성한 값 2>

JWT_ACCESS_SECRET=<생성한 값 3>
JWT_REFRESH_SECRET=<생성한 값 4>
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d
```

> ⚠️ **MYSQL_PORT 충돌 주의**
> dev는 `3307`, prod는 `3306` 사용. 같은 VM에 둘 다 띄우니 포트 분리 필수.

권한 제한:

```bash
chmod 600 .env
```

---

## Phase 4: 운영 컨테이너 실행

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
docker compose -f docker-compose.prod.yml logs -f app
```

확인:

- "Nest application successfully started" 로그
- `docker ps`로 `prod-app`, `prod-db` 컨테이너 Up 상태

---

## Phase 5: Nginx 운영용 설정

```bash
sudo nano /etc/nginx/sites-available/api.puzmu.com
```

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name api.puzmu.com;

    client_max_body_size 10M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

활성화:

```bash
sudo ln -s /etc/nginx/sites-available/api.puzmu.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

---

## Phase 6: Cloudflare DNS + HTTPS

### 6-1. DNS 추가

- Cloudflare → puzmu.com → DNS → Add record
- Type: `A`, Name: `api`, Content: `<공인 IP>`, Proxy: ⚪ **DNS only** (HTTPS 발급용 임시)

### 6-2. HTTPS 발급

```bash
sudo certbot --nginx -d api.puzmu.com
```

### 6-3. Cloudflare Proxy 다시 켜기

- DNS → `api` → ⚪ → 🟠 Proxied
- (SSL/TLS는 이미 Full strict라 자동 OK)

### 6-4. 접속 확인

```
https://api.puzmu.com/api/docs
```

---

## Phase 7: FE/Admin 환경변수 업데이트

Cloudflare Pages 운영용 환경변수:

| Project                         | Variable       | Value                       |
| ------------------------------- | -------------- | --------------------------- |
| game-project-fe (Production)    | `VITE_API_URL` | `https://api.puzmu.com/api` |
| game-project-admin (Production) | `VITE_API_URL` | `https://api.puzmu.com/api` |

> Cloudflare Pages → 프로젝트 → Settings → Environment variables
> "Production" 환경에 설정 (Preview는 그대로 dev-api 사용)

---

## Phase 8: 운영 FE/Admin 도메인 연결

### Cloudflare Pages Custom Domain

- `game-project-fe` → `puzmu.com` + `www.puzmu.com`
- `game-project-admin` → `admin.puzmu.com`

> Production branch는 `main`으로 변경하거나, 별도 main 배포 설정

---

## Phase 9: DBeaver로 운영 DB 접속 (SSH 터널)

운영 DB는 외부에 노출하지 않고 SSH 터널로만 접근.

### 9-1. 접속 흐름

```
DBeaver (로컬)
    ↓ SSH 터널 (Port 22)
Oracle VM (127.0.0.1:3306)
    ↓ Docker network
prod-db (MySQL 컨테이너)
```

### 9-2. DBeaver 새 연결 생성

- DBeaver → **Database** → **New Database Connection**
- **MySQL** 선택 → Next

### 9-3. Main 탭 설정

| 필드            | 값                                          |
| --------------- | ------------------------------------------- |
| **Server Host** | `localhost` ⭐ (오라클 IP 아님!)             |
| **Port**        | `3306`                                       |
| **Database**    | `game_project`                               |
| **Username**    | `nest`                                       |
| **Password**    | 운영 `.env`의 `MYSQL_PASSWORD` 값            |

> ⚠️ Server Host는 반드시 `localhost`! SSH 터널이 로컬 포트로 포워딩하니까.

### 9-4. SSH 탭 설정

| 필드                | 값                                          |
| ------------------- | ------------------------------------------- |
| **Use SSH Tunnel**  | ✅ 체크                                      |
| **Host**            | `<오라클 공인 IP>` (예: 132.226.6.102)       |
| **Port**            | `22`                                         |
| **User Name**       | `ubuntu`                                     |
| **Auth Method**     | Public Key                                   |
| **Private Key**     | `/Users/<본인>/.ssh/oracle-game.key`         |

### 9-5. 연결 테스트

1. **SSH 탭 → Test tunnel configuration** 클릭
   - "Connected" 나오면 SSH 정상 ✅
2. **Main 탭 → Test Connection** 클릭
   - 드라이버 다운로드 물어보면 OK
   - "Connected" 나오면 ✅

### 9-6. 연결 이름 정리 (권장)

DBeaver 연결 목록에서 헷갈리지 않게:

| 연결 이름     | 환경              |
| ------------- | ----------------- |
| `oracle-dev`  | dev (Port 3307)   |
| `oracle-prod` | prod (Port 3306)  |

> ⚠️ **운영 DB는 신중하게!** Read-only 모드 활용 권장:
> Connection settings → General → "Connection type"을 **Production**으로 설정
> → 위험 쿼리 시 경고

---

## 체크리스트

### 사전 준비

- [ ] main 브랜치가 안정적인지 확인 (테스트 완료)
- [ ] dev 환경에서 충분히 검증

### 배포

- [ ] Phase 1: deploy-prod.yml 워크플로우 추가 + 푸시
- [ ] Phase 2: 서버에 game-project-prod 폴더 clone
- [ ] Phase 3: 운영용 .env 작성 (비밀번호 dev와 다르게!, MYSQL_PORT=3306)
- [ ] Phase 4: docker compose up
- [ ] Phase 5: Nginx api.puzmu.com 설정
- [ ] Phase 6: Cloudflare DNS + Certbot HTTPS
- [ ] Phase 7: FE/Admin Production 환경변수 업데이트
- [ ] Phase 8: FE/Admin 운영 도메인 연결
- [ ] Phase 9: DBeaver 운영 DB 연결 설정

### 사후 확인

- [ ] `https://api.puzmu.com/api/docs` 접속 가능
- [ ] FE에서 운영 API 호출 성공
- [ ] dev 환경은 영향 없는지 (dev-api.puzmu.com 여전히 동작)
- [ ] `docker ps`로 4개 컨테이너 모두 Up (dev-app/db, prod-app/db)
- [ ] `docker ps`에서 포트 매핑 확인:
  - `dev-db`: `127.0.0.1:3307->3306/tcp`
  - `prod-db`: `127.0.0.1:3306->3306/tcp`
- [ ] DBeaver로 운영 DB 접속 성공

---

## 자원 확인

운영 추가 후 리소스 사용량:

```bash
# 메모리
free -h

# 디스크
df -h

# 컨테이너별 리소스
docker stats --no-stream
```

> ARM 24GB RAM, 200GB 스토리지 안에서 충분

---

## 롤백 (문제 발생 시)

### 운영만 중단 (dev는 유지)

```bash
cd ~/game-project-prod
docker compose -f docker-compose.prod.yml --env-file .env down
```

### 운영 완전 삭제 (데이터 포함)

```bash
cd ~/game-project-prod
docker compose -f docker-compose.prod.yml --env-file .env down -v
cd ~
rm -rf game-project-prod
sudo rm /etc/nginx/sites-enabled/api.puzmu.com
sudo systemctl reload nginx
```

> Cloudflare DNS의 `api` 레코드도 삭제

---

## 주의사항

- ⚠️ 운영용 .env의 비밀번호는 **반드시 dev와 다르게**
- ⚠️ `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`도 dev와 다르게 (운영 토큰 보안)
- ⚠️ 운영 DB 백업 정책 별도 수립 필요 (mysqldump 등)
- ⚠️ 운영 배포 전 main 브랜치 테스트 충분히
