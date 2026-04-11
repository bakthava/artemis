import React, { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [historyVersion, setHistoryVersion] = useState(0);
  const [collectionsVersion, setCollectionsVersion] = useState(0);

  const refreshHistory = useCallback(() => setHistoryVersion(v => v + 1), []);
  const refreshCollections = useCallback(() => setCollectionsVersion(v => v + 1), []);

  return (
    <AppContext.Provider value={{ historyVersion, collectionsVersion, refreshHistory, refreshCollections }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  return useContext(AppContext);
}
