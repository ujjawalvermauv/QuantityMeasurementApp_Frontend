import crypto from "crypto";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";

const app = express();
const port = Number(process.env.PORT || 5097);
const jwtSecret = process.env.JWT_SECRET || "change-me-in-production";
const jwtExpiresIn = process.env.JWT_EXPIRES_IN || "2h";

app.use(cors());
app.use(express.json());

const usersByEmail = new Map();
const historyByEmail = new Map();
let nextHistoryId = 1104;

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

function canonicalCategory(normalizedCategory) {
    return normalizedCategory.charAt(0).toUpperCase() + normalizedCategory.slice(1);
}

function canonicalQuantity(category, value, unit) {
    const { normalizedCategory, converter } = resolveConverter(category, unit);
    return {
        value: toNumber(value, "Quantity value"),
        unit: converter.canonical,
        category: canonicalCategory(normalizedCategory),
    };
}

function convertQuantity(source, targetUnit) {
    const sourceCanonical = canonicalQuantity(source.category, source.value, source.unit);
    const sourceResolved = resolveConverter(sourceCanonical.category, sourceCanonical.unit);
    const targetResolved = resolveConverter(sourceCanonical.category, targetUnit);

    const baseValue = sourceResolved.converter.toBase(sourceCanonical.value);
    const convertedValue = targetResolved.converter.fromBase(baseValue);

    return {
        sourceCanonical,
        quantityResult: canonicalQuantity(sourceCanonical.category, convertedValue, targetUnit),
    };
}

function ensureSameCategory(first, second) {
    const firstCategory = normalizeCategory(first.category);
    const secondCategory = normalizeCategory(second.category);

    if (!firstCategory || !secondCategory || firstCategory !== secondCategory) {
        throw new Error("Both quantities must have the same category.");
    }
}

function hashPassword(password) {
    return crypto.createHash("sha256").update(String(password)).digest("hex");
}

function getEmail(email) {
    return String(email || "").trim().toLowerCase();
}

function signToken(user) {
    return jwt.sign(
        {
            email: user.email,
            name: user.name,
        },
        jwtSecret,
        { expiresIn: jwtExpiresIn },
    );
}

function tokenExpiresAt(token) {
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== "object" || typeof decoded.exp !== "number") {
        return undefined;
    }
    return new Date(decoded.exp * 1000).toISOString();
}

function safeMessage(error, fallback = "Request failed.") {
    const text = String(error?.message || "").trim();
    return text || fallback;
}

function authFromHeader(req) {
    const authHeader = String(req.headers.authorization || "").trim();
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return null;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
        return null;
    }

    try {
        const payload = jwt.verify(token, jwtSecret);
        return {
            token,
            payload,
        };
    } catch {
        return null;
    }
}

function requireAuth(req, res, next) {
    const auth = authFromHeader(req);
    if (!auth) {
        return res.status(401).json({ message: "Please login to continue." });
    }

    req.auth = auth.payload;
    return next();
}

function currentUserFromAuth(req) {
    const auth = authFromHeader(req);
    if (!auth || !auth.payload || typeof auth.payload !== "object") {
        return null;
    }
    return {
        email: getEmail(auth.payload.email),
        name: String(auth.payload.name || "").trim(),
    };
}

function quantityToken(quantity) {
    const canonical = canonicalQuantity(quantity.category, quantity.value, quantity.unit);
    return `VAL=${canonical.value},UNIT=${canonical.unit},CAT=${canonical.category}`;
}

function recordHistory(email, operation, description, isError = false, errorMessage = "") {
    if (!email) {
        return;
    }

    const records = historyByEmail.get(email) || [];
    records.unshift({
        historyId: nextHistoryId,
        createdAt: new Date().toISOString(),
        description,
        isError,
        errorMessage,
    });
    nextHistoryId += 1;

    historyByEmail.set(email, records.slice(0, 100));
}

function withOperationHistory(operation, buildDescription, handler) {
    return (req, res) => {
        const user = currentUserFromAuth(req);

        try {
            const payload = handler(req);
            if (user?.email) {
                recordHistory(user.email, operation, buildDescription(payload));
            }
            return res.json(payload);
        } catch (error) {
            if (user?.email) {
                recordHistory(
                    user.email,
                    operation,
                    `OPERATION=${operation}`,
                    true,
                    safeMessage(error, "Operation failed."),
                );
            }

            return res.status(400).json({
                message: safeMessage(error, "Operation failed."),
            });
        }
    };
}

app.get("/", (_req, res) => {
    res.json({
        service: "quantity-measurement-microservice",
        status: "ok",
    });
});

app.post("/api/v1/auth/signup", (req, res) => {
    const fullName = String(req.body?.fullName || req.body?.name || "").trim();
    const email = getEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!fullName || !email || !password) {
        return res.status(400).json({ message: "fullName, email and password are required." });
    }

    if (usersByEmail.has(email)) {
        return res.status(409).json({ message: "User already exists." });
    }

    usersByEmail.set(email, {
        name: fullName,
        email,
        passwordHash: hashPassword(password),
    });

    const token = signToken({ name: fullName, email });
    return res.status(201).json({
        token,
        name: fullName,
        email,
        expiresAtUtc: tokenExpiresAt(token),
        message: "Signup successful.",
    });
});

app.post("/api/v1/auth/login", (req, res) => {
    const email = getEmail(req.body?.email);
    const password = String(req.body?.password || "");

    if (!email || !password) {
        return res.status(400).json({ message: "email and password are required." });
    }

    const user = usersByEmail.get(email);
    if (!user || user.passwordHash !== hashPassword(password)) {
        return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = signToken(user);
    return res.json({
        token,
        name: user.name,
        email: user.email,
        expiresAtUtc: tokenExpiresAt(token),
        message: "Login successful.",
    });
});

app.post("/api/v1/quantities/convert", withOperationHistory(
    "convert",
    (payload) => {
        return [
            "OPERATION=convert",
            `SRC=${quantityToken(payload.source)}`,
            `RESULT=${quantityToken(payload.quantityResult)}`,
        ].join(" | ");
    },
    (req) => {
        const source = req.body?.source;
        const targetUnit = req.body?.targetUnit;

        if (!source || !targetUnit) {
            throw new Error("source and targetUnit are required.");
        }

        const converted = convertQuantity(source, targetUnit);
        return {
            source: converted.sourceCanonical,
            quantityResult: converted.quantityResult,
            message: "Conversion completed successfully.",
        };
    }
));

app.post("/api/v1/quantities/compare", withOperationHistory(
    "compare",
    (payload) => {
        return [
            "OPERATION=compare",
            `FIRST=${quantityToken(payload.first)}`,
            `SECOND=${quantityToken(payload.second)}`,
            `RESULT=${String(payload.booleanResult)}`,
        ].join(" | ");
    },
    (req) => {
        const firstRaw = req.body?.first;
        const secondRaw = req.body?.second;

        if (!firstRaw || !secondRaw) {
            throw new Error("first and second are required.");
        }

        ensureSameCategory(firstRaw, secondRaw);
        const first = canonicalQuantity(firstRaw.category, firstRaw.value, firstRaw.unit);
        const second = canonicalQuantity(secondRaw.category, secondRaw.value, secondRaw.unit);
        const secondInFirst = convertQuantity(second, first.unit).quantityResult;
        const delta = Math.abs(first.value - secondInFirst.value);

        return {
            first,
            second,
            booleanResult: delta < 1e-9,
            message: "Comparison completed successfully.",
        };
    }
));

app.post("/api/v1/quantities/add", withOperationHistory(
    "add",
    (payload) => {
        return [
            "OPERATION=add",
            `FIRST=${quantityToken(payload.first)}`,
            `SECOND=${quantityToken(payload.second)}`,
            `RESULT=${quantityToken(payload.quantityResult)}`,
        ].join(" | ");
    },
    (req) => {
        const firstRaw = req.body?.first;
        const secondRaw = req.body?.second;
        const targetUnit = req.body?.targetUnit;

        if (!firstRaw || !secondRaw || !targetUnit) {
            throw new Error("first, second and targetUnit are required.");
        }

        ensureSameCategory(firstRaw, secondRaw);
        const first = canonicalQuantity(firstRaw.category, firstRaw.value, firstRaw.unit);
        const second = canonicalQuantity(secondRaw.category, secondRaw.value, secondRaw.unit);
        const firstInTarget = convertQuantity(first, targetUnit).quantityResult;
        const secondInTarget = convertQuantity(second, targetUnit).quantityResult;

        return {
            first,
            second,
            quantityResult: canonicalQuantity(first.category, firstInTarget.value + secondInTarget.value, targetUnit),
            message: "Addition completed successfully.",
        };
    }
));

app.post("/api/v1/quantities/subtract", withOperationHistory(
    "subtract",
    (payload) => {
        return [
            "OPERATION=subtract",
            `FIRST=${quantityToken(payload.first)}`,
            `SECOND=${quantityToken(payload.second)}`,
            `RESULT=${quantityToken(payload.quantityResult)}`,
        ].join(" | ");
    },
    (req) => {
        const firstRaw = req.body?.first;
        const secondRaw = req.body?.second;
        const targetUnit = req.body?.targetUnit;

        if (!firstRaw || !secondRaw || !targetUnit) {
            throw new Error("first, second and targetUnit are required.");
        }

        ensureSameCategory(firstRaw, secondRaw);
        const first = canonicalQuantity(firstRaw.category, firstRaw.value, firstRaw.unit);
        const second = canonicalQuantity(secondRaw.category, secondRaw.value, secondRaw.unit);
        const firstInTarget = convertQuantity(first, targetUnit).quantityResult;
        const secondInTarget = convertQuantity(second, targetUnit).quantityResult;

        return {
            first,
            second,
            quantityResult: canonicalQuantity(first.category, firstInTarget.value - secondInTarget.value, targetUnit),
            message: "Subtraction completed successfully.",
        };
    }
));

app.post("/api/v1/quantities/divide", withOperationHistory(
    "divide",
    (payload) => {
        return [
            "OPERATION=divide",
            `FIRST=${quantityToken(payload.first)}`,
            `SECOND=${quantityToken(payload.second)}`,
            `RESULT=${String(payload.scalarResult)}`,
        ].join(" | ");
    },
    (req) => {
        const firstRaw = req.body?.first;
        const secondRaw = req.body?.second;

        if (!firstRaw || !secondRaw) {
            throw new Error("first and second are required.");
        }

        ensureSameCategory(firstRaw, secondRaw);
        const first = canonicalQuantity(firstRaw.category, firstRaw.value, firstRaw.unit);
        const second = canonicalQuantity(secondRaw.category, secondRaw.value, secondRaw.unit);
        const secondInFirst = convertQuantity(second, first.unit).quantityResult;

        if (Math.abs(secondInFirst.value) < 1e-12) {
            throw new Error("Cannot divide by zero.");
        }

        return {
            first,
            second,
            scalarResult: first.value / secondInFirst.value,
            message: "Division completed successfully.",
        };
    }
));

app.get("/api/v1/quantities/history", requireAuth, (req, res) => {
    const email = getEmail(req.auth?.email);
    const records = historyByEmail.get(email) || [];
    return res.json(records);
});

app.use((error, _req, res, _next) => {
    res.status(500).json({ message: safeMessage(error, "Internal server error.") });
});

app.listen(port, () => {
    console.log(`Quantity microservice listening on http://localhost:${port}`);
});
