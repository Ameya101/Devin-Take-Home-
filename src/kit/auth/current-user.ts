import { cache } from "react";
import { redirect } from "next/navigation";
import { getAuthProvider } from "./index";

/** The signed-in user for this request (memoized per request). */
export const getCurrentUser = cache(() => getAuthProvider().getCurrentUser());

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
