import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPending, subscribePending } from '../../services/api';
import styles from './ApiProgress.module.css';

// Free-tier backend sleeps when idle; the first request can take ~50s.
// Show the bar after a short delay (fast requests never flash it) and explain
// the wait when it gets long, so people do not think the site is broken.
const SHOW_AFTER_MS = 300;
const SLOW_AFTER_MS = 4000;

export default function ApiProgress() {
  const busy = useSyncExternalStore(subscribePending, getPending) > 0;
  const [stage, setStage] = useState('idle');

  useEffect(() => {
    if (!busy) return;
    const show = setTimeout(() => setStage('busy'), SHOW_AFTER_MS);
    const slow = setTimeout(() => setStage('slow'), SLOW_AFTER_MS);
    return () => {
      clearTimeout(show);
      clearTimeout(slow);
      setStage('idle');
    };
  }, [busy]);

  if (!busy || stage === 'idle') return null;

  return (
    <>
      <div className={styles.bar} role="progressbar" aria-label="Carregando" />
      {stage === 'slow' && (
        <div className={styles.toast} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          Conectando ao servidor… na primeira vez pode levar até 1 minuto. Não feche a página.
        </div>
      )}
    </>
  );
}
