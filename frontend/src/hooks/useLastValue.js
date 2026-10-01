import { useState } from 'react';

// Returns the latest non-null value. Lets a modal keep rendering its content
// while it animates out, after the parent has already cleared the state.
export function useLastValue(value) {
  const [last, setLast] = useState(value);
  if (value != null && value !== last) setLast(value);
  return value ?? last;
}
