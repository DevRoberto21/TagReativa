import { motion } from 'motion/react';
import Button from './Button';
import { rise } from './motionPresets';
import styles from './PageHeader.module.css';

export default function PageHeader({ title, eyebrow, backLabel = 'Voltar', onBack }) {
  return (
    <motion.header className={styles.header} variants={rise}>
      {onBack && (
        <Button variant="ghost" size="sm" icon="arrow-left" onClick={onBack} className={styles.back}>
          {backLabel}
        </Button>
      )}
      {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
      <h1 className={styles.title}>{title}</h1>
    </motion.header>
  );
}
