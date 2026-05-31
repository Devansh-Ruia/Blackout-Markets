# Private Demo Deployment

Blackout Markets is a TypeScript React + Express MVP. The production build creates static React files in `dist-web`, and the Express server serves both the API and built UI from the same process.

## Local Dev

Install dependencies:

```bash
npm install
```

Run the web and API dev servers:

```bash
npm run dev
```

Local URLs:

- Web UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:3001`

## Production Build

Build the React app and type-check the TypeScript code:

```bash
npm run build
```

Start the Express server:

```bash
npm start
```

After `npm run build`, the server serves:

- React UI from `dist-web`
- API endpoints from `/api/*`
- Health check at `/api/health`

## Environment Assumptions

- Node.js 20 or newer is recommended.
- `PORT` controls the Express port. Default: `3001`.
- `HOST` controls the bind address. Default: `127.0.0.1`.
- Use `HOST=0.0.0.0` on platforms that need the process to bind externally.
- This MVP does not require a database.
- This MVP does not require cloud credentials.
- `npm start`, `npm run report`, and `npm run demo:reports` use `tsx`, so install dev dependencies for this private demo unless the server is bundled in a later release.

## Suggested Deployment Shape

Use one private web service:

1. Install dependencies.
2. Run `npm run build`.
3. Start with `npm start`.
4. Set `PORT` from the platform.
5. Set `HOST=0.0.0.0`.
6. Restrict access at the platform, network, VPN, or reverse-proxy layer.

Do not split the React app and API unless there is a specific reason. The current repo is simpler as one service.

## Render

Render is suitable for a private demo if access is restricted outside the app.

Suggested settings:

- Runtime: Node
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Environment:
  - `HOST=0.0.0.0`
  - `PORT` set by Render

If the deploy environment omits dev dependencies, keep dev dependencies installed for this MVP because `npm start` uses `tsx`.

## Fly.io

Fly.io is suitable if the app is placed behind private networking, an allowlist, or another access control layer.

Suggested settings:

- Build with the default Node build flow or a small Dockerfile.
- Run `npm run build` during image build.
- Start with `npm start`.
- Set `HOST=0.0.0.0`.
- Map the internal service port to `PORT`.

## What Not To Expose Publicly

Do not expose an unrestricted public upload endpoint. The app has no auth, no tenant isolation, no rate limiting, no malware scanning, and no long-term storage design. Treat it as a private demo tool for trusted design partners.

Do not include secrets, cloud credentials, production scheduler tokens, private prompts, model contents, user data, source code, billing credentials, or customer names in uploaded files.

## Deployment Test

After deploy:

1. Visit `/api/health` and confirm it returns `{ "ok": true }`.
2. Open the root URL and confirm the React app loads.
3. Upload fixture files from `fixtures/normal-week/`.
4. Use the matching `policy.json`.
5. Run the retrospective report.
6. Export diagnostic Markdown and recommendations CSV.
7. Confirm the report says shadow mode only and contains no production secrets.

CLI report generation does not require the web server:

```bash
npm run demo:reports
```

## Known Deployment Limits

- No auth.
- No database.
- No persistent report store.
- No background job queue.
- No cloud provider integration.
- No scheduler integration.
- No file scanning.
- No multi-tenant isolation.
- No bundled server output; runtime uses `tsx`.
- Upload limits are intentionally small for a private diagnostic workflow.
