# Frontend redesign audit

Audit date: 2026-11-11  
Scope: current `frontend/` source and the existing backend routes it can call. This is the pre-redesign baseline.

## Current stack and structure

- **Framework/build:** React 18, TypeScript, Vite 5.
- **Routing:** no router library. `App.tsx` renders the search app for every path except `/admin*`, which renders `AdminConsole`. Vite proxies `/api` to `http://localhost:5000`.
- **Components:** `SearchBar`, `ProductCard`, `ProductComparison`, and the substantial `AdminConsole`; the main search/results page lives in `App.tsx`.
- **Styling:** one global `styles.css` with hand-written class rules, hard-coded light colors, and a purple gradient hero. There is no component CSS framework or UI library.
- **Theme:** no light/dark/system theme state or persisted preference. The page currently uses Be Vietnam Pro loaded from Google Fonts.
- **Customer auth:** none. The admin console accepts `ADMIN_API_TOKEN` in a password field and sends it as a bearer token; no customer login/register UI or route exists.

## Existing pages and user flows

- **Search/home (`/` and all non-admin paths):** free-text submit, Enter submit, debounced product-name suggestions, six example queries, result intent/readout, notes, client-side sort, verified-price unknown section, TechAPI discovery references, and web-search references.
- **Comparison:** select up to four returned products and compare price, seller, brand/model, category, available specifications, and price-update time. The comparison table scrolls horizontally inside its own container.
- **Product cards:** permission-aware product images, verified offer price, attribution/source links, specs, source evidence, variants, and purchase links. Full specs are currently expanded with native `<details>`; there is no internal product detail page.
- **Admin (`/admin*`):** data-source configuration, dry-run/import/update/price sync, review queue, catalog CRUD, offers, taxonomy/coverage, and CSV export. Preserve these actions and the token handling.
- **Category browsing:** no category page. Backend routes already exist for `GET /api/products/categories` and `GET /api/products`; the current frontend does not call them.
- **Product detail/recommendation:** backend provides `GET /api/products/:id` and `/api/v1/products/:id/similar`; the current frontend does not use them. Product cards link to source/seller pages.
- **AI:** the current legacy search API returns parsed `intent`, `queryUnderstanding`, and `notes`; the search page displays these. There is no conversational chat API/UI in the current frontend. Do not invent AI prose or products.

## API integration found

- `GET /api/products/search?q=...` supplies verified search items, intent, status, notes, offers, budget-unknown items, TechAPI discovery references, and optional web-search references.
- `GET /api/products/suggest?q=...` supplies real name suggestions.
- Admin requests use `/api/admin/collector/*` and `/api/admin/catalog/*` with the bearer token.
- Existing but not yet used by the frontend: `GET /api/products`, `/api/products/categories`, `/api/products/:id`, and `GET /api/v1/products/:id/similar`.
- `api.ts` contains product/offer/search types, the two public search functions, and VND formatting helpers.

## Reuse and redesign plan

- Keep and restyle `SearchBar`, `ProductCard`, `ProductComparison`, and `AdminConsole` so their existing features remain available.
- Refactor the search shell in `App.tsx`; add a shared header/theme control, data-backed category/product discovery, filter/sort/results states, and a product-detail dialog backed by the existing product API.
- Keep the legacy search endpoint for primary search so its discovery, price-unknown, and web-reference responses remain visible. Use existing category/product/detail/similar endpoints only for their supported UI surfaces.
- Replace decorative emoji/orbit art, uneven result styling, and hard-coded colors with restrained SVG icons, reusable design tokens, a light/dark/system theme, and responsive layouts.

## Boundaries

- Do not change backend source, database data/schema, search/AI algorithms, or endpoint behavior.
- Do not introduce mock products, prices, sellers, AI explanations, or recommendation results.
- Do not add customer authentication or claim product-detail/category routes that do not exist. Product details can be opened in an in-page dialog using the existing product detail API.
- Preserve `/admin*`, current admin API paths, seller/source attribution and image-use checks, comparison controls, and all existing search response sections.

## Implementation and verification

- Reworked `frontend/src/App.tsx` into a search-first storefront with data-backed category and catalog discovery, the six original example searches, parsed-query context, result filters (category, brand, verified price, minimum RAM), sort, client pagination, and loading/error/empty states. Search still calls `GET /api/products/search`; it requests up to 60 items and paginates those loaded items in the browser.
- Added `frontend/src/components/ThemeToggle.tsx`, `Icon.tsx`, and `ProductDetailDialog.tsx`. The dialog uses the existing product/detail/similar endpoints and shows available specifications, variants, source evidence, verified offer data, and permitted images. `SearchBar`, `ProductCard`, and `ProductComparison` retain their existing search, attribution/image-use, offer, and compare behaviors with the new design.
- Added `frontend/src/redesign.css` and loaded it after the legacy styles. The redesign uses light/dark design tokens, a system theme preference, responsive header/filter layouts, keyboard-visible focus styles, and reduced-motion rules. `frontend/index.html` sets Vietnamese metadata and applies the saved/system theme before the app renders.
- `AdminConsole`'s internals and admin API calls were left intact; `/admin*` still renders it with the shared site header/footer. `frontend/src/api.ts` adds typed wrappers for existing catalog, category, detail, and similar-product routes; no backend source or endpoint behavior was changed.

### Verification performed

- `npm run build` passes (`tsc` and Vite production build).
- Local API smoke checks returned 21 categories and 128 catalog products; searching `laptop` returned 31 matches. The UI displayed 12 per page, and the two-product comparison rendered 20 specification/price rows.
- Browser smoke checks opened the product detail dialog and rendered 8–11 catalog specification rows plus available source evidence, opened the mobile navigation and filter drawer, and confirmed the dark theme survives a reload. System theme emulation switched between dark and light while the saved preference remained `system`.
- Checked viewport/document widths at 1920, 1440, 1366, 1024, 768, 390, 375, and 320 px. The document did not overflow horizontally; the navigation switches to the menu layout at tablet widths.
- Admin route smoke check rendered the existing collector page and token field at `/admin`.

### Remaining product/data limits

- Search still follows backend parser and ranking behavior. Filtering, sorting, and pagination apply to the returned items only (up to 60 per query); the UI discloses when more backend matches exist.
- There is no chat API, so the assistant section submits a natural-language search and displays backend-provided query understanding, without generating conversation text. Similar products can be empty when the existing endpoint has no matches. Missing price, image, variant, evidence, or specification data stays visibly missing.
- No automated accessibility suite or standalone frontend test runner is configured in the frontend package. The checks above are build and browser smoke checks, not a claim of exhaustive assistive-technology coverage.
