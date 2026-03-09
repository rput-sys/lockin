'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { usePlan } from '../hooks/usePlan';
import { useLockIn } from '../hooks/useLockIn';
import { useCountdown } from '../hooks/useCountdown';
import { useEmailCommitments, type EmailCommitment } from '../hooks/useEmailCommitments';
import { usePWA } from '../hooks/usePWA';
import { ScheduleItem } from '../lib/supabase';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// ─── Helpers ──────────────────────────────────────────────────
function fmt12(t: string) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${h < 12 ? 'AM' : 'PM'}`;
}

function formatSecs(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

// ─── Root ─────────────────────────────────────────────────────
export default function MobilePage() {
  const [tab, setTab]   = useState<'today'|'plan'|'email'|'settings'>('today');
  const { plan, loading, currentTask, nextTask, completedCount, totalCount, completeTask } = usePlan();
  const { isActive, loading: lockLoading, toggle } = useLockIn(currentTask);
  const { secondsLeft, formatted, currentTime, isUrgent } = useCountdown(currentTask, nextTask);
  const email = useEmailCommitments();
  const pwa   = usePWA();

  // Handle ?tab= and ?lockin= query params (from shortcuts)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab')) setTab(params.get('tab') as any);
    if (params.get('lockin') === '1' && !isActive) toggle();
  }, []);

  return (
    <div style={{ background: '#060d12', color: '#c8dde8', height: '100dvh', display: 'flex', flexDirection: 'column', fontFamily: "'Barlow Condensed', sans-serif", overflow: 'hidden' }}>
      <style>{MOBILE_CSS}</style>

      {/* LOCK IN FULLSCREEN */}
      {isActive && (
        <LockInOverlay
          formatted={formatted}
          currentTime={currentTime}
          isUrgent={isUrgent}
          secondsLeft={secondsLeft}
          task={currentTask ?? nextTask}
          onExit={toggle}
        />
      )}

      {/* iOS Install Guide */}
      {pwa.showIOSGuide && <IOSInstallGuide onClose={() => pwa.setShowIOSGuide(false)} />}

      {/* HEADER */}
      <div className="m-header">
        <div>
          <div className="m-title">⚡ LOCK IN</div>
          <div className="m-sub">{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase()}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {!pwa.isInstalled && (
            <button className="m-install-btn" onClick={pwa.install}>
              {pwa.isIOS ? '📲 INSTALL' : '⬇ INSTALL'}
            </button>
          )}
          <div style={{ textAlign: 'right' }}>
            <div className="m-clock">{currentTime}</div>
            <div className="m-sub" style={{ color: isUrgent ? '#ff6b35' : '#00ff88' }}>{formatted}</div>
          </div>
        </div>
      </div>

      {/* PROGRESS BAR */}
      <div className="m-prog-wrap">
        <div className="m-prog-bar" style={{ width: `${totalCount > 0 ? (completedCount/totalCount)*100 : 0}%` }} />
      </div>

      {/* TAB CONTENT */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'today'    && <TodayTab plan={plan} loading={loading} currentTask={currentTask} nextTask={nextTask} formatted={formatted} isUrgent={isUrgent} secondsLeft={secondsLeft} onToggleLockIn={toggle} lockLoading={lockLoading} onComplete={completeTask} />}
        {tab === 'plan'     && <PlanTab />}
        {tab === 'email'    && <EmailTab email={email} />}
        {tab === 'settings' && <SettingsTab pwa={pwa} />}
      </div>

      {/* BOTTOM NAV */}
      <nav className="m-nav">
        {([
          ['today',    '⚡', 'TODAY'],
          ['plan',     '🎙', 'PLAN'],
          ['email',    '📧', 'EMAIL'],
          ['settings', '⚙', 'MORE'],
        ] as const).map(([id, icon, label]) => (
          <button
            key={id}
            className={`m-nav-btn${tab === id ? ' active' : ''}`}
            onClick={() => setTab(id)}
          >
            <span className="m-nav-icon">{icon}</span>
            <span className="m-nav-label">{label}</span>
            {id === 'email' && email.critical.length > 0 && (
              <span className="m-badge">{email.critical.length}</span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}

// ─── TODAY TAB ────────────────────────────────────────────────
function TodayTab({ plan, loading, currentTask, nextTask, formatted, isUrgent, secondsLeft, onToggleLockIn, lockLoading, onComplete }: any) {
  const progressPct = plan ? (plan.schedule.filter((t: any) => t.completed).length / plan.schedule.length) * 100 : 0;

  return (
    <div className="m-scroll">
      {/* Current block card */}
      <div className="m-now-card">
        <div className="m-now-label">▶ {currentTask ? 'NOW' : nextTask ? 'UP NEXT' : 'FREE TIME'}</div>
        <div className="m-now-title">
          {currentTask ? `${currentTask.emoji} ${currentTask.title}` :
           nextTask    ? `${nextTask.emoji} ${nextTask.title}` : '🎉 All clear!'}
        </div>
        {(currentTask || nextTask) && (
          <div className="m-now-time">
            {currentTask ? `${fmt12(currentTask.startTime)} → ${fmt12(currentTask.endTime)}` :
              `Starts at ${fmt12(nextTask.startTime)}`}
          </div>
        )}
        <div className={`m-countdown${isUrgent ? ' urgent' : ''}`}>{formatted}</div>

        {/* Lock In button */}
        <button className="m-lockin-btn" onClick={onToggleLockIn} disabled={lockLoading}>
          {lockLoading ? '...' : '⚡ LOCK IN MODE'}
        </button>
      </div>

      {/* Schedule */}
      <div className="m-section-hdr">TODAY'S SCHEDULE</div>

      {loading && <div className="m-loading">LOADING...</div>}

      {!loading && !plan && (
        <div className="m-empty">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📅</div>
          <div>No plan yet. Tap PLAN to set up your day.</div>
        </div>
      )}

      {plan?.schedule.map((item: ScheduleItem, i: number) => (
        <MobileScheduleRow key={item.id} item={item} isLast={i === plan.schedule.length - 1} onComplete={() => onComplete(item.id)} />
      ))}

      <div style={{ height: 20 }} />
    </div>
  );
}

// ─── MOBILE SCHEDULE ROW ──────────────────────────────────────
function MobileScheduleRow({ item, isLast, onComplete }: { item: ScheduleItem; isLast: boolean; onComplete: () => void }) {
  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const toMin  = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const isCur  = nowMin >= toMin(item.startTime) && nowMin < toMin(item.endTime);
  const isPast = nowMin >= toMin(item.endTime) || item.completed;

  const catColors: Record<string, string> = {
    urgent: '#FF6B35', study: '#00D4FF', work: '#A78BFA',
    personal: '#5A7A8A', health: '#00FF88', meal: '#FFD166',
  };
  const color = catColors[item.category] || '#5A7A8A';

  return (
    <div className={`m-row${isCur ? ' current' : ''}${isPast ? ' past' : ''}`} onClick={!isPast ? onComplete : undefined}>
      <div className="m-row-accent" style={{ background: color }} />
      <div className="m-row-time">{fmt12(item.startTime)}</div>
      <div className="m-row-body">
        <div className="m-row-title">{item.emoji} {item.title}</div>
        {item.subtitle && <div className="m-row-sub">{item.subtitle}</div>}
      </div>
      {isCur && <div className="m-row-live">LIVE</div>}
    </div>
  );
}

// ─── PLAN TAB ─────────────────────────────────────────────────
function PlanTab() {
  const [recording, setRecording]   = useState(false);
  const [transcript, setTranscript] = useState('');
  const [generating, setGenerating] = useState(false);
  const [result, setResult]         = useState<any>(null);
  const [error, setError]           = useState('');
  const recognitionRef              = useRef<any>(null);

  // Web Speech API
  const startRecording = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) { setError('Speech recognition not supported on this browser. Try Chrome or Safari 16.4+.'); return; }

    const rec = new SpeechRecognition();
    rec.continuous   = true;
    rec.interimResults = true;
    rec.lang = 'en-US';

    rec.onresult = (e: any) => {
      const t = Array.from(e.results).map((r: any) => r[0].transcript).join(' ');
      setTranscript(t);
    };
    rec.onerror = (e: any) => { setError(e.error); setRecording(false); };
    rec.onend   = () => setRecording(false);

    rec.start();
    recognitionRef.current = rec;
    setRecording(true);
  };

  const stopRecording = () => {
    recognitionRef.current?.stop();
    setRecording(false);
  };

  const generate = async () => {
    if (!transcript.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const date = tomorrow.toISOString().split('T')[0];

      const res = await fetch(`${API}/schedule/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    }
    setGenerating(false);
  };

  return (
    <div className="m-scroll">
      <div className="m-section-hdr">VOICE PLANNING</div>
      <div style={{ padding: '0 16px', color: '#5a7a8a', fontSize: 13, marginBottom: 16 }}>
        Tell me what you need to accomplish tomorrow. Speak naturally.
      </div>

      {/* Mic button */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
        <button
          className={`m-mic${recording ? ' active' : ''}`}
          onClick={recording ? stopRecording : startRecording}
        >
          <span style={{ fontSize: 40 }}>{recording ? '⏹' : '🎙'}</span>
        </button>
        <div style={{ marginTop: 12, fontSize: 12, letterSpacing: 3, color: recording ? '#00ff88' : '#5a7a8a' }}>
          {recording ? 'LISTENING...' : 'TAP TO SPEAK'}
        </div>
        {recording && (
          <div style={{ display: 'flex', gap: 3, marginTop: 12, alignItems: 'flex-end', height: 24 }}>
            {[10,16,8,14,12,18,9,15,11].map((h, i) => (
              <div key={i} className="m-bar" style={{ height: h, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Transcript */}
      {transcript && (
        <div className="m-card" style={{ margin: '0 16px 16px', position: 'relative' }}>
          <div style={{ fontSize: 10, letterSpacing: 3, color: '#5a7a8a', marginBottom: 8 }}>TRANSCRIPT</div>
          <div style={{ fontSize: 14, lineHeight: 1.5 }}>{transcript}</div>
          <button
            onClick={() => setTranscript('')}
            style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', color: '#5a7a8a', fontSize: 16, cursor: 'pointer' }}
          >✕</button>
        </div>
      )}

      {/* Manual text input fallback */}
      {!transcript && !recording && (
        <div style={{ padding: '0 16px 16px' }}>
          <textarea
            placeholder="Or type your tasks here..."
            className="m-textarea"
            onChange={e => setTranscript(e.target.value)}
            rows={4}
          />
        </div>
      )}

      {error && <div className="m-error">{error}</div>}

      {transcript && !generating && !result && (
        <div style={{ padding: '0 16px 16px' }}>
          <button className="m-btn-primary" onClick={generate}>
            ⚡ GENERATE SCHEDULE
          </button>
        </div>
      )}

      {generating && (
        <div style={{ textAlign: 'center', padding: 24, color: '#5a7a8a' }}>
          <div style={{ fontSize: 11, letterSpacing: 3 }}>AI BUILDING YOUR DAY...</div>
        </div>
      )}

      {result && (
        <div className="m-card" style={{ margin: '0 16px 16px' }}>
          <div style={{ color: '#00ff88', fontSize: 11, letterSpacing: 3, marginBottom: 10 }}>✅ SCHEDULE READY — {result.schedule.length} BLOCKS</div>
          {result.motivation && (
            <div style={{ color: '#5a7a8a', fontSize: 13, fontStyle: 'italic', marginBottom: 12 }}>"{result.motivation}"</div>
          )}
          {result.schedule.slice(0, 6).map((item: any) => (
            <div key={item.id} style={{ display: 'flex', gap: 10, marginBottom: 8, alignItems: 'center' }}>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#5a7a8a', width: 58, flexShrink: 0 }}>{fmt12(item.startTime)}</div>
              <div style={{ fontSize: 13 }}>{item.emoji} {item.title}</div>
            </div>
          ))}
          {result.schedule.length > 6 && (
            <div style={{ color: '#5a7a8a', fontSize: 12 }}>+{result.schedule.length - 6} more...</div>
          )}
          <div style={{ marginTop: 12, color: '#00ff88', fontSize: 11, opacity: 0.7 }}>✓ Added to Google Calendar</div>
        </div>
      )}

      <div style={{ height: 20 }} />
    </div>
  );
}

// ─── EMAIL TAB ────────────────────────────────────────────────
function EmailTab({ email }: { email: ReturnType<typeof useEmailCommitments> }) {
  const [expanded, setExpanded] = useState<number | null>(null);

  const urgencyColor = (u: string) => ({
    critical: '#ff3366', high: '#ff6b35', medium: '#00d4ff', low: '#5a7a8a'
  }[u] || '#5a7a8a');

  return (
    <div className="m-scroll">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <div className="m-section-hdr" style={{ padding: 0 }}>
          EMAIL COMMITMENTS
          {email.critical.length > 0 && <span className="m-badge" style={{ marginLeft: 8, position: 'static' }}>{email.critical.length}</span>}
        </div>
        <button
          onClick={() => email.scan(3)}
          disabled={email.scanning}
          className="m-scan-btn"
        >
          {email.scanning ? 'SCANNING...' : '⟳ SCAN'}
        </button>
      </div>

      {email.scanning && (
        <div style={{ textAlign: 'center', padding: 32, color: '#5a7a8a' }}>
          <div style={{ display: 'flex', gap: 3, justifyContent: 'center', marginBottom: 12, alignItems: 'flex-end', height: 24 }}>
            {[10,16,8,14,12,18,9].map((h, i) => (
              <div key={i} className="m-bar" style={{ height: h, animationDelay: `${i*0.1}s` }} />
            ))}
          </div>
          <div style={{ fontSize: 11, letterSpacing: 3 }}>READING YOUR INBOX...</div>
        </div>
      )}

      {!email.scanning && email.pending.length === 0 && (
        <div className="m-empty">
          <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
          <div style={{ marginBottom: 20 }}>No commitments found. Scan your inbox to find tasks, deadlines, and promises.</div>
          <button className="m-btn-primary" onClick={() => email.scan(3)}>📧 SCAN INBOX</button>
        </div>
      )}

      {email.pending.map(c => (
        <div key={c.id} className="m-email-card" onClick={() => setExpanded(expanded === c.id ? null : c.id)}
          style={{ borderLeftColor: urgencyColor(c.urgency) }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>{c.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{c.title}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 9, letterSpacing: 1.5, color: urgencyColor(c.urgency), border: `1px solid ${urgencyColor(c.urgency)}`, padding: '1px 5px', borderRadius: 3 }}>{c.urgency.toUpperCase()}</span>
                {c.deadline_label && c.deadline_label !== 'No deadline' && (
                  <span style={{ fontSize: 10, color: '#ffd166' }}>⏰ {c.deadline_label}</span>
                )}
                <span style={{ fontSize: 10, color: '#5a7a8a', fontFamily: 'monospace' }}>~{c.estimated_minutes}m</span>
              </div>
              <div style={{ fontSize: 10, color: '#5a7a8a', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.source_from} · {c.source_subject}
              </div>
            </div>
          </div>

          {expanded === c.id && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(0,212,255,0.1)' }}>
              {c.detail && <div style={{ fontSize: 13, color: '#5a7a8a', lineHeight: 1.5, marginBottom: 12 }}>{c.detail}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="m-add-btn" onClick={e => { e.stopPropagation(); email.scheduleCommitment(c.id); }}>
                  + ADD TO SCHEDULE
                </button>
                <button className="m-dismiss-btn" onClick={e => { e.stopPropagation(); email.dismissCommitment(c.id); }}>
                  DISMISS
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
      <div style={{ height: 20 }} />
    </div>
  );
}

// ─── SETTINGS TAB ─────────────────────────────────────────────
function SettingsTab({ pwa }: { pwa: ReturnType<typeof usePWA> }) {
  const [apiUrl, setApiUrl] = useState(typeof window !== 'undefined' ? localStorage.getItem('li_api_url') || API : API);
  const [saved, setSaved]   = useState(false);

  const save = () => {
    localStorage.setItem('li_api_url', apiUrl);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="m-scroll">
      <div className="m-section-hdr">SETTINGS</div>

      {/* Install */}
      {!pwa.isInstalled && (
        <div className="m-card" style={{ margin: '0 16px 12px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#5a7a8a', marginBottom: 8 }}>ADD TO HOME SCREEN</div>
          <div style={{ fontSize: 13, color: '#c8dde8', marginBottom: 12 }}>Install LOCK IN on your iPhone for the full app experience — works offline, faster launch.</div>
          <button className="m-btn-primary" onClick={pwa.install}>
            {pwa.isIOS ? '📲 How to Install on iPhone' : '⬇ Install App'}
          </button>
        </div>
      )}

      {/* Push Notifications */}
      {!pwa.isPushEnabled && (
        <div className="m-card" style={{ margin: '0 16px 12px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#5a7a8a', marginBottom: 8 }}>NOTIFICATIONS</div>
          <div style={{ fontSize: 13, color: '#c8dde8', marginBottom: 12 }}>Enable push notifications for daily planning reminders and task alerts.</div>
          <button className="m-btn-primary" onClick={pwa.enablePush}>🔔 Enable Notifications</button>
        </div>
      )}
      {pwa.isPushEnabled && (
        <div className="m-card" style={{ margin: '0 16px 12px' }}>
          <div style={{ fontSize: 11, letterSpacing: 3, color: '#00ff88' }}>✓ NOTIFICATIONS ENABLED</div>
        </div>
      )}

      {/* Backend URL */}
      <div className="m-card" style={{ margin: '0 16px 12px' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#5a7a8a', marginBottom: 8 }}>BACKEND URL</div>
        <input
          className="m-input"
          value={apiUrl}
          onChange={e => setApiUrl(e.target.value)}
          placeholder="https://your-app.railway.app"
        />
        <button className="m-btn-primary" style={{ marginTop: 10 }} onClick={save}>
          {saved ? '✓ SAVED' : 'SAVE'}
        </button>
      </div>

      {/* Google Calendar */}
      <div className="m-card" style={{ margin: '0 16px 12px' }}>
        <div style={{ fontSize: 11, letterSpacing: 3, color: '#5a7a8a', marginBottom: 8 }}>GOOGLE CALENDAR</div>
        <div style={{ fontSize: 13, color: '#c8dde8', marginBottom: 12 }}>Connect to read and write your Google Calendar events.</div>
        <button className="m-btn-secondary" onClick={() => window.open(`${apiUrl}/auth/google`, '_blank')}>
          Connect Google Calendar
        </button>
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}

// ─── LOCK IN OVERLAY ──────────────────────────────────────────
function LockInOverlay({ formatted, currentTime, isUrgent, secondsLeft, task, onExit }: any) {
  const [rot, setRot] = useState(0);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setRot(r => (r + 0.6) % 360), 16);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#000', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: "'Barlow Condensed',sans-serif" }}>
      <style>{MOBILE_CSS}</style>
      <div className="ov-bg" />
      <div className="ov-scan" />

      {/* HUD corners */}
      {[{t:16,l:16},{t:16,r:16},{b:16,l:16},{b:16,r:16}].map((p,i) => (
        <div key={i} style={{ position:'absolute', width:36, height:36, pointerEvents:'none', ...Object.fromEntries(Object.entries(p).map(([k,v])=>[k,v])),
          borderTop: (p as any).t !== undefined ? '2px solid rgba(0,255,136,0.4)' : undefined,
          borderBottom: (p as any).b !== undefined ? '2px solid rgba(0,255,136,0.4)' : undefined,
          borderLeft: (p as any).l !== undefined ? '2px solid rgba(0,255,136,0.4)' : undefined,
          borderRight: (p as any).r !== undefined ? '2px solid rgba(0,255,136,0.4)' : undefined,
        }} />
      ))}

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px', width: '100%' }}>
        {/* Arc rings */}
        <div style={{ position: 'relative', width: 260, height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} viewBox="0 0 260 260">
            <circle cx="130" cy="130" r="120" fill="none" stroke="rgba(0,255,136,0.05)" strokeWidth="1.5"/>
            <circle cx="130" cy="130" r="120" fill="none" stroke="rgba(0,255,136,0.3)" strokeWidth="1.5"
              strokeDasharray="80 480" strokeLinecap="round"
              style={{ transformOrigin:'130px 130px', transform:`rotate(${rot}deg)` }}/>
            <circle cx="130" cy="130" r="106" fill="none" stroke="rgba(0,212,255,0.2)" strokeWidth="1"
              strokeDasharray="40 600" strokeLinecap="round"
              style={{ transformOrigin:'130px 130px', transform:`rotate(${-rot*1.4}deg)` }}/>
          </svg>
          <div style={{ textAlign: 'center', position: 'relative', zIndex: 1 }}>
            <div style={{ fontSize: 9, letterSpacing: 5, color: 'rgba(0,255,136,0.5)', marginBottom: 6 }}>REMAINING</div>
            <div style={{ fontFamily:'monospace', fontSize: 'clamp(48px,14vw,72px)', color: isUrgent ? '#ff6b35' : '#00ff88',
              textShadow: `0 0 40px ${isUrgent ? 'rgba(255,107,53,0.7)' : 'rgba(0,255,136,0.6)'}`, lineHeight: 1 }}>
              {formatted}
            </div>
            <div style={{ fontFamily:'monospace', fontSize: 12, color: 'rgba(0,212,255,0.4)', marginTop: 6, letterSpacing: 4 }}>{currentTime}</div>
          </div>
        </div>

        <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg,transparent,rgba(0,255,136,.35))', margin: '20px 0 6px' }} />
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#00ff88', boxShadow:'0 0 8px #00ff88', marginBottom: 6 }} />
        <div style={{ width: 100, height: 1, background: 'linear-gradient(90deg,rgba(0,255,136,.35),transparent)', marginBottom: 24 }} />

        {task && (
          <>
            <div style={{ fontSize: 9, letterSpacing: 5, color: '#5a7a8a', marginBottom: 10 }}>WORKING ON</div>
            <div style={{ fontSize: 'clamp(18px,5vw,26px)', fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
              {task.emoji} {task.title}
            </div>
            {task.subtitle && (
              <div style={{ fontFamily:'monospace', fontSize: 11, color: '#5a7a8a', marginTop: 6 }}>{task.subtitle}</div>
            )}
          </>
        )}
        {!task && <div style={{ fontSize: 22, fontWeight: 700, color: '#00ff88' }}>FOCUS MODE ACTIVE</div>}
      </div>

      {/* Exit */}
      <div style={{ position: 'fixed', bottom: 40, zIndex: 2 }}>
        {confirm ? (
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={onExit} style={{ background:'rgba(255,51,102,0.15)', border:'1px solid #ff3366', color:'#ff3366', padding:'10px 24px', fontFamily:'Courier New', fontSize:12, letterSpacing:2, borderRadius:4, cursor:'pointer' }}>
              EXIT
            </button>
            <button onClick={() => setConfirm(false)} style={{ background:'none', border:'1px solid rgba(255,255,255,0.15)', color:'#5a7a8a', padding:'10px 20px', fontFamily:'Courier New', fontSize:12, borderRadius:4, cursor:'pointer' }}>
              STAY
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirm(true)} style={{ background:'none', border:'1px solid rgba(255,255,255,0.1)', color:'#5a7a8a', padding:'10px 24px', fontFamily:'Courier New', fontSize:11, letterSpacing:2, borderRadius:4, cursor:'pointer' }}>
            EXIT ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ─── iOS Install Guide ────────────────────────────────────────
function IOSInstallGuide({ onClose }: { onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.85)', zIndex:9998, display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div style={{ background:'#0b1820', border:'1px solid rgba(0,212,255,0.2)', borderRadius:'16px 16px 0 0', padding:28, width:'100%', maxWidth:480 }}>
        <div style={{ fontFamily:'Courier New', fontSize:11, letterSpacing:3, color:'#00d4ff', marginBottom:16 }}>HOW TO INSTALL ON iPHONE</div>
        {[
          ['1', 'Open this page in Safari (not Chrome)'],
          ['2', 'Tap the Share button (⬜ with arrow) at the bottom'],
          ['3', 'Scroll down and tap "Add to Home Screen"'],
          ['4', 'Tap "Add" in the top right'],
        ].map(([n, t]) => (
          <div key={n} style={{ display:'flex', gap:12, marginBottom:12, alignItems:'flex-start' }}>
            <div style={{ background:'rgba(0,255,136,0.1)', border:'1px solid rgba(0,255,136,0.3)', borderRadius:'50%', width:24, height:24, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, color:'#00ff88', flexShrink:0, fontFamily:'monospace', fontWeight:700 }}>{n}</div>
            <div style={{ fontSize:14, color:'#c8dde8', lineHeight:1.4 }}>{t}</div>
          </div>
        ))}
        <button onClick={onClose} style={{ width:'100%', background:'rgba(0,212,255,0.1)', border:'1px solid rgba(0,212,255,0.3)', color:'#00d4ff', padding:'12px 0', fontFamily:'Courier New', fontSize:12, letterSpacing:2, borderRadius:6, cursor:'pointer', marginTop:8 }}>
          GOT IT
        </button>
      </div>
    </div>
  );
}

// ─── MOBILE CSS ───────────────────────────────────────────────
const MOBILE_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@300;400;600;700&display=swap');
  :root { --g:#00ff88;--c:#00d4ff;--o:#ff6b35;--r:#ff3366;--bg2:#0b1820;--bg3:#0f2030;--t:#c8dde8;--td:#5a7a8a;--b:rgba(0,212,255,0.15); }
  *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;}
  .m-header{padding:12px 16px;background:rgba(11,24,32,0.95);border-bottom:1px solid var(--b);display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}
  .m-title{font-family:'Courier New',monospace;font-size:18px;font-weight:900;color:var(--g);letter-spacing:4px;text-shadow:0 0 16px rgba(0,255,136,0.4);}
  .m-sub{font-family:'Courier New',monospace;font-size:11px;color:var(--td);letter-spacing:1px;}
  .m-clock{font-family:'Courier New',monospace;font-size:20px;color:var(--c);letter-spacing:2px;}
  .m-install-btn{background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);color:var(--c);padding:5px 10px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;border-radius:3px;cursor:pointer;}
  .m-prog-wrap{height:3px;background:rgba(255,255,255,0.05);flex-shrink:0;overflow:hidden;}
  .m-prog-bar{height:100%;background:linear-gradient(90deg,var(--g),var(--c));box-shadow:0 0 8px rgba(0,255,136,0.5);transition:width .5s ease;}
  .m-scroll{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;height:100%;overscroll-behavior:contain;}
  .m-section-hdr{padding:16px 16px 8px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:3px;color:var(--td);}
  .m-now-card{margin:12px 16px;background:rgba(0,255,136,0.06);border:1px solid rgba(0,255,136,0.25);border-radius:10px;padding:16px;position:relative;overflow:hidden;}
  .m-now-card::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--g);border-radius:0;}
  .m-now-label{font-family:'Courier New',monospace;font-size:9px;color:var(--g);letter-spacing:3px;margin-bottom:8px;}
  .m-now-title{font-size:20px;font-weight:700;color:#fff;line-height:1.2;margin-bottom:4px;}
  .m-now-time{font-family:'Courier New',monospace;font-size:11px;color:var(--td);margin-bottom:12px;}
  .m-countdown{font-family:'Courier New',monospace;font-size:48px;color:var(--g);text-shadow:0 0 20px rgba(0,255,136,0.4);line-height:1;letter-spacing:4px;margin-bottom:16px;}
  .m-countdown.urgent{color:var(--o);text-shadow:0 0 20px rgba(255,107,53,0.5);}
  .m-lockin-btn{width:100%;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.4);color:var(--g);padding:12px;font-family:'Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:3px;border-radius:6px;cursor:pointer;}
  .m-row{display:flex;gap:0;margin:0 16px 6px;background:var(--bg2);border:1px solid var(--b);border-radius:6px;overflow:hidden;position:relative;align-items:stretch;cursor:pointer;}
  .m-row.current{border-color:rgba(0,255,136,0.3);background:rgba(0,255,136,0.05);}
  .m-row.past{opacity:0.35;}
  .m-row-accent{width:3px;flex-shrink:0;}
  .m-row-time{font-family:'Courier New',monospace;font-size:11px;color:var(--td);padding:10px 8px;width:68px;flex-shrink:0;display:flex;align-items:center;}
  .m-row.current .m-row-time{color:var(--g);}
  .m-row-body{flex:1;padding:10px 8px 10px 0;}
  .m-row-title{font-size:14px;font-weight:600;color:var(--t);line-height:1.2;}
  .m-row.past .m-row-title{text-decoration:line-through;color:var(--td);}
  .m-row-sub{font-size:11px;color:var(--td);margin-top:2px;}
  .m-row-live{font-family:'Courier New',monospace;font-size:9px;color:var(--g);letter-spacing:2px;padding:0 10px;display:flex;align-items:center;border-left:1px solid rgba(0,255,136,0.2);}
  .m-loading{text-align:center;padding:40px;font-family:'Courier New',monospace;font-size:11px;letter-spacing:3px;color:var(--td);}
  .m-empty{text-align:center;padding:40px 24px;color:var(--td);font-size:14px;line-height:1.5;}
  .m-mic{width:100px;height:100px;border-radius:50%;background:rgba(0,255,136,0.08);border:2px solid rgba(0,255,136,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;box-shadow:0 0 0 0 rgba(0,255,136,0.2);}
  .m-mic.active{background:rgba(0,255,136,0.15);border-color:var(--g);box-shadow:0 0 0 12px rgba(0,255,136,0.08),0 0 30px rgba(0,255,136,0.2);}
  .m-bar{width:4px;background:var(--g);border-radius:2px;box-shadow:0 0 4px rgba(0,255,136,0.5);animation:bar-b .7s ease-in-out infinite alternate;}
  @keyframes bar-b{from{transform:scaleY(0.3);}to{transform:scaleY(1);}}
  .m-card{background:var(--bg2);border:1px solid var(--b);border-radius:8px;padding:14px;}
  .m-textarea{width:100%;background:var(--bg2);border:1px solid var(--b);color:var(--t);padding:12px;font-family:'Barlow Condensed',sans-serif;font-size:15px;border-radius:6px;resize:none;outline:none;line-height:1.4;}
  .m-textarea:focus{border-color:var(--c);}
  .m-textarea::placeholder{color:var(--td);}
  .m-input{width:100%;background:#050a0e;border:1px solid var(--b);color:var(--c);padding:10px 12px;font-family:'Courier New',monospace;font-size:13px;border-radius:6px;outline:none;}
  .m-input:focus{border-color:var(--c);}
  .m-btn-primary{width:100%;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.4);color:var(--g);padding:13px;font-family:'Courier New',monospace;font-size:13px;font-weight:700;letter-spacing:2px;border-radius:6px;cursor:pointer;transition:all .2s;}
  .m-btn-primary:active{background:rgba(0,255,136,0.2);}
  .m-btn-secondary{width:100%;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.3);color:var(--c);padding:11px;font-family:'Courier New',monospace;font-size:12px;letter-spacing:1px;border-radius:6px;cursor:pointer;}
  .m-error{margin:0 16px 12px;background:rgba(255,51,102,0.1);border:1px solid rgba(255,51,102,0.3);border-radius:6px;padding:10px 14px;font-size:13px;color:var(--r);}
  .m-scan-btn{background:none;border:1px solid rgba(0,212,255,0.3);color:var(--c);padding:5px 12px;font-family:'Courier New',monospace;font-size:10px;letter-spacing:1px;border-radius:3px;cursor:pointer;margin-top:12px;}
  .m-email-card{margin:0 16px 8px;background:var(--bg2);border:1px solid var(--b);border-left:3px solid var(--td);border-radius:6px;padding:12px;cursor:pointer;}
  .m-add-btn{flex:1;background:rgba(0,255,136,0.1);border:1px solid rgba(0,255,136,0.35);color:var(--g);padding:8px 0;font-family:'Courier New',monospace;font-size:9px;letter-spacing:2px;border-radius:4px;cursor:pointer;}
  .m-dismiss-btn{background:none;border:1px solid rgba(255,255,255,0.1);color:var(--td);padding:8px 14px;font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;border-radius:4px;cursor:pointer;}
  .m-nav{display:flex;background:rgba(6,13,18,0.97);border-top:1px solid var(--b);flex-shrink:0;padding-bottom:env(safe-area-inset-bottom);}
  .m-nav-btn{flex:1;background:none;border:none;color:var(--td);padding:10px 0 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:3px;position:relative;transition:color .2s;}
  .m-nav-btn.active{color:var(--g);}
  .m-nav-icon{font-size:20px;line-height:1;}
  .m-nav-label{font-family:'Courier New',monospace;font-size:9px;letter-spacing:1px;}
  .m-badge{background:var(--r);color:#fff;border-radius:10px;padding:1px 6px;font-size:9px;font-weight:700;position:absolute;top:6px;right:calc(50% - 18px);}
  .ov-bg{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 50%,rgba(0,255,136,0.05),transparent 70%),repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(0,255,136,0.02) 60px),repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(0,255,136,0.02) 60px);pointer-events:none;}
  .ov-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(0,0,0,0.15) 4px);pointer-events:none;}
`;
