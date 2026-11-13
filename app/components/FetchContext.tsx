'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

type FetchingState = { fetching: boolean; setFetching: (v: boolean) => void };

const FetchingContext = createContext<FetchingState>({ fetching: false, setFetching: () => {} });

/** Shares "a Decibel fetch is in progress" between the Fetch now button and the month navigation. */
export function FetchProvider({ children }: { children: ReactNode }) {
  const [fetching, setFetching] = useState(false);
  return <FetchingContext.Provider value={{ fetching, setFetching }}>{children}</FetchingContext.Provider>;
}

export const useFetching = () => useContext(FetchingContext);
