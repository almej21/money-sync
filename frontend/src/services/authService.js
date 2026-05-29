import { api } from "../api";

export async function loginUser({ email, password }) {
  return api("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export async function registerUser({ email, password, name, householdName }) {
  return api("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password, name, householdName }),
  });
}

export async function requestPasswordReset({ email }) {
  return api("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword({ token, password, passwordConfirm }) {
  return api(`/auth/reset-password/${encodeURIComponent(token)}`, {
    method: "POST",
    body: JSON.stringify({ password, passwordConfirm }),
  });
}

export async function getCurrentUser() {
  return api("/auth/me");
}

export async function updateUserPreferences(preferences = {}) {
  return api("/auth/preferences", {
    method: "PUT",
    body: JSON.stringify(preferences),
  });
}
