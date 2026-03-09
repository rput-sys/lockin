import { google } from 'googleapis';
import supabase from '../lib/supabase.js';

async function getAuthClient() {
  const { data, error } = await supabase
    .from('user_settings')
    .select('google_access_token, google_refresh_token, google_token_expiry')
    .single();

  if (error || !data?.google_refresh_token) {
    throw new Error('Google not connected. Visit /auth/google to connect.');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token:  data.google_access_token,
    refresh_token: data.google_refresh_token,
    expiry_date:   data.google_token_expiry
  });

  // Save refreshed tokens
  oauth2Client.on('tokens', async (tokens) => {
    await supabase.from('user_settings').update({
      google_access_token: tokens.access_token,
      ...(tokens.refresh_token && { google_refresh_token: tokens.refresh_token }),
      google_token_expiry: tokens.expiry_date
    }).eq('id', 1);
  });

  return oauth2Client;
}

/**
 * Fetch recent emails from inbox
 * @param {object} opts
 * @param {number} opts.maxResults     - How many emails to scan (default 30)
 * @param {number} opts.daysBack       - How many days back to look (default 3)
 * @param {string} opts.query          - Extra Gmail search query
 * @returns {Array} Parsed email objects
 */
export async function fetchRecentEmails({ maxResults = 30, daysBack = 3, query = '' } = {}) {
  const auth  = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // Build search query — look for emails that sound like commitments
  const after  = new Date();
  after.setDate(after.getDate() - daysBack);
  const afterStr = `${after.getFullYear()}/${String(after.getMonth()+1).padStart(2,'0')}/${String(after.getDate()).padStart(2,'0')}`;

  const baseQuery = [
    `after:${afterStr}`,
    'in:inbox',
    query
  ].filter(Boolean).join(' ');

  const listRes = await gmail.users.messages.list({
    userId:     'me',
    q:          baseQuery,
    maxResults,
  });

  const messages = listRes.data.messages || [];
  if (messages.length === 0) return [];

  // Fetch full content for each message in parallel (batch of 10 at a time)
  const emails = [];
  const batchSize = 10;

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    const fetched = await Promise.all(
      batch.map(msg => gmail.users.messages.get({
        userId: 'me',
        id:     msg.id,
        format: 'full',
      }).catch(() => null))
    );

    for (const res of fetched) {
      if (!res) continue;
      const parsed = parseEmail(res.data);
      if (parsed) emails.push(parsed);
    }
  }

  return emails;
}

/**
 * Parse a Gmail message object into a clean structure
 */
function parseEmail(message) {
  try {
    const headers  = message.payload.headers || [];
    const getHeader = (name) => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

    const subject = getHeader('Subject');
    const from    = getHeader('From');
    const date    = getHeader('Date');
    const to      = getHeader('To');

    // Extract body text — try plain text first, fall back to HTML stripped
    const body = extractBody(message.payload);
    if (!body || body.length < 20) return null;

    // Trim body to avoid token bloat — 800 chars is enough context
    const truncatedBody = body.substring(0, 800).replace(/\s+/g, ' ').trim();

    return {
      id:      message.id,
      subject,
      from:    parseEmailAddress(from),
      to:      parseEmailAddress(to),
      date:    new Date(date).toISOString(),
      body:    truncatedBody,
      snippet: message.snippet || '',
    };
  } catch {
    return null;
  }
}

function extractBody(payload) {
  // Direct body
  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  // Multipart — prefer text/plain, fall back to text/html
  if (payload.parts) {
    const plain = payload.parts.find(p => p.mimeType === 'text/plain');
    if (plain?.body?.data) return decodeBase64(plain.body.data);

    const html = payload.parts.find(p => p.mimeType === 'text/html');
    if (html?.body?.data) return stripHtml(decodeBase64(html.body.data));

    // Nested multipart
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return payload.snippet || '';
}

function decodeBase64(data) {
  return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function stripHtml(html) {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{3,}/g, '\n\n')
    .trim();
}

function parseEmailAddress(raw) {
  // Extract "Name <email>" or just "email"
  const match = raw.match(/^(.+?)\s*<(.+?)>$/);
  if (match) return { name: match[1].trim().replace(/"/g, ''), email: match[2].trim() };
  return { name: '', email: raw.trim() };
}

/**
 * Mark emails as processed (adds a label) to avoid re-scanning
 * Optional — only call after commitments extracted
 */
export async function labelEmailsProcessed(emailIds) {
  if (!emailIds?.length) return;
  const auth  = await getAuthClient();
  const gmail = google.gmail({ version: 'v1', auth });

  // Try to create the label if it doesn't exist
  let labelId = null;
  try {
    const labels = await gmail.users.labels.list({ userId: 'me' });
    const existing = (labels.data.labels || []).find(l => l.name === 'LockIn/Processed');
    if (existing) {
      labelId = existing.id;
    } else {
      const created = await gmail.users.labels.create({
        userId: 'me',
        requestBody: {
          name: 'LockIn/Processed',
          labelListVisibility: 'labelHide',
          messageListVisibility: 'hide',
        }
      });
      labelId = created.data.id;
    }
  } catch { /* labels are optional */ }

  if (!labelId) return;

  await Promise.all(emailIds.map(id =>
    gmail.users.messages.modify({
      userId: 'me',
      id,
      requestBody: { addLabelIds: [labelId] }
    }).catch(() => {})
  ));
}
