// assets/js/core/session.js
// Minimal in-memory session state for the logged-in user. Session is
// per app-launch (not persisted to disk/localStorage) -- matching how
// a real POS terminal expects a cashier to log in each time the app
// starts or after logging out.

import apiClient from '../shared/api-client.js';

const state = { user: null };

async function login(username, password) {
  const user = await apiClient.post('/users/authenticate', { username, password });
  state.user = user;
  return user;
}

function logout() {
  state.user = null;
}

function getCurrentUser() {
  return state.user;
}

function isLoggedIn() {
  return Boolean(state.user);
}

export default { login, logout, getCurrentUser, isLoggedIn };
