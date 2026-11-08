# Backman

An original maze-chase arcade game in a single HTML file. No build step and no dependencies.

Guide **Backman**, a little backpacker, through a series of garden mazes. Collect every glowing seed while four beetles hunt you down.

Every level is a new garden generated from the level number, and the game ramps up gently. Level 1 is a small, simple maze with one beetle. Each level after that is bigger and twistier and has one more beetle, up to eight. If you lose all your lives you replay the level you were on, never back to level 1. Your progress is saved.

## Play

Open `index.html` in any modern browser, or play the live version at https://backman-nu.vercel.app.

### Install it as an app

Backman is a Progressive Web App. Once installed it opens full screen with its own icon, and it works offline.

- **iPhone / iPad (Safari):** tap Share, then **Add to Home Screen**.
- **Android (Chrome):** tap **Install app** on the start screen, or use the browser menu and choose **Install app**.
- **Desktop (Chrome / Edge):** click the install icon in the address bar.

The service worker (`sw.js`) only runs when the game is served over http(s), not from a `file://` URL.

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Move (turns are buffered, so press them early) |
| P / Esc | Pause |
| M | Mute |
| Enter / Space | Start |
| Swipe anywhere | Move on touch screens |

## Rules

- **Seed**: 10 points. Clear them all to finish the level.
- **Lantern**: 50 points. For a few seconds the beetles turn blue and flee. Catch them for 200, 400, 800, then 1600 points.
- **Mushroom**: a bonus snack that appears twice per level.
- You get an extra life at 5,000 points.
- Level 1 has one beetle in a small maze. Each level adds a beetle (up to 8), grows the maze, makes the beetles a little faster, lets them out of the den sooner and shortens the lantern time, but they never outrun Backman.
- Losing all your lives restarts the current level, not the whole game.

## Looks and credits

- **Looks:** every level you clear unlocks a new look for Backman: Berry, Frosty, Sprout, Ember, Minty, Midnight and King. Some come with glasses, a bow tie, a moustache or a crown. Pick one on the start screen or the pause screen.
- **Credits:** you earn them while you play:
  - **Gold coins:** pop up in the maze every 12–20 seconds and vanish after 9. Each is worth +1.
  - **Beetles:** +1 for each one you catch after eating a lantern.
  - **Mushrooms:** +1 each.
  - **Clearing a level:** +2, or +4 if you didn't lose a life.
- **Shop:** tap a locked look to buy it with credits. Berry costs 2, and each look after it costs 1 more, up to 8 for King. Clearing the look's level still unlocks it for free.
- **Continue:** when your lives run out, spend 1 credit to keep playing from the same spot with 1 extra life. Or retry the level from the start for free.
- **Saved:** credits, looks and your level are all kept between visits.

## The beetles

| Beetle | Behaviour |
| --- | --- |
| Bramble (red) | Heads straight for you and speeds up when few seeds are left |
| Moth (pink) | Aims a few tiles ahead of you to cut you off |
| Drift (teal) | Hunts you from far away but wanders off when close |
| Hush (purple) | Follows your footsteps |

Ember, Glint, Shade and Thistle join from level 5 onwards and reuse these four chase styles.

Every so often the beetles switch between chasing you and retreating to their corners. Use the side tunnel to escape, because beetles slow down inside it.
