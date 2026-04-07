import { api, authStore } from "./api.js";
import { loadAppConfig } from "./config.js";

const path = window.location.pathname.toLowerCase();
const isSignupPage = path.endsWith("signup.html");
const isLoginPage = path.endsWith("login.html") || path.endsWith("index.html") || path.endsWith("/");

const form = document.getElementById(isSignupPage ? "signupForm" : "loginForm");
const messageEl = document.getElementById("authMessage");
const googleWrap = document.getElementById("googleLoginWrap");
const googleButtonContainer = document.getElementById("googleSignInButton");
const googleUnavailableNote = document.getElementById("googleLoginUnavailable");

if (authStore.getToken() && (isSignupPage || isLoginPage)) {
  window.location.replace("app.html");
}

function setMessage(text, kind = "") {
  if (!messageEl) {
    return;
  }

  messageEl.textContent = text;
  messageEl.className = "message";
  if (kind) {
    messageEl.classList.add(kind);
  }
}

function extractMessage(error) {
  try {
    const parsed = JSON.parse(error.message);
    if (typeof parsed === "string") {
      return parsed;
    }
    if (parsed && typeof parsed === "object") {
      if (parsed.errors && typeof parsed.errors === "object") {
        const firstErrorList = Object.values(parsed.errors).find((value) => Array.isArray(value) && value.length > 0);
        if (firstErrorList && typeof firstErrorList[0] === "string") {
          return firstErrorList[0];
        }
      }
      if (typeof parsed.userMessage === "string" && parsed.userMessage.trim()) {
        return parsed.userMessage;
      }
      if (typeof parsed.message === "string" && parsed.message.trim()) {
        return parsed.message;
      }
      if (typeof parsed.error === "string" && parsed.error.trim()) {
        return parsed.error;
      }
      if (typeof parsed.title === "string" && parsed.title.trim()) {
        return parsed.title;
      }
    }
  } catch {
    // Ignore parse failures and try plain text extraction.
  }

  const fallback = error.message || "Request failed.";
  const messageMatch = fallback.match(/"Message"\s*:\s*"([^"]+)"/i);
  if (messageMatch && messageMatch[1]) {
    return messageMatch[1];
  }

  const userMessageMatch = fallback.match(/"UserMessage"\s*:\s*"([^"]+)"/i);
  if (userMessageMatch && userMessageMatch[1]) {
    return userMessageMatch[1];
  }

  return fallback;
}

function canUseGoogleIdentity() {
  return Boolean(
    window.google &&
    window.google.accounts &&
    window.google.accounts.id &&
    googleWrap &&
    googleButtonContainer
  );
}

function showGoogleUnavailable(text) {
  if (!googleUnavailableNote) {
    return;
  }

  googleUnavailableNote.textContent = text;
  googleUnavailableNote.classList.remove("hidden");
}

async function initializeGoogleLogin() {
  if (!isLoginPage && !isSignupPage) {
    return;
  }

  if (googleWrap) {
    googleWrap.classList.remove("hidden");
  }

  const config = await loadAppConfig();
  const clientId = String(config.googleClientId || "").trim();

  if (!clientId) {
    if (googleButtonContainer) {
      googleButtonContainer.innerHTML =
        '<button type="button" class="btn ghost google-disabled-btn" disabled>Sign in with Google</button>';
    }
    showGoogleUnavailable("Google sign-in is not enabled yet. Add googleClientId in app-config.json to enable it.");
    return;
  }

  if (!canUseGoogleIdentity()) {
    if (googleButtonContainer) {
      googleButtonContainer.innerHTML =
        '<button type="button" class="btn ghost google-disabled-btn" disabled>Sign in with Google</button>';
    }
    showGoogleUnavailable("Google sign-in could not be loaded. Please refresh the page and try again.");
    return;
  }

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: async (googleResponse) => {
      try {
        if (!googleResponse || !googleResponse.credential) {
          throw new Error("Google sign-in failed. Missing credential token.");
        }

        setMessage("Signing in with Google...");
        const response = await api.googleLogin(googleResponse.credential);
        const successMessage = response?.message || response?.Message || "Google sign-in successful. Redirecting...";
        setMessage(successMessage, "success");
        window.setTimeout(() => {
          window.location.replace("app.html");
        }, 450);
      } catch (error) {
        setMessage(extractMessage(error), "error");
      }
    },
    auto_select: false,
    cancel_on_tap_outside: true,
  });

  googleButtonContainer.innerHTML = "";
  window.google.accounts.id.renderButton(googleButtonContainer, {
    theme: "outline",
    size: "large",
    text: "signin_with",
    shape: "pill",
    width: 320,
  });
}

if (form) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("Working...");

    const formData = new FormData(form);

    try {
      let response;

      if (isSignupPage) {
        response = await api.signup({
          name: String(formData.get("name") || "").trim(),
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "").trim(),
        });
      } else {
        response = await api.login({
          email: String(formData.get("email") || "").trim(),
          password: String(formData.get("password") || "").trim(),
        });
      }

      const successMessage = response?.message || response?.Message || "Authentication successful. Redirecting...";
      setMessage(successMessage, "success");

      window.setTimeout(() => {
        window.location.replace("app.html");
      }, 450);
    } catch (error) {
      const readableMessage = extractMessage(error);
      const alreadyExists = /already exists|already registered/i.test(readableMessage);

      if (isSignupPage && alreadyExists) {
        setMessage("This email is already registered. Redirecting to login...", "error");
        window.setTimeout(() => {
          window.location.replace("login.html");
        }, 1200);
        return;
      }

      setMessage(readableMessage, "error");
    }
  });
}

initializeGoogleLogin().catch((error) => {
  setMessage(extractMessage(error), "error");
});
