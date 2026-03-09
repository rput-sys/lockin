import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Takes a voice transcript + existing calendar events and returns
 * a fully scheduled day as structured JSON.
 *
 * @param {string} transcript   - Raw voice transcript from user
 * @param {Array}  existingEvents - Array of {title, start, end} from Google Calendar
 * @param {string} targetDate   - ISO date string "YYYY-MM-DD"
 * @returns {Array} Array of scheduled event objects
 */
export async function generateSchedule({ transcript, existingEvents, targetDate }) {
  const existingFormatted = existingEvents.length > 0
    ? existingEvents.map(e =>
        `  - "${e.title}" from ${e.start} to ${e.end}`
      ).join('\n')
    : '  (No existing events)';

  const prompt = `You are a personal AI scheduling assistant. The user has spoken their tasks for tomorrow and you must schedule them intelligently around their existing calendar events.

TARGET DATE: ${targetDate}

EXISTING CALENDAR EVENTS (do NOT move these, work around them):
${existingFormatted}

USER'S SPOKEN TASK LIST:
"${transcript}"

INSTRUCTIONS:
1. Parse every task the user mentioned, including estimated durations they gave
2. Find all open time windows between existing events
3. Schedule tasks back-to-back efficiently, leaving 5-10 min buffers between blocks
4. Prioritize urgent/due-today items early in the day
5. Schedule focus-heavy tasks in morning/early afternoon, lighter tasks later
6. If the day is too packed, note which tasks couldn't fit
7. Default work window: 8:00 AM to 11:59 PM unless user specifies otherwise
8. Add 30 min for meals if not mentioned (lunch ~12pm, dinner ~6pm) — but only if there's a logical gap

Respond ONLY with valid JSON, no markdown, no explanation. Use this exact schema:
{
  "date": "${targetDate}",
  "totalTasks": <number>,
  "scheduled": [
    {
      "id": <unique integer>,
      "title": "<task name, clean and concise>",
      "subtitle": "<brief note, deadline, or context — leave empty string if none>",
      "startTime": "<HH:MM in 24h format>",
      "endTime": "<HH:MM in 24h format>",
      "durationMinutes": <number>,
      "category": "<one of: urgent | study | work | personal | health | meal>",
      "isExisting": <true if from calendar, false if AI-scheduled>,
      "emoji": "<single relevant emoji>"
    }
  ],
  "unscheduled": [
    {
      "title": "<task that didn't fit>",
      "reason": "<why it couldn't be scheduled>"
    }
  ],
  "summary": "<1-2 sentence overview of the day>"
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text = response.content[0].text.trim();

  // Strip any accidental markdown fences
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

  try {
    const parsed = JSON.parse(clean);
    return parsed;
  } catch (err) {
    console.error('[Claude] Failed to parse response:', text.substring(0, 200));
    throw new Error('Claude returned invalid JSON. Raw: ' + text.substring(0, 300));
  }
}

/**
 * Scans an array of emails and extracts commitments, tasks, deadlines.
 * Returns structured JSON of actionable items to add to the schedule.
 *
 * @param {Array} emails  - Array of {subject, from, date, body, snippet}
 * @returns {object}      - { commitments: [...], summary: string }
 */
export async function extractEmailCommitments(emails) {
  if (!emails?.length) return { commitments: [], summary: 'No emails to scan.' };

  const today = new Date().toISOString().split('T')[0];

  // Format emails for prompt — keep it tight
  const emailBlocks = emails.map((e, i) => `
EMAIL ${i + 1}:
From: ${e.from.name || e.from.email} <${e.from.email}>
Date: ${new Date(e.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
Subject: ${e.subject}
Body: ${e.body}
---`).join('\n');

  const prompt = `You are scanning someone's email inbox to find commitments, tasks, deadlines, and obligations they need to act on.

TODAY'S DATE: ${today}

EMAILS TO SCAN:
${emailBlocks}

INSTRUCTIONS:
Look for anything the person has committed to, been asked to do, signed up for, or has a deadline for. This includes:
- Things THEY said they would do ("I'll send that over by Friday", "I'll take care of it")
- Deadlines in emails sent TO them ("Please submit by...", "Due date:", "We need this by...")
- Meetings or appointments they confirmed ("Looking forward to seeing you at...", "Confirmed: your appointment...")
- Sign-ups or registrations ("Your registration for X is confirmed")
- Follow-ups they need to send
- Assignments, project deliverables, bills due

IGNORE:
- Marketing emails, newsletters, promotions
- Emails where no action is needed
- Things already clearly done/resolved

For each commitment found, determine:
- The specific action needed
- The deadline (if mentioned)
- Estimated time to complete
- Which email it came from
- Urgency level

Respond ONLY with valid JSON, no markdown:
{
  "commitments": [
    {
      "id": <unique integer starting at 1>,
      "title": "<clear, action-oriented task title — start with a verb>",
      "detail": "<what exactly needs to be done and context>",
      "deadline": "<date string YYYY-MM-DD if known, else null>",
      "deadlineLabel": "<human readable: 'Today', 'Tomorrow', 'This Friday', 'No deadline', etc>",
      "estimatedMinutes": <realistic estimate: 15/30/45/60/90/120>,
      "category": "<one of: urgent | work | study | personal>",
      "urgency": "<one of: critical | high | medium | low>",
      "emoji": "<single relevant emoji>",
      "source": {
        "subject": "<email subject>",
        "from": "<sender name or email>",
        "date": "<email date>"
      },
      "autoSchedule": <true if this should be auto-added to today/tomorrow's plan>
    }
  ],
  "summary": "<1-2 sentences summarizing what was found>",
  "emailsScanned": ${emails.length},
  "emailsWithCommitments": <number>
}`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text  = response.content[0].text.trim();
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    console.error('[Claude] Email extraction parse failed:', text.substring(0, 200));
    throw new Error('Failed to parse email commitments from Claude.');
  }
}

/**
 * Given a list of email-extracted commitments, merge them into an
 * existing day's schedule. Returns the updated schedule.
 */
export async function mergeCommitmentsIntoSchedule({ existingSchedule, commitments, date }) {
  if (!commitments?.length) return existingSchedule;

  const scheduleStr = existingSchedule.length > 0
    ? existingSchedule.map(s => `  ${s.startTime}-${s.endTime}: ${s.emoji} ${s.title}`).join('\n')
    : '  (empty — no existing blocks)';

  const commitmentsStr = commitments
    .filter(c => c.autoSchedule)
    .map(c => `  - "${c.title}" (~${c.estimatedMinutes} min, urgency: ${c.urgency}, deadline: ${c.deadlineLabel})`)
    .join('\n');

  if (!commitmentsStr) return existingSchedule;

  const prompt = `You are adding newly discovered email commitments into an existing schedule.

DATE: ${date}

EXISTING SCHEDULE:
${scheduleStr}

NEW TASKS FROM EMAIL (add these):
${commitmentsStr}

INSTRUCTIONS:
- Insert the new tasks into the schedule in available time gaps
- Urgent/deadline tasks go earlier
- Don't overlap with existing blocks
- Leave 5-min buffers
- Assign realistic start/end times
- Give each new task a unique id (continue from ${(existingSchedule[existingSchedule.length-1]?.id || 0) + 1})
- Return the COMPLETE merged schedule (existing + new), sorted by startTime

Respond ONLY with a JSON array of schedule items — same schema as before:
[
  {
    "id": <int>,
    "title": "<string>",
    "subtitle": "<string>",
    "startTime": "<HH:MM>",
    "endTime": "<HH:MM>",
    "durationMinutes": <int>,
    "category": "<urgent|study|work|personal|health|meal>",
    "isExisting": <bool>,
    "emoji": "<emoji>",
    "fromEmail": <true if from email scan, false otherwise>
  }
]`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }]
  });

  const text  = response.content[0].text.trim();
  const clean = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    console.error('[Claude] Schedule merge parse failed');
    return existingSchedule; // fallback — return unchanged
  }
}

/**
 * Quick helper to get a motivational message for the day
 */
export async function getDailyMotivation(taskCount) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 100,
    messages: [{
      role: 'user',
      content: `Give me one short, punchy motivational line (under 12 words) for someone who has ${taskCount} tasks to complete today. No quotes, no attribution. Raw text only. Think: mission control, focused, no fluff.`
    }]
  });
  return response.content[0].text.trim();
}
