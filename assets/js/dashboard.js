import { api, authStore } from "./api.js";
import { loadAppConfig } from "./config.js";

const operationSelect = document.getElementById("operationSelect");
const categorySelect = document.getElementById("categorySelect");
const firstValueInput = document.getElementById("firstValue");
const firstUnitSelect = document.getElementById("firstUnit");
const secondValueInput = document.getElementById("secondValue");
const secondUnitSelect = document.getElementById("secondUnit");
const targetUnitSelect = document.getElementById("targetUnit");
const secondGroup = document.getElementById("secondGroup");
const targetGroup = document.getElementById("targetGroup");
const resultBox = document.getElementById("resultBox");
const operationMessage = document.getElementById("operationMessage");
const refreshHistoryBtn = document.getElementById("refreshHistoryBtn");
const historyList = document.getElementById("historyList");
const historyHint = document.getElementById("historyHint");
const userBadge = document.getElementById("userBadge");
const loginLink = document.getElementById("loginLink");
const signupLink = document.getElementById("signupLink");
const logoutBtn = document.getElementById("logoutBtn");
const runBtn = document.getElementById("runBtn");
const ARITHMETIC_OPERATIONS = new Set(["add", "subtract", "divide"]);

let appConfig;

function isAuthenticated() {
  return Boolean(authStore.getToken() && authStore.getUser());
}

function toggleHidden(element, isHidden) {
  if (!element) {
    return;
  }
  element.classList.toggle("hidden", isHidden);
}

function setupAuthUI() {
  const authUser = authStore.getUser();
  const authenticated = isAuthenticated();

  toggleHidden(userBadge, !authenticated);
  toggleHidden(logoutBtn, !authenticated);
  toggleHidden(loginLink, authenticated);
  toggleHidden(signupLink, authenticated);

  if (authenticated && authUser && userBadge) {
    userBadge.textContent = `${authUser.name} | ${authUser.email}`;
  }
}

function setMessage(text, kind = "") {
  operationMessage.textContent = text;
  operationMessage.className = "message";
  if (kind) {
    operationMessage.classList.add(kind);
  }
}

function extractReadableErrorMessage(error) {
  const fallback = String(error?.message || "Operation failed. Please check your inputs.");

  try {
    const parsed = JSON.parse(fallback);
    if (parsed && typeof parsed === "object") {
      return (
        parsed.userMessage ||
        parsed.UserMessage ||
        parsed.message ||
        parsed.Message ||
        parsed.error ||
        parsed.Error ||
        parsed.title ||
        parsed.Title ||
        parsed.detail ||
        parsed.Detail ||
        fallback
      );
    }
  } catch {
    // Ignore non-JSON fallback text.
  }

  return fallback;
}

function formatUnit(unit) {
  return String(unit || "").trim().toLowerCase();
}

function formatQuantity(quantity) {
  if (!quantity) {
    return "";
  }

  const value = quantity.value ?? quantity.Value;
  const unit = quantity.unit ?? quantity.Unit;
  if (value === undefined || value === null || value === "") {
    return formatUnit(unit);
  }

  return `${value} ${formatUnit(unit)}`.trim();
}

function getOperationName(operation) {
  return String(operation || "").trim().toLowerCase();
}

function getOperationSymbol(operation) {
  switch (getOperationName(operation)) {
    case "add":
      return "+";
    case "subtract":
      return "-";
    case "divide":
      return "/";
    default:
      return "→";
  }
}

function getBooleanResult(data) {
  if (!data || typeof data !== "object") {
    return undefined;
  }

  return Object.prototype.hasOwnProperty.call(data, "booleanResult")
    ? data.booleanResult
    : data.BooleanResult;
}

function getSummaryText(operation, data) {
  const op = getOperationName(operation);
  const first = data?.first || data?.First || data?.source || data?.Source;
  const second = data?.second || data?.Second;
  const resultQuantity = data?.quantityResult || data?.QuantityResult;
  const scalarResult = data?.scalarResult ?? data?.ScalarResult;
  const booleanResult = getBooleanResult(data);

  if (op === "convert" && first && resultQuantity) {
    return `${formatQuantity(first)} ${getOperationSymbol(op)} ${formatQuantity(resultQuantity)}`;
  }

  if (op === "compare" && first && second && typeof booleanResult === "boolean") {
    return `${formatQuantity(first)} vs ${formatQuantity(second)} = ${String(booleanResult)}`;
  }

  if ((op === "add" || op === "subtract") && first && second && resultQuantity) {
    return `${formatQuantity(first)} ${getOperationSymbol(op)} ${formatQuantity(second)} = ${formatQuantity(resultQuantity)}`;
  }

  if (op === "divide" && first && second && scalarResult !== undefined) {
    return `${formatQuantity(first)} ${getOperationSymbol(op)} ${formatQuantity(second)} = ${String(scalarResult)}`;
  }

  if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }

  if (data && typeof data.Message === "string" && data.Message.trim()) {
    return data.Message;
  }

  return "Operation completed successfully.";
}

function setOptions(selectElement, values) {
  selectElement.innerHTML = "";
  values.forEach((value) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectElement.appendChild(option);
  });
}

function getCategoryUnits() {
  const category = categorySelect.value;
  return appConfig.categories[category] || [];
}

function updateUnitDropdowns() {
  const units = getCategoryUnits();
  setOptions(firstUnitSelect, units);
  setOptions(secondUnitSelect, units);
  setOptions(targetUnitSelect, units);
}

function syncOperationAvailability() {
  const isTemperature = categorySelect.value === "Temperature";

  Array.from(operationSelect.options).forEach((option) => {
    option.disabled = isTemperature && ARITHMETIC_OPERATIONS.has(option.value);
  });

  if (isTemperature && ARITHMETIC_OPERATIONS.has(operationSelect.value)) {
    operationSelect.value = "convert";
    setMessage("Arithmetic operations are blocked for Temperature.", "error");
  }
}

function updateFormByOperation() {
  const operation = operationSelect.value;
  const needsSecond = operation !== "convert";
  const needsTarget = operation === "convert" || operation === "add" || operation === "subtract";

  secondGroup.style.display = needsSecond ? "grid" : "none";
  targetGroup.style.display = needsTarget ? "grid" : "none";

  if (!needsSecond) {
    secondValueInput.value = "";
  }

  setMessage("");
}

function parseNumber(input, label) {
  const numeric = Number(input.value);
  if (!Number.isFinite(numeric)) {
    throw new Error(`${label} must be a valid number.`);
  }
  return numeric;
}

function buildQuantity(value, unit) {
  return {
    value,
    unit,
    category: categorySelect.value,
  };
}

function createResultDisplay(operation, data) {
  const resultContent = document.createElement("div");
  resultContent.className = "result-content";

  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = getSummaryText(operation, data);
  resultContent.appendChild(summary);

  const details = document.createElement("div");
  details.className = "result-details";

  const addDetail = (label, value) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    const row = document.createElement("div");
    row.className = "result-detail-row";
    row.innerHTML = `<span class="result-detail-label">${label}</span><span class="result-detail-value">${value}</span>`;
    details.appendChild(row);
  };

  const op = getOperationName(operation);
  addDetail("Operation", op.toUpperCase());
  addDetail("Category", data?.first?.category || data?.First?.category || data?.First?.Category || categorySelect.value);

  const source = data?.source || data?.Source || data?.First;
  const first = data?.first || data?.First || source;
  const second = data?.second || data?.Second;
  const quantityResult = data?.quantityResult || data?.QuantityResult;
  const scalarResult = data?.scalarResult ?? data?.ScalarResult;
  const booleanResult = getBooleanResult(data);

  if (first) {
    addDetail("Input", formatQuantity(first));
  }
  if (second) {
    addDetail("Second", formatQuantity(second));
  }
  if (quantityResult) {
    addDetail("Result", formatQuantity(quantityResult));
  }
  if (scalarResult !== undefined) {
    addDetail("Result", String(scalarResult));
  }
  if (typeof booleanResult === "boolean") {
    addDetail("Result", String(booleanResult));
  }

  resultContent.appendChild(details);

  return resultContent;
}

function parseHistoryDescription(entry) {
  const description = String(entry?.description || entry?.Description || "").trim();
  if (!description) {
    return { operation: "unknown", raw: "" };
  }

  const segments = description
    .split("|")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const parsed = { raw: description };
  const plainSegments = [];

  segments.forEach((segment) => {
    const [key, ...valueParts] = segment.split("=");
    if (key && valueParts.length > 0) {
      parsed[key.trim().toUpperCase()] = valueParts.join("=").trim();
      return;
    }

    plainSegments.push(segment);
  });

  const operationHint = parsed.OPERATION || plainSegments[0] || "";
  parsed.operation = getOperationName(operationHint);

  if (!parsed.operation || parsed.operation === "unknown") {
    const known = plainSegments
      .map((segment) => getOperationName(segment))
      .find((segment) => ["convert", "compare", "add", "subtract", "divide"].includes(segment));

    if (known) {
      parsed.operation = known;
    }
  }

  return parsed;
}

function parseQuantityToken(token) {
  if (!token) {
    return { text: "", category: "" };
  }

  const fields = token
    .split(",")
    .map((pair) => pair.trim())
    .filter(Boolean)
    .reduce((accumulator, pair) => {
      const [key, ...valueParts] = pair.split("=");
      if (key && valueParts.length > 0) {
        accumulator[key.trim().toUpperCase()] = valueParts.join("=").trim();
      }
      return accumulator;
    }, {});

  const value = fields.VAL || fields.VALUE || "";
  const unit = fields.UNIT || "";
  const category = fields.CAT || fields.CATEGORY || "";

  if (!value && !unit) {
    return { text: token.trim(), category: String(category).trim() };
  }

  return {
    text: [value, formatUnit(unit)].filter(Boolean).join(" ").trim(),
    category: String(category).trim(),
  };
}

function normalizeHistoryType(parsedEntry, fallbackCategory = "") {
  const rawType =
    parsedEntry.TYPE ||
    parsedEntry.CATEGORY ||
    parsedEntry.CAT ||
    fallbackCategory ||
    "";

  const normalized = String(rawType || "").trim().toLowerCase();
  if (!normalized) {
    return "-";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatOperationLabel(operation) {
  const normalized = getOperationName(operation);
  if (!normalized) {
    return "Unknown";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function cleanRawHistoryText(raw) {
  return String(raw || "")
    .split("|")
    .map((segment) => segment.trim())
    .filter((segment) => segment && !segment.toUpperCase().startsWith("USER="))
    .join(" | ");
}

function buildHistorySummary(parsedEntry, entry) {
  switch (parsedEntry.operation) {
    case "convert": {
      const inputToken = parseQuantityToken(parsedEntry.SRC || parsedEntry.SOURCE || parsedEntry.FIRST);
      const resultToken = parseQuantityToken(parsedEntry.RESULT);
      const type = normalizeHistoryType(parsedEntry, inputToken.category);

      return {
        type,
        operation: "Convert",
        input: inputToken.text || "-",
        result: resultToken.text || "-",
      };
    }
    case "compare": {
      const first = parseQuantityToken(parsedEntry.FIRST);
      const second = parseQuantityToken(parsedEntry.SECOND);
      const rawResult = String(parsedEntry.RESULT || "").trim().toLowerCase();
      const normalizedResult = rawResult === "true" || rawResult === "equal" ? "Equal" : "Not Equal";

      return {
        type: normalizeHistoryType(parsedEntry, first.category || second.category),
        operation: "Compare",
        input: [first.text, second.text].filter(Boolean).join(" vs ") || "-",
        result: normalizedResult,
      };
    }
    case "add":
    case "subtract": {
      const first = parseQuantityToken(parsedEntry.FIRST);
      const second = parseQuantityToken(parsedEntry.SECOND);
      const result = parseQuantityToken(parsedEntry.RESULT);
      return {
        type: normalizeHistoryType(parsedEntry, first.category || second.category),
        operation: formatOperationLabel(parsedEntry.operation),
        input:
          [first.text, second.text]
            .filter(Boolean)
            .join(parsedEntry.operation === "add" ? " + " : " - ") || "-",
        result: result.text || "-",
      };
    }
    case "divide": {
      const first = parseQuantityToken(parsedEntry.FIRST);
      const second = parseQuantityToken(parsedEntry.SECOND);
      const result = parsedEntry.RESULT || "-";
      return {
        type: normalizeHistoryType(parsedEntry, first.category || second.category),
        operation: "Divide",
        input: [first.text, second.text].filter(Boolean).join(" / ") || "-",
        result: String(result),
      };
    }
    default: {
      const fallbackText = cleanRawHistoryText(parsedEntry.raw || "");
      return {
        type: normalizeHistoryType(parsedEntry, entry?.category || entry?.Category),
        operation: formatOperationLabel(parsedEntry.operation),
        input: fallbackText || "-",
        result: parsedEntry.ERRORMESSAGE || "-",
      };
    }
  }
}

function createHistoryItem(entry, index) {
  const parsed = parseHistoryDescription(entry);
  const summary = buildHistorySummary(parsed, entry);
  const isError = Boolean(entry?.isError ?? entry?.IsError);
  const errorMessage = String(entry?.errorMessage ?? entry?.ErrorMessage ?? "").trim();
  const wrapper = document.createElement("article");
  wrapper.className = `history-item${isError ? " error" : ""}`;

  const idRow = document.createElement("p");
  idRow.className = "history-line";

  const rawId = entry?.historyId ?? entry?.HistoryId ?? entry?.id ?? entry?.Id;
  const numericId = Number(rawId);
  const displayId = Number.isFinite(numericId) ? numericId : 1104 + index;
  idRow.innerHTML = `<span>ID</span><strong>${displayId}</strong>`;

  const typeRow = document.createElement("p");
  typeRow.className = "history-line";
  typeRow.innerHTML = `<span>Type</span><strong>${summary.type || "-"}</strong>`;

  const operationRow = document.createElement("p");
  operationRow.className = "history-line";
  operationRow.innerHTML = `<span>Operation</span><strong>${summary.operation || "Unknown"}</strong>`;

  const inputRow = document.createElement("p");
  inputRow.className = "history-line";
  inputRow.innerHTML = `<span>Input</span><strong>${summary.input}</strong>`;

  const resultRow = document.createElement("p");
  resultRow.className = "history-line";
  resultRow.innerHTML = `<span>Result</span><strong>${summary.result}</strong>`;

  const dateRow = document.createElement("p");
  dateRow.className = "history-line";
  dateRow.innerHTML = `<span>Date</span><strong>${formatHistoryDate(entry.createdAt || entry.CreatedAt)}</strong>`;

  wrapper.appendChild(idRow);
  wrapper.appendChild(typeRow);
  wrapper.appendChild(operationRow);
  wrapper.appendChild(inputRow);
  wrapper.appendChild(resultRow);
  wrapper.appendChild(dateRow);

  if (isError && errorMessage) {
    const error = document.createElement("p");
    error.className = "history-error";
    error.textContent = `Error: ${errorMessage}`;
    wrapper.appendChild(error);
  }

  return wrapper;
}

function formatHistoryDate(rawDate) {
  if (!rawDate) {
    return "-";
  }

  let normalizedValue = rawDate;
  if (typeof normalizedValue === "string" && /T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalizedValue)) {
    normalizedValue = `${normalizedValue}Z`;
  }

  const date = new Date(normalizedValue);
  if (!Number.isFinite(date.getTime())) {
    return String(rawDate);
  }

  const formatted = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  }).format(date);

  return formatted.replace("AM", "am").replace("PM", "pm");
}

async function runOperation() {
  const operation = operationSelect.value;

  if (categorySelect.value === "Temperature" && ARITHMETIC_OPERATIONS.has(operation)) {
    setMessage("Arithmetic operations are blocked for Temperature.", "error");
    return;
  }

  const first = buildQuantity(parseNumber(firstValueInput, "First value"), firstUnitSelect.value);

  try {
    // Show loading state
    setMessage("");
    runBtn.disabled = true;
    runBtn.innerHTML = '<span class="loading-spinner"></span>Running...';
    resultBox.innerHTML = "";

    let result;

    if (operation === "convert") {
      result = await api.convert(first, targetUnitSelect.value);
    }

    if (operation === "compare") {
      const second = buildQuantity(parseNumber(secondValueInput, "Second value"), secondUnitSelect.value);
      result = await api.compare(first, second);
    }

    if (operation === "add") {
      const second = buildQuantity(parseNumber(secondValueInput, "Second value"), secondUnitSelect.value);
      result = await api.add(first, second, targetUnitSelect.value);
    }

    if (operation === "subtract") {
      const second = buildQuantity(parseNumber(secondValueInput, "Second value"), secondUnitSelect.value);
      result = await api.subtract(first, second, targetUnitSelect.value);
    }

    if (operation === "divide") {
      const second = buildQuantity(parseNumber(secondValueInput, "Second value"), secondUnitSelect.value);
      result = await api.divide(first, second);
    }

    // Display formatted result
    const resultDisplay = createResultDisplay(operation, result);
    resultBox.innerHTML = "";
    resultBox.appendChild(resultDisplay);

    const responseMessage = getSummaryText(operation, result);
    setMessage(responseMessage, "success");

    if (isAuthenticated()) {
      await loadHistory();
    }
  } catch (error) {
    resultBox.innerHTML = "";

    if (Number(error?.status) === 401) {
      if (isAuthenticated()) {
        setMessage("Your session expired or is invalid. Please login again.", "error");
      } else {
        setMessage("Operation request was rejected by backend authorization settings.", "error");
      }
      return;
    }

    setMessage(extractReadableErrorMessage(error), "error");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run Operation";
  }
}

async function loadHistory() {
  historyList.innerHTML = "";

  if (!isAuthenticated()) {
    if (historyHint) {
      historyHint.textContent = "Login or signup to view your operation history.";
    }
    historyList.innerHTML = "<p class=\"subtext\">History is private. Please <a href=\"login.html\">login</a> or <a href=\"signup.html\">create account</a>.</p>";
    return;
  }

  try {
    const entries = await api.history();
    if (historyHint) {
      historyHint.textContent = "Recent operations from your account.";
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      historyList.innerHTML = "<p class=\"subtext\">No history found yet.</p>";
      return;
    }

    entries.forEach((entry, index) => {
      historyList.appendChild(createHistoryItem(entry, index));
    });
  } catch (error) {
    historyList.innerHTML = `<p class=\"message error\">${error.message}</p>`;
  }
}

async function initializeDashboard() {
  setupAuthUI();
  appConfig = await loadAppConfig();

  const categories = Object.keys(appConfig.categories || {});
  setOptions(categorySelect, categories);

  if (categories.length > 0) {
    categorySelect.selectedIndex = 0;
  }

  updateUnitDropdowns();
  syncOperationAvailability();
  updateFormByOperation();

  if (categories.length > 0) {
    categorySelect.dispatchEvent(new Event("change"));
  }

  await loadHistory();
}

categorySelect.addEventListener("change", () => {
  updateUnitDropdowns();
  syncOperationAvailability();
  updateFormByOperation();
});
operationSelect.addEventListener("change", updateFormByOperation);
runBtn.addEventListener("click", runOperation);
refreshHistoryBtn.addEventListener("click", loadHistory);
logoutBtn.addEventListener("click", async () => {
  await api.logout();
  setupAuthUI();
  await loadHistory();
});

initializeDashboard().catch((error) => {
  setMessage(error.message || "Unable to initialize dashboard.", "error");
});