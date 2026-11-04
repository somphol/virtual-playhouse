# Deployment

Hosted on **GitHub Pages** straight from the repository. There is no build, artifact,
package manager or CI workflow: what is committed on `main` is what is served.

- Live URL: <https://somphol.github.io/virtual-playhouse/>
- Repository: <https://github.com/somphol/virtual-playhouse>
- Source branch: `main`, folder `/` (repository root)
- Entry file: `index.html`
- Pages source: **Deploy from a branch** (`main` / root)

## 1. Deploy a change

```bash
cd ~/Projects/virtual-playhouse

# 1. verify locally
python3 -m http.server 8000        # http://localhost:8000/
#    run the manual matrix in docs/TESTING.md

# 2. commit and push
git add -A
git commit -m "…"
git push origin main
```

Pages rebuilds on push, usually within a minute. Confirm:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://somphol.github.io/virtual-playhouse/
shasum index.html
curl -sL https://somphol.github.io/virtual-playhouse/ | shasum
```

At the time of writing the live root SHA-1 was
`d2842f5bd7b7ad346fea50b4c6ac24e80ad1e367`, identical to the local `index.html`.

## 2. Repository settings that matter

| Setting | Value | Why |
| --- | --- | --- |
| Pages source | Deploy from a branch → `main` → `/ (root)` | three files at the root |
| Custom domain | none | default `*.github.io` host |
| Enforce HTTPS | on | default certificate |
| Actions | none | no workflow exists in `.github/workflows/` |
| Jekyll | disabled by `.nojekyll` | serve the static files as-is |

## 3. What is published

Because the branch root is served, the whole repository is public:

- `index.html`, `style.css`, `script.js` — the application
- `assets/preview.png` — README/social preview (not loaded by the app)
- `README.md`, `AGENTS.md`, `docs/*.md`, `CHANGELOG.md`, `LICENSE`
- `state/build-state.json` — build receipt linked from the footer
- `robots.txt` is **not** present; add one if crawler hints matter.

`state/build-state.json` contains the build duration, session id, harness/model names,
token totals and artifact sizes. It contains **no credentials, secrets or personal
data**, but it is public because the root is published. If that is undesirable, move it
out of the served tree or stop linking it.

There is no environment file and no server. Two network destinations can be contacted
from the browser:

| Destination | When | Required? |
| --- | --- | --- |
| `fonts.googleapis.com`, `fonts.gstatic.com` | every page load | no — system-font fallback |
| `api.deepseek.com/chat/completions` | only when Generate is pressed with a key | no — Copy Prompt/editor path |

No API key is committed. Speech synthesis and Web Audio run locally; audio is never
recorded or uploaded.

## 4. Rollback

Pages serves the current `main`, so rolling back is a normal history operation:

```bash
git revert <bad-commit>          # preferred: keeps history
git push origin main
```

or, for an immediate local reset:

```bash
git reset --hard <good-commit>
git push --force-with-lease origin main
```

Force-pushing rewrites the published history; prefer `git revert` unless the bad commit
contains something that must not remain public.

## 5. Caching

The live document returned:

```text
cache-control: max-age=600
etag: "6ae7fb60-5f41"
last-modified: Mon, 02 Nov 2026 02:54:24 GMT
```

A browser may keep an old `index.html` for up to ten minutes. Hard-refresh
(Shift-Reload) or use a private window after deploying. There is no service worker and
no offline cache to invalidate.

## 6. Local preview versus production

The app works from `file://` for the stage and most features, but a server is
recommended so file loading, fullscreen and speech behave consistently:

```bash
python3 -m http.server 8000
```

The first click is required to unlock the `AudioContext`; the sound gate exists for
that reason. Headless Chrome needs `--mute-audio` and a `--timeout` for DOM dumps
because the canvas loop never idles.

## 7. Platform requirements

- Modern browser with Canvas 2D, ES6 and `requestAnimationFrame`.
- Web Audio for sound; if unavailable, the stage runs silently.
- Speech Synthesis for voices; voices vary by OS. If unavailable, typewriter bubbles
  and tone clicks remain.
- DeepSeek API access from the browser is optional and may be blocked by CORS; the
  Copy Prompt and JSON editor paths do not depend on it.
- Keyboard shortcuts are disabled while a text field or open dialog has focus.
- Mobile performance is unverified; the 1600 × 900 canvas and particle layers are
  heavier than a plain page.
