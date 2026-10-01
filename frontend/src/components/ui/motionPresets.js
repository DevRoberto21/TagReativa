const EASE = [0.2, 0.8, 0.2, 1];

// Parent of a page: fades in and staggers the children that use `rise`.
export const pageVariants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.2, staggerChildren: 0.06 } },
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

// `custom` is the index of the item, for lists that mount after the page.
export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: (index = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.34, ease: EASE, delay: index * 0.06 },
  }),
  exit: { opacity: 0, transition: { duration: 0.14 } },
};

// Inline sections that open and close inside a panel.
export const reveal = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.24, ease: EASE },
};
