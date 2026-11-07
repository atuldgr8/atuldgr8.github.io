#!/bin/bash
# Double-click me (Mac). Starts the site on your laptop and opens the editor.
# Keep this window open while you work; close it when you're done.
cd "$(dirname "$0")" || exit 1
URL="http://localhost:8000/work.html?edit"
openit() { open -a "Google Chrome" "$URL" 2>/dev/null || open -a "Arc" "$URL" 2>/dev/null || open "$URL"; }
if curl -s -o /dev/null "http://localhost:8000/assets/editor.js"; then
  echo "Already running. Opening the editor..."; openit; exit 0
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "Python isn't installed. A box may pop up offering to install developer tools: say yes, then double-click me again."
  read -r -p "Press Enter to close."; exit 1
fi
(sleep 1; openit) &
python3 serve.py 8000
