import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const envPath = path.join(projectRoot, ".env");
const templatePath = path.join(projectRoot, "src", "assets", "data", "app-config.template.json");
const outputPaths = [
    path.join(projectRoot, "src", "assets", "data", "app-config.json"),
    path.join(projectRoot, "assets", "data", "app-config.json"),
];

function parseEnvFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return {};
    }

    const text = fs.readFileSync(filePath, "utf8");
    const envVars = {};

    for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const index = line.indexOf("=");
        if (index < 1) {
            continue;
        }

        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim();
        envVars[key] = value.replace(/^"|"$/g, "");
    }

    return envVars;
}

function pickValue(name, fileEnv, fallback = "") {
    const processValue = process.env[name];
    if (typeof processValue === "string" && processValue.trim()) {
        return processValue.trim();
    }

    const fileValue = fileEnv[name];
    if (typeof fileValue === "string" && fileValue.trim()) {
        return fileValue.trim();
    }

    return fallback;
}

const fileEnv = parseEnvFile(envPath);
const template = JSON.parse(fs.readFileSync(templatePath, "utf8"));

const appConfig = {
    ...template,
    appName: pickValue("APP_NAME", fileEnv, template.appName || "Quantity Measurement App"),
    apiBaseUrl: pickValue("API_BASE_URL", fileEnv, "http://localhost:5097/api"),
    fallbackApiBaseUrl: pickValue("FALLBACK_API_BASE_URL", fileEnv, ""),
    googleClientId: pickValue("GOOGLE_CLIENT_ID", fileEnv, ""),
};

const output = `${JSON.stringify(appConfig, null, 2)}\n`;

for (const targetPath of outputPaths) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, output, "utf8");
}

console.log("Generated app-config.json from environment variables.");
