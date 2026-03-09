'use client';
import { useState, useEffect } from 'react';
import { ScheduleItem } from '../lib/supabase';

function toMin(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
function nowSec() { const n = new Date(); return n.getHours() * 3600 + n.getMinutes() * 60 + n.getSeconds(); }

export function useCountdown(currentTask: ScheduleItem | null, nextTask: ScheduleItem | null) {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [currentTime, setCurrentTime] = useState('');

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setCurrentTime(
        `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`
      );

      if (currentTask) {
        const endSec = toMin(currentTask.endTime) * 60;
        setSecondsLeft(Math.max(0, endSec - nowSec()));
      } else if (nextTask) {
        const startSec = toMin(nextTask.startTime) * 60;
        setSecondsLeft(Math.max(0, startSec - nowSec()));
      } else {
        setSecondsLeft(0);
      }
    };

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [currentTask, nextTask]);

  const fmt = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
    return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  };

  return {
    secondsLeft,
    formatted: fmt(secondsLeft),
    currentTime,
    isUrgent: secondsLeft > 0 && secondsLeft < 300,
  };
}
