import { Link } from 'react-router-dom';
import { cx } from '../../utils/cx';
import Icon from './Icon';
import styles from './Button.module.css';

// Renders a router Link when `to` is set, an anchor when `href` is set,
// a button otherwise, so links and buttons share one look.
export default function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  icon,
  to,
  href,
  className,
  children,
  ...rest
}) {
  const classes = cx(styles.button, styles[variant], styles[size], block && styles.block, className);
  const content = (
    <>
      {icon && <Icon name={icon} size={size === 'lg' ? 22 : 18} />}
      <span>{children}</span>
    </>
  );

  if (to) return <Link to={to} className={classes} {...rest}>{content}</Link>;
  if (href) return <a href={href} className={classes} {...rest}>{content}</a>;
  return <button type="button" className={classes} {...rest}>{content}</button>;
}
