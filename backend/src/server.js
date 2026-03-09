import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cron from 'node-cron';

import authRoutes from './routes/auth.js';
import scheduleRoutes from './routes/schedule.js';
import lockInRoutes from './routes/lockin.js';
import calendarRoutes from './routes/calendar.js';
import emailRoutes from './routes/email.js';

import { sendDailyPromptNotification } from './services/notifications.js';
import { fetchRecentEmails } from './services/gmail.js';
import { extractEmailCommitments, mergeCommitmentsIntoSchedule } from './services/claude.js';
import supabase from './lib/supabase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ──────────────────────────────────────────────
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    process.env.WEB_URL || 'https://your-vercel-app.vercel.app'
  ],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// ─── Routes ─────────────────────────────────────────────────
app.use('/auth',     authRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/lockin',   lockInRoutes);
app.use('/calendar', calendarRoutes);

// Health check
app.get('/health', (_, res) => res.json({
  status: 'LOCKED IN',
  time: new Date().toISOString()
}));

// ─── Cron Jobs ───────────────────────────────────────────────
// Fire at configured time every day (default 7 PM)
const hour   = process.env.DAILY_PROMPT_HOUR   || 19;
const minute = process.env.DAILY_PROMPT_MINUTE || 0;

cron.schedule(`${minute} ${hour} * * *`, async () => {
  console.log(`[CRON] Firing daily planning prompt at ${hour}:${String(minute).padStart(2,'0')}`);
  try {
    await sendDailyPromptNotification();
  } catch (err) {
    console.error('[CRON] Failed to send notification:', err.message);
  }
}, { timezone: process.env.TIMEZONE || 'America/New_York' });

// Morning email scan — run at 8 AM daily
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Running morning email commitment scan...');
  try {
    const emails = await fetchRecentEmails({ daysBack: 1, maxResults: 20 });
    if (emails.length === 0) return;
    const result = await extractEmailCommitments(emails);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = tomorrow.toISOString().split('T')[0];
    for (const c of (result.commitments || [])) {
      await supabase.from('email_commitments').upsert({
        external_id:       `${c.source?.subject}_${c.source?.from}_${c.source?.date}`,
        title:             c.title, detail: c.detail,
        deadline:          c.deadline, deadline_label: c.deadlineLabel,
        estimated_minutes: c.estimatedMinutes, category: c.category,
        urgency:           c.urgency, emoji: c.emoji,
        source_subject:    c.source?.subject, source_from: c.source?.from, source_date: c.source?.date,
        auto_schedule:     c.autoSchedule, scheduled: false, dismissed: false,
        created_at:        new Date().toISOString()
      }, { onConflict: 'external_id' });
    }
    console.log(`[CRON] Email scan found ${result.commitments?.length || 0} commitments`);
  } catch (err) {
    console.error('[CRON] Email scan failed:', err.message);
  }
}, { timezone: process.env.TIMEZONE || 'America/New_York' });

// ─── Start ───────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`
  ⚡ LOCK IN BACKEND ONLINE
  ─────────────────────────
  Port:     ${PORT}
  Env:      ${process.env.NODE_ENV}
  Daily:    ${hour}:${String(minute).padStart(2,'0')} ${process.env.TIMEZONE}
  `);
});

export default app;
