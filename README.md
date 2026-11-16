# Comnex

**Say it on X. It lands on Solana.**

[![Live site](https://img.shields.io/badge/live-comnex.fun-b7f205?style=flat-square&labelColor=0c0c0c)](https://comnex.fun)
![Chain](https://img.shields.io/badge/chain-Solana-0c0c0c?style=flat-square)

- **Chain:** Solana mainnet
- **Contract address:** `TBA` (placeholder until announced; the site shows it in the top bar the moment it is stated)

## Overview

Comnex turns plain posts on X into commands that settle on Solana. The site is a static front end: a live market board, a pinned own-token row, and an address checker that compares any pasted string against the official registry.

## Features

- Always-visible contract address bar with click-to-copy (inert until stated)
- Live market board of the ten most boosted Solana tokens, refreshed every 60 seconds, paused while the tab is hidden
- Pinned row #1 for the Comnex token, fed by DexScreener and pump.fun in parallel once the address exists
- Ticker, skeleton loaders, count-up values, spring-driven entrances, parallax hero
- Register pattern: every external fact is one record (`stated`, `absent` or `unconfirmed`); anything not stated renders inert
- Reduced-motion fallback for every animation

## Links

- Site: https://comnex.fun
- X: https://x.com/TryComnex
- GitHub: not published yet

## Develop

```bash
npm run build   # copies to dist/ and runs every gate
npm run serve   # preview dist/ on http://localhost:4173
```

Build output is `dist/`.

## License

MIT, see [LICENSE](LICENSE).
