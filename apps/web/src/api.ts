const API_BASE = `${window.location.protocol}//${window.location.hostname}:4000`;

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(`Unable to reach the portal API at ${API_BASE}. Make sure the API server is running.`);
    }
    throw error;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}