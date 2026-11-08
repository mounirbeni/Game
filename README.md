# Bug Maze Adventure

An original maze-chase arcade game. It's a single HTML file plus its icons and home-screen art, with no build step and no dependencies.

The home screen has a Play button, a daily reward, daily missions, a shop for Backman's looks, a leaderboard of your best runs, level select, stats and settings.

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

- **Looks:** every level you clear unlocks a new look for Backman: ZOGHA, ES, Sprout, FOX, Minty, Midnight, MBN, Shadow and Ranger, each with its own outfit. Pick one on the start screen or the pause screen.
- **Credits:** you earn them while you play:
  - **Gold coins:** pop up in the maze every 12–20 seconds and vanish after 9. Each is worth +1.
  - **Beetles:** +1 for each one you catch after eating a lantern.
  - **Mushrooms:** +1 each, and they freeze every beetle for 3 seconds.
  - **Clearing a level:** +2, or +4 if you didn't lose a life.
- **Shop:** tap a locked look to buy it with credits. Berry costs 2, and each look after it costs 1 more, up to 8 for King. Clearing the look's level still unlocks it for free.
- **Continue:** when your lives run out, spend 1 credit to keep playing from the same spot with 1 extra life. Or retry the level from the start for free.
- **Saved:** credits, looks and your level are all kept between visits.

## Character powers

| Look | Power |
| --- | --- |
| Backman | All-rounder: no special power |
| ZOGHA | Sweet tooth: one extra mushroom per level; mushrooms give +2 credits |
| ES | Deep freeze: lanterns last 50% longer |
| Sprout | Harvest: seeds are worth 15 points |
| FOX | Quick feet: runs 10% faster |
| Minty | Lucky leaf: gold coins appear twice as often |
| Midnight | Magic shield: survives the first beetle hit each level |
| MBN | Royal treasury: double credits for clearing a level |
| Shadow | Stealth: beetles notice you later |
| Ranger | Survivor: starts each level with 4 lives |

## The beetles

| Beetle | Behaviour |
| --- | --- |
| Bramble (red) | Heads straight for you and speeds up when few seeds are left |
| Moth (pink) | Aims a few tiles ahead of you to cut you off |
| Drift (teal) | Hunts you from far away but wanders off when close |
| Hush (purple) | Follows your footsteps |

Ember, Glint, Shade and Thistle join from level 5 onwards and reuse these four chase styles.

Beetles don't all chase you from the start. They leave the den and wander the garden, steering clear of you while they wander. As you eat the seeds they join the hunt one at a time, at first only now and then. Once about 90% of the seeds are gone, half of them hunt you hard and the rest join in now and then. After you lose a life they leave you alone for a few seconds. When 8 or fewer seeds are left, the seeds pulse and an arrow points to the nearest one.

Every so often the beetles switch between chasing you and retreating to their corners. Use the side tunnel to escape, because beetles slow down inside it.

## Saves and updates

Progress is stored in the browser (`localStorage` keys starting with `backman.` or `bma.`). Publishing a new version never touches it, and these rules keep it that way:

- **Keys:** never rename or delete an existing save key. Add new keys instead, with a migration that only adds progress.
- **Never lower progress:** the saved level never moves backwards (replaying an old level doesn't change it). Every merge (backup restore, save code, address move) keeps the higher level, credits, best score and cleared levels, and the union of owned looks.
- **Backup copy:** a second copy of the save lives in IndexedDB (`bugmaze-save`). If the main copy disappears, the game restores it on start.
- **One address:** any other `*.vercel.app` address forwards the player to `backman-nu.vercel.app` and takes their save along. An installed app stays where it was installed.
- **Save code:** Settings has *Copy* and *Load a save code*. Players can use it to move progress between Safari and the installed app, to another phone, or after reinstalling.
- **Don't delete the installed app to update:** on iPhone, deleting a home-screen app deletes its data. Updates arrive on their own: close the app fully and reopen it.

## Credits

All home-screen and score-bar icons are custom artwork made for this game.

## Online leaderboard

- **Claiming a name:** in the Profile, players claim a unique name of 3 to 5 letters or numbers. Names are case-insensitive, so `mbn` and `MBN` are the same name.
- **Score updates:** the game sends each player's best score, highest level and current look to the server.
- **The board:** the Leaderboard has a **World** tab (top 100, your rank highlighted) and a **My runs** tab.
- **Server:** Vercel Functions in `api/`, storing data in a private Vercel Blob store (`BLOB_READ_WRITE_TOKEN`):
  - `POST /api/claim` `{name, password}`: reserves the name and returns a secret key for this player.
  - `POST /api/score` `{name, token, best, level, look}`: keeps the highest values sent.
  - `GET /api/leaderboard?me=NAME`: returns the ranking.
  - `POST /api/release` `{name, token}`: frees the name.
  - `POST /api/account` `{action: 'save', name, token, save}`: stores the player's whole progress online (`saves/<NAME>.json`).
  - `POST /api/account` `{action: 'load', name, token}`: returns the saved progress.
  - `POST /api/account` `{action: 'login', name, password}`: logs in on a new device and returns a new key plus the saved progress.
  - `POST /api/account` `{action: 'password', name, token, password}`: sets or changes the password.
- **Cloud save:** with an account, progress is sent to the server a few seconds after every change and when the app closes, and merged back in (never lowering anything) when the game opens or after logging in.
- **Secret key:** the key is saved on the device in `bma.account`. It is also included in the save code, so a player's name moves to a new phone with their progress.
