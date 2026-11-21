# Brand Asset & Logo Extractor API

Zero-dependency Node.js microservice that extracts company logos, favicons, brand hex color palettes, fonts, social links, and OpenGraph metadata from any public domain.

## Endpoints

- `GET /v1/brand?domain=stripe.com`
- `GET /openapi.json`
- `GET /health`

## Local Run & Test

```bash
npm test
npm start
```

## RapidAPI Deployment Checklist

1. Deploy this service to Railway, Render, Fly.io, or any Docker host.
2. Set `RAPIDAPI_PROXY_SECRET` in your hosting environment variables using the secret generated in RapidAPI Studio.
3. In RapidAPI Studio, import `https://<your-host>/openapi.json`.
4. Configure pricing tiers:
   - Basic Free: 100 requests/month ($0)
   - Pro: 10,000 requests/month ($9/month)
   - Ultra: 100,000 requests/month ($29/month)
5. Connect your payout account in RapidAPI Provider Billing.
