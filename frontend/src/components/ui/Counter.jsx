import { useEffect, useState } from 'react';
import { animate, useReducedMotion } from 'motion/react';

// Counts up to `value` whenever it changes.
export default function Counter({ value }) {
  const [shown, setShown] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    const controls = animate(0, value, {
      duration: reduced ? 0 : 0.8,
      ease: 'easeOut',
      onUpdate: latest => setShown(Math.round(latest)),
    });
    return () => controls.stop();
  }, [value, reduced]);

  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{shown}</span>;
}
