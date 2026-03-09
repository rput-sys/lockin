'use client';
import { useState, useEffect } from 'react';
import { supabase, DailyPlan, ScheduleItem } from '../lib/supabase';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function todayStr() { return new Date().toISOString().split('T')[0]; }
function tomorrowStr() {
  const d = new Date(); d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

export function usePlan() {
  const [plan, setPlan]       = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const fetchPlan = async (date = todayStr()) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: dbErr } = await supabase
        .from('daily_plans')
        .select('*')
        .eq('date', date)
        .single();
      if (dbErr) throw dbErr;
      setPlan(data);
    } catch {
      setError('No plan found for today.');
      setPlan(null);
    } finally {
      setLoading(false);
    }
  };

  const completeTask = async (taskId: number) => {
    if (!plan) return;
    const updated = plan.schedule.map(t =>
      t.id === taskId ? { ...t, completed: true } : t
    );
    setPlan({ ...plan, schedule: updated });

    await fetch(`${API}/schedule/task/${taskId}/complete`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: plan.date, completed: true }),
    });
  };

  useEffect(() => {
    fetchPlan();

    // Realtime — reload when plan changes
    const channel = supabase
      .channel('plan_realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'daily_plans' },
        () => fetchPlan()
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  // Derived helpers
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };
  const toMin  = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

  const currentTask = plan?.schedule.find(item => {
    const n = nowMin();
    return n >= toMin(item.startTime) && n < toMin(item.endTime);
  }) ?? null;

  const nextTask = plan?.schedule
    .filter(item => toMin(item.startTime) > nowMin())
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;

  const completedCount = plan?.schedule.filter(t => t.completed).length ?? 0;
  const totalCount     = plan?.schedule.length ?? 0;
  const progressPct    = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  return {
    plan, loading, error,
    currentTask, nextTask,
    completedCount, totalCount, progressPct,
    refetch: fetchPlan,
    completeTask,
  };
}
