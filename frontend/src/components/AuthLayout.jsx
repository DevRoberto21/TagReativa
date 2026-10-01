import { motion } from 'motion/react';
import Page from './ui/Page';
import Panel from './ui/Panel';
import Icon from './ui/Icon';
import { rise } from './ui/motionPresets';
import styles from './AuthLayout.module.css';

// Shared frame of the login, register and password recovery screens.
export default function AuthLayout({ tagline, children, footer }) {
  return (
    <Page center>
      <motion.div className={styles.brand} variants={rise}>
        <span className={styles.mark}><Icon name="logo" size={30} /></span>
        <div>
          <h1 className={styles.wordmark}>TagReativa</h1>
          <p className={styles.tagline}>{tagline}</p>
        </div>
      </motion.div>

      <Panel>{children}</Panel>

      {footer && <motion.nav className={styles.footer} variants={rise}>{footer}</motion.nav>}
    </Page>
  );
}
