# Deployment

Carrick Games deploys through GitHub Actions after every push to `main`. The same workflow can also be started manually with `workflow_dispatch`.

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

Pull requests run the build and e2e test gate but do not deploy.

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

The `production` environment currently has no required reviewers, so deployment is fully automatic.

## Verification

Check the latest workflow run:

```bash
gh run list --repo Carrick-K7/carrick-games --workflow deploy.yml --limit 3
```

Confirm Caddy is serving the latest release:

```bash
git rev-parse --short=12 HEAD
ssh ubuntu@games.carrick7.com 'readlink /var/www/games.carrick7.com/current'
curl -I https://games.carrick7.com/
```

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
