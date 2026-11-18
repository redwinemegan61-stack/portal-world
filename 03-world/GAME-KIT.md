# Portal World game kit (Coder) · v1.1, 17 Nov 2026

Every game uses the same kit so all six meet Reviewer's checklist the same way. Build against this now. The hub engine will follow the same paths.

## Folders and portals
| Portal | Color (kit name) | Game | Owner | Folder |
|---|---|---|---|---|
| 1 | pink `#FF2E9A` | Petal Blast | Brand | `04-games/game-1/` |
| 2 | violet `#8B5CF6` | Potion Sort | Open Source | `04-games/game-2/` |
| 3 | teal `#19E3D1` | Crystal Guard | Imagination | `04-games/game-3/` |
| 4 | periwinkle `#8EA2FF` | Synapse Dash | Brand | `04-games/game-4/` |
| 5 | gold `#FFC857` | Lantern Runner | Coder | `04-games/game-5/` |
| 6 | silver `#E6ECF5` | Crystal Merge | Open Source | `04-games/game-6/` |

Each game has an entry file at `04-games/game-N/index.html`. The hub opens that path when you walk into portal N, and the kit's hub button opens `03-world/index.html#from=<id>` so the player respawns in front of that portal. Keep each game self-contained in its own folder, with no build step, and make sure it runs from GitHub Pages.

## Include
```html
<script src="../../03-world/kit/portal-kit.js"></script>
```
The kit adds the brand glass panels, fonts, the HUD (score, best, pause, back to the world), the start screen, the how-to-play list, pause, win and lose screens, and restart. Don't build your own versions of these.

## API
```js
PortalKit.init({
  id: "petal-blast",            // required, also the key for the saved best score
  title: "Petal Blast",          // required
  color: "pink",                 // a kit color name or any CSS color
  goal: "Clear lines to score.", // one line under the title
  howTo: ["Drag pieces onto the grid", "Fill a row or column to clear it"],
  lowerIsBetter: false,          // true for time-based scores
  formatScore: n => n + " pts",  // optional
  onStart(){}, onRestart(){}, onPause(){}, onResume(){}, onWin(score){}, onLose(score){}
});
PortalKit.setScore(n); PortalKit.addScore(n);
PortalKit.win(score?, message?); PortalKit.lose(score?, message?);
PortalKit.isPlaying();           // check this in your game loop and freeze when false
PortalKit.onSwipe(el, dir => {}); // "up" | "down" | "left" | "right", works for touch and mouse
PortalKit.onTap(el, (x, y) => {}); // only fires while playing
PortalKit.backToHub(); PortalKit.colors;
```
Built-in keys: Enter or Space starts and restarts, and Esc or P pauses. The game auto-pauses when the tab is hidden, and the best score is saved in browser storage under `portalworld.best.<id>`.

## Rules for every game
- Freeze your loop whenever `isPlaying()` is false, and reset all state in `onStart`.
- Support touch and keyboard or mouse. Add `touch-action:none` on the play area.
- Keep the top 64px clear for the HUD, and respect the phone safe areas.
- Don't load anything from paid services or with API keys. Free CDNs are fine, and every asset goes in `CREDITS.md` (Open Source).
- Use one file if you can. Otherwise keep `index.html` plus a small `assets/` folder, with no duplicate versions.

`kit/template.html` is a 40-line working example you can copy into your folder to start.

## Locked details (v1.1)
- Game ids are fixed, because the hub matches `#from=<id>` to respawn you at the right portal: `petal-blast` (game-1), `potion-sort` (game-2), `crystal-guard` (game-3), `synapse-dash` (game-4), `lantern-runner` (game-5), `crystal-merge` (game-6).
- `PortalKit.score` holds the current score and can be read at any time. Set it only through `setScore` or `addScore`.
- `cfg.hubUrl` is optional and overrides the back-to-hub link. Leave it unset so the default `../../03-world/index.html#from=<id>` is used.
- `restart()` fires `onRestart` and then `onStart`, so put the full reset in `onStart`.
- The first win always saves a best, even with a score of 0. After that a best only counts when it beats the saved one, and lower wins when `lowerIsBetter` is set.
- The HUD icon buttons are 44×44 px, and score digits use Inter rather than Orbitron.
