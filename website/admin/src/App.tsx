import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Toaster } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import { router } from '@/routes';
import { applyTheme, useUi } from '@/store/ui';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';

export default function App() {
  const theme = useUi((s) => s.theme);
  const { i18n } = useTranslation();
  useEffect(() => applyTheme(theme), [theme]);

  return (
    <HelmetProvider>
      <ConfirmProvider>
        <RouterProvider router={router} future={{ v7_startTransition: true }} />
      </ConfirmProvider>
      <Toaster
        position={i18n.language === 'ar' ? 'bottom-left' : 'bottom-right'}
        gutter={10}
        toastOptions={{
          duration: 3200,
          className: '!rounded-xl !border !border-line !bg-surface !text-ink !text-sm !shadow-lift',
          success: { iconTheme: { primary: '#16A34A', secondary: '#fff' } },
          error: { iconTheme: { primary: '#DC2626', secondary: '#fff' } },
        }}
      />
    </HelmetProvider>
  );
}
