// core/report-scheduler.js
// Registers cron jobs for daily/weekly/monthly automated report emails.
// All three jobs are always registered; each checks the current email
// settings at fire-time and only actually sends if scheduling is
// enabled and its frequency matches -- so changing settings via the UI
// takes effect immediately without needing a server restart.

const cron = require('node-cron');
const { sendReportEmail } = require('./report-mailer');

const SCHEDULES = [
  { frequency: 'daily', cronExpr: '0 8 * * *', range: 'today' }, // 8am every day
  { frequency: 'weekly', cronExpr: '0 8 * * 1', range: 'week' }, // 8am every Monday
  { frequency: 'monthly', cronExpr: '0 8 1 * *', range: 'month' } // 8am on the 1st
];

function startScheduler({ reportGenerator, storeProfile, emailSettings }) {
  const tasks = SCHEDULES.map(({ frequency, cronExpr, range }) =>
    cron.schedule(cronExpr, async () => {
      const settings = await emailSettings.get();
      if (!settings.scheduleEnabled || settings.scheduleFrequency !== frequency) return;
      try {
        await sendReportEmail({ range, reportGenerator, storeProfile, emailSettings });
        console.log(`Scheduled ${frequency} report sent.`);
      } catch (err) {
        console.error(`Scheduled ${frequency} report failed:`, err.message);
      }
    })
  );

  return function stopScheduler() {
    tasks.forEach((task) => task.stop());
  };
}

module.exports = { startScheduler };
