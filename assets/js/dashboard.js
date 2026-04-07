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
  const isConvert = operation === "convert";
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

function getOperationMessage(data, operation) {
  if (data && typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (data && typeof data.Message === "string" && data.Message.trim()) {
    return data.Message;
  }

  if (operation === "convert") {
    const source = data?.source || data?.Source || data?.First;
    const result = data?.quantityResult || data?.QuantityResult;
    if (source && result) {
      return `Conversion completed: ${source.value} ${source.unit} -> ${result.value} ${result.unit}.`;
    }
  }

  if (operation === "compare") {
    const result = Object.prototype.hasOwnProperty.call(data || {}, "booleanResult")
      ? data.booleanResult
      : data?.BooleanResult;
    if (typeof result === "boolean") {
      return result
        ? "Comparison completed. The two quantities are equal."
        : "Comparison completed. The two quantities are not equal.";
    }
  }

  if (operation === "add") {
    const result = data?.quantityResult || data?.QuantityResult;
    if (result) {
      return `Addition completed: ${result.value} ${result.unit}.`;
    }
  }

  if (operation === "subtract") {
    const result = data?.quantityResult || data?.QuantityResult;
    if (result) {
      return `Subtraction completed: ${result.value} ${result.unit}.`;
    }
  }

  if (operation === "divide") {
    const quotient = data?.scalarResult || data?.ScalarResult;
    if (quotient !== undefined) {
      return `Division completed. Quotient: ${quotient}.`;
    }
  }

  return "Operation completed successfully.";
}

/* Enhanced result rendering functions */
function createResultDisplay(operation, data) {
  const resultContent = document.createElement("div");
  resultContent.className = "result-content";

  const summary = document.createElement("p");
  summary.className = "result-summary";
  summary.textContent = getOperationMessage(data, operation);
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

  addDetail("Operation", operation.toUpperCase());
  addDetail("Category", data?.first?.category || data?.First?.category || data?.First?.Category || categorySelect.value);

  const source = data?.source || data?.Source || data?.First;
  const first = data?.first || data?.First || source;
  const second = data?.second || data?.Second;
  const quantityResult = data?.quantityResult || data?.QuantityResult;
  const scalarResult = data?.scalarResult ?? data?.ScalarResult;
  const booleanResult = Object.prototype.hasOwnProperty.call(data || {}, "booleanResult")
    ? data.booleanResult
    : data?.BooleanResult;

  if (first) {
    addDetail("First", `${first.value} ${first.unit}`);
  }
  if (second) {
    addDetail("Second", `${second.value} ${second.unit}`);
  }
  if (quantityResult) {
    addDetail("Result", `${quantityResult.value} ${quantityResult.unit}`);
  }
  if (scalarResult !== undefined) {
    addDetail("Result", String(scalarResult));
  }
  if (typeof booleanResult === "boolean") {
    addDetail("Result", booleanResult ? "Equal" : "Not equal");
  }

  resultContent.appendChild(details);

  return resultContent;
}

function getFieldValue(entry, fieldNames) {
  const keyByLower = Object.keys(entry || {}).reduce((acc, key) => {
    acc[key.toLowerCase()] = key;
    return acc;
  }, {});

  for (const fieldName of fieldNames) {
    const resolvedKey = keyByLower[fieldName.toLowerCase()];
    if (resolvedKey && entry[resolvedKey] !== undefined && entry[resolvedKey] !== null && entry[resolvedKey] !== "") {
      return entry[resolvedKey];
    }
  }

  return "";
}

function normalizeText(value, fallback = "-") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  if (typeof value === "object") {
    return JSON.stringify(value);
  }
  return String(value);
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

function createHistoryTable(entries) {
  const table = document.createElement("table");
  table.className = "history-table";

  const thead = document.createElement("thead");
  thead.innerHTML = "<tr><th>ID</th><th>Category</th><th>Type</th><th>Input</th><th>Output</th><th>Date</th></tr>";
  table.appendChild(thead);

  const tbody = document.createElement("tbody");

  function appendCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
  }

  entries.forEach((entry, index) => {
    const id = normalizeText(
      getFieldValue(entry, ["id", "historyid", "operationid", "recordid"]),
      String(entries.length - index)
    );
    const category = normalizeText(getFieldValue(entry, ["category", "quantitytype", "measurementtype"]));
    const operation = normalizeText(getFieldValue(entry, ["operationtype", "operation", "type"]), "UNKNOWN").toUpperCase();
    const input = normalizeText(
      getFieldValue(entry, ["input", "inputexpression", "expression", "request", "description"])
    );
    const output = normalizeText(
      getFieldValue(entry, ["output", "result", "resulttext", "response"]),
      entry.isError ? `Error: ${normalizeText(entry.errorMessage)}` : "-"
    );
    const createdAt = formatHistoryDate(getFieldValue(entry, ["createdat", "createdatutc", "timestamp", "date"]));

    const row = document.createElement("tr");
    if (entry.isError) {
      row.classList.add("is-error");
    }

    appendCell(row, id);
    appendCell(row, category);
    appendCell(row, operation);
    appendCell(row, input);
    appendCell(row, output);
    appendCell(row, createdAt);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  return table;
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

    const responseMessage = getOperationMessage(result, operation);
    setMessage(responseMessage, "success");
    await loadHistory();
  } catch (error) {
    resultBox.innerHTML = "";
    setMessage(error.message || "Operation failed. Please check your inputs.", "error");
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run Operation";
  }
}

function createHistoryItem(entry) {
  const wrapper = document.createElement("article");
  wrapper.className = `history-item${entry.isError ? " error" : ""}`;

  const timestamp = document.createElement("time");
  timestamp.textContent = new Date(entry.createdAt).toLocaleString();

  const description = document.createElement("p");
  description.textContent = entry.description;

  wrapper.appendChild(timestamp);
  wrapper.appendChild(description);

  if (entry.isError && entry.errorMessage) {
    const error = document.createElement("p");
    error.textContent = `Error: ${entry.errorMessage}`;
    wrapper.appendChild(error);
  }

  return wrapper;
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

    historyList.appendChild(createHistoryTable(entries));
  } catch (error) {
    historyList.innerHTML = `<p class=\"message error\">${error.message}</p>`;
  }
}

async function initializeDashboard() {
  setupAuthUI();
  appConfig = await loadAppConfig();

  setOptions(categorySelect, Object.keys(appConfig.categories));
  updateUnitDropdowns();
  syncOperationAvailability();
  updateFormByOperation();
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
