import { useEffect } from "react";

type Props = {
  message: string;
  onDismiss: () => void;
  duration?: number;
};

export function Toast({ message, onDismiss, duration = 5000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [onDismiss, duration]);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-start gap-3 bg-red-600 text-white px-4 py-3 rounded-lg shadow-lg max-w-sm text-sm">
      <span className="flex-1">{message}</span>
      <button type="button" onClick={onDismiss} className="shrink-0 hover:opacity-80 leading-none">
        ✕
      </button>
    </div>
  );
}
