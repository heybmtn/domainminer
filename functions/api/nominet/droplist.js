import { fetchDroplist } from "../../../lib/nominet.mjs";
import { fail, getCache, json } from "../../_lib.js";

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";
    const result = await fetchDroplist({ cache: getCache(env), force });
    return json(result);
  } catch (err) {
    return fail(err);
  }
}
