# Seat finder design

Followers open a public 3D stadium, search for their Instagram handle and fly to their seat. The site is static and deploys to GitHub Pages through GitHub Actions.

## Decisions

- **Scene:** adapted from the stadium used in the reels, with the reel and editing tools removed.
- **Followers:** updated in batches with `npm run add`. List position sets the seat, so existing seats never move.
- **Stands:** fill one section at a time, front row first, starting from a middle section.
- **Handles:** every follower is shown, including handles that may offend.
- **Custom figures:** Reese has her own model in Tower 5, Box 2, Seat 13.
- **Boards:** the first 100 donors go on the two First 100 boards at the open ends of the stadium. The boards around the pitch are for ads bought by viewers.
- **Ko-fi:** the floating support button appears on every page.
- **Arena name:** set by `arena` in `data/followers.json`. Empty shows "?".

## Phones

Phones skip post-processing, cap pixel density at 1.25, and use simpler seats, people and terrain. This must still be checked on real phones before publishing, and revisited as seated followers grow.

## Left out

Accounts, seat claiming, buying ad boards on the site, and automatic Instagram sync.
