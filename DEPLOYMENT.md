# Deployment

Carrick Games deploys through GitHub Actions after every push to `main`.

## Production Flow

1. Install dependencies with `npm ci`.
2. Build with `npm run build`.
3. Run Playwright e2e tests with `npm run test:e2e`.
4. Package only production assets:
   - `index.html`
   - `dist/`
   - `fonts/`
5. Upload the package over SSH to the server.
6. Extract it into `/var/www/games.carrick7.com/releases/<git-sha>/`.
7. Atomically update `/var/www/games.carrick7.com/current`.
8. Smoke test the public URL.

Caddy serves:

```caddy
games.carrick7.com {
	root * /var/www/games.carrick7.com/current
	encode gzip
	file_server
}
```

## Required GitHub Secrets

Repository or `production` environment secrets:

- `DEPLOY_HOST`: SSH host, currently `games.carrick7.com`
- `DEPLOY_USER`: SSH user, currently `ubuntu`
- `DEPLOY_PATH`: deploy root, currently `/var/www/games.carrick7.com`
- `DEPLOY_URL`: public URL, currently `https://games.carrick7.com`
- `DEPLOY_SSH_KEY`: private key for the deploy user
- `DEPLOY_KNOWN_HOSTS`: pinned SSH host key lines for `DEPLOY_HOST`

## Rollback

List available releases:

```bash
ssh ubuntu@games.carrick7.com 'ls -1dt /var/www/games.carrick7.com/releases/*'
```

Switch to a previous release:

```bash
ssh ubuntu@games.carrick7.com '
  set -euo pipefail
  deploy_root=/var/www/games.carrick7.com
  release=releases/<release-id>
  test -f "$deploy_root/$release/index.html"
  ln -sfn "$release" "$deploy_root/current.new"
  mv -Tf "$deploy_root/current.new" "$deploy_root/current"
'
```
