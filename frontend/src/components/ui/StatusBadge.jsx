import { cx } from '../../utils/cx';
import styles from './StatusBadge.module.css';

// Status is never colour-only: the label always states it.
export default function StatusBadge({ lost, muted, label, className }) {
  return (
    <span className={cx(styles.badge, lost && styles.lost, muted && styles.muted, className)}>
      <span className={styles.dot} aria-hidden="true" />
      {label ?? (lost ? 'PERDIDO' : 'SEGURO')}
    </span>
  );
}
