#!/usr/bin/env bash
set -euo pipefail

# Example deploy helper.
# Customize to your environment and keep your real script local (untracked).

REMOTE_HOST="your-host"
REMOTE_DIR="~/projects/interactive_brokers"
BRANCH="${BRANCH:-main}"

echo "→ Commit & push"
if [[ -n "$(git status -s)" ]]; then
  git add -A
  git commit -m "Deploy: $(date +'%Y-%m-%d %H:%M:%S')"
fi
git push origin "$BRANCH"

TARGET_HASH="$(git rev-parse HEAD)"
echo "→ Remote update ($REMOTE_HOST:$REMOTE_DIR @ $BRANCH)"
ssh "$REMOTE_HOST" "cd $REMOTE_DIR && git fetch origin $BRANCH && git reset --hard origin/$BRANCH"

REMOTE_HASH="$(ssh "$REMOTE_HOST" "cd $REMOTE_DIR && git rev-parse HEAD" | tr -d '\r' | xargs)"
if [[ "$TARGET_HASH" != "$REMOTE_HASH" ]]; then
  echo "✕ Mismatch: local=$TARGET_HASH remote=$REMOTE_HASH" >&2
  exit 1
fi

echo "✓ Deployed: ${TARGET_HASH:0:7}"

