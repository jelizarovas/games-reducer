# Games Reducer

A browser-only, controller-friendly ROM reviewer. Choose a local folder, try games, keep favorites, and mark the rest for cleanup. No Node server, RetroBat, account, or ROM uploads are required on the device where you play.

## Use on the Surface Hub

1. Open the GitHub Pages URL in current desktop **Edge or Chrome**.
2. Choose **ROM folder**. Select the folder containing `megadrive`, `snes`, and `nes`, or select one of those console folders directly.
3. Allow the browser to read that folder. Click a game to play.
4. Settings, backups, and Finish session are under the **...** menu.

The first visit may reload once while the browser enables the emulator's isolated environment. Folder permission may need to be granted again on a later visit. Use **Reconnect / rescan** in settings. The site must be opened directly over HTTPS (localhost also works), not as a file:// page or inside a restricted embedded browser.

Supported: Genesis / Mega Drive, SNES, and NES cartridge files, plus ZIPs containing exactly one supported ROM. Compressed and expanded cartridge limits are 64 MiB. CD games, PS1, PS2, and 7z collections are not supported.

NES support includes a local mapper 33 extension for Taito cartridges such as Golf Ko Open, with PRG/CHR bank switching and mirroring. Other mappers outside JSNES's supported set may still be unsupported.

## Local progress and backups

IndexedDB stores the folder handle, inventory, keep/remove/later decisions, play time, and undo history. ROMs remain in the chosen folder and are read only for playback or verified cleanup. The app makes no API requests and uploads no ROMs or review data. Only one tab can edit the library at a time.

**Export backup** downloads a JSON file containing review decisions, play time, metadata, and **in-game cartridge saves** for Genesis, SNES, and battery-backed NES games. It waits for pending save writes. **Import backup** validates the whole file, shows a confirmation, and atomically replaces matching review records and cartridge saves. Other games remain unchanged. Matching uses console, relative filename, and size, so a backup can move between devices even when the drive letter changes. You may import before picking a folder; unmatched records are retained until scanning finds them. Older version-one review-only backups still work and leave cartridge saves untouched.

To move between the PC and Hub: save using the game's own save feature, open **... > Library settings > Export backup**, and copy the JSON file and your ROM folder to the other device. Open the same site there, import the backup, then choose the copied ROM folder. Keep filenames and console subfolders the same. This restores the game's normal save/continue data, not an exact snapshot of its current screen. Password-only games still need their passwords; games with no save feature do not gain one.

Existing Genesis/SNES saves on the same browser origin are copied into the new shared storage without removing the originals. Clearing site data clears review progress, cartridge saves, and saved folder access. Export before changing browsers, devices, or site URLs. GitHub Pages and localhost are separate storage locations; use export/import to transfer between them. ROM files are never embedded in backups.

The previous desktop SQLite database remains untouched in `data/`. A private migration export was produced in `.validation/desktop-progress-backup.json`; import that file in the browser edition to carry over existing reviews. Neither location is published.

## Metadata and covers

The bundled catalog has 4,544 records with the names, years, descriptions, categories, and artwork already collected on the development PC. There are 3,112 deduplicated WebP covers, approximately 70 MiB in total; images load as needed. No scraper account or runtime metadata service is needed. Unknown years and categories are left blank.

Matching first uses the console and exact relative filename, then a unique cleaned title within that console. Ambiguous matches retain the filename instead of guessing. Local `gamelist.xml` text metadata is imported when present. The old multi-gigabyte image cache and private database are not shipped.

Provenance: [Libretro thumbnails](https://thumbnails.libretro.com/), [Libretro release-year catalog](https://github.com/libretro/libretro-database/tree/master/metadat/releaseyear), [LaunchBox Games Database](https://gamesdb.launchbox-app.com/), and previously imported local gamelists. Attribution is retained in metadata where available.

## Cleanup

Marking a game never changes its ROM. In settings, choose a **trash folder outside the ROM library**. Finish session shows the exact marked files for review. The move operation:

1. Requests write access to the source and destination folders.
2. Rechecks the original size, modification time, and file handle.
3. Creates a unique destination, copies the file, and verifies its SHA-256.
4. Persists a receipt locally and rechecks the source contents.
5. Removes the verified source, then clears that game's review record and undo entries.

A failed copy or verification keeps the original. A crash may leave a duplicate in trash or a missing record that can be reconciled by rescanning; receipts retain the destination name and hash. Cleanup is not a permanent-delete operation. It never uses the Windows Recycle Bin automatically.

## Controls and browsing

- Click a game to play. D-pad/left stick browses; A plays; LB/RB changes console; LT/RT jumps through the list.
- Back + Start or Escape pauses for review. Keep, Remove, and Later advance within the active console/category/search queue.
- Hold the header's **fast-forward button**, RT/R2, or Tab for 3x fast forward; release for normal speed. Mouse and touch holds release even when the pointer leaves the button.
- L3 or F toggles fullscreen. The header contains mute and complete draggable red P1 / blue P2 controllers.
- Category, search, sort, and review filters remain usable during gameplay.
- The icon before the app name shows/hides the sidebar. Drag its right edge to resize it, or the top edge of the bottom dock on small screens. The view icon beside sort/filter toggles cover grid and list. Layout choices are saved in this browser.
- Press **Shift + /** (`?`) to toggle keyboard shortcuts, or choose **Keyboard shortcuts** from **...**. Hold **Alt** to reveal key badges. Alt+L toggles the sidebar, Alt+V switches its layout, Alt+K focuses search, Alt+G/Alt+P switch screens, Alt+S opens settings, Alt+M toggles sound, and Alt+U undoes a decision. Alt+1/2/3 keep, mark, or skip during play; plain 1/2/3 work when paused. These also work while the WASM game has keyboard focus.
- Genesis keyboard: **Z/X/C** = A/B/C, **A/S/D** = X/Y/Z. Arrow keys move and Enter starts. SNES/NES mappings and controller/touch button assignments are unchanged. A newly loaded game takes keyboard focus after a review decision.
- The library scrolls vertically on desktop and docks horizontally at the bottom on narrow screens. The game stays 4:3.
- **... > Games library** opens `/games/`, with a virtualized cover grid or compact list and the same console, category, review, search, and sort filters. Click a card to play.
- The **...** menu includes collection progress: reviewed/remaining totals, kept, marked/later games, play time, and cartridge-save count. Switching between the player and games library pauses and preserves the loaded game.

## Development

Node 22.13+ is required only for development/building:

```sh
npm ci
npm run dev
```

This starts **Vite only**, on http://127.0.0.1:3001. HMR is disabled to preserve running games: refresh manually after code edits. `npm run build` emits a static `dist/` directory. `npm start` previews it locally. The old Express/SQLite implementation remains in `server/` solely for reference and metadata/migration tooling; it is not used by the browser edition.

## GitHub Pages

The included `.github/workflows/pages.yml` builds and publishes `dist/`. In repository **Settings > Pages**, use **GitHub Actions** as the publishing source. The workflow derives the correct repository URL prefix from Pages configuration, including custom domains. All asset, engine, and catalog URLs honor that prefix. The build emits a real `games/index.html` entry point so direct links and refreshing the games route work on static hosting.

GitHub Pages does not supply the COOP/COEP headers needed by the WebAssembly audio engine. The same-origin `isolation-sw.js` service worker adds those response headers locally, then the bootstrap reloads once before mounting the app. It does not cache ROMs or progress and is not an offline installation feature. A network connection is needed to load the app and assets.

Emulator files are served from a content-versioned directory so a returning browser cannot mix a cached engine/save adapter with a newer app. Development maps that directory to the local engine; production builds include the matching static files.

## Verification

```sh
npm test
# Build a project-site prefix before the static-host browser test:
BASE_PATH=/games-reducer/ npm run build
npm run test:browser
```

On PowerShell, set `$env:BASE_PATH='/games-reducer/'` before building. Browser checks use installed Chrome and three Mario/Sonic ROMs from `C:/RetroBat/roms`; set `TEST_ROM_ROOT` and `CHROME_PATH` for another development machine. They copy ROM data into disposable browser-private files, substitute the folder picker with real browser directory handles, and never move the original ROMs. The test host serves static files only, with no isolation headers or API.

Coverage includes all three emulators, held fast-forward/release, route transitions without unmounting the game, direct-route loads, desktop/mobile layouts, project-site isolation, metadata, live filters, local persistence, concurrent-tab protection, malformed backup rejection, legacy save migration, byte-for-byte fresh-profile save restore, and verified cleanup on disposable files. An original NES test cartridge increments battery RAM on each boot to verify writes, backup export, import, and loading that save on the next boot. Native operating-system picker prompts and physical Surface Hub/controller performance still need testing on that device.

## Emulator source

Genesis/SNES use a locally patched [jgenesis](https://github.com/jsgroth/jgenesis/tree/c9ff3184cf1515648576a6641c05a11ef4089fb5) WebGL/WASM build with independent player-two input. NES uses JSNES from npm. The GPL-3.0 license is included at `public/engine/LICENSE`. Matching jgenesis source, local changes, bridge, and build scripts are bundled as `public/engine/corresponding-source.zip`; tool versions and the binary hash are in `public/engine/player-two-build.json`. Build tooling is not needed on the Hub.

The public source package omits games and private review data. See `docs/legacy-local.md` only for the retired Node edition's historical setup.
