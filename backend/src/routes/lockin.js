import { Router } from 'express';
import supabase from '../lib/supabase.js';
import { sendLiveActivityUpdate, sendAlert } from '../services/notifications.js';

const router = Router();

/**
 * POST /lockin/activate
 * Called when user clicks "Lock In Mode" on website or iOS app.
 * Updates DB state → triggers Supabase Realtime → iOS app receives it.
 */
router.post('/activate', async (req, res) => {
  const { taskTitle, taskSubtitle, blockEndsAt } = req.body;

  // Update DB state
  const { error } = await supabase
    .from('lockin_state')
    .upsert({
      id:            1,
      is_active:     true,
      task_title:    taskTitle || 'Focus Block',
      task_subtitle: taskSubtitle || '',
      block_ends_at: blockEndsAt || null,
      activated_at:  new Date().toISOString(),
    });

  if (error) return res.status(500).json({ error: error.message });

  // Push Live Activity to lock screen
  try {
    await sendLiveActivityUpdate({
      taskTitle:    taskTitle || 'Focus Block',
      taskSubtitle: taskSubtitle || '',
      endsAt:       blockEndsAt,
      isActive:     true
    });
  } catch (e) {
    console.warn('[APNs] Live Activity push failed:', e.message);
  }

  console.log(`[LockIn] ACTIVATED — "${taskTitle}"`);
  return res.json({ success: true, active: true });
});

/**
 * POST /lockin/deactivate
 * Called when user exits Lock In mode on any device.
 */
router.post('/deactivate', async (req, res) => {
  const { error } = await supabase
    .from('lockin_state')
    .update({
      is_active:       false,
      deactivated_at:  new Date().toISOString()
    })
    .eq('id', 1);

  if (error) return res.status(500).json({ error: error.message });

  // End the Live Activity on lock screen
  try {
    await sendLiveActivityUpdate({ isActive: false });
  } catch (e) {
    console.warn('[APNs] Live Activity end failed:', e.message);
  }

  console.log('[LockIn] DEACTIVATED');
  return res.json({ success: true, active: false });
});

/**
 * GET /lockin/state
 * Polling fallback — iOS app can hit this on launch
 */
router.get('/state', async (req, res) => {
  const { data, error } = await supabase
    .from('lockin_state')
    .select('*')
    .eq('id', 1)
    .single();

  if (error) return res.json({ is_active: false });
  return res.json(data);
});

/**
 * POST /lockin/device-token
 * iOS app registers its APNs device token here on first launch
 */
router.post('/device-token', async (req, res) => {
  const { token, deviceName } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  const { error } = await supabase
    .from('device_tokens')
    .upsert({
      token,
      device_name: deviceName || 'Unknown',
      active:      true,
      updated_at:  new Date().toISOString()
    }, { onConflict: 'token' });

  if (error) return res.status(500).json({ error: error.message });
  return res.json({ success: true });
});

export default router;
