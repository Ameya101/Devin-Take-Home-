import { KitError } from "@/kit/errors";

/** Adapts a withPermission-wrapped route handler so kit errors become HTTP responses (e.g. 403). */
export function toRouteHandler<A extends unknown[]>(handler: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof KitError) return Response.json({ error: err.message }, { status: err.status });
      throw err;
    }
  };
}
