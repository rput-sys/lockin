import { Router } from 'express';
import { generateSchedule, getDailyMotivation } from '../services/claude.js';
import { getEventsForDate, writeEventsToCalendar } from '../services/googleCalendar.js';
import supabase from '../lib/supabase.js';

const router = Router();

/**
 * POST /schedule/generate
 * Body: { transcript: string, date?: string }
 *
 * Main endpoint called by iOS app after voice recording.
 * 1. Fetches existing Google Calendar events
 * 2. Sends to Claude for intelligent scheduling
 * 3. Writes new events back to Google Calendar
 * 4. Saves plan to Supabase (for web dashboard + iOS sync)
 * 5. Returns complete schedule
 */
router.post('/generate', async (req, res) => {
  const { transcript, date } = req.body;

  if (!transcript || transcript.trim().length < 5) {
    return res.status(400).json({ error: 'Transcript is too short or missing.' });
  }

  const targetDate = date || getTomorrow();
  console.log(`[Schedule] Generating for ${targetDate}...`);

  try {
    // 1. Fetch existing calendar events
    let existingEvents = [];
    try {
      existingEvents = await getEventsForDate(targetDate);
      console.log(`[Schedule] Found ${existingEvents.length} existing events`);
    } catch (calErr) {
      console.warn('[Schedule] Could not fetch calendar events:', calErr.message);
      // Continue without — calendar might not be connected yet
    }

    // 2. Ask Claude to schedule everything
    const schedule = await generateSchedule({ transcript, existingEvents, targetDate });
    console.log(`[Schedule] Claude scheduled ${schedule.scheduled?.length} items`);

    // 3. Get a motivational line
    let motivation = '';
    try {
      motivation = await getDailyMotivation(schedule.totalTasks);
    } catch (_) {}

    // 4. Save to Supabase
    const { data: saved, error: dbErr } = await supabase
      .from('daily_plans')
      .upsert({
        date:        targetDate,
        schedule:    schedule.scheduled,
        unscheduled: schedule.unscheduled || [],
        summary:     schedule.summary,
        motivation,
        raw_transcript: transcript,
        updated_at:  new Date().toISOString()
      }, { onConflict: 'date' })
      .select()
      .single();

    if (dbErr) console.error('[DB] Failed to save plan:', dbErr.message);

    // 5. Write to Google Calendar (async, don't block response)
    writeEventsToCalendar(schedule.scheduled, targetDate)
      .then(results => console.log(`[GCal] Wrote ${results.filter(r=>r.status==='created').length} events`))
      .catch(err => console.error('[GCal] Write failed:', err.message));

    // 6. Broadcast to Supabase Realtime so web + iOS update instantly
    await supabase.channel('plan_updates').send({
      type: 'broadcast',
      event: 'new_plan',
      payload: { date: targetDate, itemCount: schedule.scheduled.length }
    });

    return res.json({
      success: true,
      date: targetDate,
      schedule: schedule.scheduled,
      unscheduled: schedule.unscheduled || [],
      summary: schedule.summary,
      motivation,
      id: saved?.id
    });

  } catch (err) {
    console.error('[Schedule] Error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /schedule/today
 * Returns today's plan from DB
 */
router.get('/today', async (req, res) => {
  const today = getToday();
  const { data, error } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('date', today)
    .single();

  if (error) return res.status(404).json({ error: 'No plan for today.' });
  return res.json(data);
});

/**
 * GET /schedule/:date
 * Returns plan for a specific date
 */
router.get('/:date', async (req, res) => {
  const { date } = req.params;
  const { data, error } = await supabase
    .from('daily_plans')
    .select('*')
    .eq('date', date)
    .single();

  if (error) return res.status(404).json({ error: `No plan for ${date}.` });
  return res.json(data);
});

/**
 * PATCH /schedule/task/:id/complete
 * Mark a task as complete
 */
router.patch('/task/:taskId/complete', async (req, res) => {
  const { taskId } = req.params;
  const { date, completed } = req.body;

  const targetDate = date || getToday();
  const { data: plan } = await supabase
    .from('daily_plans')
    .select('schedule')
    .eq('date', targetDate)
    .single();

  if (!plan) return res.status(404).json({ error: 'Plan not found' });

  const updated = plan.schedule.map(t =>
    t.id === parseInt(taskId) ? { ...t, completed: completed ?? true } : t
  );

  await supabase
    .from('daily_plans')
    .update({ schedule: updated })
    .eq('date', targetDate);

  // Broadcast task completion
  await supabase.channel('plan_updates').send({
    type: 'broadcast',
    event: 'task_updated',
    payload: { date: targetDate, taskId, completed }
  });

  return res.json({ success: true });
});

// ─── Helpers ─────────────────────────────────────────────────
function getToday() {
  return new Date().toISOString().split('T')[0];
}
function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default router;
