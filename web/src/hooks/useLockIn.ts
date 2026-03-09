'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, LockInState, ScheduleItem } from '../lib/supabase';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function useLockIn(currentTask: ScheduleItem | null) {
  const [isActive, setIsActive]       = useState(false);
  const [lockInData, setLockInData]   = useState<LockInState | null>(null);
  const [loading, setLoading]         = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Subscribe to realtime changes
  useEffect(() => {
    // Initial fetch
    supabase
      .from('lockin_state')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) { setLockInData(data); setIsActive(data.is_active); }
      });

    // Realtime subscription
    const channel = supabase
      .channel('lockin_realtime')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'lockin_state', filter: 'id=eq.1' },
        (payload) => {
          const row = payload.new as LockInState;
          setLockInData(row);
          setIsActive(row.is_active);
        }
      )
      .subscribe();

    channelRef.current = channel;
    return () => { channel.unsubscribe(); };
  }, []);

  const activate = useCallback(async () => {
    setLoading(true);
    try {
      const body: Record<string, string> = {
        taskTitle:    currentTask ? `${currentTask.emoji} ${currentTask.title}` : 'Focus Block',
        taskSubtitle: currentTask?.subtitle || '',
      };
      if (currentTask?.endTime) {
        const [h, m] = currentTask.endTime.split(':').map(Number);
        const endsAt = new Date();
        endsAt.setHours(h, m, 0, 0);
        body.blockEndsAt = endsAt.toISOString();
      }
      const res = await fetch(`${API}/lockin/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed to activate');
      setIsActive(true);
    } catch (e) {
      console.error('[LockIn] Activate error:', e);
    } finally {
      setLoading(false);
    }
  }, [currentTask]);

  const deactivate = useCallback(async () => {
    setLoading(true);
    try {
      await fetch(`${API}/lockin/deactivate`, { method: 'POST' });
      setIsActive(false);
    } catch (e) {
      console.error('[LockIn] Deactivate error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const toggle = useCallback(() => {
    if (isActive) deactivate(); else activate();
  }, [isActive, activate, deactivate]);

  return { isActive, lockInData, loading, toggle, activate, deactivate };
}
