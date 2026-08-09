// assets/js/shared/api-client.js
// Thin wrapper around fetch() so feature modules never construct URLs
// or handle JSON parsing/error handling themselves.
//
// Also carries the logged-in user's id on every request via the
// X-User-Id header, so the backend can enforce per-user permissions
// (see api/auth-middleware.js) -- session.js calls setCurrentUserId()
// after login/logout rather than this module importing session.js
// directly, to avoid a circular import (session.js already imports
// apiClient to call /users/authenticate).

const BASE_URL = '/api';

let currentUserId = null;

function setCurrentUserId(id) {
  currentUserId = id || null;
}

function authHeaders() {
  return currentUserId ? { 'X-User-Id': currentUserId } : {};
}

async function request(method, endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed: ${res.status}`);
    err.status = res.status;
    err.details = data && data.details;
    throw err;
  }
  return data;
}

const apiClient = {
  get: (endpoint) => request('GET', endpoint),
  post: (endpoint, body) => request('POST', endpoint, body),
  put: (endpoint, body) => request('PUT', endpoint, body),
  delete: (endpoint) => request('DELETE', endpoint),
  setCurrentUserId,

  /**
   * Uploads a File/Blob as multipart form data (field name "file") and
   * returns the parsed JSON response. Used for CSV bulk import, where
   * the payload isn't JSON so the plain request() helper doesn't fit.
   */
  async uploadFile(endpoint, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'POST', body: formData, headers: authHeaders() });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const err = new Error((data && data.error) || `Upload failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  },

  /** Triggers a browser download of a GET endpoint that returns a file (e.g. a CSV template). */
  async downloadFile(endpoint, filename) {
    const res = await fetch(`${BASE_URL}${endpoint}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
};

export default apiClient;
