let counter = 0;
/** Short unique id for records created in the UI. */
export const uid = (prefix = 'id') =>
  `${prefix}_${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;
