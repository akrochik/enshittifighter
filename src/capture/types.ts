// The message the MAIN-world hook posts to the isolated-world relay. Kept tiny
// and serializable (it crosses the window.postMessage boundary).

export const MS_SOURCE = 'marketplace-sift';
export const MS_CAPTURE = 'MS_CAPTURE';

export interface Captured {
  transport: 'fetch' | 'xhr';
  url: string;
  friendlyName: string; // fb_api_req_friendly_name from the request
  status: number;
  body: string; // raw response text (possibly newline-chunked)
}

export interface CaptureMessage {
  source: typeof MS_SOURCE;
  type: typeof MS_CAPTURE;
  payload: Captured;
}

// Any script on the page can postMessage, so check the fields the relay reads,
// not just the envelope — a malformed payload must be dropped, never thrown on.
export function isCaptureMessage(data: unknown): data is CaptureMessage {
  const d = data as CaptureMessage | undefined;
  const p = d?.payload;
  return (
    !!d &&
    d.source === MS_SOURCE &&
    d.type === MS_CAPTURE &&
    !!p &&
    typeof p.body === 'string' &&
    typeof p.friendlyName === 'string' &&
    typeof p.status === 'number'
  );
}
