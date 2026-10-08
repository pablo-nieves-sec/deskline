# Deskline

A dark mode desktop app for vulnerability SLAs, tasks, and follow ups. Built with Electron, no accounts, no cloud. Your data stays on your machine.

## What is inside

* Dashboard with SLA health per company, a calendar, and everything due in one window
* Vulnerabilities tab with severity, status, and a due date calculated from each company's SLA
* SLAs tab where you set the days allowed per severity for every company
* Tasks and Follow ups tabs with a calendar date picker on every item
* A small quick add window from the tray icon or the global shortcut

## Quick add

Press Ctrl+Shift+A (Cmd+Shift+A on Mac) from anywhere, or click the tray or menu bar icon. Pick Task, Follow up, or Vulnerability, type, press Return. Use Ctrl or Cmd with 1, 2, or 3 to switch type.

Closing the main window hides it to the tray so quick add stays available. Quit from the tray menu.

## Run it locally

You need Node.js 20 or newer.

```bash
npm install
npm start
```

## Build installers

```bash
npm run dist
```

Installers land in the `dist` folder. Mac gives dmg files for Apple Silicon and Intel, Windows gives a Setup exe, Linux gives an AppImage. Each OS builds its own, so use the GitHub workflow below to get all three.

## Put it on GitHub and download from there

1. Create an empty repository named `deskline` on GitHub.
2. In `package.json`, check that `build.publish.owner` and `build.publish.repo` match your GitHub username and repository name.
3. Push the project.

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/deskline.git
git push -u origin main
```

4. Publish a release by pushing a version tag.

```bash
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions builds Mac, Windows, and Linux installers and attaches them to a release on the Releases page. Download the one for your machine from there. Later versions work the same way, bump `version` in `package.json` and push a new tag like `v1.0.1`.

You can also run the workflow by hand from the Actions tab.

## Mac notes

* The release has two dmg files. Use the one ending in arm64 for Apple Silicon (M1 and newer) and the one ending in x64 for Intel Macs.
* Open the dmg and drag Deskline to Applications.
* The app is not signed with an Apple Developer certificate, so the first launch is blocked. Right click Deskline in Applications, choose Open, then Open again. If macOS says the app is damaged, run this in Terminal and open it again.

```bash
xattr -cr /Applications/Deskline.app
```

* Deskline lives in the menu bar. Click its icon for quick add, right click for Open and Quit.
* Cmd+Shift+A opens quick add from any app. Cmd+W hides the main window, Cmd+Q quits, Cmd+N adds an item on the current tab.
* Dock icon click brings the main window back.

## Windows notes

* Run the Setup exe from the release. SmartScreen may warn on first run since the app is not signed. Choose More info, then Run anyway.
* Deskline lives in the system tray, which may be tucked under the up arrow in the taskbar. Click it for quick add, right click for Open and Quit.
* Ctrl+Shift+A opens quick add from any app. Ctrl+N adds an item on the current tab.

## Where your data lives

A single JSON file in the app's user data folder.

* Mac, `~/Library/Application Support/Deskline/deskline-data.json`
* Windows, `%APPDATA%\Deskline\deskline-data.json`
* Linux, `~/.config/Deskline/deskline-data.json`

Use Export backup and Import backup in the sidebar to move data between machines.

## How due dates work

A vulnerability is due its discovered date plus the days set for its severity on that company's SLA. Change an SLA and every open finding for that company recalculates. Pick a date in the Due date field to override a single finding. Status shows On track, Due soon (3 days or less), or Breached.

## Project layout

```
main.js        Electron main process, tray, shortcut, storage
preload.js     Safe bridge between the windows and main
src/           Full window and quick add window
assets/        Tray icons
build/         App icon used by the installers
.github/       Release workflow
```
