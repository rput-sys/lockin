import { Router } from 'express';
import { google } from 'googleapis';
import supabase from '../lib/supabase.js';

const router = Router();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

/**
 * GET /auth/google
 * Redirect to Google's OAuth consent screen
 */
router.get('/google', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',  // Gets refresh token
    scope: [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.labels',
      'https://www.googleapis.com/auth/gmail.modify',
    ],
    prompt: 'consent' // Force to always get refresh token
  });
  res.redirect(url);
});

/**
 * GET /auth/google/callback
 * Google redirects here after user approves
 */
router.get('/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) return res.send(`<h1>Auth failed: ${error}</h1>`);
  if (!code)  return res.send('<h1>No code returned from Google</h1>');

  try {
    const { tokens } = await oauth2Client.getToken(code);

    // Store tokens in Supabase
    await supabase.from('user_settings').upsert({
      id: 1,
      google_access_token:  tokens.access_token,
      google_refresh_token: tokens.refresh_token,
      google_token_expiry:  tokens.expiry_date,
      google_connected_at:  new Date().toISOString()
    });

    console.log('[Auth] Google Calendar connected successfully');

    res.send(`
      <html>
        <head><title>LOCK IN — Connected</title></head>
        <body style="background:#060d12;color:#00ff88;font-family:monospace;padding:40px;text-align:center;">
          <h1>⚡ GOOGLE CALENDAR CONNECTED</h1>
          <p>You can close this window and return to the app.</p>
          <script>setTimeout(()=>window.close(), 2000)</script>
        </body>
      </html>
    `);
  } catch (err) {
    console.error('[Auth] Google callback error:', err);
    res.status(500).send(`<h1>Error: ${err.message}</h1>`);
  }
});

/**
 * GET /auth/status
 * Check if Google Calendar is connected
 */
router.get('/status', async (req, res) => {
  const { data } = await supabase
    .from('user_settings')
    .select('google_connected_at, google_refresh_token')
    .eq('id', 1)
    .single();

  return res.json({
    googleCalendar: !!data?.google_refresh_token,
    connectedAt: data?.google_connected_at || null
  });
});

export default router;
