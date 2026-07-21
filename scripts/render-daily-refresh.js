const appUrl = String(process.env.AIMATE_APP_URL || process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
const cronSecret = process.env.CRON_SECRET || process.env.AIMATE_CRON_SECRET || '';

async function main() {
  if (!appUrl) {
    throw new Error('AIMATE_APP_URL is required for the Render daily refresh cron job.');
  }

  if (!cronSecret) {
    throw new Error('CRON_SECRET is required for the Render daily refresh cron job.');
  }

  const response = await fetch(`${appUrl}/api/cron/daily-refresh`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json'
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Daily refresh failed with ${response.status}: ${text.slice(0, 1000)}`);
  }

  console.log(text);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
