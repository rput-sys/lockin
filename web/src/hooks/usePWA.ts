'use client';
import { useState, useEffect, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

export function usePWA() {
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isPushEnabled, setIsPushEnabled] = useState(false);
  const [swRegistered, setSwRegistered] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);

    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone === true;
    setIsInstalled(standalone);

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then(reg => {
        setSwRegistered(true);
        reg.pushManager?.getSubscription().then(sub => {
          setIsPushEnabled(!!sub);
        });
      }).catch(err => {
        console.warn('[PWA] SW registration failed:', err);
      });
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (isIOS) { setShowIOSGuide(true); return; }
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') setIsInstalled(true);
      setDeferredPrompt(null);
      setIsInstallable(false);
    }
  }, [isIOS, deferredPrompt]);

  const enablePush = useCallback(async () => {
    if (!swRegistered) return false;
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;
    try {
      const reg = await navigator.serviceWorker.ready;
      if (VAPID_PUBLIC_KEY) {
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        await fetch(`${API}/lockin/web-push-token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription }),
        });
      }
      setIsPushEnabled(true);
      return true;
    } catch (err) {
      console.error('[PWA] Push subscription failed:', err);
      return false;
    }
  }, [swRegistered]);

  const scheduleLocalNotification = useCallback(async (title: string, body: string, delayMs: number) => {
    if (!swRegistered || Notification.permission !== 'granted') return;
    setTimeout(async () => {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png' });
    }, delayMs);
  }, [swRegistered]);

  return {
    isInstallable: isInstallable || isIOS,
    isInstalled,
    isPushEnabled,
    isIOS,
    showIOSGuide,
    setShowIOSGuide,
    install,
    enablePush,
    scheduleLocalNotification,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}
