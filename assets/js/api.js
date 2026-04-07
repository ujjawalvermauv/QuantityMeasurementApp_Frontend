import { loadAppConfig } from "./config.js";

const TOKEN_KEY = "qm_auth_token";
const USER_KEY = "qm_auth_user";

let configCache;

async function getConfig() {
  if (!configCache) {
    configCache = await loadAppConfig();
  }
  return configCache;
}

function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

function getUser() {
  const raw = sessionStorage.getItem(USER_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setAuthSession(authResponse) {
  const token = authResponse.token || authResponse.Token;
  const name = authResponse.name || authResponse.fullName || authResponse.FullName;
  const email = authResponse.email || authResponse.Email;
  const expiresAtUtc = authResponse.expiresAtUtc || authResponse.ExpiresAtUtc;

  sessionStorage.setItem(TOKEN_KEY, token);
  sessionStorage.setItem(
    USER_KEY,
    JSON.stringify({
      name,
      email,
      expiresAtUtc,
    })
  );
}

function clearAuthSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(USER_KEY);
}

async function request(path, { method = "GET", body = null, requiresAuth = false } = {}) {
  const config = await getConfig();
  const candidateBases = [config.apiBaseUrl, config.fallbackApiBaseUrl].filter(Boolean);
  const headers = { "Content-Type": "application/json" };
  const token = getToken();

  // Attach token whenever available so optional-auth endpoints can associate user actions.
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (requiresAuth) {
    if (!token) {
      throw new Error("Please login to continue.");
    }
  }

  let lastError = null;

  for (const baseUrl of candidateBases) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      if (!response.ok) {
        const payloadText = await response.text();
        let message = payloadText || `Request failed with status ${response.status}`;

        try {
          const payload = JSON.parse(payloadText);
          message = payload.userMessage || payload.message || payload.error || payload.title || message;
        } catch {
          // Keep plain text fallback.
        }

        throw new Error(message);
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Unable to connect to backend API.");
}

async function signup({ name, email, password }) {
  const result = await request("/v1/auth/signup", {
    method: "POST",
    body: { fullName: name, email, password },
  });
  setAuthSession(result);
  return result;
}

async function login({ email, password }) {
  const result = await request("/v1/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setAuthSession(result);
  return result;
}

async function googleLogin(idToken) {
  const result = await request("/v1/auth/google", {
    method: "POST",
    body: { idToken },
  });
  setAuthSession(result);
  return result;
}

async function logout() {
  clearAuthSession();
}

async function convert(source, targetUnit) {
  return request("/v1/quantities/convert", {
    method: "POST",
    body: { source, targetUnit },
  });
}

async function compare(first, second) {
  return request("/v1/quantities/compare", {
    method: "POST",
    body: { first, second },
  });
}

async function add(first, second, targetUnit) {
  return request("/v1/quantities/add", {
    method: "POST",
    body: { first, second, targetUnit },
  });
}

async function subtract(first, second, targetUnit) {
  return request("/v1/quantities/subtract", {
    method: "POST",
    body: { first, second, targetUnit },
  });
}

async function divide(first, second) {
  return request("/v1/quantities/divide", {
    method: "POST",
    body: { first, second },
  });
}

async function history() {
  return request("/v1/quantities/history", {
    method: "GET",
    requiresAuth: true,
  });
}

export const authStore = {
  getToken,
  getUser,
  setAuthSession,
  clearAuthSession,
};

export const api = {
  signup,
  login,
  googleLogin,
  logout,
  convert,
  compare,
  add,
  subtract,
  divide,
  history,
};
