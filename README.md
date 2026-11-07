# Backman

An original maze-chase arcade game in a single HTML file. No build step and no dependencies.

Guide **Backman**, a little backpacker, through a hedge maze at night. Collect every glowing seed while four beetles hunt you down.

## Play

Open `index.html` in any modern browser.

| Control | Action |
| --- | --- |
| Arrow keys / WASD | Move (turns are buffered, so press them early) |
| P / Esc | Pause |
| M | Mute |
| Enter / Space | Start |
| Swipe or on-screen pad | Move on touch screens |

## Rules

- **Seed**: 10 points. Clear them all to finish the level.
- **Lantern**: 50 points. For a few seconds the beetles turn blue and flee. Catch them for 200, 400, 800, then 1600 points.
- **Mushroom**: a bonus snack that appears twice per level.
- You get an extra life at 10,000 points.
- Each level makes the beetles faster and shortens the lantern time.

## The beetles

| Beetle | Behaviour |
| --- | --- |
| Bramble (red) | Heads straight for you and speeds up when few seeds are left |
| Moth (pink) | Aims a few tiles ahead of you to cut you off |
| Drift (teal) | Hunts you from far away but wanders off when close |
| Hush (purple) | Follows your footsteps |

Every so often the beetles switch between chasing you and retreating to their corners. Use the side tunnel to escape, because beetles slow down inside it.
