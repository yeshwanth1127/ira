import { useEffect } from "react";

export default function Download() {
  useEffect(() => {
    // Keep behavior simple for now: forward users to homepage if no direct installer URL is configured.
    // You can later replace this with platform-specific installer links.
    const timer = window.setTimeout(() => {
      window.location.href = "/";
    }, 800);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold mb-2">Preparing download...</h1>
        <p className="text-sm opacity-70">Redirecting you in a moment.</p>
      </div>
    </div>
  );
}

