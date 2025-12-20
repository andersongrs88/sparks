import { useEffect } from "react";
import { useRouter } from "next/router";
import { getSession } from "../lib/auth";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const s = getSession();
    router.replace(s ? "/dashboard" : "/login");
  }, [router]);

  return null;
}
