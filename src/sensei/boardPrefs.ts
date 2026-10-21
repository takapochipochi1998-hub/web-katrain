import { createContext, useContext } from 'react';

/** Board display choices from 設定, read by every board without passing them through each screen. */
export type BoardPrefs = { showCoords: boolean };

export const BoardPrefsContext = createContext<BoardPrefs>({ showCoords: false });

export const useBoardPrefs = (): BoardPrefs => useContext(BoardPrefsContext);
