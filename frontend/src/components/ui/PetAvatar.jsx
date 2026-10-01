import { cx } from '../../utils/cx';
import { cloudinaryUrl } from '../../utils/cloudinaryUrl';
import Icon from './Icon';
import styles from './PetAvatar.module.css';

const SPECIES_ICON = { Cachorro: 'dog', Gato: 'cat' };

// Photo, or a species icon when there is none, inside a viewfinder frame.
export default function PetAvatar({ pet, size = 56, width = 200, lost = false, ping = false, className }) {
  return (
    <div
      className={cx(styles.avatar, lost && styles.lost, className)}
      // Large avatars get a shorter ping so the rings stay clear of nearby text.
      style={{ '--size': `${size}px`, '--ping-scale': size > 80 ? 1.18 : 1.45 }}
    >
      {ping && (
        <>
          <span className={styles.ping} aria-hidden="true" />
          <span className={cx(styles.ping, styles.pingLate)} aria-hidden="true" />
        </>
      )}
      <div className={styles.frame}>
        {pet?.photoUrl ? (
          <img src={cloudinaryUrl(pet.photoUrl, { width })} alt={pet.name ?? 'Pet'} className={styles.photo} />
        ) : (
          <Icon name={SPECIES_ICON[pet?.species] ?? 'paw'} size={Math.round(size * 0.5)} />
        )}
      </div>
    </div>
  );
}
