import { Router } from 'express';
import { fetchRecentEmails, labelEmailsProcessed } from '../services/gmail.js';
import { extractEmailCommitments, mergeCommitmentsIntoSchedule } from '../services/claude.js';
import supabase from '../lib/supabase.js';

const router = Router();

/**
 * POST /email/scan
 * Scans recent emails, extracts commitments, saves them to DB.
 * Body: { daysBack?: number, maxResults?: number, autoMerge?: boolean, date?: string }
 *
 * Flow:
 * 1. Fetch emails from Gmail
 * 2. Claude reads them and extracts commitments
 * 3. Save commitments to Supabase
 * 4. Optionally merge into today's/tomorrow's schedule
 */
router.post('/scan', async (req, res) => {
  const {
    daysBack    = 3,
    maxResults  = 30,
    autoMerge   = true,
    date        = getTomorrow(),
  } = req.body;

  console.log(`[Email] Scanning last ${daysBack} days, max ${maxResults} emails...`);

  try {
    // 1. Fetch emails
    const emails = await fetchRecentEmails({ daysBack, maxResults });
    console.log(`[Email] Fetched ${emails.length} emails`);

    if (emails.length === 0) {
      return res.json({
        success: true,
        emailsScanned: 0,
        commitments: [],
        summary: 'No emails found in the last ' + daysBack + ' days.'
      });
    }

    // 2. Extract commitments with Claude
    const result = await extractEmailCommitments(emails);
    console.log(`[Email] Found ${result.commitments?.length || 0} commitments`);

    // 3. Save commitments to Supabase
    const savedCommitments = [];
    for (const c of (result.commitments || [])) {
      const { data } = await supabase
        .from('email_commitments')
        .upsert({
          external_id:        `${c.source?.subject}_${c.source?.from}_${c.source?.date}`,
          title:              c.title,
          detail:             c.detail,
          deadline:           c.deadline,
          deadline_label:     c.deadlineLabel,
          estimated_minutes:  c.estimatedMinutes,
          category:           c.category,
          urgency:            c.urgency,
          emoji:              c.emoji,
          source_subject:     c.source?.subject,
          source_from:        c.source?.from,
          source_date:        c.source?.date,
          auto_schedule:      c.autoSchedule,
          scheduled:          false,
          dismissed:          false,
          created_at:         new Date().toISOString()
        }, { onConflict: 'external_id' })
        .select()
        .single();

      if (data) savedCommitments.push({ ...c, dbId: data.id });
    }

    // 4. Auto-merge into schedule if requested
    let mergeResult = null;
    if (autoMerge && savedCommitments.length > 0) {
      const { data: plan } = await supabase
        .from('daily_plans')
        .select('schedule')
        .eq('date', date)
        .single();

      const existingSchedule = plan?.schedule || [];
      const toMerge = savedCommitments.filter(c => c.autoSchedule);

      if (toMerge.length > 0) {
        const merged = await mergeCommitmentsIntoSchedule({
          existingSchedule,
          commitments: toMerge,
          date,
        });

        // Mark newly added items
        const newItems = merged.filter(item => item.fromEmail);

        // Update plan in DB
        await supabase
          .from('daily_plans')
          .upsert({
            date,
            schedule:   merged,
            updated_at: new Date().toISOString()
          }, { onConflict: 'date' });

        // Mark commitments as scheduled
        for (const c of toMerge) {
          if (c.dbId) {
            await supabase.from('email_commitments').update({ scheduled: true }).eq('id', c.dbId);
          }
        }

        mergeResult = {
          addedToSchedule: newItems.length,
          date,
        };

        console.log(`[Email] Merged ${newItems.length} items into ${date} schedule`);
      }
    }

    // 5. Label processed emails in Gmail (async, don't block)
    const emailIds = emails.map(e => e.id);
    labelEmailsProcessed(emailIds).catch(err =>
      console.warn('[Email] Failed to label emails:', err.message)
    );

    // 6. Broadcast update to web + iOS
    await supabase.channel('email_updates').send({
      type: 'broadcast',
      event: 'commitments_found',
      payload: { count: savedCommitments.length, date }
    });

    return res.json({
      success: true,
      emailsScanned:  emails.length,
      emailsWithCommitments: result.emailsWithCommitments || 0,
      commitments:    savedCommitments,
      summary:        result.summary,
      mergeResult,
    });

  } catch (err) {
    console.error('[Email] Scan error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /email/commitments
 * Returns all stored commitments (unscheduled ones shown by default)
 */
router.get('/commitments', async (req, res) => {
  const { scheduled = 'false', dismissed = 'false' } = req.query;

  let query = supabase
    .from('email_commitments')
    .select('*')
    .order('urgency', { ascending: true })
    .order('deadline', { ascending: true, nullsFirst: false });

  if (scheduled === 'false') query = query.eq('scheduled', false);
  if (dismissed === 'false') query = query.eq('dismissed', false);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  return res.json({ commitments: data || [], count: data?.length || 0 });
});

/**
 * POST /email/commitments/:id/schedule
 * Manually add a single commitment to a specific day's schedule
 */
router.post('/commitments/:id/schedule', async (req, res) => {
  const { id }  = req.params;
  const { date = getTomorrow() } = req.body;

  const { data: commitment } = await supabase
    .from('email_commitments')
    .select('*')
    .eq('id', id)
    .single();

  if (!commitment) return res.status(404).json({ error: 'Commitment not found' });

  const { data: plan } = await supabase
    .from('daily_plans')
    .select('schedule')
    .eq('date', date)
    .single();

  const existingSchedule = plan?.schedule || [];

  const merged = await mergeCommitmentsIntoSchedule({
    existingSchedule,
    commitments: [{
      title:              commitment.title,
      detail:             commitment.detail,
      estimatedMinutes:   commitment.estimated_minutes,
      urgency:            commitment.urgency,
      deadlineLabel:      commitment.deadline_label,
      autoSchedule:       true,
    }],
    date,
  });

  await supabase.from('daily_plans').upsert({
    date,
    schedule:   merged,
    updated_at: new Date().toISOString()
  }, { onConflict: 'date' });

  await supabase.from('email_commitments').update({ scheduled: true }).eq('id', id);

  return res.json({ success: true, date, addedToSchedule: 1 });
});

/**
 * DELETE /email/commitments/:id
 * Dismiss a commitment (won't appear again)
 */
router.delete('/commitments/:id', async (req, res) => {
  await supabase.from('email_commitments').update({ dismissed: true }).eq('id', req.params.id);
  return res.json({ success: true });
});

// ─── Helpers ─────────────────────────────────────────────────
function getTomorrow() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export default router;
