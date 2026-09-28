# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

**Despensa** — a household pantry-inventory PWA. Vanilla HTML/CSS/JS with native ES modules, **no build step, no package.json, no dependencies to install**. Supabase (PostgreSQL + Auth + Storage) is the single source of truth; the Supabase JS SDK is vendored at `vendor/supabase.mjs` so nothing is fetched from the network at runtime.

The entire UI, all code comments, and all user-facing strings are in **Spanish**. Keep it that way — match the surrounding language when adding code.

## Commands

```bash
# Run locally (must be served over HTTP — ES modules and the service worker
# do not work from file://)
python -m http.server 8080      # then open http://localhost:8080
npx serve .                     # alternative

# Regenerate the service-worker precache list after adding/removing static files
node tools/update-precache.mjs
```

There are **no tests, no linter, and no build**. Verification is manual: serve the folder and exercise the flow in a browser.

Deployment is "upload the folder" to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages, plain nginx). It must be served over **HTTPS** in production — both the camera capture and PWA installability require a secure context. Relative paths throughout (`./`) mean subdirectory hosting works unchanged.

### Known issue: `tools/update-precache.mjs` is broken on Windows

It derives `ROOT` from `new URL('..', import.meta.url).pathname`, which yields `/C:/Users/...` on Windows and makes every `readdirSync` fail with `ENOENT`. It throws before writing, so nothing is corrupted. To run it here, either fix it to use `fileURLToPath(new URL('..', import.meta.url))` or edit the `PRECACHE` block in `service-worker.js` by hand.

**If you do regenerate the list, review the diff.** The tool walks all of `js/` indiscriminately and will re-add the dead legacy modules (see below) that the current list deliberately omits.

### Version bump ritual

When shipping a change, bump **both** in lockstep, or clients never see the update:

- `VERSION` in `service-worker.js` (drives the cache name; old caches are purged on activate)
- `APP_VERSION` in `js/app-info.js` (shown in the *Más* screen and logged at boot)

`js/app.js` listens for `updatefound` and shows a "Hay una versión nueva disponible" toast that posts `SKIP_WAITING` and reloads.

## Architecture

### Boot and phases

`js/app.js` is the entry point. `state.phase` (see `PHASE` in `js/state.js`) decides what renders:

- `SETUP` — no Supabase URL/key configured → `views/setup.js` (also runs `services/diagnostics.js`, which probes project, key, each table, and the storage bucket)
- `LOGIN` — configured but no session → `views/login.js`
- `READY` — builds the persistent shell (header + `#view` outlet + bottom nav) and hands control to the router

`SETUP` and `LOGIN` render *fullscreen*, replacing `#app` entirely and tearing down the shell. Only `READY` has a router.

### Config resolution

`js/api/client.js` merges two sources, device first: `localStorage['despensa.connection']` overrides `window.DESPENSA_CONFIG` from `config.js`. `config.js` ships with a committed project URL and **anon** key — that key is designed to be public; RLS in `supabase/schema.sql` is the actual security boundary. The Supabase client is a lazily-created singleton; `saveConfig`/`clearConfig`/`resetClient` null it so the next `getClient()` rebuilds it.

### State and data flow

`js/state.js` holds one in-memory mirror of the household plus `Map` indexes (`productsById`, `categoriesById`, `storesById`) rebuilt by `reindex()` on every mutation. There is no local persistence of data — the app is **online-first**:

- `loadAll()` refetches household + categories + stores + products
- `startAutoRefresh()` polls every 45 s, and also refetches on `visibilitychange` and `online`
- Subscribers get `(state, reason)`; views typically call `ctx.onState(() => ctx.refresh())`

Mutations are **optimistic**: `upsertProductLocal()` paints immediately, the API call confirms, and on failure the previous object is restored and a toast explains why (`js/services/actions.js` is the canonical example, including the "Deshacer" action).

### The API layer

One module per table under `js/api/`. Each owns its **`fromRow` / `toRow` mapping between snake_case columns and camelCase app objects** — this is the only place that translation lives, so schema changes stay local. Every call funnels errors through `describeError()` in `client.js`, which turns Postgres codes (`23505`, `42P01`, `42501`) and network failures into Spanish sentences the user can act on.

`js/api/photos.js` compresses to ~800 px JPEG client-side before uploading to the public `product-photos` bucket under `{householdId}/{productId}-{timestamp}.jpg`. Because that path embeds the product id, **saving a product with a new photo takes three round trips**: create/update the row, upload the blob, then a second `updateProduct` to attach `photoPath`. Old photos are deleted only after the new row is saved. Keep that ordering if you touch `product-form.js`.

`js/api/auth.js` builds its email redirect from `origin + pathname`, so magic links and password resets survive a subpath deploy (GitHub Pages) without configuration.

### Router

`js/router.js` — hash-based (`#/inventario`), so it works from any subdirectory and offline. Views are `render(ctx)` functions returning a DOM node. `ctx` gives `params`, `query`, `go`, `back`, `setHeader(meta)`, `onCleanup`, `onState`, and `refresh()`.

`ctx.refresh()` is the re-render primitive: it coalesces into one animation frame, preserves scroll position, and restores focus + selection for any element carrying `data-keep-focus` (that is how the search input survives typing-triggered re-renders). Sheets are only closed on a genuine path change, never on a refresh.

### Rendering

No framework, no virtual DOM. `h()` in `js/utils/dom.js` builds elements from an emmet-ish tag string (`'button.btn.btn-primary'`), with `onclick`-style props, `style`/`dataset` objects, and an explicit `html:` escape hatch. `null`/`false` children are dropped, so inline conditionals (`cond ? h(...) : null`) are the idiom throughout. Views rebuild their whole subtree on refresh.

Shared UI lives in `js/components/ui/`: `sheet.js` (bottom sheets/dialogs), `toast.js`, `confirm.js`, `form.js` (field/input/select/switchRow/segmented/chipRow), `empty.js`.

**Editors are promise-returning sheet openers.** `openProductForm(product?)` resolves with the saved product, `askExpiryDate(product)` resolves with a date string — both resolve `null` if dismissed, and `onClose` guarantees the promise always settles. Inside a sheet action, `keepOpen: true` plus returning `false` keeps the sheet open on a validation failure; the `api` argument offers `setBusy()` and `close()`. Validation writes inline via `setFieldError(control, message)` rather than toasting (see the duplicate-name guard using `findByName`).

Icons are a **closed set**: `js/utils/icons.js` holds a fixed `PATHS` map of inline SVG and `icon('whatever')` silently falls back to `PATHS.info` for an unknown name. Categories persist an icon *name* to the database, so adding a category icon means adding a path here first — check with `hasIcon()` / `ICON_NAMES`.

`js/services/inventory.js` holds all pure business rules — expiry classification (`EXPIRY` states), filtering, sorting, grouping, summaries. It never touches the network; it receives already-loaded products. Add derived-data logic here, not in views.

### UI state vs. data state

`js/state.js` holds **server data only**. Transient UI state lives in *module scope* in the view that owns it and is persisted per-device through `js/utils/prefs.js` (localStorage, all keys prefixed `despensa.`):

- `filters.inventory`, `ui.inventoryView` — `views/inventory.js`
- `theme` — `js/theme.js`

Two consequences worth knowing before you "fix" it. Because `filters` is a module-level `let`, it survives navigating away and back — deliberate — but it is global rather than per-mount. And query params only *seed* it: `#/inventario?status=in` sets `filters.status` on render, after which the module variable wins, so the URL stops reflecting the visible filter. Filters are therefore not bookmarkable or shareable. Changing that means moving the filter state into the hash, not into `state.js`.

### Styling

`css/styles.css` defines the whole design system as CSS custom properties on `:root` (warm paper / pine / amber palette, self-hosted Fraunces + Hanken Grotesk variable fonts), with the dark theme overriding the same tokens. `css/responsive.css` is mobile-first breakpoint tuning only. `js/theme.js` sets `data-theme` on `<html>` and persists the choice via `js/utils/prefs.js`.

### Notifications

`js/services/notifications.js` uses `registration.showNotification()`, never `new Notification()` — the latter throws on Chrome for Android. **These only fire while the app is open** (foreground or backgrounded tab); there is no push server, so a fully closed app receives nothing. The module header documents what real Web Push would require. Permission is requested only from the settings toggle, since browsers penalise unsolicited prompts, and `notificationsSupported()` feature-detects rather than sniffing the browser because iOS exposes the API only to home-screen-installed PWAs.

Delivery is throttled to once a minute and deduped to one notification per product per day via the `notify.sent` pref; three or more expiring products collapse into a single summary notification.

### Service worker

`service-worker.js` precaches the app shell only. **Data never passes through it** — navigations are network-first (cache as offline fallback), static assets are cache-first with background revalidation, and non-GET/cross-origin requests are ignored entirely so Supabase traffic always hits the network.

### Database

`supabase/schema.sql` is idempotent and re-runnable. Five tables (`households`, `categories`, `stores`, `products`, `product_cycles`), all scoped by `household_id` with RLS policies allowing only the owning account. An `on_auth_user_created` trigger calls `create_household_for_user`, which seeds the nine default categories; `ensureHousehold()` in `js/api/household.js` invokes that RPC as a fallback for accounts created before the schema was installed.

**The `product_duration_stats` view filters by `auth.uid()` in its own `where` clause on purpose.** A plain view runs as its owner (`postgres`), which bypasses RLS on the underlying table — without that filter every account would read every household's averages. `security_invoker = on` is applied afterwards inside an exception-guarded `do` block, because the option only exists on PostgreSQL 15+; the `where` clause is what makes the view safe on its own.

### How "cuánto dura" works

`products.purchased_on` means *when the current stock entered the house*, and the database maintains it:

- `touch_status_changed_at` (BEFORE) clears it when something runs out, and sets it to `current_date` on restock **only when it arrives null**
- `close_product_cycle` (AFTER) writes one `product_cycles` row per depletion, reading `old.purchased_on`, which is still intact

That "only when null" rule is what makes undo work. `revert()` in `js/services/actions.js` deliberately re-sends the original `purchasedOn` so the trigger leaves it alone instead of stamping today, and calls `deleteRecentCycle()` to drop the cycle the mistaken tap just closed. Change either half and undo silently corrupts the averages.

Averages are read from the view into `state.durationByProduct`; `durationInfo()` in `js/services/inventory.js` turns them into display text. `js/api/cycles.js` returns `[]` rather than throwing when the view is missing, so the app still loads against a database that has not run the new schema yet.

## Dead code: the v2 IndexedDB island

These files are leftovers from the pre-Supabase local-storage version. **Nothing reachable from `js/app.js` imports them**, none appear in the service-worker precache list, and `views/backup.js` is not registered in `ROUTES`:

```
js/database/*                       js/services/backup-service.js
js/services/inventory-service.js    js/services/shopping-service.js
js/components/views/backup.js       js/components/views/shopping-list.js
js/components/shopping-item-form.js
```

They form a self-referential cluster (they import each other, which is why they look "used" to a naive grep). Do not extend them, and do not mistake `js/services/inventory-service.js` for the live `js/services/inventory.js`. Note that the README still advertises a backup/import screen under *Más → Datos y privacidad* that the current routes do not expose.
