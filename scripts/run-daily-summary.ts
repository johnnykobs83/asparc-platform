/** Manually generate the daily summary:  npm run summary:run -- 2026-11-09 */
import { runDailySummary } from '../lib/reports/daily-summary';

runDailySummary({ date: process.argv[2] })
  .then((s) => console.log(`✔ Summary for ${s.summary_date} (email: ${s.email_status})`))
  .catch((e) => {
    console.error('✖', e);
    process.exit(1);
  });
