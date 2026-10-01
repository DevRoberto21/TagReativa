import { cx } from '../../utils/cx';
import styles from './ScanLoader.module.css';

export default function ScanLoader({ label, compact = false }) {
  return (
    <div className={cx(styles.loader, compact && styles.compact)} role="status">
      <div className={styles.scope} aria-hidden="true">
        <span className={styles.beam} />
      </div>
      {label && <p className={styles.label}>{label}</p>}
    </div>
  );
}
