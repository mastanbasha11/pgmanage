# Vendored API-docs assets

We self-host Swagger UI and ReDoc here so `/api/docs` and `/api/redoc` work
under our locked-down CSP (`script-src 'self'` in
[infrastructure/prod/Caddyfile](../../../../infrastructure/prod/Caddyfile)),
which blocks the CDN that FastAPI's default docs pages load from.

| File | Source |
|------|--------|
| `swagger-ui.css` | `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css` |
| `swagger-ui-bundle.js` | `https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js` |
| `redoc.standalone.js` | `https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js` |

Wired in [`app/main.py`](../../main.py) via `get_swagger_ui_html` /
`get_redoc_html` pointing at `/api/static/docs/...`.

## Refresh

```bash
cd apps/backend/app/static/docs
curl -sS -o swagger-ui.css       https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css
curl -sS -o swagger-ui-bundle.js https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js
curl -sS -o redoc.standalone.js  https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js
```

Bump the version tags as needed and commit the resulting binaries.
