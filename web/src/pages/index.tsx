'use client';
import { useState, useEffect, useRef } from 'react';
import { usePlan } from '../hooks/usePlan';
import { useLockIn } from '../hooks/useLockIn';
import { useCountdown } from '../hooks/useCountdown';
import { useEmailCommitments, type EmailCommitment } from '../hooks/useEmailCommitments';
import { ScheduleItem } from '../lib/supabase';

// ─── Helpers ─────────────────────────────────────────────────
function fmt12(t: string) {
  const [h, m] = t.split(':').map(Number);
  const ap = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2,'0')} ${ap}`;
}

const CAT_COLORS: Record<string, string> = {
  urgent:   '#FF6B35',
  study:    '#00D4FF',
  work:     '#A78BFA',
  personal: '#5A7A8A',
  health:   '#00FF88',
  meal:     '#FFD166',
};

// ─── Root Page ────────────────────────────────────────────────
export default function DashboardPage() {
  const { plan, loading, currentTask, nextTask, completedCount, totalCount, progressPct, completeTask } = usePlan();
  const { isActive, loading: lockLoading, toggle } = useLockIn(currentTask);
  const { secondsLeft, formatted, currentTime, isUrgent } = useCountdown(currentTask, nextTask);
  const { pending: emailTasks, critical: criticalEmails, scanning, scan: scanEmails, scheduleCommitment, dismissCommitment } = useEmailCommitments();
  const [checkedIds, setCheckedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('li_checks') || '[]')); } catch { return new Set(); }
  });
  const [customTasks, setCustomTasks] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem('li_custom') || '[]'); } catch { return []; }
  });
  const [addInput, setAddInput] = useState('');
  const [notifGranted, setNotifGranted] = useState(false);

  useEffect(() => {
    setNotifGranted(typeof Notification !== 'undefined' && Notification.permission === 'granted');
  }, []);

  const toggleCheck = (id: string) => {
    const next = new Set(checkedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setCheckedIds(next);
    localStorage.setItem('li_checks', JSON.stringify([...next]));
  };

  const addTask = () => {
    if (!addInput.trim()) return;
    const next = [...customTasks, addInput.trim()];
    setCustomTasks(next);
    localStorage.setItem('li_custom', JSON.stringify(next));
    setAddInput('');
  };

  const deleteTask = (i: number) => {
    const next = customTasks.filter((_, idx) => idx !== i);
    setCustomTasks(next);
    localStorage.setItem('li_custom', JSON.stringify(next));
  };

  const reqNotif = () => {
    Notification.requestPermission().then(p => {
      if (p === 'granted') setNotifGranted(true);
    });
  };

  const allTasks = [
    ...(plan?.schedule.map(s => ({ id: `sch_${s.id}`, text: `${s.emoji} ${s.title}`, note: s.subtitle })) || []),
    ...customTasks.map((t, i) => ({ id: `custom_${i}`, text: t, note: '' })),
  ];
  const checkedCount = allTasks.filter(t => checkedIds.has(t.id)).length;
  const masterPct = allTasks.length > 0 ? Math.round((checkedCount / allTasks.length) * 100) : 0;

  if (isActive) return <LockInOverlay secondsLeft={secondsLeft} formatted={formatted} currentTime={currentTime} isUrgent={isUrgent} currentTask={currentTask} nextTask={nextTask} onExit={toggle} />;

  return (
    <div style={{ background: 'var(--bg)', color: 'var(--text)', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', fontFamily: "'Barlow Condensed', sans-serif" }}>
      <style>{CSS}</style>

      {/* HEADER */}
      <header className="header">
        <div>
          <div className="title">⚡ LOCK IN</div>
          <div className="subtitle">MISSION CONTROL — {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</div>
        </div>
        <button className="btn-lockin" onClick={toggle} disabled={lockLoading}>
          {lockLoading ? '...' : '⚡ LOCK IN MODE'}
        </button>
        {!notifGranted && (
          <button className="btn-notif" onClick={reqNotif}>🔔 ENABLE ALERTS</button>
        )}
        <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
          <div className="live-clock">{currentTime}</div>
          <div className="sub-text">NEXT: <span style={{ color: 'var(--green)' }}>{formatted}</span></div>
        </div>
      </header>

      {/* PROGRESS STRIP */}
      <div className="progress-strip">
        <div className="sub-text">MISSION PROGRESS</div>
        <div className="prog-outer"><div className="prog-inner" style={{ width: `${masterPct}%` }} /></div>
        <div style={{ color: 'var(--green)', fontFamily: 'monospace', fontSize: 13, minWidth: 40, textAlign: 'right' }}>{masterPct}%</div>
        <div className="sub-text">{checkedCount} / {allTasks.length} TASKS</div>
      </div>

      {/* MAIN GRID */}
      <div className="grid">

        {/* LEFT — FOCUS */}
        <div className="panel">
          <div className="panel-hdr">⏱ FOCUS STATION</div>
          <div className="panel-body">
            <div className="cd-label">CURRENT BLOCK ENDS IN</div>
            <div className={`cd-clock${isUrgent ? ' urgent' : ''}`}>{formatted}</div>

            <div className="cur-card">
              <div style={{ fontSize: 9, letterSpacing: 3, color: 'var(--green)', marginBottom: 4 }}>▶ NOW</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', lineHeight: 1.2 }}>
                {currentTask ? `${currentTask.emoji} ${currentTask.title}` : nextTask ? `Up next: ${nextTask.emoji} ${nextTask.title}` : '🎉 All done!'}
              </div>
              {currentTask && (
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-dim)', marginTop: 4 }}>
                  {fmt12(currentTask.startTime)} – {fmt12(currentTask.endTime)}
                </div>
              )}
            </div>

            <FocusTimer />

            {plan?.motivation && (
              <div style={{ marginTop: 14, textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: 'var(--text-dim)', letterSpacing: 1 }}>
                "{plan.motivation}"
              </div>
            )}
          </div>
        </div>

        {/* MIDDLE — SCHEDULE */}
        <div className="panel">
          <div className="panel-hdr">📅 TODAY'S SCHEDULE</div>
          <div className="panel-body">
            {loading ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>LOADING...</div>
            ) : plan ? (
              plan.schedule.map((item, i) => (
                <ScheduleRow key={item.id} item={item} isLast={i === plan.schedule.length - 1} onComplete={() => completeTask(item.id)} />
              ))
            ) : (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-dim)' }}>
                <div style={{ fontSize: 14, letterSpacing: 3 }}>NO PLAN FOR TODAY</div>
                <div style={{ fontSize: 12, marginTop: 8 }}>Use the iOS app to plan your day</div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — CHECKLIST + MUSIC */}
        <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="panel-hdr">✅ TASK CHECKLIST</div>
          <div className="panel-body" style={{ flex: 1, overflowY: 'auto' }}>
            {/* Add task */}
            <div className="add-row">
              <input
                className="add-input"
                placeholder="Add a task..."
                value={addInput}
                onChange={e => setAddInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addTask()}
                maxLength={80}
              />
              <button className="add-btn" onClick={addTask}>+</button>
            </div>

            {allTasks.map(task => (
              <div
                key={task.id}
                className={`chk-item${checkedIds.has(task.id) ? ' done' : ''}`}
                onClick={() => toggleCheck(task.id)}
              >
                <div className={`chk-box${checkedIds.has(task.id) ? ' checked' : ''}`}>
                  {checkedIds.has(task.id) && <span style={{ color: '#000', fontSize: 11, fontWeight: 900 }}>✓</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="chk-text">{task.text}</div>
                  {task.note && <div style={{ fontSize: 9, color: 'var(--orange)', letterSpacing: 1, marginTop: 2 }}>{task.note}</div>}
                </div>
                {task.id.startsWith('custom_') && (
                  <button
                    className="del-btn"
                    onClick={e => { e.stopPropagation(); deleteTask(Number(task.id.replace('custom_', ''))); }}
                  >✕</button>
                )}
              </div>
            ))}
          </div>

          {/* YouTube Music */}
          <div className="music-sec">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ fontSize: 10, letterSpacing: 3, color: 'var(--text-dim)' }}>🎵 FLOW STATE MUSIC</div>
              <MusicBars />
            </div>
            <div style={{ borderRadius: 6, overflow: 'hidden', border: '1px solid var(--border)', background: '#000' }}>
              <iframe
                src="https://www.youtube.com/embed/videoseries?list=PLjvGKGzTSZiM_Q2w0hjdXp50zN1L0ca7r&autoplay=0&loop=1&rel=0"
                allow="autoplay; encrypted-media"
                allowFullScreen
                style={{ display: 'block', width: '100%', height: 150, border: 'none' }}
              />
            </div>
          </div>
        </div>

        {/* EMAIL — COMMITMENTS */}
        <EmailPanel
          commitments={emailTasks}
          scanning={scanning}
          criticalCount={criticalEmails.length}
          onScan={() => scanEmails(3)}
          onSchedule={scheduleCommitment}
          onDismiss={dismissCommitment}
        />
      </div>
    </div>
  );
}

// ─── Schedule Row ─────────────────────────────────────────────
function ScheduleRow({ item, isLast, onComplete }: { item: ScheduleItem; isLast: boolean; onComplete: () => void }) {
  const nowMin = () => { const n = new Date(); return n.getHours() * 60 + n.getMinutes() + n.getSeconds() / 60; };
  const toMin  = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const n = nowMin();
  const isCurrent = n >= toMin(item.startTime) && n < toMin(item.endTime);
  const isDone    = n >= toMin(item.endTime) || item.completed;

  return (
    <div className={`sch-row cat-${item.category}${isCurrent ? ' current' : ''}${isDone ? ' done' : ''}`}>
      <div className="sch-time">{fmt12(item.startTime)}</div>
      <div className="sch-dot" />
      {!isLast && <div className="sch-line" />}
      <div className="sch-content" onClick={onComplete} style={{ cursor: isDone ? 'default' : 'pointer' }}>
        <div className="sch-name">{item.emoji} {item.title}</div>
        {item.subtitle && <div className="sch-sub">{item.subtitle} · {item.durationMinutes}m</div>}
        <span className={`cat-badge ${item.category}`}>{item.category.toUpperCase()}</span>
      </div>
    </div>
  );
}

// ─── Lock In Overlay ──────────────────────────────────────────
function LockInOverlay({ secondsLeft, formatted, currentTime, isUrgent, currentTask, nextTask, onExit }: {
  secondsLeft: number; formatted: string; currentTime: string; isUrgent: boolean;
  currentTask: ScheduleItem | null; nextTask: ScheduleItem | null; onExit: () => void;
}) {
  const task = currentTask ?? nextTask;
  const [rot, setRot] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRot(r => (r + 0.5) % 360), 16);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9000, fontFamily: "'Barlow Condensed', sans-serif" }}>
      <style>{CSS}</style>
      <div className="ov-bg" />
      <div className="ov-scan" />
      <HUDCorners />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        {/* Arc ring container */}
        <div style={{ position: 'relative', width: 320, height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 32 }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 320 320">
            <circle cx="160" cy="160" r="148" fill="none" stroke="rgba(0,255,136,0.05)" strokeWidth="1.5" />
            <circle cx="160" cy="160" r="132" fill="none" stroke="rgba(0,255,136,0.04)" strokeWidth="1" />
            <circle cx="160" cy="160" r="148" fill="none" stroke="rgba(0,255,136,0.3)" strokeWidth="1.5"
              strokeDasharray="80 480" strokeLinecap="round"
              style={{ transformOrigin: '160px 160px', transform: `rotate(${rot}deg)` }} />
            <circle cx="160" cy="160" r="132" fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="1"
              strokeDasharray="40 600" strokeLinecap="round"
              style={{ transformOrigin: '160px 160px', transform: `rotate(${-rot * 1.4}deg)` }} />
            <circle cx="160" cy="160" r="116" fill="none" stroke="rgba(0,255,136,0.15)" strokeWidth="2"
              strokeDasharray="15 200" strokeLinecap="round"
              style={{ transformOrigin: '160px 160px', transform: `rotate(${rot * 2}deg)` }} />
          </svg>

          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ fontSize: 10, letterSpacing: 5, color: 'rgba(0,255,136,0.5)', marginBottom: 8 }}>TIME REMAINING</div>
            <div className={`ov-clock${isUrgent ? ' urgent' : ''}`}>{formatted}</div>
            <div style={{ fontFamily: 'monospace', fontSize: 13, color: 'rgba(0,212,255,0.4)', marginTop: 6, letterSpacing: 6 }}>{currentTime}</div>
          </div>
        </div>

        {/* Separator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg, transparent, rgba(0,255,136,0.35))' }} />
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--green)', boxShadow: '0 0 8px var(--green)' }} />
          <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg, rgba(0,255,136,0.35), transparent)' }} />
        </div>

        {/* Task */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 10, letterSpacing: 6, color: 'var(--text-dim)', marginBottom: 8 }}>▶ CURRENTLY WORKING ON</div>
          <div style={{ fontFamily: "'Orbitron', sans-serif", fontSize: 'clamp(14px,2.2vw,24px)', fontWeight: 700, color: '#fff', letterSpacing: 2, maxWidth: '80vw', lineHeight: 1.3 }}>
            {task ? `${task.emoji} ${task.title}` : 'FOCUS MODE ACTIVE'}
          </div>
          {task?.subtitle && (
            <div style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-dim)', marginTop: 6, letterSpacing: 2 }}>{task.subtitle}</div>
          )}
          {task && (
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(0,212,255,0.4)', marginTop: 6, letterSpacing: 3 }}>
              {fmt12(task.startTime)} → {fmt12(task.endTime)}
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: 'fixed', bottom: 30, display: 'flex', gap: 14, alignItems: 'center', zIndex: 2 }}>
        <MusicBars />
        <span style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: 'var(--text-dim)' }}>MUSIC PLAYING</span>
        <button className="ov-btn ov-exit" onClick={onExit} style={{ marginLeft: 20 }}>EXIT ✕</button>
      </div>
    </div>
  );
}

// ─── Focus Timer ──────────────────────────────────────────────
function FocusTimer() {
  const [preset, setPreset]   = useState(25);
  const [left, setLeft]       = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [total, setTotal]     = useState(25 * 60);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const circumference = 376.99;
  const progress = left / total;
  const offset   = circumference * (1 - progress);

  const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2,'0')}:${String(s % 60).padStart(2,'0')}`;

  const toggle = () => {
    if (running) {
      clearInterval(intervalRef.current!);
      setRunning(false);
    } else {
      setRunning(true);
      intervalRef.current = setInterval(() => {
        setLeft(l => {
          if (l <= 1) {
            clearInterval(intervalRef.current!);
            setRunning(false);
            if (Notification.permission === 'granted') new Notification('✅ Focus session complete!', { body: `${preset}min block done.` });
            return 0;
          }
          return l - 1;
        });
      }, 1000);
    }
  };

  const reset = () => {
    clearInterval(intervalRef.current!);
    setRunning(false);
    setLeft(preset * 60);
  };

  const pick = (m: number) => {
    if (running) return;
    setPreset(m); setTotal(m * 60); setLeft(m * 60);
  };

  useEffect(() => () => clearInterval(intervalRef.current!), []);

  return (
    <>
      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
      <div style={{ fontSize: 10, letterSpacing: 3, color: 'var(--text-dim)', textAlign: 'center', marginBottom: 8 }}>FOCUS TIMER</div>

      <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 12px' }}>
        <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
          <circle fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="6" cx="70" cy="70" r="60" />
          <circle fill="none" stroke="var(--cyan)" strokeWidth="6" strokeLinecap="round"
            strokeDasharray="376.99" strokeDashoffset={offset}
            cx="70" cy="70" r="60"
            style={{ transition: 'stroke-dashoffset 1s linear', filter: 'drop-shadow(0 0 6px rgba(0,212,255,0.8))' }} />
        </svg>
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', textAlign: 'center' }}>
          <div style={{ fontFamily: 'monospace', fontSize: 26, color: 'var(--cyan)', lineHeight: 1 }}>{fmt(left)}</div>
          <div style={{ fontSize: 9, letterSpacing: 2, color: 'var(--text-dim)', marginTop: 2 }}>
            {running ? 'LOCKED IN 🔥' : left === 0 ? 'DONE! 🔥' : 'READY'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
        {[25, 45, 60, 90].map(m => (
          <button key={m} className={`preset${preset === m ? ' active' : ''}`} onClick={() => pick(m)}>{m}m</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
        <button className="tbtn start" onClick={toggle}>{running ? 'PAUSE' : left < total && left > 0 ? 'RESUME' : 'START'}</button>
        <button className="tbtn reset" onClick={reset}>RESET</button>
      </div>
    </>
  );
}


// ─── Email Commitments Panel ──────────────────────────────────
function EmailPanel({ commitments, scanning, criticalCount, onScan, onSchedule, onDismiss }: {
  commitments: EmailCommitment[];
  scanning: boolean;
  criticalCount: number;
  onScan: () => void;
  onSchedule: (id: number, date?: string) => void;
  onDismiss: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const urgencyOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const sorted = [...commitments].sort((a, b) =>
    (urgencyOrder[a.urgency] ?? 3) - (urgencyOrder[b.urgency] ?? 3)
  );

  const urgencyColor = (u: string) => ({
    critical: 'var(--red)',
    high:     'var(--orange)',
    medium:   'var(--cyan)',
    low:      'var(--text-dim)',
  }[u] || 'var(--text-dim)');

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div className="panel-hdr" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span>
          📧 EMAIL COMMITMENTS
          {criticalCount > 0 && (
            <span style={{ marginLeft: 8, background: 'var(--red)', color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 9, fontWeight: 700 }}>
              {criticalCount} URGENT
            </span>
          )}
        </span>
        <button
          onClick={onScan}
          disabled={scanning}
          style={{ background: 'none', border: '1px solid rgba(0,212,255,0.3)', color: 'var(--cyan)', padding: '2px 8px', fontFamily: 'monospace', fontSize: 10, borderRadius: 3, cursor: scanning ? 'default' : 'pointer', opacity: scanning ? 0.6 : 1, letterSpacing: 1 }}
        >
          {scanning ? 'SCANNING...' : '⟳ SCAN'}
        </button>
      </div>

      <div className="panel-body">
        {scanning && (
          <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--text-dim)' }}>
            <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 3, marginBottom: 8 }}>READING INBOX...</div>
            <div style={{ display: 'flex', gap: 3, justifyContent: 'center', alignItems: 'flex-end', height: 20 }}>
              {[10,16,8,14,12,18,9].map((h,i) => (
                <div key={i} className="bar" style={{ height: h, animationDelay: `${i*0.1}s` }} />
              ))}
            </div>
          </div>
        )}

        {!scanning && commitments.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 16px' }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>📭</div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, letterSpacing: 2, color: 'var(--text-dim)', marginBottom: 8 }}>NO COMMITMENTS FOUND</div>
            <div style={{ fontSize: 12, color: 'var(--text-dim)', opacity: 0.6, marginBottom: 16 }}>
              Scan your inbox to find tasks, deadlines, and things you've committed to.
            </div>
            <button onClick={onScan} className="btn-lockin" style={{ width: '100%', justifyContent: 'center', display: 'flex' }}>
              📧 SCAN INBOX
            </button>
          </div>
        )}

        {sorted.map(c => (
          <div key={c.id} style={{ marginBottom: 8 }}>
            <div
              className="email-card"
              style={{ borderColor: c.urgency === 'critical' ? 'var(--red)' : c.urgency === 'high' ? 'rgba(255,107,53,0.3)' : 'var(--border)' }}
              onClick={() => setExpanded(expanded === c.id ? null : c.id)}
            >
              {/* Top row */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{c.emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: c.scheduled ? 'var(--text-dim)' : 'var(--text)', lineHeight: 1.3, textDecoration: c.scheduled ? 'line-through' : 'none' }}>
                    {c.title}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: urgencyColor(c.urgency), letterSpacing: 1, border: `1px solid ${urgencyColor(c.urgency)}`, padding: '1px 5px', borderRadius: 3 }}>
                      {c.urgency.toUpperCase()}
                    </span>
                    {c.deadline_label && c.deadline_label !== 'No deadline' && (
                      <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--gold)', letterSpacing: 1 }}>
                        ⏰ {c.deadline_label}
                      </span>
                    )}
                    <span style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--text-dim)' }}>~{c.estimated_minutes}m</span>
                  </div>
                </div>
              </div>

              {/* Source */}
              <div style={{ marginTop: 6, fontFamily: 'monospace', fontSize: 9, color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                From: {c.source_from} · {c.source_subject}
              </div>

              {/* Expanded detail */}
              {expanded === c.id && (
                <div style={{ marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.5, marginBottom: 12 }}>
                    {c.detail}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {!c.scheduled && (
                      <button
                        onClick={e => { e.stopPropagation(); onSchedule(c.id); }}
                        style={{ flex: 1, background: 'rgba(0,255,136,0.1)', border: '1px solid rgba(0,255,136,0.35)', color: 'var(--green)', padding: '6px 0', fontFamily: 'Orbitron', fontSize: 9, letterSpacing: 2, borderRadius: 3, cursor: 'pointer' }}
                      >
                        + ADD TO SCHEDULE
                      </button>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); onDismiss(c.id); }}
                      style={{ flex: c.scheduled ? 1 : 0, background: 'none', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-dim)', padding: '6px 10px', fontFamily: 'monospace', fontSize: 10, borderRadius: 3, cursor: 'pointer' }}
                    >
                      DISMISS
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Music Bars ───────────────────────────────────────────────
function MusicBars() {
  return (
    <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 16 }}>
      {[8, 14, 10, 16, 7].map((h, i) => (
        <div key={i} className="bar" style={{ height: h }} />
      ))}
    </div>
  );
}

// ─── HUD Corners ──────────────────────────────────────────────
function HUDCorners() {
  const s: React.CSSProperties = { position: 'absolute', width: 40, height: 40, pointerEvents: 'none' };
  const line = 'rgba(0,255,136,0.4)';
  return (
    <>
      <div style={{ ...s, top: 24, left: 24, borderTop: `2px solid ${line}`, borderLeft: `2px solid ${line}` }} />
      <div style={{ ...s, top: 24, right: 24, borderTop: `2px solid ${line}`, borderRight: `2px solid ${line}` }} />
      <div style={{ ...s, bottom: 24, left: 24, borderBottom: `2px solid ${line}`, borderLeft: `2px solid ${line}` }} />
      <div style={{ ...s, bottom: 24, right: 24, borderBottom: `2px solid ${line}`, borderRight: `2px solid ${line}` }} />
    </>
  );
}

// ─── CSS ─────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Orbitron:wght@400;700;900&family=Barlow+Condensed:wght@300;400;600;700&display=swap');
  :root {
    --bg:#060d12;--bg2:#0b1820;--bg3:#0f2030;
    --green:#00ff88;--cyan:#00d4ff;--orange:#ff6b35;--red:#ff3366;--gold:#ffd166;
    --text:#c8dde8;--text-dim:#5a7a8a;--border:rgba(0,212,255,0.15);
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--bg);}
  .header{background:rgba(11,24,32,0.95);border-bottom:1px solid var(--border);padding:10px 20px;display:flex;align-items:center;gap:14px;backdrop-filter:blur(10px);flex-shrink:0;
    background-image:repeating-linear-gradient(0deg,transparent,transparent 39px,rgba(0,212,255,0.03) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,rgba(0,212,255,0.03) 40px);}
  .title{font-family:'Orbitron',sans-serif;font-size:18px;font-weight:900;color:var(--green);text-shadow:0 0 20px rgba(0,255,136,0.4);letter-spacing:4px;}
  .subtitle{font-size:12px;color:var(--text-dim);letter-spacing:2px;}
  .live-clock{font-family:monospace;font-size:22px;color:var(--cyan);text-shadow:0 0 20px rgba(0,212,255,0.4);}
  .sub-text{font-size:11px;color:var(--text-dim);letter-spacing:2px;}
  .btn-lockin{background:linear-gradient(135deg,rgba(0,255,136,0.15),rgba(0,212,255,0.08));border:1px solid rgba(0,255,136,0.5);color:var(--green);padding:7px 16px;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;border-radius:4px;cursor:pointer;transition:all .2s;white-space:nowrap;}
  .btn-lockin:hover{background:rgba(0,255,136,0.25);box-shadow:0 0 20px rgba(0,255,136,0.4);}
  .btn-notif{background:rgba(255,209,102,0.1);border:1px solid rgba(255,209,102,0.3);color:var(--gold);padding:6px 12px;font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:1px;border-radius:3px;cursor:pointer;transition:all .2s;}
  .progress-strip{background:var(--bg2);border-bottom:1px solid var(--border);padding:6px 20px;display:flex;align-items:center;gap:15px;flex-shrink:0;}
  .prog-outer{flex:1;height:6px;background:rgba(255,255,255,0.05);border-radius:3px;overflow:hidden;border:1px solid rgba(0,212,255,0.1);}
  .prog-inner{height:100%;background:linear-gradient(90deg,var(--green),var(--cyan));border-radius:3px;transition:width .5s ease;box-shadow:0 0 10px rgba(0,255,136,0.5);}
  .grid{display:grid;grid-template-columns:260px 1fr 280px 300px;flex:1;overflow:hidden;}
  .panel{border-right:1px solid var(--border);display:flex;flex-direction:column;overflow:hidden;}
  .panel:last-child{border-right:none;}
  .panel-hdr{padding:10px 16px;background:rgba(0,212,255,0.04);border-bottom:1px solid var(--border);font-size:10px;letter-spacing:3px;color:var(--text-dim);flex-shrink:0;}
  .panel-body{flex:1;overflow-y:auto;padding:16px;scrollbar-width:thin;scrollbar-color:var(--border) transparent;}
  .panel-body::-webkit-scrollbar{width:4px;}.panel-body::-webkit-scrollbar-thumb{background:var(--border);border-radius:2px;}
  .cd-label{font-size:10px;letter-spacing:3px;color:var(--text-dim);text-align:center;margin-bottom:6px;}
  .cd-clock{font-family:monospace;font-size:52px;text-align:center;color:var(--green);text-shadow:0 0 20px rgba(0,255,136,0.4);line-height:1;letter-spacing:4px;animation:glow-pulse 2s ease-in-out infinite;}
  .cd-clock.urgent{color:var(--orange);animation:glow-urgent .8s ease-in-out infinite;}
  @keyframes glow-pulse{0%,100%{text-shadow:0 0 20px rgba(0,255,136,0.4);}50%{text-shadow:0 0 40px rgba(0,255,136,0.8),0 0 60px rgba(0,255,136,0.3);}}
  @keyframes glow-urgent{0%,100%{text-shadow:0 0 20px rgba(255,107,53,0.4);}50%{text-shadow:0 0 50px rgba(255,107,53,1),0 0 80px rgba(255,107,53,0.5);}}
  .cur-card{margin:14px 0;background:rgba(0,255,136,0.05);border:1px solid rgba(0,255,136,0.2);border-radius:6px;padding:12px;position:relative;overflow:hidden;}
  .cur-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--green);box-shadow:0 0 20px rgba(0,255,136,0.4);}
  .preset{background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.2);color:var(--cyan);padding:4px 10px;font-family:'Barlow Condensed',sans-serif;font-size:12px;letter-spacing:1px;border-radius:3px;cursor:pointer;transition:all .2s;}
  .preset.active,.preset:hover{background:rgba(0,212,255,0.2);border-color:var(--cyan);box-shadow:0 0 10px rgba(0,212,255,0.3);}
  .tbtn{background:none;border:1px solid var(--border);color:var(--text);padding:8px 18px;font-family:'Orbitron',sans-serif;font-size:11px;font-weight:700;letter-spacing:2px;border-radius:3px;cursor:pointer;transition:all .2s;}
  .tbtn.start{border-color:var(--green);color:var(--green);}.tbtn.start:hover{background:rgba(0,255,136,0.1);box-shadow:0 0 20px rgba(0,255,136,0.4);}
  .tbtn.reset:hover{background:rgba(255,51,102,0.1);border-color:var(--red);color:var(--red);}
  .sch-row{display:flex;gap:12px;margin-bottom:6px;position:relative;padding-left:4px;align-items:flex-start;}
  .sch-time{font-family:monospace;font-size:12px;color:var(--text-dim);width:70px;flex-shrink:0;padding-top:8px;}
  .sch-dot{width:10px;height:10px;border-radius:50%;background:var(--border);border:2px solid var(--bg);flex-shrink:0;margin-top:10px;position:relative;z-index:1;transition:all .3s;}
  .sch-line{position:absolute;left:78px;top:22px;bottom:-6px;width:1px;background:var(--border);}
  .sch-content{flex:1;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:8px 12px;margin-bottom:6px;transition:all .3s;}
  .sch-content:hover{background:var(--bg3);border-color:rgba(0,212,255,0.3);}
  .sch-name{font-size:14px;font-weight:600;color:var(--text);line-height:1.2;}
  .sch-sub{font-size:11px;color:var(--text-dim);margin-top:2px;letter-spacing:1px;}
  .sch-row.current .sch-content{background:rgba(0,255,136,0.07);border-color:rgba(0,255,136,0.4);box-shadow:0 0 15px rgba(0,255,136,0.1);}
  .sch-row.current .sch-dot{background:var(--green);border-color:var(--green);animation:dot-pulse 1.5s ease-in-out infinite;}
  .sch-row.current .sch-name{color:#fff;}.sch-row.current .sch-time{color:var(--green);}
  .sch-row.done .sch-content{opacity:.35;background:rgba(0,0,0,.2);}.sch-row.done .sch-dot{background:var(--text-dim);}
  .sch-row.done .sch-name{text-decoration:line-through;color:var(--text-dim);}
  @keyframes dot-pulse{0%,100%{box-shadow:0 0 10px rgba(0,255,136,.6),0 0 0 3px rgba(0,255,136,.1);}50%{box-shadow:0 0 20px rgba(0,255,136,.9),0 0 0 5px rgba(0,255,136,.2);}}
  .cat-urgent .sch-content{border-left:3px solid var(--orange);}
  .cat-study .sch-content{border-left:3px solid var(--cyan);}
  .cat-personal .sch-content{border-left:3px solid var(--text-dim);}
  .cat-badge{display:inline-block;font-size:9px;letter-spacing:2px;padding:1px 6px;border-radius:2px;margin-top:3px;}
  .cat-badge.urgent{background:rgba(255,107,53,.15);color:var(--orange);}
  .cat-badge.study{background:rgba(0,212,255,.1);color:var(--cyan);}
  .cat-badge.personal{background:rgba(100,130,150,.1);color:var(--text-dim);}
  .cat-badge.work{background:rgba(167,139,250,.1);color:#A78BFA;}
  .cat-badge.health{background:rgba(0,255,136,.1);color:var(--green);}
  .cat-badge.meal{background:rgba(255,209,102,.1);color:var(--gold);}
  .add-row{display:flex;gap:6px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border);}
  .add-input{flex:1;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:7px 10px;font-family:'Barlow Condensed',sans-serif;font-size:13px;border-radius:4px;outline:none;transition:border-color .2s;}
  .add-input:focus{border-color:var(--cyan);}.add-input::placeholder{color:var(--text-dim);}
  .add-btn{background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.35);color:var(--green);padding:7px 14px;font-family:'Orbitron',sans-serif;font-size:16px;font-weight:700;border-radius:4px;cursor:pointer;transition:all .2s;}
  .add-btn:hover{background:rgba(0,255,136,.2);box-shadow:0 0 20px rgba(0,255,136,.4);}
  .chk-item{display:flex;align-items:flex-start;gap:10px;margin-bottom:8px;padding:8px 10px;background:var(--bg2);border:1px solid var(--border);border-radius:5px;cursor:pointer;transition:all .2s;position:relative;}
  .chk-item:hover{background:var(--bg3);border-color:rgba(0,212,255,.3);}.chk-item:hover .del-btn{opacity:1;}
  .chk-item.done{opacity:.4;background:rgba(0,0,0,.2);}
  .chk-box{width:18px;height:18px;border:2px solid var(--border);border-radius:3px;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:all .2s;margin-top:1px;}
  .chk-box.checked{background:var(--green);border-color:var(--green);box-shadow:0 0 8px rgba(0,255,136,.5);}
  .chk-text{font-size:13px;color:var(--text);line-height:1.3;}.chk-item.done .chk-text{text-decoration:line-through;color:var(--text-dim);}
  .del-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-dim);font-size:14px;cursor:pointer;opacity:0;transition:opacity .2s,color .2s;padding:2px 4px;}
  .del-btn:hover{color:var(--red);}
  .music-sec{border-top:1px solid var(--border);padding:12px;flex-shrink:0;background:rgba(11,24,32,.85);}
  .bar{width:3px;background:var(--green);border-radius:1px;box-shadow:0 0 4px rgba(0,255,136,.5);animation:bar-bounce .8s ease-in-out infinite alternate;}
  .bar:nth-child(1){animation-delay:0s;}.bar:nth-child(2){animation-delay:.15s;}.bar:nth-child(3){animation-delay:.3s;}.bar:nth-child(4){animation-delay:.1s;}.bar:nth-child(5){animation-delay:.25s;}
  @keyframes bar-bounce{from{transform:scaleY(.3);}to{transform:scaleY(1);}}
  .ov-bg{position:absolute;inset:0;background:radial-gradient(ellipse 60% 40% at 50% 50%,rgba(0,255,136,.05) 0%,transparent 70%),repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(0,255,136,.02) 60px),repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(0,255,136,.02) 60px);pointer-events:none;}
  .ov-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,.12) 4px);pointer-events:none;opacity:.5;}
  .ov-clock{font-family:monospace;font-size:clamp(64px,14vw,160px);line-height:1;color:var(--green);letter-spacing:8px;text-shadow:0 0 60px rgba(0,255,136,.6),0 0 120px rgba(0,255,136,.2);animation:ov-glow 2s ease-in-out infinite;}
  .ov-clock.urgent{color:var(--orange);animation:ov-urgent .6s ease-in-out infinite;}
  @keyframes ov-glow{0%,100%{text-shadow:0 0 60px rgba(0,255,136,.6),0 0 120px rgba(0,255,136,.2);}50%{text-shadow:0 0 100px rgba(0,255,136,.9),0 0 200px rgba(0,255,136,.4);}}
  @keyframes ov-urgent{0%,100%{text-shadow:0 0 60px rgba(255,107,53,.7);}50%{text-shadow:0 0 120px rgba(255,107,53,1),0 0 200px rgba(255,107,53,.5);}}
  .ov-btn{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:var(--text-dim);padding:10px 20px;font-family:'Orbitron',sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;border-radius:4px;cursor:pointer;transition:all .2s;}
  .ov-btn:hover{border-color:var(--cyan);color:var(--cyan);background:rgba(0,212,255,.08);}
  .ov-exit:hover{border-color:var(--red);color:var(--red);background:rgba(255,51,102,.08);}
  .email-card{background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;cursor:pointer;transition:all .2s;}
  .email-card:hover{background:var(--bg3);border-color:rgba(0,212,255,0.3);}
`;
