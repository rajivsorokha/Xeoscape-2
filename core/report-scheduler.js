// core/report-scheduler.js
// Automated report emails. One job fires at the top of every hour and
// asks isDue() whether a report should go out right now, using the
// *current* email settings -- so changing the frequency or send time
// in the UI takes effect immediately, with no server restart.
//
//   daily   -> every day at the chosen hour, covering that day
//   weekly  -> Sundays at the chosen hour, covering the last 7 days
//   monthly -> the last day of the month at the chosen hour, covering
//              the last 30 days
//
// Reports go out in the evening by default (see scheduleHour in
// email-settings.js): a report sent first thing in the morning would
// describe a day in which nothing has been sold yet.
//
// The app has to be running at that hour -- a closed app can't send.

const cron = require('node-cron');
const { sendReportEmail } = require('./report-mailer');

const RANGE_FOR = { daily: 'today', weekly: 'week', monthly: 'month' };

function isLastDayOfMonth(date) {
  const tomorrow = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
  return tomorrow.getDate() === 1;
}

/**
 * @returns {string|null} the report range to send now, or null if nothing is due
 */
function dueRange(settings, now = new Date()) {
  if (!settings.scheduleEnabled) return null;
  if (now.getHours() !== Number(settings.scheduleHour ?? 21)) return null;
  switch (settings.scheduleFrequency) {
    case 'daily': return RANGE_FOR.daily;
    case 'weekly': return now.getDay() === 0 ? RANGE_FOR.weekly : null;
    case 'monthly': return isLastDayOfMonth(now) ? RANGE_FOR.monthly : null;
    default: return null;
  }
}

function startScheduler({ reportGenerator, storeProfile, emailSettings }) {
  const task = cron.schedule('0 * * * *', async () => {
    try {
      const settings = await emailSettings.get();
      const range = dueRange(settings);
      if (!range) return;
      await sendReportEmail({ range, reportGenerator, storeProfile, emailSettings });
      console.log(`Scheduled ${settings.scheduleFrequency} report sent.`);
    } catch (err) {
      console.error('Scheduled report failed:', err.message);
    }
  });

  return function stopScheduler() {
    task.stop();
  };
}

module.exports = { startScheduler, dueRange, isLastDayOfMonth };
