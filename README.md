# ABBA Broker

Backend service for ABBA AI managed app publishing. Accepts publish bundles from the desktop app and deploys them to Vercel.

## Overview

The ABBA Broker enables one-click publishing from the ABBA AI desktop app. Users don't need GitHub, Vercel, or any third-party accounts - just click "Publish" and get a live URL.

**Architecture:**

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   ABBA AI App   │────▶│   ABBA Broker    │────▶│     Vercel      │
│   (Desktop)     │     │   (This Service) │     │   (Hosting)     │
└─────────────────┘     └──────────────────┘     └─────────────────┘
        │                        │
        │   Device Token         │   Vercel Token
        │   Auth Header          │   (Server-side only)
```

## API Endpoints

### Health Check

```
GET /api/health
```

Returns `{ ok: true, time: "2024-01-01T00:00:00.000Z" }`

### Authenticated Health Check

```
GET /api/health/auth
Header: x-abba-device-token: <token>
```

Validates the device token without performing any other operation.

**Responses:**

- `200`: `{ ok: true, auth: "ok", time: "..." }` — Token is valid
- `401`: `{ error: "Unauthorized", message: "Missing device token" }` — Header not provided
- `401`: `{ error: "Unauthorized", message: "Invalid device token" }` — Token doesn't match
- `503`: `{ error: "BrokerMisconfigured", message: "ABBA_DEVICE_TOKEN not configured on server..." }` — Server env not set

**Security:** This endpoint never returns the actual token value. Use it to verify token configuration without risking exposure.

### Start Publish

```
POST /api/v1/publish/start
Header: x-abba-device-token: <token>
Body: {
  appId: number,
  bundleHash: string,
  bundleSize: number,
  appName?: string,
  profileId?: string
}
```

Returns `{ publishId, status, uploadUrl }`

### Upload Bundle

```
PUT /api/v1/publish/upload?publishId=<id>
Header: x-abba-device-token: <token>
Content-Type: multipart/form-data OR application/octet-stream
Body: Bundle ZIP file
```

Returns `{ success, message, deploymentId? }`

### Complete Publish

```
POST /api/v1/publish/complete
Header: x-abba-device-token: <token>
Body: { publishId: string }
```

Returns `{ success, status, url?, error? }`

### Check Status

```
GET /api/v1/publish/status?publishId=<id>
Header: x-abba-device-token: <token>
```

Returns `{ status, progress?, message?, url?, error? }`

Status values: `queued`, `packaging`, `uploading`, `building`, `deploying`, `ready`, `failed`, `cancelled`

### Cancel Publish

```
POST /api/v1/publish/cancel
Header: x-abba-device-token: <token>
Body: { publishId: string }
```

Returns `{ success, status }`

## Deployment

### Deploy to Vercel

1. Fork or clone this repository
2. Connect to Vercel: `vercel link`
3. Set environment variables (see below)
4. Deploy: `vercel --prod`

### Environment Variables

| Variable                    | Required | Description                                                            |
| --------------------------- | -------- | ---------------------------------------------------------------------- |
| `ABBA_DEVICE_TOKEN`         | Yes      | Shared secret for authenticating desktop app requests                  |
| `BROKER_VERCEL_TOKEN`       | Yes      | Vercel API token for deployments (create at vercel.com/account/tokens) |
| `VERCEL_TEAM_ID`            | No       | Deploy apps to a specific Vercel team                                  |
| `SUPABASE_URL`              | No\*     | Supabase project URL                                                   |
| `SUPABASE_SERVICE_ROLE_KEY` | No\*     | Supabase service role key                                              |

\*If Supabase is not configured, the broker uses an in-memory store (jobs won't persist across restarts).

### Token Setup Checklist

1. **Generate a secure token** (at least 32 characters):
   ```bash
   openssl rand -hex 32
   ```
2. **Set `ABBA_DEVICE_TOKEN` in Vercel**:
   - Go to your Vercel project → Settings → Environment Variables
   - Add `ABBA_DEVICE_TOKEN` with your generated token
   - **Important**: Changes to environment variables require a new deployment to take effect
3. **Redeploy the broker**:
   ```bash
   vercel --prod
   ```
4. **Copy the same token to ABBA AI desktop** via Owner Setup or Admin Config (Ctrl+Shift+K)
5. **Test the connection** using the "Test Connection" button in Admin Config

**Common Issues:**

| Error Code               | Meaning                               | Solution                                       |
| ------------------------ | ------------------------------------- | ---------------------------------------------- |
| 503 BrokerMisconfigured  | `ABBA_DEVICE_TOKEN` not set on server | Set env var in Vercel and redeploy             |
| 401 Missing device token | Client didn't send token header       | Check desktop token is saved                   |
| 401 Invalid device token | Token mismatch                        | Ensure desktop and broker use exact same token |

### Supabase Setup

To persist publish jobs, create a Supabase project and run the migration:

```sql
-- See supabase/migrations/001_create_publish_jobs.sql
```

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build
```

## Security

- Device tokens are validated using constant-time comparison
- Rate limiting: 60 requests/minute per IP
- Max bundle size: 50MB
- Token values are never logged; only safe hash prefixes (first 8 chars of SHA256) are logged for debugging
- All secrets are stored server-side only
- Server logs include safe diagnostics: `serverConfigured`, `headerPresent`, `serverHash`, `clientHash`

## Example: Publish Flow

```bash
# 1. Start publish
curl -X POST https://your-broker.vercel.app/api/v1/publish/start \
  -H "x-abba-device-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"appId": 123, "bundleHash": "abc123", "bundleSize": 1024}'

# Response: {"publishId": "uuid", "status": "queued", "uploadUrl": "/api/v1/publish/upload?publishId=uuid"}

# 2. Upload bundle
curl -X PUT "https://your-broker.vercel.app/api/v1/publish/upload?publishId=uuid" \
  -H "x-abba-device-token: $TOKEN" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @bundle.zip

# Response: {"success": true, "message": "Bundle uploaded, deployment started"}

# 3. Poll status
curl "https://your-broker.vercel.app/api/v1/publish/status?publishId=uuid" \
  -H "x-abba-device-token: $TOKEN"

# Response: {"status": "ready", "progress": 100, "url": "https://abba-app-123-abc123.vercel.app"}
```

## License

Proprietary - ABBA AI
