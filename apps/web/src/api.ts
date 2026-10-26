import { API_BASE, monitoredFetch } from './monitoring';

export const AUTH_EXPIRED_EVENT = 'portal:auth-expired';

function checkSession(response: Response) {
  if (response.status === 401) {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    throw new Error('Your session has expired. Please sign in again.');
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await monitoredFetch(path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Unable to reach the portal API at ${API_BASE}. Make sure the API server is running.`);
    }
    throw error;
  }

  checkSession(response);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  let response: Response;
  try {
    response = await monitoredFetch(path, { credentials: 'include' });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Unable to reach the portal API at ${API_BASE}. Make sure the API server is running.`);
    }
    throw error;
  }

  checkSession(response);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || 'Unable to download the report');
  }

  const disposition = response.headers.get('Content-Disposition');
  const filename = disposition?.match(/filename="([^"]+)"/)?.[1] ?? 'leave-report.csv';
  return { blob: await response.blob(), filename };
}
