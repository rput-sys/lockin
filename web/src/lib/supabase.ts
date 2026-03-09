import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnon);

// ─── Types matching backend schema ───────────────────────────
export interface ScheduleItem {
  id: number;
  title: string;
  subtitle: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  category: 'urgent' | 'study' | 'work' | 'personal' | 'health' | 'meal';
  isExisting: boolean;
  emoji: string;
  completed?: boolean;
}

export interface DailyPlan {
  id: number;
  date: string;
  schedule: ScheduleItem[];
  unscheduled: { title: string; reason: string }[];
  summary: string | null;
  motivation: string | null;
  updated_at: string;
}

export interface LockInState {
  id: number;
  is_active: boolean;
  task_title: string | null;
  task_subtitle: string | null;
  block_ends_at: string | null;
  activated_at: string | null;
}
