import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login } from "../api";

export default function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token } = await login(username, password);
      localStorage.setItem("admin_token", token);
      localStorage.removeItem("customer_token");
      localStorage.removeItem("customer_email");
      localStorage.removeItem("customer_license");
      localStorage.removeItem("customer_user_id");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 sm:px-6 sm:py-16 md:px-8 lg:px-12 xl:px-32">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-lg border border-white/20 bg-white/5 p-6 sm:p-8 mx-4"
        style={{ fontFamily: "JetBrains Mono, monospace" }}
      >
        <h1 className="mb-2 text-xl sm:text-2xl font-bold" style={{ fontFamily: "JetBrains Mono, monospace", color: "#32d74b" }}>
          Ira Admin
        </h1>
        <p className="mb-6 text-sm text-white/70">Sign in to the admin dashboard</p>
        {error && (
          <div className="mb-4 text-sm text-red-400">{error}</div>
        )}
        <div className="mb-4">
          <label className="mb-2 block text-sm" style={{ color: "#ff9f0a" }}>Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            autoComplete="username"
            className="w-full rounded-lg border border-white/30 bg-black px-3 py-2 text-white placeholder-white/50 focus:border-[#32d74b] focus:outline-none focus:ring-1 focus:ring-[#32d74b]"
          />
        </div>
        <div className="mb-6">
          <label className="mb-2 block text-sm" style={{ color: "#ff9f0a" }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full rounded-lg border border-white/30 bg-black px-3 py-2 text-white placeholder-white/50 focus:border-[#32d74b] focus:outline-none focus:ring-1 focus:ring-[#32d74b]"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg border border-white bg-black px-4 py-3 font-medium text-white transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
        <p className="mt-4 text-center text-sm text-white/80">
          <Link to="/login" className="text-[#32d74b] hover:underline">
            ← Back to customer login
          </Link>
        </p>
      </form>
    </div>
  );
}
