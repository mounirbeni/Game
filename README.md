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

- **Looks:** ZOGHA, ES, Sprout, FOX, Minty, Midnight, MBN, Shadow, Ranger, Seeker and Voyager, each with its own outfit and powers. Looks are bought in the shop; clearing levels does not unlock them (looks a player already earned that way are kept).
- **Credits:** you earn them while you play:
  - **Gold coins:** pop up in the maze every 12–20 seconds and vanish after 9. Each is worth +1.
  - **Beetles:** +1 for each one you catch after eating a lantern.
  - **Mushrooms:** +1 each, and they freeze every beetle for 3 seconds.
  - **Clearing a level:** +2, or +4 if you didn't lose a life.
- **Shop:** tap a locked look to buy it with credits. Prices follow the power: ZOGHA 120, Sprout 150, Minty 180, ES 220, FOX 300, Shadow 350, Ranger 400, Seeker 420, Voyager 430, Midnight 450, MBN 600.
- **Continue:** when your lives run out, spend 1 credit to keep playing from the same spot with 1 extra life. Or retry the level from the start for free.
- **Saved:** credits, looks and your level are all kept between visits.

## Character powers

| Look | Price | Powers |
| --- | --- | --- |
| Backman | free | All-rounder: no special power |
| ZOGHA | 120 | Sweet tooth: one extra mushroom per level; mushrooms give +2 credits; mushroom freeze lasts 5 s |
| Sprout | 150 | Harvest: seeds 15 points, lanterns 150 points |
| Minty | 180 | Lucky leaf: gold coins appear twice as often and stay twice as long |
| ES | 220 | Deep freeze: lanterns last 50% longer; scared beetles 20% slower |
| FOX | 300 | Quick feet: 10% faster; no slowdown in the gates |
| Shadow | 350 | Stealth: beetles notice you later and move 5% slower |
| Ranger | 400 | Survivor: 4 lives each level; extra life at 3,000 points |
| Seeker | 420 | Sharp eye: scared beetles worth double points; gold coins give 2 credits |
| Voyager | 430 | Pathfinder: beetles frozen for the first 3 s of every level; +2 credits per cleared level |
| Midnight | 450 | Magic shield: survives the first two beetle hits each level |
| MBN | 600 | The King: beetles within 3 tiles slow down 25%; lanterns also freeze the beetles for 1.5 s; double level-clear credits; 2 credits per beetle |

Powers are switched off in live matches with friends.

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
- **The board:** the Leaderboard has a **World** tab (top 100, your rank highlighted) and a **Friends** tab (add friends by name to rank against each other, each with their world rank).
- **Server:** Vercel Functions in `api/`, storing data in a private Vercel Blob store (`BLOB_READ_WRITE_TOKEN`):
  - `POST /api/claim` `{name, password}`: reserves the name and returns a secret key for this player.
  - `POST /api/score` `{name, token, best, level, look}`: keeps the highest values sent.
  - `GET /api/leaderboard?me=NAME&friends=A,B`: returns the ranking plus those players.
  - `POST /api/release` `{name, token}`: frees the name.
  - `POST /api/account` `{action: 'save', name, token, save}`: stores the player's whole progress online (`saves/<NAME>.json`).
  - `POST /api/account` `{action: 'load', name, token}`: returns the saved progress.
  - `POST /api/account` `{action: 'login', name, password}`: logs in on a new device and returns a new key plus the saved progress.
  - `POST /api/account` `{action: 'password', name, token, password}`: sets or changes the password.
- **Cloud save:** with an account, progress is sent to the server a few seconds after every change and when the app closes, and merged back in (never lowering anything) when the game opens or after logging in.
- **Secret key:** the key is saved on the device in `bma.account`. It is also included in the save code, so a player's name moves to a new phone with their progress.

## Friend challenges

In the leaderboard's Friends tab, tap a friend's name under **Challenges** to challenge them.
You both play the same maze once (it has the size of the lower of your two levels). Each player
gets one attempt with all their lives. The challenger usually plays first to set the score to beat.
Leaving the run early ends it with the score so far. The higher score wins **+10 credits**, a draw
gives +5 each, and the loser still gets +1. A challenge lasts 3 days, and a player can have 5
challenges going at once. Challenge runs never change your saved level or best score.
The server (`/api/challenge`) keeps the maze seed, each attempt and each collected reward, so
each player can only play once and collect once.

## Gates

Levels 1 to 5 have no gates (their beetles are a little slower to make up for it). From level 6
every maze has a gate in the left and right walls: walk out of one side and come back in on the
other. From **level 20** there is also a gate in the top and bottom walls, and every **15 seconds
all the gates move** to new places. The open gates blink orange just before they move. They wait
for anyone standing in a doorway, so nobody gets stuck. Beetles slow down in the doorways.

## Play live with friends (real time)

Tap **Play live with friends** on the home screen. One player creates a room and shares its
4-letter code; up to 3 friends join with the code. Two modes:

- **Race**: shared seeds. Each player has 3 lives, and the most points when the maze is empty wins
  (+10 credits; everyone else gets +2).
- **Team**: clear the maze together with shared lives (3 + 1 per extra player). The team gets +5
  credits each when it clears the maze, +1 if it runs out of lives.

The phones talk directly to each other (WebRTC data channels, STUN only). `/api/room` only passes
the connection offer and answer through the room code. The host's phone runs the match and sends
the state about 20 times a second; the others send their direction. Character powers are off in
live matches. The maze uses the host's level (between 6 and 12) with a fresh layout.
