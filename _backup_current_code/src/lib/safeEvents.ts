/**
 * Safely dispatches a custom event across all browser environments,
 * avoiding "TypeError: Illegal constructor" in WebViews or sandboxed iframes
 * where `new Event()` or `new CustomEvent()` might throw.
 */
export const safeDispatchEvent = (eventName: string, detail?: any) => {
  if (typeof window === 'undefined') return;

  // 1. Try CustomEvent constructor
  try {
    if (typeof window.CustomEvent === 'function') {
      const event = new window.CustomEvent(eventName, { detail, bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      return;
    }
  } catch {
    // Fall back if CustomEvent constructor fails
  }

  // 2. Try document.createEvent('CustomEvent')
  try {
    if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
      const evt = document.createEvent('CustomEvent');
      evt.initCustomEvent(eventName, true, true, detail);
      window.dispatchEvent(evt);
      return;
    }
  } catch {
    // Fall back if document.createEvent fails
  }

  // 3. Try standard Event constructor
  try {
    if (typeof window.Event === 'function') {
      const event = new window.Event(eventName, { bubbles: true, cancelable: true });
      window.dispatchEvent(event);
      return;
    }
  } catch {
    // Fall back if Event constructor fails
  }

  // 4. Try document.createEvent('Event')
  try {
    if (typeof document !== 'undefined' && typeof document.createEvent === 'function') {
      const evt = document.createEvent('Event');
      evt.initEvent(eventName, true, true);
      window.dispatchEvent(evt);
    }
  } catch (err) {
    console.warn(`[safeDispatchEvent] Unable to dispatch event '${eventName}':`, err);
  }
};

