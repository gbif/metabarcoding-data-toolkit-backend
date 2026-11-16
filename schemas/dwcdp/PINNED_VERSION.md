# DwC-DP table schemas — pinned source

These seven files are copied verbatim from a pinned upstream commit. Do not edit them by hand;
re-copy from a new pin instead.

- **Source:** https://github.com/gbif/dwc-dp `dwc-dp/table-schemas/`
- **Pinned commit:** `0fc041559db078c0c1cbdba8f8ffb4073319e2fa` (2026-09-28)
- **Profile version at that commit:** `http://rs.tdwg.org/dwc-dp/1.0-DEV`

## Why pinned, and why flat

This is a moving target. The upstream layout changed once already (the `0.1/` path level was
removed, which is why the schema URLs in every previously generated `datapackage.json` now 404),
and the pinned commit's own message is "Process cleanup before migrating to dwc repository" — so
the location is expected to move again. A pin, refreshed deliberately, is the only stable
reference.

The directory is deliberately **flat, holding one version only**. Nothing reads these files to
interpret an *existing* data package: an already-generated package carries its own
`datapackage.json` on disk. The only readers are `getDwcDPSchema` and
`getDwcDPtermsFromSchema` (`util/dwcTerms.js`), both called solely from the generation path in
`converters/dwcdp.js` - they decide what a *new* package declares and which user columns are
recognised DwC-DP terms. Backward compatibility for older packages is therefore a column-shape
problem, handled by structural detection plus a version-keyed column map in the dashboard, not
by keeping old schema files around.

## Divergence from TDWG, as of this pin

`tdwg/rs.tdwg.org/dwc-dp/table-schemas` publishes a *different* set: 77 schemas against GBIF's
81, and for our seven it is field-for-field identical to what MDT shipped before this pin -
i.e. still natural keys. GBIF's copy carries the surrogate-key form (`event_pk`, `event_fk`).
We pin to GBIF's on the understanding that it is not expected to diverge further before 1.0.
Re-check this before the next refresh.
