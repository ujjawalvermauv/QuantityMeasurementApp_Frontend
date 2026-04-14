import { loadAppConfig } from "./config.js";

const TOKEN_KEY = "qm_auth_token";
const USER_KEY = "qm_auth_user";

let configCache;

function normalizeBaseUrl(baseUrl) {
  return String(baseUrl || "").replace(/\/+$/, "");
}

function buildCandidateBaseUrls(config) {
  const variants = new Set();

  [config.apiBaseUrl, config.fallbackApiBaseUrl]
    .filter(Boolean)
    .map(normalizeBaseUrl)
    .forEach((baseUrl) => {
      variants.add(baseUrl);

      if (baseUrl.endsWith("/api")) {
        variants.add(baseUrl.slice(0, -4));
      } else {
        variants.add(`${baseUrl}/api`);
      }
    });

  return Array.from(variants).filter(Boolean);
}

function buildCandidatePaths(path) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const variants = new Set([normalized]);

  if (normalized.startsWith("/v1/")) {
    variants.add(`/api${normalized}`);
  }

  if (normalized.startsWith("/api/v1/")) {
    variants.add(normalized.replace(/^\/api/, ""));
  }

  return Array.from(variants);
}

function buildCandidateUrls(config, path) {
  const urls = new Set();
  const candidateBases = buildCandidateBaseUrls(config);
  const candidatePaths = buildCandidatePaths(path);

  candidateBases.forEach((baseUrl) => {
    candidatePaths.forEach((candidatePath) => {
      urls.add(`${baseUrl}${candidatePath}`);
    });
  });

  return Array.from(urls);
}

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

const CONVERTERS = {
  length: {
    feet: {
      toBase: (value) => value * 12,
      fromBase: (value) => value / 12,
      canonical: "Feet",
    },
    inches: {
      toBase: (value) => value,
      fromBase: (value) => value,
      canonical: "Inches",
    },
    yards: {
      toBase: (value) => value * 36,
      fromBase: (value) => value / 36,
      canonical: "Yards",
    },
    centimeters: {
      toBase: (value) => value / 2.54,
      fromBase: (value) => value * 2.54,
      canonical: "Centimeters",
    },
  },
  weight: {
    kilogram: {
      toBase: (value) => value * 1000,
      fromBase: (value) => value / 1000,
      canonical: "Kilogram",
    },
    gram: {
      toBase: (value) => value,
      fromBase: (value) => value,
      canonical: "Gram",
    },
    pound: {
      toBase: (value) => value * 453.59237,
      fromBase: (value) => value / 453.59237,
      canonical: "Pound",
    },
  },
  volume: {
    litre: {
      toBase: (value) => value * 1000,
      fromBase: (value) => value / 1000,
      canonical: "Litre",
    },
    millilitre: {
      toBase: (value) => value,
      fromBase: (value) => value,
      canonical: "Millilitre",
    },
    gallon: {
      toBase: (value) => value * 3785.411784,
      fromBase: (value) => value / 3785.411784,
      canonical: "Gallon",
    },
  },
  temperature: {
    celsius: {
      toBase: (value) => value,
      fromBase: (value) => value,
      canonical: "Celsius",
    },
    fahrenheit: {
      toBase: (value) => (value - 32) * (5 / 9),
      fromBase: (value) => value * (9 / 5) + 32,
      canonical: "Fahrenheit",
    },
    kelvin: {
      toBase: (value) => value - 273.15,
      fromBase: (value) => value + 273.15,
      canonical: "Kelvin",
    },
  },
};

function normalizeCategory(category) {
  return String(category || "").trim().toLowerCase();
}

function normalizeUnit(unit) {
  return String(unit || "").trim().toLowerCase();
}

function toNumber(value, fieldLabel) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${fieldLabel} must be a valid number.`);
  }
  return numeric;
}

function resolveConverter(category, unit) {
  const normalizedCategory = normalizeCategory(category);
  const normalizedUnit = normalizeUnit(unit);
  const categoryConverters = CONVERTERS[normalizedCategory];

  if (!categoryConverters) {
    throw new Error(`Unsupported category: ${category}`);
  }

  const converter = categoryConverters[normalizedUnit];
  if (!converter) {
    throw new Error(`Unsupported unit '${unit}' for category '${category}'.`);
  }

  return {
    normalizedCategory,
    converter,
  };
}

function canonicalQuantity(category, value, unit) {
  const { normalizedCategory, converter } = resolveConverter(category, unit);
  return {
    value,
    unit: converter.canonical,
    category: normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1),
  };
}

function convertQuantityLocal(source, targetUnit) {
  const sourceCategory = source?.category;
  const sourceUnit = source?.unit;
  const sourceValue = toNumber(source?.value, "Source value");

  const sourceResolved = resolveConverter(sourceCategory, sourceUnit);
  const targetResolved = resolveConverter(sourceCategory, targetUnit);

  const baseValue = sourceResolved.converter.toBase(sourceValue);
  const convertedValue = targetResolved.converter.fromBase(baseValue);

  return canonicalQuantity(sourceCategory, convertedValue, targetUnit);
}

function ensureSameCategory(first, second) {
  const firstCategory = normalizeCategory(first?.category);
  const secondCategory = normalizeCategory(second?.category);

  if (!firstCategory || !secondCategory || firstCategory !== secondCategory) {
    throw new Error("Both quantities must have the same category.");
  }

  return firstCategory;
}

function formatGuestMessage(operation) {
  return `${operation} completed (guest mode). Login to save this in history.`;
}

function shouldUseGuestFallback(error) {
  return Number(error?.status) === 401 && !getToken();
}

async function requestOrGuest(path, options, guestResolver) {
  try {
    return await request(path, options);
  } catch (error) {
    if (shouldUseGuestFallback(error)) {
      return guestResolver();
    }

    throw error;
  }
}

async function request(path, { method = "GET", body = null, requiresAuth = false } = {}) {
  const config = await getConfig();
  const candidateUrls = buildCandidateUrls(config, path);
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

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(candidateUrl, {
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

        const httpError = new Error(message);
        httpError.status = response.status;
        httpError.url = candidateUrl;

        // Keep trying only when route is not found.
        if (response.status === 404) {
          lastError = httpError;
          continue;
        }

        throw httpError;
      }

      if (response.status === 204) {
        return null;
      }

      return response.json();
    } catch (error) {
      const status = Number(error?.status || 0);
      const isNetworkError = !status;

      if (isNetworkError) {
        lastError = error;
        continue;
      }

      throw error;
    }
  }

  throw lastError || new Error("Unable to connect to backend API.");
}

async function endpointExists(path, { method = "GET", body = null } = {}) {
  const config = await getConfig();
  const candidateUrls = buildCandidateUrls(config, path);
  let sawNetworkFailure = false;
  let sawNotFound = false;

  for (const candidateUrl of candidateUrls) {
    try {
      const response = await fetch(candidateUrl, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : null,
      });

      if (response.status === 404) {
        sawNotFound = true;
        continue;
      }

      return true;
    } catch {
      sawNetworkFailure = true;
    }
  }

  // If at least one reachable backend returned 404, treat endpoint as unavailable.
  if (sawNotFound) {
    return false;
  }

  if (sawNetworkFailure) {
    return null;
  }

  return false;
}

async function isGoogleAuthAvailable() {
  // A non-404 response means the backend route exists, even if it requires POST/auth.
  return endpointExists("/v1/auth/google", { method: "GET" });
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
  return requestOrGuest(
    "/v1/quantities/convert",
    {
      method: "POST",
      body: { source, targetUnit },
    },
    () => ({
      source: canonicalQuantity(source?.category, toNumber(source?.value, "Source value"), source?.unit),
      quantityResult: convertQuantityLocal(source, targetUnit),
      message: formatGuestMessage("Conversion"),
    })
  );
}

async function compare(first, second) {
  return requestOrGuest(
    "/v1/quantities/compare",
    {
      method: "POST",
      body: { first, second },
    },
    () => {
      ensureSameCategory(first, second);
      const firstCanonical = canonicalQuantity(first?.category, toNumber(first?.value, "First value"), first?.unit);
      const secondCanonical = canonicalQuantity(second?.category, toNumber(second?.value, "Second value"), second?.unit);
      const convertedSecond = convertQuantityLocal(secondCanonical, firstCanonical.unit);
      const delta = Math.abs(firstCanonical.value - convertedSecond.value);

      return {
        first: firstCanonical,
        second: secondCanonical,
        booleanResult: delta < 1e-9,
        message: formatGuestMessage("Comparison"),
      };
    }
  );
}

async function add(first, second, targetUnit) {
  return requestOrGuest(
    "/v1/quantities/add",
    {
      method: "POST",
      body: { first, second, targetUnit },
    },
    () => {
      ensureSameCategory(first, second);
      const firstCanonical = canonicalQuantity(first?.category, toNumber(first?.value, "First value"), first?.unit);
      const secondCanonical = canonicalQuantity(second?.category, toNumber(second?.value, "Second value"), second?.unit);
      const firstInTarget = convertQuantityLocal(firstCanonical, targetUnit);
      const secondInTarget = convertQuantityLocal(secondCanonical, targetUnit);

      return {
        first: firstCanonical,
        second: secondCanonical,
        quantityResult: canonicalQuantity(
          firstCanonical.category,
          firstInTarget.value + secondInTarget.value,
          targetUnit
        ),
        message: formatGuestMessage("Addition"),
      };
    }
  );
}

async function subtract(first, second, targetUnit) {
  return requestOrGuest(
    "/v1/quantities/subtract",
    {
      method: "POST",
      body: { first, second, targetUnit },
    },
    () => {
      ensureSameCategory(first, second);
      const firstCanonical = canonicalQuantity(first?.category, toNumber(first?.value, "First value"), first?.unit);
      const secondCanonical = canonicalQuantity(second?.category, toNumber(second?.value, "Second value"), second?.unit);
      const firstInTarget = convertQuantityLocal(firstCanonical, targetUnit);
      const secondInTarget = convertQuantityLocal(secondCanonical, targetUnit);

      return {
        first: firstCanonical,
        second: secondCanonical,
        quantityResult: canonicalQuantity(
          firstCanonical.category,
          firstInTarget.value - secondInTarget.value,
          targetUnit
        ),
        message: formatGuestMessage("Subtraction"),
      };
    }
  );
}

async function divide(first, second) {
  return requestOrGuest(
    "/v1/quantities/divide",
    {
      method: "POST",
      body: { first, second },
    },
    () => {
      ensureSameCategory(first, second);
      const firstCanonical = canonicalQuantity(first?.category, toNumber(first?.value, "First value"), first?.unit);
      const secondCanonical = canonicalQuantity(second?.category, toNumber(second?.value, "Second value"), second?.unit);
      const secondInFirst = convertQuantityLocal(secondCanonical, firstCanonical.unit);

      if (Math.abs(secondInFirst.value) < 1e-12) {
        throw new Error("Cannot divide by zero.");
      }

      return {
        first: firstCanonical,
        second: secondCanonical,
        scalarResult: firstCanonical.value / secondInFirst.value,
        message: formatGuestMessage("Division"),
      };
    }
  );
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
  isGoogleAuthAvailable,
  logout,
  convert,
  compare,
  add,
  subtract,
  divide,
  history,
};