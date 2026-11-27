// Minimal ZeptoMail REST client.
//
// We deliberately do not use the `zeptomail` npm package here. Its sendMail()
// keeps a floating promise inside httpRequest(): when the API replies with a
// non-2xx status AND a body that is not valid JSON (empty 502/504/429 pages
// from edge proxies do this), the `instance.toJSON(error)` promise rejects with
// nobody attached to it. That unhandled rejection terminates the Node process,
// which takes the whole web server down. See README of the incident: the
// "invalid json response body" crash.
//
// This client reads the body as text first and parses it defensively, so a
// non-JSON response becomes a normal, catchable Error instead of a process exit.

const ZEPTOMAIL_ENDPOINT = "https://api.zeptomail.com/v1.1/email";
const DEFAULT_TIMEOUT_MS = 15000;
const BODY_SNIPPET_LIMIT = 300;

const fetchImpl = globalThis.fetch || require("node-fetch");

function getToken() {
  return (process.env.ZEPTOMAIL_TOKEN || "").trim();
}

function isConfigured() {
  return getToken().length > 0;
}

// ZeptoMail wraps its messages in a few shapes; pull out the most useful one.
function extractDetail(data, rawBody) {
  const firstError = data?.error?.details?.[0];
  if (firstError?.message) return firstError.message;
  if (data?.error?.message) return data.error.message;
  if (data?.message) return data.message;
  const snippet = (rawBody || "").trim().slice(0, BODY_SNIPPET_LIMIT);
  return snippet || "(empty response body)";
}

function parseBody(rawBody) {
  if (!rawBody || !rawBody.trim()) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

async function sendMail(payload, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const token = getToken();
  if (!token) {
    throw new Error("ZEPTOMAIL_TOKEN is not configured");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetchImpl(ZEPTOMAIL_ENDPOINT, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (networkError) {
      if (networkError?.name === "AbortError") {
        const timeoutError = new Error(`ZeptoMail request timed out after ${timeoutMs}ms`);
        timeoutError.code = "ZEPTOMAIL_TIMEOUT";
        throw timeoutError;
      }
      const transportError = new Error(
        `ZeptoMail request failed: ${networkError?.message || networkError}`
      );
      transportError.code = "ZEPTOMAIL_NETWORK";
      transportError.cause = networkError;
      throw transportError;
    }

    const rawBody = await response.text();
    const data = parseBody(rawBody);

    if (!response.ok) {
      const error = new Error(
        `ZeptoMail API responded ${response.status}: ${extractDetail(data, rawBody)}`
      );
      error.code = "ZEPTOMAIL_API_ERROR";
      error.status = response.status;
      error.response = data ?? rawBody;
      throw error;
    }

    if (data === null) {
      // 2xx with a non-JSON body: the mail was accepted, but we cannot hand back
      // structured details. Do not treat this as a failure.
      return { success: true, raw: rawBody };
    }

    return data;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { sendMail, isConfigured };
