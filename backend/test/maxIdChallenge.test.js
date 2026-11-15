import test from "node:test";
import assert from "node:assert/strict";
import { configureMaxIdChallenge } from "../src/services/maxIdChallenge.js";

function setup({ initial = false, id = "123456789", challenge = false } = {}) {
  const actions = [];
  let finishLogin;
  const login = new Promise((resolve) => { finishLogin = resolve; });
  const page = {
    $: async () => initial ? { isVisible: async () => true } : null,
    $eval: async (selector) => { actions.push(selector.includes("send-me-code") ? "submit" : "clear"); if (selector.includes("send-me-code")) finishLogin(); },
    type: async (_selector, value) => { actions.push(`type:${value}`); },
    waitForSelector: async () => { if (!challenge) throw new Error("no challenge"); },
  };
  const scraper = { page, getLoginOptions: () => ({ preAction: async () => {}, postAction: () => login }) };
  configureMaxIdChallenge(scraper, id);
  return { options: scraper.getLoginOptions({}), actions, finishLogin };
}

test("fills ID already present on the password form", async () => {
  const { options, actions, finishLogin } = setup({ initial: true });
  await options.preAction();
  finishLogin();
  await options.postAction();
  assert.deepEqual(actions, ["clear", "type:123456789"]);
});

test("fills and resubmits a challenge appearing after login", async () => {
  const { options, actions } = setup({ challenge: true });
  await options.preAction();
  await options.postAction();
  assert.deepEqual(actions, ["clear", "type:123456789", "submit"]);
});

test("reports a missing ID without submitting a challenge", async () => {
  const { options, actions, finishLogin } = setup({ challenge: true, id: "" });
  await options.preAction();
  await assert.rejects(options.postAction(), /MAX requires an ID number/);
  finishLogin();
  assert.deepEqual(actions, []);
});

test("preserves password login when no ID is requested", async () => {
  const { options, actions, finishLogin } = setup();
  await options.preAction();
  finishLogin();
  await options.postAction();
  assert.deepEqual(actions, []);
});
