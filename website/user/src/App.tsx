import { HelmetProvider } from 'react-helmet-async';
import { BrowserRouter } from 'react-router-dom';
import { MotionConfig } from 'framer-motion';
import { ToastProvider } from '@/components/ui';
import { AuthProvider } from '@/context/AuthContext';
import { LangProvider } from '@/context/LangContext';
import { StudentProvider } from '@/context/StudentContext';
import { AppRoutes } from '@/routes/AppRoutes';

export default function App() {
  return (
    <HelmetProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <MotionConfig reducedMotion="user">
          <LangProvider>
            <AuthProvider>
              <StudentProvider>
                <ToastProvider>
                  <AppRoutes />
                </ToastProvider>
              </StudentProvider>
            </AuthProvider>
          </LangProvider>
        </MotionConfig>
      </BrowserRouter>
    </HelmetProvider>
  );
}
