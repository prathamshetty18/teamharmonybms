const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

function getStoredToken() {
  const direct = localStorage.getItem('token') || 
                 localStorage.getItem('auth_token') || 
                 localStorage.getItem('bhoomi_setu_token');
  if (direct) return direct;
  try {
    const auth = JSON.parse(localStorage.getItem('bhoomi_setu_auth') || '{}');
    return auth.token || auth.jwt || null;
  } catch (_) {
    return null;
  }
}

async function request(path, options = {}) {
  const url = path.startsWith('http://') || path.startsWith('https://') 
    ? path 
    : `${BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

  const headers = { ...options.headers };
  const token = getStoredToken();
  if (token && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && typeof options.body === 'object') {
    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify(options.body);
  }

  try {
    const res = await fetch(url, { ...options, headers });
    let data;
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      data = await res.json();
    } else {
      data = await res.text();
    }

    if (!res.ok) {
      const errorMsg = (data && data.error) || (data && data.detail) || res.statusText || 'Request failed';
      const error = new Error(errorMsg);
      error.status = res.status;
      error.data = data;
      throw error;
    }
    return data;
  } catch (err) {
    throw err;
  }
}

export const http = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};

export default http;
