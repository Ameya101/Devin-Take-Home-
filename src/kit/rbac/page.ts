import { redirect } from "next/navigation";
import { ForbiddenError } from "@/kit/errors";

/** For server components: turns a ForbiddenError from a withPermission loader into a redirect to /forbidden. */
export async function orForbidden<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (err) {
    if (err instanceof ForbiddenError) redirect("/forbidden");
    throw err;
  }
}
