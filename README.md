# Reply Pulse AI: Review Replies

Reply Pulse AI: Review Replies is a Shopify public embedded app configured to run as one app container on the shared Shopify apps infrastructure.

## Runtime

- Shared Caddy and PostgreSQL live in `../shared-docker`.
- Reply Pulse AI: Review Replies uses the external Docker network `shared_apps`.
- Reply Pulse AI: Review Replies has its own PostgreSQL database and database user inside the shared PostgreSQL container.
- Runtime secrets belong in `.env`; `.env.example` documents the required keys.
- `APP_ENV=development` is the default local mode and uses SQLite through `DEV_DATABASE_URL`.
- `APP_ENV=production` uses PostgreSQL through `DATABASE_URL` and publishes `SHOPIFY_APP_URL` from `PROD_SHOPIFY_APP_URL` in Docker.
- In development, `shopify app dev` provides the Cloudflare tunnel URL through `HOST`; Reply Pulse AI: Review Replies prefers that URL over the production `SHOPIFY_APP_URL`.
- `JUDGEME_TEST_DOMAIN_FIELD_ENABLED=true` shows the Judge.me test domain override in Connect. Leave it unset or `false` for normal installs.

## Local development

```sh
cp .env.example .env
npm run dev
```

In development, `npm run dev` runs Prisma against `prisma/schema.dev.prisma` and creates `prisma/dev.sqlite`.
Leave `SHOPIFY_APP_URL` and `DEV_SHOPIFY_APP_URL` empty to use the default Cloudflare tunnel from `shopify app dev`; set `DEV_SHOPIFY_APP_URL` only when you need a fixed development URL.
For production-like commands, set `APP_ENV=production`.

## Deploy

```sh
cd ../shared-docker
cp .env.example .env
./deploy-all.sh
```

```sh
cd ../ReplyPilot/reply-pilot-app
cp .env.example .env
# set APP_ENV=production and edit Shopify, PROD_SHOPIFY_APP_URL, PostgreSQL, and SMTP values
./deploy.sh
```

Publish Shopify app configuration after replacing placeholder domains and credentials:

```sh
npm run deploy
```

## SMTP

Production contact and privacy emails require `CONTACT_EMAIL`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, and `EMAIL_PASS`.
When using Gmail SMTP, `EMAIL_PASS` must be a Gmail App Password.
