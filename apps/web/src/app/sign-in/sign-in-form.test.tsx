import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignInForm } from "./sign-in-form";

const getProviders = vi.fn();
const signIn = vi.fn();

vi.mock("next-auth/react", () => ({
  getProviders: (...args: unknown[]) => getProviders(...args),
  signIn: (...args: unknown[]) => signIn(...args),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("SignInForm", () => {
  beforeEach(() => {
    getProviders.mockReset();
    signIn.mockReset();
    signIn.mockResolvedValue(undefined);
  });

  it("shows only the Google button when only Google is configured", async () => {
    getProviders.mockResolvedValue({ google: { id: "google", name: "Google" } });

    render(<SignInForm />);

    expect(await screen.findByRole("button", { name: /sign in with google/i })).toBeInTheDocument();
    expect(screen.queryByLabelText(/email me a sign-in link/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/dev login/i)).not.toBeInTheDocument();
  });

  it("calls signIn('google', ...) with the callback URL when clicked", async () => {
    getProviders.mockResolvedValue({ google: { id: "google", name: "Google" } });

    render(<SignInForm />);
    fireEvent.click(await screen.findByRole("button", { name: /sign in with google/i }));

    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/" });
  });

  it("sends a magic link and shows a confirmation once submitted", async () => {
    getProviders.mockResolvedValue({ nodemailer: { id: "nodemailer", name: "Email" } });

    render(<SignInForm />);
    const emailInput = await screen.findByPlaceholderText("you@company.com");
    fireEvent.change(emailInput, { target: { value: "founder@acme.com" } });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() =>
      expect(signIn).toHaveBeenCalledWith("nodemailer", {
        email: "founder@acme.com",
        callbackUrl: "/",
        redirect: false,
      })
    );
    expect(await screen.findByText(/check founder@acme.com for a sign-in link/i)).toBeInTheDocument();
  });

  it("offers dev login only when the dev-login provider is registered", async () => {
    getProviders.mockResolvedValue({ "dev-login": { id: "dev-login", name: "Dev login" } });

    render(<SignInForm />);
    fireEvent.click(await screen.findByRole("button", { name: /continue/i }));

    expect(signIn).toHaveBeenCalledWith("dev-login", {
      email: "founder@demo.raisely.dev",
      callbackUrl: "/",
    });
  });

  it("shows a warning when no providers are configured at all", async () => {
    getProviders.mockResolvedValue({});

    render(<SignInForm />);

    expect(await screen.findByText(/no auth providers are configured/i)).toBeInTheDocument();
  });
});
