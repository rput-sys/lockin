import { Router } from 'express';
import { getEventsForDate } from '../services/googleCalendar.js';

const router = Router();

/**
 * GET /calendar/events/:date
 * Preview what's on calendar for a given date
 */
router.get('/events/:date', async (req, res) => {
  try {
    const events = await getEventsForDate(req.params.date);
    return res.json({ date: req.params.date, events, count: events.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
