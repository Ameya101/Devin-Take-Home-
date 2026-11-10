"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuthProvider } from "./index";

// Sign-in/out are the only server actions not wrapped in withPermission:
// they run before a user exists.
export async function signInAction(formData: FormData) {
  const { userId } = z.object({ userId: z.string().min(1) }).parse({ userId: formData.get("userId") });
  await getAuthProvider().signIn({ userId });
  redirect("/");
}

export async function signOutAction() {
  await getAuthProvider().signOut();
  redirect("/login");
}
