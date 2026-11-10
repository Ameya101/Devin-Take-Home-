import { ZodError } from "zod";
import { KitError } from "./errors";

export type ActionState = { ok: true; message: string } | { ok: false; error: string } | null;

/**
 * Runs a server-action body and converts expected errors (403, validation, conflicts)
 * into a serializable result for useActionState. Unexpected errors still throw.
 */
export async function runAction(fn: () => Promise<string>): Promise<ActionState> {
  try {
    return { ok: true, message: await fn() };
  } catch (err) {
    if (err instanceof KitError) return { ok: false, error: err.message };
    if (err instanceof ZodError) {
      return { ok: false, error: err.issues.map((i) => i.message).join("; ") };
    }
    throw err;
  }
}
