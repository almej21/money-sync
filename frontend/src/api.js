const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

// const SENSITIVE_KEY_PATTERN = /password|token|authorization|otp|nationalid/i;

// function toIsoNow() {
//   return new Date().toISOString();
// }

// function sanitizeForLog(value) {
//   if (value == null) return value;
//   if (Array.isArray(value)) return value.map((item) => sanitizeForLog(item));
//   if (typeof value !== "object") return value;

//   const output = {};
//   for (const [key, nestedValue] of Object.entries(value)) {
//     if (SENSITIVE_KEY_PATTERN.test(String(key))) {
//       output[key] = "***redacted***";
//       continue;
//     }
//     output[key] = sanitizeForLog(nestedValue);
//   }
//   return output;
// }

export async function api(path, options = {}) {
  if (!API_URL) {
    throw new Error("VITE_API_URL is missing");
  }

  const token = localStorage.getItem("token");
  // const method = String(options.method || "GET").toUpperCase();
  const url = `${API_URL}${path}`;
  // const requestStartedAtIso = toIsoNow();
  // const startedPerf = performance.now();

  // const requestInfo = sanitizeForLog({
  //   method,
  //   url,
  //   path,
  //   headers: {
  //     "Content-Type": "application/json",
  //     ...(token ? { Authorization: `Bearer ${token}` } : {}),
  //     ...(options.headers || {}),
  //   },
  //   body: options.body,
  // });

  // console.log("[API REQUEST]", {
  //   at: requestStartedAtIso,
  //   ...requestInfo,
  // });

  let res;
  try {
    res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    // const requestEndedAtIso = toIsoNow();
    // const durationMs =
    //   Math.round((performance.now() - startedPerf) * 1000) / 1000;
    // console.log("[API RESPONSE]", {
    //   at: requestEndedAtIso,
    //   method,
    //   url,
    //   path,
    //   status: null,
    //   ok: false,
    //   durationMs,
    //   error: error?.message || "Network request failed",
    // });
    throw error;
  }

  // const requestEndedAtIso = toIsoNow();
  // const durationMs =
  //   Math.round((performance.now() - startedPerf) * 1000) / 1000;
  // console.log("[API RESPONSE]", {
  //   at: requestEndedAtIso,
  //   method,
  //   url,
  //   path,
  //   status: res.status,
  //   ok: res.ok,
  //   durationMs,
  // });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(err.message || "Request failed");
  }

  return res.json();
}
