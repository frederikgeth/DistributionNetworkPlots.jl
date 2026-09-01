# Vendored ELK.js

`elk.bundled.js` is the browser distribution of [elkjs](https://github.com/kieler/elkjs), pinned to version `0.10.2`.

- Upstream source: <https://github.com/kieler/elkjs/tree/0.10.2>
- Package metadata: <https://cdn.jsdelivr.net/npm/elkjs@0.10.2/package.json>
- License: Eclipse Public License 2.0, reproduced in [ELK-LICENSE.md](ELK-LICENSE.md)
- SHA-256: `88f7753e5b41af205d56ee4edaf6eea4fceabe0115b76c9495e5a2cee95c31d1`

The bundle is loaded only when a user explicitly requests ELK layout. The
deterministic renderer remains the default and does not depend on this asset.
Generated Julia reports embed this exact bundle so their ELK option remains
available without a network connection.
