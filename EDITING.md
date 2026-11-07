# Editing the site

1. Double-click **start-editor.command** (Mac) or **start-editor.bat** (Windows) in this folder. It starts the site and opens the editor in Chrome. Keep its window open while you work. (By hand: `python3 -m http.server 8000` here, then open http://localhost:8000/work.html?edit.) On your laptop every page also shows a small blue **edit** link in the corner.
2. Press **connect folder** once and pick this folder (the one with index.html). Saving now writes straight into it.
3. **+ new project** makes a page from the template. **edit page** opens the editor.
4. In the editor: drop pictures onto the grey placeholders, double-click text to type, drag things around (they snap to the 12 columns; hold Alt to break the grid). Press `?` for every shortcut.
5. **save** (⌘S), then commit and push. That's publishing.

More in the editor:
- **+ blocks** (B): ready-made layouts, buttons, slideshows, and your own components.
- Select things and **make component** (⌥⌘K): copies stay linked. Double-click one to edit them all; **detach** to change one alone.
- **Grid** (page panel, nothing selected): columns, gutter, margins, row height, per page. Snapping to columns, rows, other things and your guides can each be turned on or off. Drag from the top or left edge to make a guide.

Files: `projects/components.json` holds your components, `projects/index.json` is the work list, `projects/<slug>.json` is each page, pictures go in `projects/media/<slug>/`.
Nothing is lost if you close the tab: unsaved changes come back as a draft.
