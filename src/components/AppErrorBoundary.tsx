import React from 'react';

// Without a boundary, any render error unmounted the whole portal and left a blank white screen (inside the
// Fleet app that looks like a frozen app with no way out). This shows a short message with Reload instead.
// Keyed on the route by the caller, so moving to another page clears the error.
interface State { error: Error | null }

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[portal] render error', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm dark:border-[#1d3f5c] dark:bg-[#0d2438]">
        <p className="font-semibold text-slate-800 dark:text-white">Something went wrong on this page</p>
        <p className="mt-1 text-sm text-slate-500 dark:text-[#8fb0cf]">Reload to try again. Your saved data is safe.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Reload
        </button>
      </div>
    );
  }
}
