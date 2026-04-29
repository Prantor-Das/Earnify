"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

type ToastType = "success" | "error" | "info" | "warning";

type ToastInput = {
  type: ToastType;
  title: string;
  message?: string;
};

type ToastEntry = ToastInput & {
  id: string;
};

type ToastContextValue = {
  pushToast: (input: ToastInput) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

function getToastStyle(type: ToastType) {
  if (type === "success") {
    return {
      color: "var(--color-success)",
      borderColor:
        "color-mix(in srgb, var(--color-success) 40%, var(--color-border))",
      backgroundColor:
        "color-mix(in srgb, var(--color-success) 14%, var(--color-surface))",
    };
  }

  if (type === "error") {
    return {
      color: "var(--color-danger)",
      borderColor:
        "color-mix(in srgb, var(--color-danger) 40%, var(--color-border))",
      backgroundColor:
        "color-mix(in srgb, var(--color-danger) 14%, var(--color-surface))",
    };
  }

  if (type === "warning") {
    return {
      color: "var(--color-accent)",
      borderColor:
        "color-mix(in srgb, var(--color-accent) 42%, var(--color-border))",
      backgroundColor:
        "color-mix(in srgb, var(--color-accent) 15%, var(--color-surface))",
    };
  }

  return {
    color: "var(--color-secondary)",
    borderColor:
      "color-mix(in srgb, var(--color-secondary) 36%, var(--color-border))",
    backgroundColor:
      "color-mix(in srgb, var(--color-secondary) 13%, var(--color-surface))",
  };
}

function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const pushToast = useCallback((input: ToastInput) => {
    const nextToast: ToastEntry = {
      ...input,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };

    setToasts((previous) => [nextToast, ...previous].slice(0, 6));

    window.setTimeout(() => {
      setToasts((previous) =>
        previous.filter((toast) => toast.id !== nextToast.id),
      );
    }, 4000);
  }, []);

  const value = useMemo<ToastContextValue>(() => ({ pushToast }), [pushToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2">
        {toasts.map((toast) => (
          <article
            key={toast.id}
            className="pointer-events-auto rounded-md border px-4 py-3 shadow-sm"
            style={getToastStyle(toast.type)}
          >
            <p className="text-sm font-semibold">{toast.title}</p>
            {toast.message ? (
              <p className="mt-1 text-xs text-muted">{toast.message}</p>
            ) : null}
          </article>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return context;
}

export { ToastProvider, useToast };
