export async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data.detail
      ? `${data.error || 'Something went wrong.'} ${data.detail}`
      : (data.error || 'Something went wrong.');
    const error = new Error(message);
    error.data = data;
    error.status = response.status;

    if (response.status === 401 && path !== '/api/session' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('hummingbird:auth-expired'));
    }

    throw error;
  }

  return data;
}
