import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { ToastProvider } from '@/components/ui';
import { ApiBridge } from '@/components/system/ApiBridge';
import { LegalPrompt } from '@/components/system/LegalPrompt';
import { MaintenanceGate } from '@/components/system/MaintenanceGate';
import { AuthProvider } from '@/context/AuthContext';
import { LangProvider } from '@/context/LangContext';
import { AppRoutes } from '@/routes/AppRoutes';

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MotionConfig reducedMotion="user">
          <LangProvider>
            <AuthProvider>
              <ToastProvider>
                <ApiBridge />
                <MaintenanceGate>
                  <AppRoutes />
                  <LegalPrompt />
                </MaintenanceGate>
              </ToastProvider>
            </AuthProvider>
          </LangProvider>
        </MotionConfig>
      </BrowserRouter>
    </HelmetProvider>
  );
}
