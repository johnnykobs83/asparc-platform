/**
 * Creates the "ASPARC" property group and custom contact properties in HubSpot.
 * Safe to re-run. Requires HUBSPOT_ACCESS_TOKEN with crm.schemas.contacts.write.
 *   npm run hubspot:setup
 */
import { isHubSpotConfigured, setupHubSpotProperties, testHubSpotConnection } from '../lib/integrations/hubspot';

async function main() {
  if (!isHubSpotConfigured()) throw new Error('Set HUBSPOT_ACCESS_TOKEN in .env.local first.');
  for (const line of await setupHubSpotProperties()) console.log(' •', line);
  console.log((await testHubSpotConnection()).message);
}
main().catch((e) => {
  console.error('✖', e instanceof Error ? e.message : e);
  process.exit(1);
});
