#!/usr/bin/env bash
# provision-do.sh — Spin up DigitalOcean infrastructure for a new
# Forjio SaaS product. Step 10 of the TEMPLATE.md walkthrough.
#
# Idempotent: each step checks state first and skips when done so
# re-runs after a partial failure pick up where they left off.
#
# What it does:
#   1. ONE droplet — prd-<brand> — in sgp1. PRODUCTION ONLY.
#   2. DNS A records on both .com and .forjio.com zones, including
#      staging-<brand>.forjio.com → the SHARED staging box
#   3. install.sh on the prod droplet (node, pnpm, pm2, nginx, certbot,
#      postgres 16, 2GB swap)
#   4. certbot --webroot for TLS on the prod domains (NOT --nginx — see
#      feedback_nginx_auth_request_no_rotation)
#   5. Print the shared-staging registration checklist + verification
#
# STAGING IS NOT A DROPLET (2026-06-15 consolidation). Every product's
# staging lives on the ONE shared box (stg-shared). This script used to
# create a per-product `stg-<brand>` droplet; that is gone. It now only
# points staging-<brand>.forjio.com at the shared box and prints the
# box-side registration steps (port pair, DB, .env, CI pubkey, nginx
# vhost) — spawn-product skill, Phase 1 step 8. Do NOT re-add a staging
# droplet: the 10 old ones were destroyed to cut ~$48/mo.
#
# Prereqs:
#   - doctl authenticated (`doctl auth init`). NOTE: the default doctl
#     token is READ-ONLY — creates need the write PAT (DO_API_TOKEN in
#     /etc/catentio/saas-cp.env). See reference_do_tokens.
#   - SSH key registered with DO + path in $DO_SSH_KEY (default ~/.ssh/id_ed25519)
#   - The .com domain you own already added to DO's DNS section (`doctl
#     compute domain create <brand>.com` if not). .forjio.com is
#     already managed.
#
# Usage:
#   ./scripts/provision-do.sh <brand> [<region>]
#   ./scripts/provision-do.sh kalium sgp1
set -euo pipefail

BRAND="${1:?usage: provision-do.sh <brand> [<region>]}"
REGION="${2:-sgp1}"
DO_SSH_KEY="${DO_SSH_KEY:-$HOME/.ssh/id_ed25519}"

if [[ ! "$BRAND" =~ ^[a-z][a-z0-9-]{1,30}$ ]]; then
  echo "error: brand must be lowercase alphanumeric/hyphen (got '$BRAND')" >&2
  exit 2
fi

PROD_NAME="prd-$BRAND"

# Droplet sizes — locked per the canonical playbook. Bump only if a
# product genuinely needs more headroom (most don't until > 10k MAU).
PROD_SIZE="s-2vcpu-2gb"      # $18/mo
IMAGE="ubuntu-24-04-x64"

# The SHARED staging box (stg-shared, sgp1). Staging for EVERY product
# is a vhost + port pair on this one box — never a new droplet.
#   - public IP: what staging-<brand>.forjio.com resolves to
#   - tailnet IP: how CI actually reaches it (deploy-staging / e2e /
#     visual-regression join the tailnet and map STAGING_HOST → this in
#     /etc/hosts). The box is tailnet-routable; keep both in sync.
SHARED_STAGING_IP="${SHARED_STAGING_IP:-129.212.234.54}"
SHARED_STAGING_TAILNET_IP="${SHARED_STAGING_TAILNET_IP:-100.123.65.113}"
STAGING_HOST="staging-$BRAND.forjio.com"

# log() writes to STDERR — several call sites run inside $(…) command
# substitution (e.g. ensure_droplet), and stdout-logging corrupted the
# captured values (template bug found spawning suppuo).
log() { echo >&2 "[provision-do] $*"; }
err() { echo "[provision-do] ERROR: $*" >&2; exit 1; }

# ─── Pre-flight ───────────────────────────────────────────────────────

command -v doctl >/dev/null || err "doctl not found — install + run 'doctl auth init'"
doctl account get >/dev/null 2>&1 || err "doctl not authenticated — run 'doctl auth init'"

[[ -r "$DO_SSH_KEY" ]] || err "SSH key not readable at $DO_SSH_KEY (set DO_SSH_KEY=...)"

# doctl returns MD5-format fingerprints, so match on MD5 (the original
# SHA256 comparison never matched — template bug found spawning suppuo).
DO_SSH_FINGERPRINT="$(ssh-keygen -lf "$DO_SSH_KEY" -E md5 | awk '{print $2}' | sed 's|MD5:||')"
DO_KEY_ID="$(doctl compute ssh-key list --format ID,FingerPrint --no-header | awk -v fp="$DO_SSH_FINGERPRINT" '$2==fp {print $1; exit}')"
[[ -n "$DO_KEY_ID" ]] || err "$DO_SSH_KEY not registered with DigitalOcean. Run 'doctl compute ssh-key import'."

log "brand=$BRAND region=$REGION ssh-key=$DO_KEY_ID"

# ─── Step 1: Droplet (production only) ───────────────────────────────

ensure_droplet() {
  local name="$1" size="$2"
  local existing_id
  existing_id="$(doctl compute droplet list --format ID,Name --no-header | awk -v n="$name" '$2==n {print $1; exit}')"
  if [[ -n "$existing_id" ]]; then
    log "✓ droplet $name already exists (id=$existing_id)"
    echo "$existing_id"
    return
  fi
  log "creating droplet $name ($size)…"
  doctl compute droplet create "$name" \
    --image "$IMAGE" \
    --size "$size" \
    --region "$REGION" \
    --ssh-keys "$DO_KEY_ID" \
    --tag-name "forjio-family,$BRAND" \
    --wait \
    --format ID --no-header
}

# Production only. Staging is a vhost on the shared box — see the
# header and Step 5. Never add a stg-<brand> droplet here.
PROD_ID="$(ensure_droplet "$PROD_NAME" "$PROD_SIZE")"

PROD_IP="$(doctl compute droplet get "$PROD_ID" --format PublicIPv4 --no-header)"
log "  prod:    $PROD_IP"
log "  staging: $SHARED_STAGING_IP (shared box — no droplet created)"

# ─── Step 2: DNS records on both zones ───────────────────────────────

ensure_a_record() {
  local zone="$1" name="$2" ip="$3"
  local existing
  existing="$(doctl compute domain records list "$zone" --format ID,Type,Name,Data --no-header \
    | awk -v n="$name" -v ip="$ip" '$2=="A" && $3==n && $4==ip {print $1; exit}')"
  if [[ -n "$existing" ]]; then
    log "  ✓ $zone $name → $ip (record $existing)"
    return
  fi
  # Delete any stale record for the same name first so we don't dupe.
  local stale_id
  stale_id="$(doctl compute domain records list "$zone" --format ID,Type,Name --no-header \
    | awk -v n="$name" '$2=="A" && $3==n {print $1}')"
  if [[ -n "$stale_id" ]]; then
    log "  removing stale $zone $name → (was wrong IP), record $stale_id"
    doctl compute domain records delete "$zone" "$stale_id" --force
  fi
  log "  creating $zone $name → $ip"
  doctl compute domain records create "$zone" \
    --record-type A --record-name "$name" --record-data "$ip" --record-ttl 300 \
    --format ID --no-header >/dev/null
}

# .forjio.com zone — every product has its .forjio.com mirror, and its
# staging vhost. staging-<brand> points at the SHARED box, not a droplet;
# nginx there routes the ~10 staging vhosts by Host header.
log "DNS records on forjio.com zone…"
ensure_a_record "forjio.com" "$BRAND" "$PROD_IP"
ensure_a_record "forjio.com" "staging-$BRAND" "$SHARED_STAGING_IP"

# <brand>.com zone — only if the user has added it to DO. Bail
# cleanly if not. NOTE: no staging.<brand>.com record — the staging
# hostname is staging-<brand>.forjio.com (above), which is what
# STAGING_HOST / the CI deploy + e2e jobs use.
if doctl compute domain get "$BRAND.com" >/dev/null 2>&1; then
  log "DNS records on $BRAND.com zone…"
  ensure_a_record "$BRAND.com" "@" "$PROD_IP"
  ensure_a_record "$BRAND.com" "www" "$PROD_IP"
else
  log "⚠ $BRAND.com not in DO DNS yet. Add it after registering the domain:"
  log "    doctl compute domain create $BRAND.com --ip-address $PROD_IP"
  log "    then re-run this script to add the A records."
fi

# ─── Step 3: install.sh on the prod droplet ──────────────────────────

# Prod only. The shared staging box is already provisioned — its base +
# the two class-fixes are codified in /opt/saas/setup-box.sh ON the box.
# Never run install.sh against the shared box: it would stomp the nginx
# and postgres config the other ~10 products' staging depends on.
INSTALL_SCRIPT="$(dirname "$0")/install.sh"
if [[ ! -f "$INSTALL_SCRIPT" ]]; then
  log "⚠ scripts/install.sh missing in this template — skipping install step."
  log "  Copy the canonical playbook from saas-plugipay/scripts/ or"
  log "  reference_forjio_deploy_playbook.md, drop at scripts/install.sh,"
  log "  then re-run with --resume to pick up here."
else
  log "running install.sh on $PROD_IP (prod)…"
  # Note: this is destructive (installs packages, opens firewall
  # ports). Idempotent inside install.sh — re-runs are safe.
  scp -i "$DO_SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "$INSTALL_SCRIPT" "root@$PROD_IP:/tmp/install.sh"
  ssh -i "$DO_SSH_KEY" -o StrictHostKeyChecking=accept-new \
    "root@$PROD_IP" "FORJIO_BRAND=$BRAND bash /tmp/install.sh"
fi

# ─── Step 4: certbot (--webroot, NOT --nginx) ────────────────────────

log "TLS via certbot --webroot (run on the prod droplet)…"
log "  ssh root@$PROD_IP 'certbot certonly --webroot -w /var/www/$BRAND -d $BRAND.com -d www.$BRAND.com -d $BRAND.forjio.com --email support@forjio.com --agree-tos -n'"
log ""
log "(Skipping automated cert provisioning — first run after DNS"
log " propagation. Re-run that command once dig +short shows the IP"
log " above. The staging cert, if the product forces https, is issued"
log " ON the shared box — see Step 5.)"

# ─── Step 5: register staging on the SHARED box ──────────────────────
#
# No droplet. These steps run ON stg-shared and are the box-side half of
# the spawn (spawn-product skill, Phase 1 step 8). Left as an explicit
# checklist rather than automated: the port pair must be reconciled
# against the live ledger, and a bad guess collides with another
# product's staging.

log ""
log "─── staging = SHARED box ($SHARED_STAGING_IP, tailnet $SHARED_STAGING_TAILNET_IP) ───"
log "NO staging droplet was created (2026-06-15 consolidation). DNS for"
log "$STAGING_HOST → $SHARED_STAGING_IP is done. Now register the product ON the box:"
log ""
log "  ssh -i $DO_SSH_KEY root@$SHARED_STAGING_IP"
log ""
log "  1. Port pair — pick an unused backend+frontend pair and APPEND the"
log "     new row. The backend port must NOT be a WHATWG Fetch blocked"
log "     port (4045, 4190, 5060, 5061, 6000, 6566, 6665-6669, 6697, 10080)"
log "     or the SSR auth gate silently login-loops:"
log "       vim /opt/saas/PORTS.md"
log "  2. Staging DB + role → the staging DATABASE_URL:"
log "       sudo -u postgres createuser $BRAND && sudo -u postgres createdb -O $BRAND ${BRAND}_staging"
log "  3. App dirs:"
log "       mkdir -p /opt/saas/$BRAND/{backend,frontend}"
log "  4. Backend .env — verbatim from the prod values, with only the DB /"
log "     REDIS URLs repointed at the box's local postgres/redis. Write the"
log "     values explicitly (zsh parameter expansion mangles URLs in heredocs):"
log "       vim /opt/saas/$BRAND/backend/.env"
log "  5. CI deploy key — add the repo's deploy@saas-$BRAND pubkey:"
log "       vim /root/.ssh/authorized_keys"
log "  6. nginx vhost — server_name $STAGING_HOST;"
log "     /api/ + /health → backend port, / → frontend port. Put the"
log "     frontend location AFTER the api one and BEFORE any slug-redirect:"
log "       vim /etc/nginx/sites-available/$BRAND && nginx -t && systemctl reload nginx"
log "  7. certbot on the box IF the product forces https:"
log "       certbot certonly --webroot -w /var/www/html -d $STAGING_HOST --email support@forjio.com --agree-tos -n"
log ""
log "  CI reaches staging over the TAILNET: deploy-staging / e2e-staging /"
log "  visual-regression join as ephemeral nodes (TS_AUTHKEY) and map"
log "  STAGING_HOST → $SHARED_STAGING_TAILNET_IP in /etc/hosts. Set the repo secret:"
log "       gh secret set STAGING_HOST --body $STAGING_HOST"

# ─── Step 6: smoke ───────────────────────────────────────────────────

log ""
log "verification:"
log "  curl -sI https://$BRAND.com"
log "  curl -sI https://$BRAND.forjio.com"
log "  curl -sI http://$STAGING_HOST        # after the box-side steps above"
log ""
log "done. monthly cost: \$18 — ONE prod droplet. Staging adds \$0 (shared box)."
log "next: TEMPLATE.md Step 11 — seed demo data via scripts/seed-demo.mjs"
