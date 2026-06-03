# Fisher Hill — 3D map site

A single self-contained page (`index.html`) with a photorealistic 3D map of the
Fisher Hill neighborhood as the centerpiece. No build step — just static files.
Everything is in the one file except CesiumJS (loaded from its CDN) and Google's
map tiles.

## Publish it (GitHub Pages)

1. Create a new repo under your account — e.g. **`never-nude/fisher-hill`**.
2. Add `index.html` (this folder's contents) and push to `main`.
3. Repo **Settings → Pages →** deploy from `main` / root.
4. It goes live at **`https://never-nude.github.io/fisher-hill/`**.

## Two things before the map shows

1. **Paste your API key.** Open `index.html`, find the line
   `const GOOGLE_MAPS_API_KEY = "";` near the bottom, and put your key between the
   quotes. (It's a referrer-restricted browser key, so it's fine in the file.)
2. **Allow this site on the key.** In the Google Cloud console, add the live
   address to the key's **Website restrictions**:
   `https://never-nude.github.io/*` (plus `http://localhost:8080/*` for local tests).

## Preview locally

```
cd fisher-hill-site
python3 -m http.server 8080
```
Then open `http://localhost:8080/`. (`localhost:8080` is already on the key's
allow-list.) Opening the file directly with `file://` won't work — the tiles need
an allowed http(s) address.

## Tuning

- Default camera (the hero view): the `CAM` object in `index.html`.
- Neighborhood boundary: the `FH_BOUNDARY` coordinate list in `index.html`.
