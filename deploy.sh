#!/bin/bash
set -e

# Visual style: Pragmatic & Minimalist
RESET='\033[0m'
BOLD='\033[1m'
GREEN='\033[32m'
BLUE='\033[34m'
RED='\033[31m'
GRAY='\033[90m'

log() {
  echo -e "${BLUE}${BOLD}→ ${1}${RESET}"
}

success() {
  echo -e "${GREEN}${BOLD}✓ ${1}${RESET}"
}

error() {
  echo -e "${RED}${BOLD}✕ ${1}${RESET}"
  exit 1
}

# 1. Local Commit & Push
log "Syncing local state..."

# Add all changes and commit if necessary
if [[ -n $(git status -s) ]]; then
  git add .
  git commit -m "Deploy: $(date +'%Y-%m-%d %H:%M:%S')" > /dev/null
  success "Committed local changes."
else
  echo -e "${GRAY}  No changes to commit.${RESET}"
fi

# Push to origin
git push origin master --quiet || error "Failed to push to origin."
success "Pushed to origin/master."

# Get the target commit hash
TARGET_HASH=$(git rev-parse HEAD)
echo -e "${GRAY}  Target: ${TARGET_HASH:0:7}${RESET}"

# 2. Remote Deployment
log "Deploying to remote..."

# Use git fetch + reset --hard to guarantee identical state (resolving any conflicts by force)
REMOTE_CMD="cd ~/projects/interactive_brokers && \
git fetch origin master --quiet && \
git reset --hard origin/master --quiet"

if puky bash -c "$REMOTE_CMD"; then
  success "Remote repository updated."
else
  error "Remote update failed."
fi

# 3. Integrity Verification
log "Verifying integrity..."

REMOTE_HASH_FULL=$(puky bash -c "cd ~/projects/interactive_brokers && git rev-parse HEAD")
# Trim whitespace
REMOTE_HASH=$(echo "$REMOTE_HASH_FULL" | xargs)

if [ "$TARGET_HASH" == "$REMOTE_HASH" ]; then
  echo ""
  success "Deployed successfully."
  echo -e "${BOLD}  Status : ${GREEN}Synced${RESET}"
  echo -e "${BOLD}  Commit : ${TARGET_HASH:0:7}${RESET}"
else
  echo ""
  error "Mismatch detected."
  echo -e "  Local  : ${TARGET_HASH:0:7}"
  echo -e "  Remote : ${REMOTE_HASH:0:7}"
  exit 1
fi
