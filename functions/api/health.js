import { json, getCache } from "../_lib.js";
import { healthPayload } from "../../lib/health.mjs";

export async function onRequestGet({ env }) {
  return json(await healthPayload(env, getCache(env)));
}
