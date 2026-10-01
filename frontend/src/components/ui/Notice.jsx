import { cx } from '../../utils/cx';
import styles from './Notice.module.css';

export default function Notice({ tone = 'info', className, children }) {
  return (
    <div className={cx(styles.notice, styles[tone], className)} role={tone === 'error' ? 'alert' : undefined}>
      {children}
    </div>
  );
}
