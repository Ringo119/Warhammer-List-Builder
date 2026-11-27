# Warhammer 40K List Builder

A mobile-first army list builder for **Warhammer 40,000 11th edition**, modelled on the list builder in the official Warhammer 40,000 app. It is an installable web app (PWA): add it to your phone's home screen and it works offline. Lists are stored on the device.

> Unofficial fan-made tool, not affiliated with or endorsed by Games Workshop.

Includes every 11th edition faction: all Imperium armies (including each Space Marine chapter), all Chaos armies, and all Xenos armies (33 in total). Each army is shown in its own colour.

Faction data downloads the first time you open that faction and is then available offline; the app itself is fully cached on install.

## Features

- Army roster grouped like the app (Characters, Battleline, Dedicated Transports, Other Datasheets, Allied Units), with points, Detachment Points (DP) and Enhancement counters
- Battle size, multiple detachments (DP costs), force disposition, Legends / optional content toggles
- Unit configuration: model counts, wargear choices, splitting models for mixed wargear, Warlord, Enhancements (filtered by your detachments), attaching Leaders to bodyguard units
- Live validation: points limit, unit limits, Enhancement limits, Epic Heroes, required selections, leader eligibility
- Datasheet viewer: stats, weapons (reflecting chosen wargear and enhancement modifiers), abilities, composition, wargear options, keywords
- Army rules: faction rules, detachment rules, enhancements and stratagems (colour-coded by turn), plus core stratagems
- Multiple saved lists: duplicate, rename, delete
- Export as text in the app's format, share via the system share sheet, or copy a share link that re-opens the exact list in the builder (Import)

Unit images are not included; role icons are used instead.

## Data sources

- **List-building logic, points, wargear, enhancements, leaders**: [BSData](https://github.com/BSData) 11th edition data (BattleScribe format), via a public mirror. The app runs the BattleScribe rules (conditions, modifiers, constraints) in a small built-in engine (`src/engine`), so other factions can be added from the same data.
- **Rules text (detachment rules, stratagems, datasheet text)**: Powered by [Wahapedia](https://wahapedia.ru), via a public mirror of its CSV export.

The processed data is committed in `public/data/`. To refresh it:

```bash
npm run fetch-sources   # clones the data sources into .sources/
npm run build-data      # writes public/data/*.json
```

Factions are configured in `scripts/factions.json` (catalogue, Wahapedia faction id, colour). Catalogues shared between factions (e.g. Space Marines for every chapter) are written once to `public/data/cat/`.

`npm test` includes a sweep that builds a list in every faction with every datasheet and fails if a unit starts with a missing required selection.

## Development

```bash
npm install
npm run dev       # local dev server
npm test          # engine tests
npm run build     # production build in dist/
```

## Deploying to GitHub Pages

The workflow in `.github/workflows/deploy.yml` builds and deploys on every push to `main`. One-time setup: in the repository settings, go to **Pages** and set **Source** to **GitHub Actions**. The app will be published at `https://<user>.github.io/Warhammer-List-Builder/`.
