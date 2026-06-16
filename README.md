# Ranching in a New Climate

Interactive drought stocking & feeding decision tool for South Texas cow-calf producers.

Built on:
- **FARM Assistance Focus 2011-6** — Young, Dominguez, Paschal & Klose (destock/restock 10-yr analysis)
- **"Ranching in a New Climate"** — Womble, Clayton, Harborth & Calil (feeding-cost analysis, 2023 market values)

## What it does
- **Destock & Restock** — slide year-1 destock % and year-3 restock % freely (no fixed scenarios). Shows 10-yr avg net cash farm income, ending cash, real net-worth growth, and a net farm income trajectory vs. feeding through.
- **Feed the Diet?** — slide the share of the diet you supply as feed (0% graze-only → 100% sacrifice pasture). Reproduces the "cost of feeding" table live with a stocking-rate response.
- **Assumptions** — every input (herd, calf value/weights, feed prices & rations, cow cost) is editable and flows into both calculators.

## Run locally
```bash
npm install
npm run dev
```

## Build for production
```bash
npm run build      # outputs to dist/
```

## Deploy on Render
Static Site:
- Build command: `npm install && npm run build`
- Publish directory: `dist`
