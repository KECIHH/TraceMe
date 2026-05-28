"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsLoading(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: formData.get("username"),
        password: formData.get("password"),
      }),
    });

    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;

    if (!response.ok) {
      setError(payload?.error ?? "登录失败，请稍后再试。");
      setIsLoading(false);
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-[#34434c]">用户名</span>
        <input
          autoComplete="username"
          className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
          name="username"
          required
          type="text"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-[#34434c]">密码</span>
        <input
          autoComplete="current-password"
          className="mt-2 w-full rounded-md border border-[#cfd7d2] bg-white px-3 py-2 text-sm outline-none transition focus:border-[#2f6f73] focus:ring-2 focus:ring-[#2f6f73]/20"
          name="password"
          required
          type="password"
        />
      </label>

      {error ? (
        <p className="rounded-md border border-[#f1b8aa] bg-[#fff2ee] px-3 py-2 text-sm text-[#9b2f1f]">
          {error}
        </p>
      ) : null}

      <button
        className="w-full rounded-md bg-[#2f6f73] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#285f62] disabled:cursor-not-allowed disabled:bg-[#90aaa9]"
        disabled={isLoading}
        type="submit"
      >
        {isLoading ? "登录中..." : "登录"}
      </button>
    </form>
  );
}
