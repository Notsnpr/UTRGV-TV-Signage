# UTRGV TV Signage

Digital signage management system for UTRGV campus displays. Admins manage TVs and media from a web dashboard; each TV runs a fullscreen player that polls for content and survives network outages via a service worker cache.

## Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js 18+ |
| Framework | Express 4 |
| Database | better-sqlite3 (WAL mode) |
| Auth | express-session + bcryptjs |
| Uploads | multer |
| Validation | Zod |
| Frontend | Vanilla JS, no build step |

## Features

- **TV management** — create TVs with unique display tokens, assign media playlists, set cycle intervals
- **Per-TV access control** — admins can grant individual users access to specific TVs
- **Media library** — upload images and videos (up to 500 MB), reuse across TVs
- **Scheduled content** — set start/end times on individual playlist items
- **Emergency broadcast** — instantly push a full-screen alert to all TVs (with per-TV opt-out)
- **Offline playback** — service worker caches player assets and media; player keeps running if the network drops
- **API keys** — create named keys for external integrations (hashed in DB, shown once at creation)
- **Webhooks** — register endpoints to receive `emergency.activated` / `emergency.deactivated` events
- **Audit log** — every admin action is recorded with user, IP, and timestamp
- **Integration tests** — 25 tests covering auth, users, and TVs (Jest + Supertest, in-memory SQLite)

## Getting started

```bash
npm install
npm run dev       # nodemon auto-reload on :3000
# or
npm start         # production
```

App runs at `http://localhost:3000`.

Default admin credentials:

| Field | Value |
|---|---|
| Email | `admin@utrgv.edu` |
| Password | `admin123` |

Override via environment variables: `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_USERNAME`, `SESSION_SECRET`.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `SESSION_SECRET` | `change-me-in-production` | Express session signing key |
| `DATABASE_PATH` | `./data.sqlite` | SQLite file path (`：memory:` for tests) |
| `ADMIN_EMAIL` | `admin@utrgv.edu` | Seed admin email |
| `ADMIN_PASSWORD` | `admin123` | Seed admin password |
| `ADMIN_USERNAME` | `admin` | Seed admin username |

## Project structure

```
server.js                        # Entry point — middleware + route mounting
lib/
  database.js                    # Schema init, migrations, default seed
  middleware.js                  # requireAuth, requireAdmin, requireTVAccess, requireApiKey
  helpers.js                     # errorResponse, logAudit, triggerWebhooks, token utils
routes/
  auth.js                        # POST /api/auth/login|logout, GET /api/auth/me
  users.js                       # CRUD /api/admin/users
  tvs.js                         # CRUD /api/tvs + access control
  media.js                       # Upload + CRUD /api/media
  emergency.js                   # Activate/deactivate /api/emergency
  settings.js                    # API keys + webhooks /api/settings
  audit.js                       # GET /api/audit-logs
  public.js                      # GET /api/public/tv/:token (no auth, used by player)
public/
  index.html                     # Login page
  player.html                    # Fullscreen player (no auth required)
  player.js                      # Playback engine — polls API, handles emergency overlays
  sw.js                          # Service worker — offline caching for player
  styles.css
  js/shared.js                   # Shared admin utilities (api(), showToast(), escapeHtml()…)
  admin/
    index.html                   # Dashboard
    tvs.html / tv-detail.html    # TV list + detail/playlist editor
    media.html                   # Media library
    emergency.html               # Emergency broadcast control
    users.html                   # User management (admin only)
    audit.html                   # Audit log (admin only)
    settings.html                # API keys + webhooks (admin only)
    components/sidebar.html      # Shared sidebar (loaded dynamically)
    js/<page>.js                 # One IIFE module per page
uploads/                         # Created at runtime by multer
data.sqlite                      # Created at runtime
```

## API overview

All API routes return `{ error: { code, message } }` on failure.

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | Login |
| POST | `/api/auth/logout` | session | Logout |
| GET | `/api/auth/me` | session | Current user |
| GET | `/api/admin/users` | admin | List users |
| POST | `/api/admin/users` | admin | Create user |
| PATCH | `/api/admin/users/:id` | admin | Update user |
| DELETE | `/api/admin/users/:id` | admin | Delete user |
| GET | `/api/tvs` | session | List TVs (filtered by access) |
| POST | `/api/tvs` | admin | Create TV |
| GET | `/api/tvs/:id` | session | TV detail + playlist |
| PATCH | `/api/tvs/:id` | admin | Update TV |
| DELETE | `/api/tvs/:id` | admin | Delete TV |
| POST | `/api/tvs/:id/items` | session | Add item to playlist |
| PATCH | `/api/tvs/:id/items/:itemId` | session | Update playlist item |
| DELETE | `/api/tvs/:id/items/:itemId` | session | Remove playlist item |
| GET | `/api/media` | session | List media assets |
| POST | `/api/media` | session | Upload media |
| DELETE | `/api/media/:id` | session | Delete media |
| POST | `/api/emergency/activate` | admin | Activate emergency alert |
| POST | `/api/emergency/deactivate` | admin | Deactivate alert |
| GET | `/api/emergency/status` | session | Current alert status |
| GET | `/api/settings/api-keys` | admin | List API keys |
| POST | `/api/settings/api-keys` | admin | Create API key |
| DELETE | `/api/settings/api-keys/:id` | admin | Revoke API key |
| GET | `/api/settings/webhooks` | admin | List webhooks |
| POST | `/api/settings/webhooks` | admin | Add webhook |
| PATCH | `/api/settings/webhooks/:id` | admin | Enable/disable webhook |
| DELETE | `/api/settings/webhooks/:id` | admin | Delete webhook |
| GET | `/api/settings/system/info` | admin | Uptime, version, Node |
| GET | `/api/audit-logs` | admin | Paginated audit log |
| GET | `/api/public/tv/:token` | — | Player data (no auth) |

## Player

Navigate to `/player.html?token=<displayToken>` on any screen. The player:

- Polls `/api/public/tv/:token` every 30 seconds for playlist updates
- Cycles through images and videos at the configured interval
- Shows emergency alerts full-screen when active
- Registers a service worker that caches player assets (24h TTL), media files (7d TTL), and API responses (5m TTL) — playback continues through network outages

## Running tests

```bash
npm test
```

Uses an in-memory SQLite database so tests never touch `data.sqlite`.
