import type { HttpResponseInit } from "@azure/functions";

export function json(body: unknown, status = 200): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  };
}

export function noContent(): HttpResponseInit {
  return { status: 204, headers: { "Cache-Control": "no-store" } };
}
