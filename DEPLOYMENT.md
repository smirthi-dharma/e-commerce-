# Deploy the full Pandiyan Stores application

Use the repository root as the Vercel project Root Directory. Do not select `frontend`: that deploys the SPA without Django and can return `index.html` for API requests. The root `vercel.json` owns both services. Vercel Services is currently in beta.

## Project settings

- Git repository: `smirthi-dharma/e-commerce-`.
- Root Directory: blank (repository root).
- Framework preset: Other / automatic detection. Frameworks are set per service.
- Leave project-level install, build and output overrides empty; the service configuration owns them.
- Do not set `VITE_API_BASE_URL` to localhost in Preview or Production. The frontend defaults to same-origin `/api/v1` in production.

Public `/api`, `/api/*`, `/django-admin/*`, and `/static/*` requests go to the backend service before the frontend catch-all is considered. Django already handles the `/api/v1` prefix, so do not strip it. Only the frontend service applies the SPA rewrite. Django's `STATIC_ROOT` enables Vercel to collect and serve framework assets. The backend uses Python 3.13 and installs the pinned requirements lockfile.

## Backend environment and database

Set these directly in Vercel, without committing credentials:

- `DJANGO_SECRET_KEY`: a unique production secret.
- `DJANGO_DEBUG=False`.
- `DATABASE_URL`: the persistent PostgreSQL connection string (automatically supplied by the Neon integration). SSL is required by default, connections close after each request, and server-side cursors are disabled for pooled connections. `POSTGRES_URL` is also accepted.
- For an existing MySQL installation instead, set `DB_ENGINE=mysql` and `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`.
- `DJANGO_ALLOWED_HOSTS` for any custom domain. Vercel's deployment and production hostnames are added automatically.

Do not upload a local SQLite database or sample inventory. Vercel function storage does not persist customer accounts, inventory or orders. Reuse the existing database when repairing a production deployment. Back it up before migrations, then apply `python manage.py migrate` against the intended persistent database. Migrations are a separate operation and are not run during every build.

For Neon migrations, temporarily use `DATABASE_URL_UNPOOLED` as `DATABASE_URL` in the migration process. New installations start empty; create the administrator with `python manage.py createsuperuser` using a private terminal prompt. Never commit database credentials or administrator passwords.

## Release gate for schema changes

Vercel deploys `main` to production automatically, but migrations are manual. Merging a PR that contains a migration therefore breaks every query touching the new column until the migration is applied (PR #17 caused a products 500 this way). `/api/health/` stays green because it does not query the database.

For any PR that adds a migration:

1. Back up the Neon `main` branch (create a Neon branch or snapshot) and record its link in the PR.
2. Use a clean checkout of the exact reviewed PR commit (`git status` clean, `git rev-parse HEAD` matches the PR head) that is up to date with `main`. Never migrate from a working copy with other local migrations.
3. Run `python manage.py migrate --plan` against Neon (`DATABASE_URL_UNPOOLED`) and confirm it lists only the PR's migrations. Then apply it with `python manage.py migrate`. If the migration files or their dependencies change before merge (including after rebasing onto `main`), recheck the plan.
4. Keep the change additive (new nullable column or table) so the previous deployment still works against the new schema. Record the plan output and backup in the PR.
5. Merge. Vercel builds the production deployment.
6. Run `node scripts/verify-deployment.mjs <deployment-url>` (needs no database credentials). The products and categories checks exercise the database.
7. If products return 500, roll back to the last deployment that works with the schema now in Neon, then fix forward.

## Rollback and destructive changes

Rolling back a Vercel deployment does not roll back the database. The rollback target must work with the schema already in Neon, so only roll back to a deployment built before an additive migration, never before a destructive one.

Never drop or rename a column in the same release that stops using it. For a rename, use separate releases:

1. Add the new column (additive migration, applied before merge).
2. Release code that writes both columns and copies existing data across.
3. Release code that removes every application reference to the old column: reads, dual writes and the Django model field. Make the old column nullable beforehand (additive step in release 2 or earlier) so inserts that omit it still succeed. Keep the physical column in Neon.
4. After release 3 is deployed and verified, drop the old column in a later release. Dropping it earlier means rolling back to release 2 or 3 could select or write a missing column and return 500s.

## Stage, check and release

Deploy the PR branch as a preview, or stage a production build with `vercel deploy --prod --skip-domain` from the repository root. Verify the exact deployment before promoting it:

```sh
node scripts/verify-deployment.mjs https://your-deployment.vercel.app
```

The check reads `/api/health/`, categories, products, public store settings and the `/products` SPA deep link. It fails if API requests return HTML, an error status or an unexpected response shape. `/api/health/` confirms Django routing without connecting to the database; the catalogue checks additionally verify the database is usable. For protected previews, use Vercel's authenticated access tools instead of disabling deployment protection.

Complete a browser pass of category/search, cart stock validation and sign-in continuation. Promote only the verified production build with `vercel promote <deployment-url>`. A successful frontend build alone does not establish that the backend was deployed.

Sources: [Services routing](https://vercel.com/docs/services/routing), [service configuration](https://vercel.com/docs/services/config-reference), and [Django deployment](https://vercel.com/docs/frameworks/full-stack/django).
