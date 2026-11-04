"use client";

import { useEffect, useState } from "react";
import { api, type SignInMethods } from "@/lib/api";
import { isSelfHosted } from "@/lib/runtime-config";

// The sign-in methods that work on this deployment, from the API
// (`GET /auth/methods`): the sign-in screen shows these and no others, so it
// never offers a button that ends on someone else's error page. A
// self-hosted install has GitHub with an OAuth client of its own, or, on
// Coderhelm's GitHub App (hybrid), once it is registered with Coderhelm: the
// same /auth/github then goes through Coderhelm's app and the install still
// decides who signs in.
//
// Until the API answers, and when it can't (an older gateway), the hosted
// service keeps Google and GitHub and a self-hosted install shows email and
// password only.

export function fallbackSignInMethods(selfHosted: boolean): SignInMethods {
  return { password: true, google: !selfHosted, github: !selfHosted };
}

export function useSignInMethods(): SignInMethods {
  const [methods, setMethods] = useState<SignInMethods>(() => fallbackSignInMethods(isSelfHosted()));
  useEffect(() => {
    let live = true;
    api
      .signInMethods()
      .then((m) => {
        if (!live) return;
        setMethods({
          password: m.password !== false,
          google: m.google === true,
          github: m.github === true,
          ...(m.senders ? { senders: m.senders } : {}),
        });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return methods;
}
