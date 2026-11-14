// Operator CLI: npm run cache:purge -w @projectx/edge -- --tags tax,qlist
// REQUIRES APPROVAL: calls the live Cloudflare API. Env: CF_ZONE_ID, CF_API_TOKEN_PURGE.
import { createZoneApiInvalidator } from '../invalidators';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const tags = (arg('tags') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const zoneId = process.env.CF_ZONE_ID;
const apiToken = process.env.CF_API_TOKEN_PURGE;
if (tags.length === 0) {
  console.error('usage: cache:purge --tags tag1,tag2   (env: CF_ZONE_ID, CF_API_TOKEN_PURGE)');
  process.exit(2);
}
if (!zoneId || !apiToken) {
  console.error('CF_ZONE_ID and CF_API_TOKEN_PURGE must be set');
  process.exit(2);
}
const res = await createZoneApiInvalidator({ zoneId, apiToken }).purgeTags(tags);
console.log(JSON.stringify(res));
process.exit(res.ok ? 0 : 1);
