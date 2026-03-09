import { google } from 'googleapis';
import supabase from '../lib/supabase.js';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * Get stored OAuth tokens from DB, refresh if needed
 */
async function getAuthClient() {
  const { data, error } = await supabase
    .from('user_settings')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .single();

  if (error || !data?.google_refresh_token) {
    throw new Error('Google Calendar not connected. Visit /auth/google to connect.');
  }

  oauth2Client.setCredentials({
    access_token:  data.google_access_token,
    refresh_token: data.google_refresh_token,
    expiry_date:   data.google_token_expiry
  });

  // Auto-refresh if expired
  oauth2Client.on('tokens', async (tokens) => {
    if (tokens.refresh_token) {
      await supabase.from('user_settings').update({
        google_access_token:  tokens.access_token,
        google_refresh_token: tokens.refresh_token,
        google_token_expiry:  tokens.expiry_date
      }).eq('id', 1);
    }
  });

  return oauth2Client;
}

/**
 * Fetch events for a given date
 * @param {string} date - "YYYY-MM-DD"
 * @returns {Array} simplified event list
 */
export async function getEventsForDate(date) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const timeMin = new Date(`${date}T00:00:00`).toISOString();
  const timeMax = new Date(`${date}T23:59:59`).toISOString();

  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];

  return events
    .filter(e => e.start?.dateTime) // skip all-day events
    .map(e => ({
      gcalId:   e.id,
      title:    e.summary || 'Untitled Event',
      start:    formatTime(e.start.dateTime),
      end:      formatTime(e.end.dateTime),
      startISO: e.start.dateTime,
      endISO:   e.end.dateTime,
    }));
}

/**
 * Write a batch of scheduled events to Google Calendar
 * @param {Array}  events    - Array of schedule items from Claude
 * @param {string} date      - "YYYY-MM-DD"
 */
export async function writeEventsToCalendar(events, date) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const results = [];

  for (const event of events) {
    if (event.isExisting) continue; // Don't re-add existing events

    try {
      const created = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: {
          summary:     `${event.emoji} ${event.title}`,
          description: event.subtitle || '',
          start: {
            dateTime: `${date}T${event.startTime}:00`,
            timeZone: process.env.TIMEZONE || 'America/New_York'
          },
          end: {
            dateTime: `${date}T${event.endTime}:00`,
            timeZone: process.env.TIMEZONE || 'America/New_York'
          },
          colorId: categoryToGCalColor(event.category),
          reminders: {
            useDefault: false,
            overrides: [
              { method: 'popup', minutes: 5 }
            ]
          },
          extendedProperties: {
            private: { lockinManaged: 'true', category: event.category }
          }
        }
      });

      results.push({ title: event.title, gcalId: created.data.id, status: 'created' });
    } catch (err) {
      console.error(`[GCal] Failed to create "${event.title}":`, err.message);
      results.push({ title: event.title, status: 'failed', error: err.message });
    }
  }

  return results;
}

/**
 * Delete all Lock In managed events for a date (for re-scheduling)
 */
export async function clearLockinEvents(date) {
  const auth = await getAuthClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const events = await getEventsForDate(date);

  for (const event of events) {
    if (event.lockinManaged) {
      await calendar.events.delete({ calendarId: 'primary', eventId: event.gcalId });
    }
  }
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function categoryToGCalColor(category) {
  const map = {
    urgent:   '11', // Tomato
    study:    '9',  // Blueberry
    work:     '1',  // Lavender
    personal: '2',  // Sage
    health:   '10', // Basil
    meal:     '5',  // Banana
  };
  return map[category] || '8'; // Graphite default
}
