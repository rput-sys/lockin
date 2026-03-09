import apn from 'node-apn';
import supabase from '../lib/supabase.js';

let provider = null;

function getProvider() {
  if (!provider) {
    provider = new apn.Provider({
      token: {
        key:    process.env.APN_KEY_PATH,
        keyId:  process.env.APN_KEY_ID,
        teamId: process.env.APN_TEAM_ID,
      },
      production: process.env.NODE_ENV === 'production'
    });
  }
  return provider;
}

/**
 * Get all registered device tokens from DB
 */
async function getDeviceTokens() {
  const { data } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('active', true);
  return (data || []).map(r => r.token);
}

/**
 * Send the daily 7 PM planning prompt notification
 */
export async function sendDailyPromptNotification() {
  const tokens = await getDeviceTokens();
  if (tokens.length === 0) {
    console.log('[APNs] No device tokens registered');
    return;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayName = tomorrow.toLocaleDateString('en-US', { weekday: 'long' });

  const notification = new apn.Notification();
  notification.expiry       = Math.floor(Date.now() / 1000) + 3600; // 1hr to deliver
  notification.badge        = 1;
  notification.sound        = 'default';
  notification.alert = {
    title:    '⚡ Plan Tomorrow',
    subtitle: `${dayName} — Let's set it up`,
    body:     'Tap to tell me what you need to get done tomorrow.'
  };
  notification.topic        = process.env.APN_BUNDLE_ID;
  notification.category     = 'DAILY_PLANNING';
  notification.payload      = { action: 'openPlanning' };
  notification.pushType     = 'alert';

  const prov = getProvider();
  const result = await prov.send(notification, tokens);
  console.log(`[APNs] Sent to ${result.sent.length} devices, failed: ${result.failed.length}`);
  return result;
}

/**
 * Send a Live Activity update for Lock In mode
 * Uses the newer Push-to-Update format for ActivityKit
 */
export async function sendLiveActivityUpdate({ activityId, taskTitle, taskSubtitle, endsAt, isActive }) {
  const tokens = await getDeviceTokens();
  if (tokens.length === 0) return;

  const notification = new apn.Notification();
  notification.topic    = `${process.env.APN_BUNDLE_ID}.push-type.liveactivity`;
  notification.pushType = 'liveactivity';
  notification.expiry   = Math.floor(Date.now() / 1000) + 900; // 15 min

  notification.payload = {
    'content-state': {
      taskTitle,
      taskSubtitle: taskSubtitle || '',
      endsAt:       endsAt || null,
      isActive,
    },
    event:       isActive ? 'update' : 'end',
    'timestamp': Math.floor(Date.now() / 1000),
    'dismissal-date': isActive ? undefined : Math.floor(Date.now() / 1000) + 5,
  };

  const prov = getProvider();
  await prov.send(notification, tokens);
}

/**
 * Send a generic alert (task starting, timer done, etc.)
 */
export async function sendAlert({ title, body, data = {} }) {
  const tokens = await getDeviceTokens();
  if (tokens.length === 0) return;

  const notification = new apn.Notification();
  notification.expiry   = Math.floor(Date.now() / 1000) + 600;
  notification.sound    = 'default';
  notification.alert    = { title, body };
  notification.topic    = process.env.APN_BUNDLE_ID;
  notification.payload  = data;
  notification.pushType = 'alert';

  const prov = getProvider();
  return prov.send(notification, tokens);
}

export function closeProvider() {
  if (provider) { provider.shutdown(); provider = null; }
}
