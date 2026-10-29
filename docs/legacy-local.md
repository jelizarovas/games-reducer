# Games Reducer

A local, controller-friendly way to try your ROMs, keep the games you enjoy, and mark the rest for cleanup.

## Run

Requires Node 22.13 or later. Node 22.23.2 was used here.

```powershell
cd C:\apps\games-reducer
npm install
npm run dev
```

`npm run dev` starts both the Vite frontend at **http://127.0.0.1:3001** and the Node API at **http://127.0.0.1:4311**. Ctrl+C stops both. Automatic frontend reloads and backend watching are disabled to preserve the running game. Refresh manually for UI changes; restart npm run dev for server changes. The API listens only on this PC.

For a production build, use `npm run build`, then `npm start`, and open http://127.0.0.1:4311.

## Library

The default folder is `C:\RetroBat\roms`. Change it using the settings button. The selected root should contain these subfolders:

| Folder | Console | Engine |
| --- | --- | --- |
| `megadrive` | Sega Genesis / Mega Drive | jgenesis WebGL / WebAssembly |
| `snes` | Super Nintendo | jgenesis WebGL / WebAssembly |
| `nes` | Nintendo Entertainment System | JSNES |

No RetroArch installation or running RetroBat instance is needed. The engines are bundled locally. The browser needs WebGL2, WebAssembly shared memory, and AudioWorklet support. Current Chrome and Edge on this PC are the intended targets. Both development and production servers set the cross-origin isolation headers required by the engine.

Loose cartridge ROMs and ZIPs containing exactly one supported ROM work. ZIPs are read in memory, up to a 64 MB expanded limit. Multi-game ZIPs, 7z collections, CD images, and other systems are not loaded by this first version. Unsupported ZIPs appear in scan warnings. Use the already extracted RetroBat library prepared on this PC.

On its first visit, the app scans the default library if available. Further scans import new files and mark absent files as missing. A ROM whose size or modification time changed is reset to unreviewed. Scanning does not move or delete ROMs.

## Review loop

Click a game or its cover to launch it immediately. Controller users can highlight a game with the D-pad or left stick, then press A. Clicking a different game switches playback. While playing, Back + Start pauses the emulator and audio and opens the decision overlay. Choosing Keep, Mark for removal, or Try later saves the choice in SQLite and starts the next unreviewed game for that console. Y resumes the current game.

All buttons must be released between gameplay and the review overlay before a decision is accepted. This prevents a held gameplay button from marking a game.

| Screen | Controller | Keyboard |
| --- | --- | --- |
| Library | D-pad/stick up/down selects; A plays; X opens menu; Y undoes; LB/RB changes console; left/right filters; LT/RT jumps 20; Start finishes | Arrows select; Enter plays; U undoes |
| Game | Hold RT/R2 for 3x fast forward; Back + Start opens review | Hold Tab for 3x; Escape opens review |
| Any screen | L3 toggles expanded view | F or the fullscreen button requests browser fullscreen |
| Review | A keeps; B marks; X defers; Y resumes | 1 keeps; 2 marks; 3 defers; Enter/Escape resumes |
| Dialog | D-pad changes focus; A activates; B closes | Tab, Enter, Escape |

Fast-forward mutes audio while held. Release returns to normal speed. Review and controller disconnection also reset it. Actual acceleration depends on CPU capacity. Expanded view fills the page even when browser fullscreen needs a keyboard or mouse gesture.

Mappings use the browser's standard controller layout. Nonstandard controllers may need an OS-level mapping. The app uses the first connected controller. Keyboard gameplay uses arrows and Enter. Genesis buttons are A/S/D and Q/W/E. SNES buttons are Z/X/A/S with D/C shoulders and Right Shift select. NES buttons are X/Z with Right Ctrl select.

## Progress and cleanup

The database is `data/library.sqlite`, using SQLite WAL. It stores file inventory, review status, accumulated preview time, metadata, last selected game, and undo history. User review data is excluded from Git. The bundled jgenesis runtime stores cartridge saves in browser IndexedDB, with filenames prefixed by the game ID. Triage progress lives in SQLite, independently of those saves.

Marking a game changes only SQLite. At the end of a session, **Finish session** lists the marked games. You can unmark individual games or choose **Move marked games to trash**.

Cleanup performs these steps per game:

1. Recheck that the ROM remains inside the selected root, is not a linked path, and still matches the scanned size and modification time.
2. Create a unique destination beneath `C:\files\trash\games-reducer`.
3. Write a pending recovery receipt and move the file with a filesystem rename.
4. Verify the source is absent and the destination SHA-256 matches.
5. Remove the game's database record and cascading decision history. Retain a minimal move receipt for crash recovery and locating the trashed file.

Failed moves retain the game record. A restart reconciles verified moves interrupted before their database transaction. Cleanup confirmation expires after ten minutes and is invalidated when review decisions or inventory change. Nothing is permanently deleted. The trash folder must be on the same drive as the ROMs; cross-drive moves fail without removing the source. Set `TRASH_ROOT` in `.env` if using another drive.

For files you removed outside the app, rescan and use **Clear missing records** in settings. Only records whose files remain absent are cleared.

## Metadata and artwork

Scanning imports `gamelist.xml` from each supported system folder, including title, description, genre, player count, publisher, cover and screenshot paths. Only images inside the library are served. An empty description is shown honestly when no data exists.

Optional ScreenScraper integration identifies the actual ROM contents by MD5/SHA-1, size, and system. Copy `.env.example` to `.env`, provide your own ScreenScraper user and developer credentials, and restart. Use **Fetch info** on the selected game. Requests run one at a time. Metadata is stored in SQLite and images in `data/media` for offline use. Unmatched ROMs keep their existing metadata. ROM contents are not uploaded; identifying hashes, filename, size, and system are sent.

With credentials configured, selecting a game without metadata also starts a background lookup. Failed automatic lookups are attempted once per game per page session; Fetch info allows a manual retry.

The API requires developer credentials in addition to a user account. Request your own access through https://www.screenscraper.fr/webapi2.php. Credentials are used only on the local server and are not sent to the React client. There are no bundled third-party credentials. Live ScreenScraper requests were not tested because credentials have not been supplied. Importing existing RetroBat metadata works without them.

## Development

- `src/`: React interface, controller router, embedded player adapters, and Tailwind styles.
- `server/`: Express API, SQLite library, ROM validation, cleanup, and optional metadata provider.
- `public/engine/`: bundled jgenesis WebGL build plus its local adapter.
- `scripts/dev.mjs`: starts and stops the two development processes.
- `tests/`: filesystem and controller regression tests.

```powershell
npm test
npm run build
npm run test:browser
```

The browser smoke test needs Chrome at its normal Windows location and five specific Mario/Sonic ROMs in the prepared library. It copies those ROMs into an isolated test folder, uses a separate database/API, injects simulated controller inputs, and only cleans up disposable copies. Set `CHROME_PATH` or `TEST_ROM_ROOT` to override those locations. Evidence is saved under `test-results/browser`. Test files are retained rather than automatically deleted.

Validation on this PC: Genesis, SNES and NES ROMs reached their game screens; controller input opened review, kept/marked games, and advanced to the next ROM; pause stopped emulator callbacks and suspended audio; decisions survived page reload; cleanup moved a test ROM and cleared its game record. Physical controller input and long gameplay sessions still need a hands-on check. No performance claim is made for the Surface Hub.

## Emulator provenance

The bundled jgenesis WebGL build was downloaded from https://jsgroth.dev/jgenesis-webgl/ and reports source revision `c9ff3184cf1515648576a6641c05a11ef4089fb5`.

Source: https://github.com/jsgroth/jgenesis/tree/c9ff3184cf1515648576a6641c05a11ef4089fb5

License: GPL-3.0, copied to `public/engine/LICENSE`. A matching source checkout is present locally in `vendor/jgenesis`. It is not needed to run the app. Preserve the license and provide matching source when distributing the bundled emulator. Original download sizes and hashes are recorded in `public/engine/manifest.json`.

The local WASM build adds a separate player-two key channel with `scripts/prepare-two-player.mjs`; it uses the same upstream revision. `scripts/prepare-engine.mjs` creates `play.html` and adapts generated JavaScript timer bindings to `bridge.js` so only emulator callbacks pause. The audio worklet drains its queue while muted. The original downloaded package is retained in `.validation/engine-before-player-two`, and the local build hash/tool versions are recorded in `public/engine/player-two-build.json`.

`npm run engine:download` refuses to replace a local two-player build accidentally. `node scripts/download-engine.mjs --upstream-only` explicitly restores the upstream single-player bundle. To rebuild the patched engine on this development PC: run `node scripts/prepare-two-player.mjs`, `wsl --exec bash /mnt/c/apps/games-reducer/scripts/build-engine.sh`, `node scripts/install-built-engine.mjs`, then `node scripts/prepare-engine.mjs`. The build uses the project-local Rust nightly toolchain, `rust-src`, Clang/GCC in WSL, and the checksum-verified wasm-bindgen 0.2.114 binary. These tools are not needed to run the app. Rerun browser tests after rebuilding. JSNES comes from npm at the version recorded in `package-lock.json`.

### Screen controls and browsing

The red P1 and blue P2 header buttons toggle independent, complete controllers. Drag any empty part of a controller case. Buttons support mouse holds and simultaneous touch contacts; A/B turbo repeats while held. NES uses two JSNES controller ports; Genesis/SNES use separate key channels in the patched WASM engine. Start/Select become Start/Mode on Genesis, with its six face buttons. Two-player gameplay depends on the selected game's multiplayer mode.

Search, console, sort, and review filters stay available during playback without changing the active game. Selecting a game starts it. Sort offers title and year in both directions, with unknown years last. Click outside a modal to dismiss it (except during an active library operation). The header sound toggle persists locally and survives pause/resume and game changes.

### Additional metadata

Missing release years and covers fall back to the public [LaunchBox Games Database export](https://gamesdb.launchbox-app.com/Metadata.zip). The first metadata download is about 109 MB; the parser streams the XML and saves a small index of the three supported consoles in `data/launchbox`. Existing dates and artwork are preserved. Matching requires one unambiguous console/title or documented alias; hacks and prototypes are not guessed. Covers download locally as needed, at most three at a time. Run `node scripts/scrape-launchbox.mjs --covers` for a batch pass. Unavailable or oversized covers keep their placeholder and can retry later. Release years from this fallback are catalog years rather than guaranteed regional release dates.

### Cover browsing

Game rows show covers from existing metadata, or download matching box art from https://thumbnails.libretro.com/ as you scroll. No account or RetroArch installation is required. Indexes and images cache under data/. Up to three downloads run at once. Matching uses the console and normalized ROM title, with a region preference; it is not a checksum match. Unknown titles, demos and hacks show a placeholder. The provider receives cover requests, never ROM bytes. Detailed descriptions still use imported RetroBat metadata or optional ScreenScraper credentials.

The adapter also patches performance-clock bindings and selects the gated timer fallback for pause and 3x speed. The audio worklet drains and mutes accelerated audio. The WASM binary remains unchanged.
Release years are filled automatically when the library loads, using the public Libretro database releaseyear datasets for Genesis, SNES and NES. Original DAT files cache in data/year-index for 30 days. Matching requires a console/title/region agreement or a local ROM CRC32 match; NES headers and SNES copier headers are handled. Existing dates are preserved. No ROM data is uploaded. Unmatched entries retry after seven days; failed downloads retry after a short cooldown. The source and matched name are stored with each year. Run node scripts/scrape-years.mjs for a manual library pass. Source: https://github.com/libretro/libretro-database/tree/master/metadat/releaseyear
