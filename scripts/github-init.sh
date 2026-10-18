#!/usr/bin/env bash
# Helper script: initialize the REA Studio project as a fresh git repo and
# prepare it for the first push to GitHub.
#
# Usage:
#   cd /path/to/your-clone
#   ./scripts/github-init.sh
#
# After this script runs:
#   1. Create an empty repo on GitHub: https://github.com/new
#      - Name: rea-studio (or whatever you prefer)
#      - Visibility: Private or Public
#      - DO NOT initialize with README/.gitignore/LICENSE (we already have them)
#   2. Copy the `git remote add` + `git push` commands this script prints.

set -euo pipefail

cd "$(dirname "$0")/.."

if [ -d .git ]; then
  echo "✓ .git directory already exists — skipping init"
else
  echo "→ Initializing git repo…"
  git init -b main
fi

echo "→ Staging files (respecting .gitignore)…"
git add -A

echo "→ Showing staged file count:"
STAGED=$(git diff --cached --name-only | wc -l)
echo "  $STAGED files ready to commit"

if [ "$STAGED" -eq 0 ]; then
  echo ""
  echo "⚠ No files staged. Check your .gitignore."
  exit 1
fi

echo ""
echo "→ First few staged files:"
git diff --cached --name-only | head -10
echo "  …"

echo ""
read -p "Create initial commit? [y/N] " CONFIRM
if [ "$CONFIRM" = "y" ] || [ "$CONFIRM" = "Y" ]; then
  git commit -m "Initial commit: REA Studio — web UI for the REA CLI

- Next.js 16 + Tailwind 4 + shadcn/ui
- In-process runner wraps the rea-agents CLI with demo/live modes
- Submit / Jobs / Findings / Reports / Settings tabs
- Retailored reports (developer / executive / QA / auditor) via z-ai-web-dev-sdk
- SQLite via Prisma (Job, Finding, Report, Setting, AuditLog)
- fly.io deployment config + Dockerfile + GitHub Actions CI"

  echo ""
  echo "✓ Commit created."
  echo ""
  echo "Next steps:"
  echo "  1. Go to https://github.com/new"
  echo "     - Name: rea-studio"
  echo "     - DO NOT initialize with README/.gitignore/LICENSE"
  echo "  2. Run these commands (replace YOUR_USERNAME):"
  echo ""
  echo "     git remote add origin git@github.com:YOUR_USERNAME/rea-studio.git"
  echo "     git branch -M main"
  echo "     git push -u origin main"
  echo ""
  echo "  3. Set up secrets for CI (optional, only if you want smoke tests in CI):"
  echo "     - No secrets needed — the smoke test uses the demo runner"
  echo ""
  echo "  4. Deploy (pick one):"
  echo "     - fly.io: see DEPLOYMENT.md → 'fly.io' section"
  echo "     - Oracle Cloud: see DEPLOYMENT.md → 'Oracle Cloud Always-Free' section"
  echo "     - Railway: see DEPLOYMENT.md → 'Railway' section"
else
  echo "Aborted. Staged files are still staged — review with 'git status'."
fi
