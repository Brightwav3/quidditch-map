# Quidditch Map

The 3D stadium where Quidditch Tournaments followers can find their seat. It is a static site with no accounts or backend.

## Run it locally

```bash
npm start
```

Then open <http://localhost:4188>. Add `?lite` or `?full` to force the phone or desktop graphics.

## Publish

Every push to `main` runs the tests and deploys the site to GitHub Pages.

## Add new followers

The best source is `connections/followers_and_following/followers_1.json` or `followers_1.html` from Instagram's data export, because it lists everyone in follow order. Use it in place of `list.txt` below. Otherwise, copy your Instagram follower list into a text file, far enough back to include people who already have seats. Check it first:

```bash
npm run add -- list.txt --dry-run
```

Then save it:

```bash
npm run add -- list.txt
```

The script adds only new handles after the existing ones, so nobody moves. It assumes the list is newest first, as Instagram shows it. Use `--oldest-first` for a list in the other order.

Everything that changes lives in `data/followers.json`. Set `"arena"` there when the arena has a name. Add donor names to `"first100"` to show them on the two First 100 boards.

## Test

```bash
npm test
```

For the browser checks, start the site, then run:

```bash
npm install
npm run e2e
```

## Rules that keep seats stable

- A follower's position in `data/followers.json` sets their seat, so never reorder or delete entries.
- Don't change `src/seats.js` or the stadium's seat layout once the site is live.
- The first 1,000 followers sit in the VIP towers. After that, the stands fill one section at a time, from the front row back.
