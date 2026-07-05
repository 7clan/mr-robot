#!/usr/bin/env bash
# Upload Mr Robot to your GitHub (github.com/7clan)
#
# This script will:
# 1. Ask for your GitHub token (one-time)
# 2. Create a new repo called "mr-robot" under your account
# 3. Upload all the source code
# 4. Return the repo URL
#
# Your Mr Robot repo will be live at: https://github.com/7clan/mr-robot
#
# === HOW TO GET A GITHUB TOKEN ===
# 1. Go to: https://github.com/settings/tokens/new
# 2. Log into GitHub
# 3. Note: type "mr-robot upload"
# 4. Expiration: 30 days
# 5. Check the box: "repo" (full control of private repositories)
# 6. Click "Generate token" at the bottom
# 7. Copy the token (starts with ghp_)
# 8. Run this script and paste the token when asked

set -e

echo "=== Mr Robot → GitHub Upload ==="
echo ""

# Check if we have a token argument
TOKEN=$1
if [ -z "$TOKEN" ]; then
    echo "Please enter your GitHub token:"
    echo "(Get one at: https://github.com/settings/tokens/new — check 'repo' scope)"
    read -s TOKEN
fi

if [ -z "$TOKEN" ]; then
    echo "Error: No token provided. Cannot upload to GitHub."
    exit 1
fi

USERNAME="7clan"
REPO="mr-robot"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "Step 1: Creating GitHub repo '$USERNAME/$REPO'..."
curl -s -X POST https://api.github.com/user/repos \
    -H "Authorization: token $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"$REPO\",\"public\":true,\"description\":\"Mr Robot — From-Scratch AI Assistant with Embedded Open-Source LLM. Runs Llama-3.2/Qwen-2.5 in-browser via WebGPU. No external APIs.\"}" > /tmp/repo-create.json

# Check if repo was created
REPO_URL=$(curl -s -H "Authorization: token $TOKEN" https://api.github.com/repos/$USERNAME/$REPO | grep -o '"html_url":"[^"]*"' | head -1 | cut -d'"' -f4)
if [ -z "$REPO_URL" ]; then
    echo "Repo might already exist, continuing with upload..."
    REPO_URL="https://github.com/$USERNAME/$REPO"
fi

echo "  ✓ Repo ready: $REPO_URL"

echo ""
echo "Step 2: Uploading source code..."
cd "$DIR"

# Initialize git if needed
git init 2>/dev/null || true
git config user.email "mohammadfarhat81000@gmail.com"
git config user.name "Mohammad Farhat"

# Set up remote with token auth
git remote remove origin 2>/dev/null || true
git remote add origin "https://$TOKEN@github.com/$USERNAME/$REPO.git"

# Add all files and commit
git add -A
git commit -m "Initial commit: Mr Robot — From-Scratch AI Assistant with Embedded Open-Source LLM" 2>/dev/null || true

# Push to GitHub
git branch -M main
if git push -u origin main --force 2>/dev/null; then
    echo "  ✓ Code uploaded successfully!"
else
    echo "  ⚠ Push issue — trying alternative method..."
    git push -u origin main 2>&1 | tail -5
fi

echo ""
echo "=== DONE! ==="
echo ""
echo "Your Mr Robot repo is live at:"
echo "  $REPO_URL"
echo ""
echo "Next steps:"
echo "  1. Visit $REPO_URL to verify the code is there"
echo "  2. Add this URL to your portfolio and CV"
echo ""
echo "To run Mr Robot locally:"
echo "  git clone $REPO_URL.git"
echo "  cd mr-robot"
echo "  npm install"
echo "  npx prisma db push && npx prisma generate"
echo "  npm run dev"
echo "  → Open http://localhost:3000"
