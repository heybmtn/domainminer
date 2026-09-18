import { test } from "node:test";
import assert from "node:assert/strict";
import { healthPayload } from "../lib/health.mjs";
import { readCredentials } from "../lib/dataforseo.mjs";

test("readCredentials trims whitespace", () => {
  const creds = readCredentials({
    DATAFORSEO_LOGIN: "  user@example.com \n",
    DATAFORSEO_PASSWORD: " secret ",
  });
  assert.equal(creds.login, "user@example.com");
  assert.equal(creds.password, "secret");
  assert.equal(creds.configured, true);
});

test("health is configured but not authorized when DataForSEO returns 401", async () => {
  const env = { DATAFORSEO_LOGIN: "user@example.com", DATAFORSEO_PASSWORD: "wrong" };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    status_code: 40100,
    status_message: "You are not authorized to access this resource. See your login details here: https://app.dataforseo.com/api-access .",
  }), { status: 401 });
  try {
    const payload = await healthPayload(env, { size: async () => 0 });
    assert.equal(payload.configured, true);
    assert.equal(payload.authorized, false);
    assert.match(payload.authError, /not authorized/i);
  } finally {
    globalThis.fetch = orig;
  }
});

test("health authorized when user_data succeeds", async () => {
  const env = { DATAFORSEO_LOGIN: "user@example.com", DATAFORSEO_PASSWORD: "ok" };
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status_code: 20000, status_message: "Ok." }), { status: 200 });
  try {
    const payload = await healthPayload(env, { size: async () => 3 });
    assert.equal(payload.configured, true);
    assert.equal(payload.authorized, true);
    assert.equal(payload.cacheSize, 3);
    assert.equal(payload.authError, undefined);
  } finally {
    globalThis.fetch = orig;
  }
});
