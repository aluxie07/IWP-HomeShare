#!/usr/bin/env bash
set -e

echo ""
echo "  HomeShare Local Network Mode"
echo "  ============================"
echo ""

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js is required. Install from https://nodejs.org"
  exit 1
fi

INSTALL_DIR="${HOME}/HomeShare-Local"
REPO_URL="https://github.com/YOUR_USERNAME/IWP-HomeShare.git"

if [ ! -f "${INSTALL_DIR}/server/index.js" ]; then
  echo "  First-time setup: downloading HomeShare server..."
  mkdir -p "${INSTALL_DIR}"
  if ! command -v git >/dev/null 2>&1; then
    echo ""
    echo "  Git is not installed. Download the repo ZIP from GitHub"
    echo "  and extract to: ${INSTALL_DIR}"
    exit 1
  fi
  git clone "${REPO_URL}" "${INSTALL_DIR}" || true
  if [ ! -f "${INSTALL_DIR}/server/index.js" ]; then
    echo ""
    echo "  Clone failed. Edit REPO_URL in this script to your GitHub repo."
    exit 1
  fi
fi

cd "${INSTALL_DIR}/server"

if [ ! -f ".env" ]; then
  cat > .env << 'EOF'
FILE_STORAGE=disk
PORT=8080
JWT_SECRET=local-dev-change-this-secret
MONGO_URI=mongodb://127.0.0.1:27017/homeshare
CLIENT_URL=https://YOUR_USERNAME.github.io/IWP-HomeShare
ALLOWED_ORIGINS=https://YOUR_USERNAME.github.io,http://localhost:3000,http://127.0.0.1:3000
EOF
  echo ""
  echo "  Created server/.env — edit MONGO_URI and your GitHub Pages URL."
  echo ""
fi

if [ ! -d "node_modules" ]; then
  echo "  Installing dependencies..."
  npm install
fi

echo ""
echo "  Starting local server on http://127.0.0.1:8080"
echo "  Keep this terminal open."
echo "  Then open your HomeShare website and click Detect local server."
echo ""
export FILE_STORAGE=disk
node index.js
