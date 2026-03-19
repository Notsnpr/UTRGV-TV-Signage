# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# UTRGV TV Signage — approach/reference

## About this branch
This branch builds the app by closely following the architecture and patterns from the reference signage system at `/Users/snpr/Code/Test/signage`. The full architecture guide lives at `/Users/snpr/Code/Test/signage/docs/architecture.md` — read it before implementing anything.

## Stack
| Layer | Technology |
|---|---|
| Runtime | Node.js (v18+) |
| Web framework | Express 4 |
| Database | better-sqlite3 (synchronous, WAL mode) |
| Validation | Zod |
| Auth | express-session + bcryptjs |
| File uploads | multer |
| Frontend | Vanilla JS (IIFE modules), no build step |

## Project structure
```
server.js              # Entry point — mounts middleware + routes
lib/
  database.js          # DB init, schema, migrations, default seed
  middleware.js        # requireAuth, requireAdmin, requireApiKey, requireAuthOrApiKey
  helpers.js           # errorResponse, generateToken, logAudit, triggerWebhooks, token utils
routes/
  auth.js              # POST /api/auth/login|logout, GET /api/auth/me
  users.js             # CRUD /api/admin/users
  playlists.js         # CRUD /api/playlists + share/clone/preview
  items.js             # CRUD /api/items/:id, reorder
  devices.js           # CRUD /api/devices + poll + commands
  schedules.js         # CRUD /api/schedules
  emergency.js         # CRUD /api/emergency
  media.js             # Upload + CRUD /api/media
  overlays.js          # CRUD /api/playlists/:id/overlays
  widgets.js           # CRUD /api/playlists/:id/widgets
  analytics.js         # GET /api/analytics/plays, POST /api/playback-logs
  audit.js             # GET /api/audit-logs
  settings.js          # GET|PATCH /api/settings, api-keys, webhooks
  public.js            # GET /api/public/playlists/:token (no auth)
public/
  js/shared.js         # Shared global: checkAuth, api, showToast, escapeHtml, etc.
  admin/
    components/sidebar.html
    js/<page>.js       # One JS file per admin page (IIFE pattern)
    <page>.html        # One HTML file per admin page
  index.html           # Login page
  player.html          # Player (fullscreen, no auth)
  player.js            # Playback engine
  styles.css           # All styles
  sw.js                # Service worker (player-only caching with TTL)
uploads/               # Created at runtime by multer
data.sqlite            # Created at runtime by better-sqlite3
```

## Key conventions
- **SQLite**: Use `db.prepare(...).get()` / `.all()` / `.run()` — always parameterized `?` placeholders
- **Booleans**: SQLite stores as 0/1 — convert with `!!row.enabled` on responses
- **JSON columns**: `JSON.stringify()` on write, `JSON.parse()` on read
- **Error shape**: `{ error: { code, message, details } }`
- **HTTP codes**: 200 GET/PATCH, 201 POST, 204 DELETE, 400 validation, 401 unauth, 403 forbidden, 404 not found
- **Frontend**: IIFE modules per page, `Shared` global for utilities, sidebar loaded dynamically
- **Multer**: accessed in routes via `req.app.locals.upload` (set in `server.js`)
- **Migrations**: add additive `ALTER TABLE` SQL strings to the `migrations` array in `database.js`
- **Constrained enums**: `playlist_items.type` ∈ `image|video|youtube`; `widgets.type` ∈ `clock|weather|rss|date`

## Implementation status
All route files (`routes/*.js`) are stubs with `// TODO: implement routes`. Implement by consulting the reference at `/Users/snpr/Code/Test/signage/routes/`.

## Helpers reference (`lib/helpers.js`)
| Export | Purpose |
|---|---|
| `errorResponse(res, status, code, message, details?)` | Consistent error JSON |
| `logAudit(userId, action, entityType, entityId, details, ip)` | Write to `audit_logs` |
| `triggerWebhooks(event, data)` | Fire matching webhooks async |
| `createPreviewToken(resourceId)` | In-memory token, 1hr TTL |
| `validatePreviewToken(token)` | Returns resourceId or null |
| `setDeviceCommand(deviceId, cmd)` | In-memory command, 60s TTL |
| `getDeviceCommand(deviceId)` | Returns command or null (consumed) |
| `generateToken(length?)` | Crypto random hex string |
| `getClientIp(req)` | Respects `X-Forwarded-For` |

## Middleware reference (`lib/middleware.js`)
| Export | Purpose |
|---|---|
| `requireAuth` | Session userId required |
| `requireAdmin` | Session userId + `isAdmin=1` |
| `requireApiKey` | Bearer token lookup, sets `req.session.userId` |
| `requireAuthOrApiKey` | Session OR Bearer token |
| `isUserAdmin(userId)` | Boolean helper, no middleware |
| `canAccessResource(userId, resourceId, isAdmin, table, col?)` | Ownership check |

## Reference files to consult
- `/Users/snpr/Code/Test/signage/docs/architecture.md` — templates for every layer
- `/Users/snpr/Code/Test/signage/server.js` — full implementation reference
- `/Users/snpr/Code/Test/signage/lib/` — db/middleware/helpers reference
- `/Users/snpr/Code/Test/signage/routes/` — route implementation reference
- `/Users/snpr/Code/Test/signage/public/` — frontend reference

## Default credentials
- Email: `admin@utrgv.edu`
- Password: `admin123`
- Override via: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `SESSION_SECRET` env vars

## Dev setup
```bash
npm install
npm run dev   # nodemon auto-reload
# or
npm start
```
App runs at `http://localhost:3000`
