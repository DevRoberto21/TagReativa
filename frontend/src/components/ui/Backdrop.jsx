import styles from './Backdrop.module.css';

export default function Backdrop() {
  return (
    <div className={styles.backdrop} aria-hidden="true">
      <div className={styles.grid} />
      <div className={styles.radar}>
        <div className={styles.rings} />
        <div className={styles.sweep} />
      </div>
    </div>
  );
}
