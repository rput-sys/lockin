'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface EmailCommitment {
  id: number;
  title: string;
  detail: string;
  deadline: string | null;
  deadline_label: string;
  estimated_minutes: number;
  category: string;
  urgency: 'critical' | 'high' | 'medium' | 'low';
  emoji: string;
  source_subject: string;
  source_from: string;
  source_date: string;
  auto_schedule: boolean;
  scheduled: boolean;
  dismissed: boolean;
  created_at: string;
}

export function useEmailCommitments() {
  const [commitments, setCommitments] = useState<EmailCommitment[]>([]);
  const [scanning, setScanning]       = useState(false);
  const [lastScan, setLastScan]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  const fetchCommitments = async () => {
    const { data } = await supabase
      .from('email_commitments')
      .select('*')
      .eq('dismissed', false)
      .order('urgency', { ascending: true })
      .order('deadline', { ascending: true, nullsFirst: false });
    setCommitments(data || []);
  };

  const scan = async (daysBack = 3) => {
    setScanning(true);
    setError(null);
    try {
      const res = await fetch(`${API}/email/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysBack, autoMerge: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Scan failed');
      setLastScan(new Date().toISOString());
      await fetchCommitments();
      return data;
    } catch (e: any) {
      setError(e.message);
      throw e;
    } finally {
      setScanning(false);
    }
  };

  const scheduleCommitment = async (id: number, date?: string) => {
    const res = await fetch(`${API}/email/commitments/${id}/schedule`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date }),
    });
    if (res.ok) {
      setCommitments(prev => prev.map(c => c.id === id ? { ...c, scheduled: true } : c));
    }
  };

  const dismissCommitment = async (id: number) => {
    setCommitments(prev => prev.filter(c => c.id !== id));
    await fetch(`${API}/email/commitments/${id}`, { method: 'DELETE' });
  };

  useEffect(() => {
    fetchCommitments();

    const channel = supabase
      .channel('email_realtime')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'email_commitments' },
        () => fetchCommitments()
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, []);

  const pending = commitments.filter(c => !c.scheduled);
  const scheduled = commitments.filter(c => c.scheduled);
  const critical = pending.filter(c => c.urgency === 'critical' || c.urgency === 'high');

  return {
    commitments, pending, scheduled, critical,
    scanning, lastScan, error,
    scan, scheduleCommitment, dismissCommitment,
    refetch: fetchCommitments,
  };
}
