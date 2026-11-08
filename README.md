# Backman

An original maze-chase arcade game in a single HTML file. No build step and no dependencies.

Guide **Backman**, a little backpacker, through a series of garden mazes. Collect every glowing seed while four beetles hunt you down.

Level 1 is the hand-made Night Garden. Every level after that is a new maze, generated from the level number. Each one has a theme (Autumn Grove, Frost Hollow, Rose Labyrinth, Mossy Ruins and Golden Meadow) and is checked to have no dead ends and every seed reachable.

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
- Level 1 is gentle. Each level makes the beetles a little faster, lets them out of the den sooner and shortens the lantern time, but they never outrun Backman.

## The beetles

| Beetle | Behaviour |
| --- | --- |
| Bramble (red) | Heads straight for you and speeds up when few seeds are left |
| Moth (pink) | Aims a few tiles ahead of you to cut you off |
| Drift (teal) | Hunts you from far away but wanders off when close |
| Hush (purple) | Follows your footsteps |

Every so often the beetles switch between chasing you and retreating to their corners. Use the side tunnel to escape, because beetles slow down inside it.
