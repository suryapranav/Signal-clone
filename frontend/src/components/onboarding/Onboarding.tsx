"use client";

import { ArrowLeft, Info, MessageCircle } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, ApiError } from "@/lib/api";
import { formatPhone } from "@/lib/format";
import { useChat } from "@/store/chat";
import { useSession } from "@/store/session";

const COUNTRIES = [
  { code: "+1", name: "United States" },
  { code: "+91", name: "India" },
  { code: "+44", name: "United Kingdom" },
  { code: "+61", name: "Australia" },
  { code: "+49", name: "Germany" },
  { code: "+65", name: "Singapore" },
  { code: "+971", name: "United Arab Emirates" },
];

const DEMO_ACCOUNTS = [
  { name: "Alice Chen", phone: "+15550100001" },
  { name: "Bob Martinez", phone: "+15550100002" },
  { name: "Priya Sharma", phone: "+15550100003" },
];

export function OnboardingFrame({ children, onBack }: { children: ReactNode; onBack?: () => void }) {
  return (
    <div className="flex h-dvh flex-col overflow-y-auto bg-chat">
      <div className="flex h-14 items-center px-4">
        {onBack && (
          <button className="icon-btn" onClick={onBack} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
        )}
      </div>
      <div className="mx-auto flex w-full max-w-[420px] flex-1 flex-col px-6 pb-10 pt-4 sm:pt-12">
        <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-white">
          <MessageCircle size={26} fill="currentColor" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Onboarding() {
  const [phone, setPhone] = useState<string | null>(null);
  return phone ? <CodeStep phone={phone} onBack={() => setPhone(null)} /> : <PhoneStep onNext={setPhone} />;
}

function PhoneStep({ onNext }: { onNext: (phone: string) => void }) {
  const [country, setCountry] = useState("+1");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(full: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.requestOtp(full);
      onNext(res.phone);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Can't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(country + number.replace(/\D/g, ""));
  };

  return (
    <OnboardingFrame>
      <h1 className="text-title font-semibold">Phone number</h1>
      <p className="mt-2 text-body text-ink-2">Enter your phone number to get started.</p>

      <form onSubmit={onSubmit} className="mt-8 space-y-3">
        <label className="block">
          <span className="sr-only">Country</span>
          <select
            className="input appearance-none"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <div className="input w-20 shrink-0 select-none text-center leading-9 text-ink-2">{country}</div>
          <input
            className="input"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="Phone number"
            autoFocus
            value={number}
            onChange={(e) => setNumber(e.target.value.replace(/[^\d\s-]/g, ""))}
            aria-label="Phone number"
          />
        </div>
        {error && <p className="text-body-sm text-danger">{error}</p>}
        <div className="flex justify-end pt-4">
          <button className="btn-primary min-w-24" disabled={busy || number.replace(/\D/g, "").length < 6}>
            {busy ? "…" : "Next"}
          </button>
        </div>
      </form>

      <div className="mt-10 rounded-xl bg-field p-4">
        <p className="text-body-sm font-semibold text-ink-2">Demo accounts</p>
        <p className="mt-1 text-body-sm text-ink-3">Seeded users with chats and groups. Open two in different browsers to see real-time messaging.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {DEMO_ACCOUNTS.map((a) => (
            <button key={a.phone} className="btn-secondary h-8 bg-pane text-body-sm" onClick={() => submit(a.phone)} disabled={busy}>
              {a.name}
            </button>
          ))}
        </div>
      </div>
    </OnboardingFrame>
  );
}

const CODE_LENGTH = 6;

function CodeStep({ phone, onBack }: { phone: string; onBack: () => void }) {
  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => inputs.current[0]?.focus(), []);

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(phone, code);
      useChat.getState().setMe(res.user);
      useSession.getState().signIn(res.token);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      setDigits(Array(CODE_LENGTH).fill(""));
      inputs.current[0]?.focus();
      setBusy(false);
    }
  }

  function setAt(i: number, value: string) {
    const chars = value.replace(/\D/g, "").split("");
    if (chars.length === 0) {
      setDigits((d) => d.map((x, j) => (j === i ? "" : x)));
      return;
    }
    // Typing or pasting several digits fills the following boxes.
    const next = digits.slice();
    chars.slice(0, CODE_LENGTH - i).forEach((c, k) => (next[i + k] = c));
    setDigits(next);
    const focusAt = Math.min(i + chars.length, CODE_LENGTH - 1);
    inputs.current[focusAt]?.focus();
    if (next.every(Boolean)) void verify(next.join(""));
  }

  return (
    <OnboardingFrame onBack={onBack}>
      <h1 className="text-title font-semibold">Verification code</h1>
      <p className="mt-2 text-body text-ink-2">
        Enter the code we sent to {formatPhone(phone)}.{" "}
        <button className="font-medium text-accent hover:underline" onClick={onBack}>
          Wrong number?
        </button>
      </p>

      <div className="mt-8 flex justify-between gap-2" aria-label="Verification code">
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputs.current[i] = el;
            }}
            value={d}
            inputMode="numeric"
            autoComplete={i === 0 ? "one-time-code" : "off"}
            maxLength={CODE_LENGTH}
            disabled={busy}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => setAt(i, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && !d && i > 0) inputs.current[i - 1]?.focus();
            }}
            className="h-12 w-11 rounded-lg bg-field text-center text-[20px] font-medium outline-none focus:ring-2 focus:ring-accent disabled:opacity-60"
          />
        ))}
      </div>
      {error && <p className="mt-3 text-body-sm text-danger">{error}</p>}

      <div className="mt-8 flex items-start gap-3 rounded-xl bg-field p-4 text-body-sm text-ink-2">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          Demo mode: no SMS is sent. Use code <b className="font-semibold text-ink">123456</b>.
        </p>
      </div>
    </OnboardingFrame>
  );
}
