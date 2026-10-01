import { motion } from 'motion/react';
import { cx } from '../../utils/cx';
import { rise } from './motionPresets';
import styles from './Panel.module.css';

export default function Panel({ tone = 'default', brackets = true, className, children, ...rest }) {
  return (
    <motion.div
      className={cx(styles.panel, styles[tone], brackets && styles.brackets, className)}
      variants={rise}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
