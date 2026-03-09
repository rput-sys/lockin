-- ============================================================
-- LOCK IN — Supabase Database Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- Daily Plans: stores each day's AI-generated schedule
CREATE TABLE IF NOT EXISTS daily_plans (
  id              BIGSERIAL PRIMARY KEY,
  date            DATE NOT NULL UNIQUE,   -- "2026-03-09"
  schedule        JSONB NOT NULL DEFAULT '[]',
  unscheduled     JSONB NOT NULL DEFAULT '[]',
  summary         TEXT,
  motivation      TEXT,
  raw_transcript  TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast date lookups
CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans(date DESC);

-- Lock In State: single row tracking cross-device Lock In mode
CREATE TABLE IF NOT EXISTS lockin_state (
  id              INT PRIMARY KEY DEFAULT 1,       -- always 1, single user
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,
  task_title      TEXT DEFAULT '',
  task_subtitle   TEXT DEFAULT '',
  block_ends_at   TIMESTAMPTZ,
  activated_at    TIMESTAMPTZ,
  deactivated_at  TIMESTAMPTZ
);

-- Seed the row so it always exists
INSERT INTO lockin_state (id, is_active) VALUES (1, false)
ON CONFLICT (id) DO NOTHING;

-- Device Tokens: APNs tokens for push notifications
CREATE TABLE IF NOT EXISTS device_tokens (
  id          BIGSERIAL PRIMARY KEY,
  token       TEXT NOT NULL UNIQUE,
  device_name TEXT DEFAULT 'iPhone',
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- User Settings: Google OAuth tokens etc.
CREATE TABLE IF NOT EXISTS user_settings (
  id                    INT PRIMARY KEY DEFAULT 1,
  google_access_token   TEXT,
  google_refresh_token  TEXT,
  google_token_expiry   BIGINT,
  google_connected_at   TIMESTAMPTZ,
  daily_prompt_hour     INT DEFAULT 19,
  daily_prompt_minute   INT DEFAULT 0,
  timezone              TEXT DEFAULT 'America/New_York'
);

-- Seed settings row
INSERT INTO user_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ─── Realtime ────────────────────────────────────────────────
-- Enable Realtime on tables the iOS app and website need to watch
ALTER PUBLICATION supabase_realtime ADD TABLE lockin_state;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_plans;

-- ─── RLS (Row Level Security) ────────────────────────────────
-- Since this is single-user, we allow all access with service key
-- The service key is ONLY used server-side, never in the app
ALTER TABLE daily_plans   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lockin_state  ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Policies: service role bypasses RLS (already does by default)
-- Anon key gets read access to daily_plans and lockin_state only
CREATE POLICY "anon_read_plans" ON daily_plans
  FOR SELECT TO anon USING (true);

CREATE POLICY "anon_read_lockin" ON lockin_state
  FOR SELECT TO anon USING (true);

-- Email Commitments: tasks extracted from inbox
CREATE TABLE IF NOT EXISTS email_commitments (
  id                BIGSERIAL PRIMARY KEY,
  external_id       TEXT UNIQUE,            -- dedup key (subject+from+date hash)
  title             TEXT NOT NULL,
  detail            TEXT,
  deadline          DATE,
  deadline_label    TEXT,
  estimated_minutes INT DEFAULT 30,
  category          TEXT DEFAULT 'work',
  urgency           TEXT DEFAULT 'medium',  -- critical | high | medium | low
  emoji             TEXT DEFAULT '📧',
  source_subject    TEXT,
  source_from       TEXT,
  source_date       TEXT,
  auto_schedule     BOOLEAN DEFAULT TRUE,
  scheduled         BOOLEAN DEFAULT FALSE,
  dismissed         BOOLEAN DEFAULT FALSE,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Realtime for email commitments panel
ALTER PUBLICATION supabase_realtime ADD TABLE email_commitments;

-- RLS
ALTER TABLE email_commitments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon_read_commitments" ON email_commitments
  FOR SELECT TO anon USING (true);
-- Helper to get today's plan conveniently
CREATE OR REPLACE FUNCTION get_todays_plan()
RETURNS SETOF daily_plans AS $$
  SELECT * FROM daily_plans WHERE date = CURRENT_DATE LIMIT 1;
$$ LANGUAGE sql STABLE;
