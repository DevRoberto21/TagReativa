import { useId } from 'react';
import { cx } from '../../utils/cx';
import styles from './Field.module.css';

export default function Field({ label, as: Control = 'input', prefix, hint, className, children, ...rest }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={cx(styles.field, className)}>
      <label className={styles.label} htmlFor={id}>{label}</label>
      <div className={cx(styles.control, Control === 'select' && styles.selectWrap)}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <Control
          id={id}
          className={cx(styles.input, Control === 'textarea' && styles.textarea, prefix && styles.withPrefix)}
          aria-describedby={hintId}
          {...rest}
        >
          {children}
        </Control>
      </div>
      {hint && <p id={hintId} className={styles.hint}>{hint}</p>}
    </div>
  );
}
