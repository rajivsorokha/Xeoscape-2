// assets/js/shared/api-client.js
// Thin wrapper around fetch() so feature modules never construct URLs
// or handle JSON parsing/error handling themselves.

const BASE_URL = '/api';

async function request(method, endpoint, body) {
  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
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

  /**
   * Uploads a File/Blob as multipart form data (field name "file") and
   * returns the parsed JSON response. Used for CSV bulk import, where
   * the payload isn't JSON so the plain request() helper doesn't fit.
   */
  async uploadFile(endpoint, file) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE_URL}${endpoint}`, { method: 'POST', body: formData });
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
    const res = await fetch(`${BASE_URL}${endpoint}`);
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
