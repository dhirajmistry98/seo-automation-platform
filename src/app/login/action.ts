"use server";

import { signIn, signOut } from "@/auth";

export async function signInWithGoogle(formData: FormData) {
  const requested = formData.get("callbackUrl");
  const callbackUrl = typeof requested === "string" && requested.startsWith("/") && !requested.startsWith("//") && !requested.includes("\\") ? requested : "/dashboard";
  await signIn("google", {
    redirectTo: callbackUrl,
  });
}

export async function signOutAction() {
  await signOut({
    redirectTo: "/login",
  });
}
