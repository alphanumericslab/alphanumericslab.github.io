/* Loading of the generated payload.

   Asset URLs are resolved from this module's own location, so the page works
   under any Jekyll baseurl without Liquid interpolation inside the script. */

const DATA_ROOT = new URL('../data/', import.meta.url);

export class LoadError extends Error {
  constructor(message, url, cause) {
    super(message);
    this.name = 'LoadError';
    this.url = url;
    this.cause = cause;
  }
}

async function fetchJson(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'force-cache' });
  } catch (error) {
    throw new LoadError('network request failed', url, error);
  }
  if (!response.ok) throw new LoadError('HTTP ' + response.status, url);
  try {
    return await response.json();
  } catch (error) {
    throw new LoadError('malformed JSON', url, error);
  }
}

async function fetchInt16(url) {
  let response;
  try {
    response = await fetch(url, { cache: 'force-cache' });
  } catch (error) {
    throw new LoadError('network request failed', url, error);
  }
  if (!response.ok) throw new LoadError('HTTP ' + response.status, url);
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength % 2 !== 0) {
    throw new LoadError('ECG payload has an odd byte length', url);
  }
  return new Int16Array(buffer);
}

export function loadMeta() {
  return fetchJson(new URL('meta.json', DATA_ROOT).href);
}

/* Subject payloads are fetched lazily, once, and cached. There is no idle
   prefetch: the second subject costs nothing until it is asked for. */
const cache = new Map();

export function loadSubject(subject) {
  if (cache.has(subject)) return cache.get(subject);

  const base = new URL('subject_' + subject + '/', DATA_ROOT);
  const promise = Promise.all([
    fetchJson(new URL('beats.json', base).href),
    fetchInt16(new URL('ecg_int16.bin', base).href),
  ]).then(([beats, ecg]) => {
    if (!beats || typeof beats.n !== 'number' || !Array.isArray(beats.t)) {
      throw new LoadError('beats payload is not in the expected shape', base.href);
    }
    if (beats.t.length !== beats.n) {
      throw new LoadError('beats payload has inconsistent array lengths', base.href);
    }
    return { subject, beats, ecg };
  }).catch((error) => {
    cache.delete(subject);   // let Retry try again from scratch
    throw error;
  });

  cache.set(subject, promise);
  return promise;
}

/* Monotonic token so an out-of-order response can never win a race. */
let ticket = 0;
export function nextTicket() {
  ticket += 1;
  return ticket;
}
export function isCurrent(value) {
  return value === ticket;
}
