import AsyncStorage from '@react-native-async-storage/async-storage';
import { createJSONStorage } from 'zustand/middleware';

/** Shared AsyncStorage adapter for persisted zustand stores. */
export const asyncJSONStorage = createJSONStorage(() => AsyncStorage);
