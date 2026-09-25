#!/usr/bin/env bash
# 로컬 작업 트리를 Lightsail 서버로 보내고, 서버에서 설치 → 빌드 → 마이그레이션 → 재시작한다.
# 사용법: npm run deploy
# 설정: DEPLOY_HOST(필수), DEPLOY_USER, DEPLOY_KEY — 환경변수 또는 커밋되지 않는 .deploy.env 파일
# (공개 저장소이므로 서버 주소는 코드에 두지 않는다. CI에서는 GitHub Secrets로 넘긴다.)
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -z "${DEPLOY_HOST:-}" ] && [ -f .deploy.env ]; then
  # shellcheck disable=SC1091
  source .deploy.env
fi
: "${DEPLOY_HOST:?DEPLOY_HOST가 없습니다. .deploy.env에 DEPLOY_HOST=서버주소 를 적어주세요.}"

HOST="$DEPLOY_HOST"
USER_NAME="${DEPLOY_USER:-ubuntu}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/leak-care.pem}"
APP_DIR=/srv/leak-care
SSH=(ssh -i "$KEY" -o ConnectTimeout=10 "$USER_NAME@$HOST")

echo "▶ 파일 전송 ($HOST)"
rsync -az --delete \
  -e "ssh -i $KEY" \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'coverage/' \
  --exclude '.env' \
  --exclude '.deploy.env' \
  --exclude '*.db' \
  --exclude '*.db-journal' \
  --exclude 'design/' \
  --exclude '.idea/' \
  --exclude '.superpowers/' \
  ./ "$USER_NAME@$HOST:$APP_DIR/"

echo "▶ 설치 · 빌드 · 마이그레이션 · 재시작"
"${SSH[@]}" "bash -s" <<EOF
set -euo pipefail
cd $APP_DIR
npm ci --no-audit --no-fund
npm run build
npx prisma migrate deploy
pm2 startOrReload ecosystem.config.js --update-env
pm2 save >/dev/null
EOF

echo "▶ 상태 확인"
for _ in $(seq 1 20); do
  if curl -fs -o /dev/null "http://$HOST/health"; then
    echo "✅ 배포 완료: http://$HOST/"
    exit 0
  fi
  sleep 1
done
echo "❌ /health 응답 없음 — 서버 로그 확인: ssh -i $KEY $USER_NAME@$HOST 'pm2 logs leak-care --lines 50'"
exit 1
