#!/usr/bin/env bash
# =============================================================================
# git_manager.sh — Git workflow manager for Universal RAG Enterprise
#
# Options:
#   1) Create new GitHub repo + initialize + first push
#   2) Push changes (add → commit → push)
#   3) Show status (what changed, staged, unstaged)
#   4) Show commit history
#   5) Add remote to existing local repo
#   6) Rollback last commit (keep changes)
#   7) Exit
#
# Usage:
#   bash scripts/git_manager.sh
# =============================================================================
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
info()    { echo -e "${CYAN}  →  $1${NC}"; }
success() { echo -e "${GREEN}  ✓  $1${NC}"; }
error()   { echo -e "${RED}  ✗  $1${NC}"; }
warn()    { echo -e "${YELLOW}  !  $1${NC}"; }
header()  { echo -e "\n${BOLD}${CYAN}$1${NC}"; echo "$(printf '─%.0s' {1..55})"; }

# ── Read config if saved from previous run ────────────────────────────────────
CONFIG_FILE=".git_manager_config"

load_config() {
  if [ -f "$CONFIG_FILE" ]; then
    source "$CONFIG_FILE"
  fi
}

save_config() {
  cat > "$CONFIG_FILE" <<EOF
GITHUB_TOKEN="${GITHUB_TOKEN:-}"
GITHUB_USERNAME="${GITHUB_USERNAME:-}"
REMOTE_NAME="${REMOTE_NAME:-enterprise}"
REPO_NAME="${REPO_NAME:-}"
EOF
}

# ── Banner ────────────────────────────────────────────────────────────────────
print_banner() {
  echo ""
  echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║        Universal RAG Enterprise — Git Manager            ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# ── Prompt for GitHub credentials (reuse if already saved) ───────────────────
prompt_credentials() {
  if [ -z "${GITHUB_TOKEN:-}" ]; then
    echo -e "${YELLOW}  GitHub Personal Access Token:${NC} "
    read -r -s GITHUB_TOKEN
    echo ""
  else
    info "Using saved GitHub token."
  fi

  if [ -z "${GITHUB_USERNAME:-}" ]; then
    echo -e "${YELLOW}  GitHub Username:${NC} "
    read -r GITHUB_USERNAME
  else
    info "Using saved username: $GITHUB_USERNAME"
  fi

  if [ -z "${REMOTE_NAME:-}" ]; then
    REMOTE_NAME="enterprise"
  fi
}

# ── Option 1: Create new GitHub repo + init + first push ─────────────────────
create_repo() {
  header "Create New GitHub Repo + Initialize + First Push"

  prompt_credentials

  echo -e "${YELLOW}  Repository name (e.g. universal-rag-agent-enterprise):${NC} "
  read -r REPO_NAME

  echo -e "${YELLOW}  Description (press Enter to skip):${NC} "
  read -r REPO_DESC

  echo -e "${YELLOW}  Private repo? (y/n):${NC} "
  read -r IS_PRIVATE
  PRIVATE_FLAG="false"
  [[ "$IS_PRIVATE" == "y" || "$IS_PRIVATE" == "Y" ]] && PRIVATE_FLAG="true"

  info "Creating GitHub repo: $REPO_NAME ..."

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST https://api.github.com/user/repos \
    -H "Authorization: token $GITHUB_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"name\": \"$REPO_NAME\",
      \"description\": \"$REPO_DESC\",
      \"private\": $PRIVATE_FLAG
    }")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -n -1)

  if [ "$HTTP_CODE" == "201" ]; then
    success "Repo created: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
  else
    error "Failed to create repo (HTTP $HTTP_CODE)"
    echo "$BODY" | grep -o '"message":"[^"]*"' || true
    exit 1
  fi

  # Initialize git if not already done
  if [ ! -d ".git" ]; then
    info "Initializing git..."
    git init
    git branch -M main
    success "Git initialized."
  else
    warn "Git already initialized — skipping git init."
  fi

  # Check if remote already exists
  REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"
  if git remote get-url "$REMOTE_NAME" &>/dev/null; then
    warn "Remote '$REMOTE_NAME' already exists — updating URL."
    git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
  else
    git remote add "$REMOTE_NAME" "$REMOTE_URL"
    success "Remote '$REMOTE_NAME' added."
  fi

  # Stage and push everything
  info "Staging all files..."
  git add .

  echo -e "${YELLOW}  Initial commit message (press Enter for default):${NC} "
  read -r COMMIT_MSG
  COMMIT_MSG="${COMMIT_MSG:-Initial commit — Universal RAG Enterprise}"

  git commit -m "$COMMIT_MSG" 2>/dev/null || warn "Nothing to commit or commit already exists."

  info "Pushing to GitHub..."
  git push -u "$REMOTE_NAME" main
  success "All code pushed to: https://github.com/$GITHUB_USERNAME/$REPO_NAME"

  save_config
}

# ── Option 2: Push changes ────────────────────────────────────────────────────
push_changes() {
  header "Push Changes to GitHub"

  load_config
  prompt_credentials

  # Show current status first
  echo ""
  info "Current git status:"
  git status --short
  echo ""

  echo -e "${YELLOW}  Stage which files?${NC}"
  echo "    1) All changed files (git add .)"
  echo "    2) Specific files (you type them)"
  echo "    3) Only already-staged files (skip staging)"
  echo ""
  read -r -p "  Choice [1/2/3]: " STAGE_CHOICE

  case "$STAGE_CHOICE" in
    1)
      git add .
      success "All files staged."
      ;;
    2)
      echo -e "${YELLOW}  Enter file paths separated by spaces:${NC} "
      read -r FILES
      # shellcheck disable=SC2086
      git add $FILES
      success "Files staged: $FILES"
      ;;
    3)
      info "Skipping staging — using already staged files."
      ;;
    *)
      warn "Invalid choice — staging all files."
      git add .
      ;;
  esac

  # Show what is staged
  echo ""
  info "Files to be committed:"
  git diff --cached --name-only | sed 's/^/    /'
  echo ""

  # Commit message
  echo -e "${YELLOW}  Commit message:${NC} "
  read -r COMMIT_MSG

  if [ -z "$COMMIT_MSG" ]; then
    error "Commit message cannot be empty."
    exit 1
  fi

  git commit -m "$COMMIT_MSG"
  success "Committed: $COMMIT_MSG"

  # Push
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  info "Pushing to '$REMOTE_NAME' → branch '$CURRENT_BRANCH'..."
  git push "$REMOTE_NAME" "$CURRENT_BRANCH"
  success "Changes pushed to GitHub."

  # Print the GitHub URL
  REPO_URL=$(git remote get-url "$REMOTE_NAME" 2>/dev/null | sed "s|https://[^@]*@|https://|")
  info "View at: $REPO_URL"
}

# ── Option 3: Show status ─────────────────────────────────────────────────────
show_status() {
  header "Git Status"

  echo ""
  info "Branch: $(git rev-parse --abbrev-ref HEAD)"
  echo ""

  info "Changes (M=modified, A=added, D=deleted, ?=untracked):"
  git status --short
  echo ""

  info "Staged files (ready to commit):"
  git diff --cached --name-only | sed 's/^/    /' || echo "    (none)"
  echo ""

  info "Commits ahead of remote:"
  git log "@{u}.." --oneline 2>/dev/null | sed 's/^/    /' || echo "    (up to date or no upstream set)"
}

# ── Option 4: Show commit history ─────────────────────────────────────────────
show_history() {
  header "Commit History (last 20)"

  git log --oneline --graph --decorate -20
  echo ""
  info "To see full details of any commit: git show <commit-sha>"
}

# ── Option 5: Add remote to existing repo ─────────────────────────────────────
add_remote() {
  header "Add Remote to Existing Local Repo"

  prompt_credentials

  echo -e "${YELLOW}  Repository name on GitHub:${NC} "
  read -r REPO_NAME

  REMOTE_URL="https://${GITHUB_TOKEN}@github.com/${GITHUB_USERNAME}/${REPO_NAME}.git"

  if git remote get-url "$REMOTE_NAME" &>/dev/null; then
    warn "Remote '$REMOTE_NAME' already exists — updating URL."
    git remote set-url "$REMOTE_NAME" "$REMOTE_URL"
  else
    git remote add "$REMOTE_NAME" "$REMOTE_URL"
  fi

  success "Remote '$REMOTE_NAME' → https://github.com/$GITHUB_USERNAME/$REPO_NAME"
  save_config
}

# ── Option 6: Rollback last commit (keep changes) ─────────────────────────────
rollback_last() {
  header "Rollback Last Commit (keeps your file changes)"

  LAST_COMMIT=$(git log --oneline -1)
  warn "Last commit: $LAST_COMMIT"
  echo ""
  echo -e "${YELLOW}  This will undo the commit but KEEP your file changes (git reset --soft HEAD~1).${NC}"
  echo -e "${YELLOW}  Your files will go back to 'staged' state. Continue? (y/n):${NC} "
  read -r CONFIRM

  if [[ "$CONFIRM" == "y" || "$CONFIRM" == "Y" ]]; then
    git reset --soft HEAD~1
    success "Last commit rolled back. Your changes are still staged."
    info "Run option 2 to commit again with a different message."
  else
    info "Rollback cancelled."
  fi
}

# ── Main menu ─────────────────────────────────────────────────────────────────
main() {
  print_banner
  load_config

  while true; do
    echo -e "${BOLD}  What do you want to do?${NC}"
    echo ""
    echo "    1)  Create new GitHub repo + initialize + first push"
    echo "    2)  Push changes  (add → commit → push)"
    echo "    3)  Show status   (what changed, staged, unstaged)"
    echo "    4)  Show commit history"
    echo "    5)  Add remote to existing local repo"
    echo "    6)  Rollback last commit (keeps file changes)"
    echo "    7)  Exit"
    echo ""
    read -r -p "  Choice [1-7]: " CHOICE
    echo ""

    case "$CHOICE" in
      1) create_repo ;;
      2) push_changes ;;
      3) show_status ;;
      4) show_history ;;
      5) add_remote ;;
      6) rollback_last ;;
      7) echo -e "${GREEN}  Bye.${NC}"; exit 0 ;;
      *) error "Invalid choice — enter 1 to 7." ;;
    esac

    echo ""
    echo "$(printf '─%.0s' {1..55})"
    echo ""
  done
}

main
