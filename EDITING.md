# Editing the site

1. In the site folder, run `python3 -m http.server` and open http://localhost:8000/work.html?edit in Chrome, Edge or Arc.
2. Press **connect folder** once and pick this folder (the one with index.html). Saving now writes straight into it.
3. **+ new project** makes a page from the template. **edit page** opens the editor.
4. In the editor: drop pictures onto the grey placeholders, double-click text to type, drag things around (they snap to the 12 columns; hold Alt to break the grid). Press `?` for every shortcut.
5. **save** (⌘S), then commit and push. That's publishing.

Files: `projects/index.json` is the work list, `projects/<slug>.json` is each page, pictures go in `projects/media/<slug>/`.
Nothing is lost if you close the tab: unsaved changes come back as a draft.
