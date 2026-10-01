import { motion } from 'motion/react';
import { cx } from '../../utils/cx';
import { pageVariants } from './motionPresets';
import styles from './Page.module.css';

// Route wrapper: fades in, staggers its children, fades out on navigation.
export default function Page({ width = 'narrow', center = false, className, children }) {
  return (
    <motion.main
      className={cx(styles.page, styles[width], center && styles.center, className)}
      variants={pageVariants}
      initial="hidden"
      animate="show"
      exit="exit"
    >
      {children}
    </motion.main>
  );
}
