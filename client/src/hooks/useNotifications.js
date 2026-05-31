import { useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { supabase } from '../services/supabase';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

let firebaseApp;
let messaging;

function initFirebase() {
  if (!firebaseApp) {
    firebaseApp = initializeApp(firebaseConfig);
    messaging = getMessaging(firebaseApp);
  }
  return messaging;
}

export function useNotifications(user) {
  useEffect(() => {
    if (!user || !import.meta.env.VITE_FIREBASE_PROJECT_ID) return;

    async function setup() {
      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return;

        const msg = initFirebase();
        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
        const token = await getToken(msg, {
          vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
          serviceWorkerRegistration: registration,
        });

        if (token) {
          const { data: { session } } = await supabase.auth.getSession();
          await fetch('/api/notifications/subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session?.access_token}`,
            },
            body: JSON.stringify({ fcmToken: token }),
          });
        }

        onMessage(msg, (payload) => {
          // Foreground notification
          const { title, body } = payload.notification || {};
          if (title) {
            new Notification(title, { body, icon: '/logo_progect.jpeg' });
          }
        });
      } catch (err) {
        console.warn('Push notification setup failed:', err);
      }
    }

    setup();
  }, [user]);
}
