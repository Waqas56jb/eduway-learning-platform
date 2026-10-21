import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { useUi } from '@/store/ui';
import { Skeleton } from '@/components/ui/Feedback';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { CommandPalette } from './CommandPalette';

export function PageFallback() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

export function AppLayout() {
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen bg-app">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-lift">
        Skip to content
      </a>
      <Sidebar />
      <div className={cn('flex min-h-screen min-w-0 flex-col transition-[padding] duration-300 ease-out', collapsed ? 'lg:ps-[72px]' : 'lg:ps-[260px]')}>
        <Topbar />
        <main id="main" className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageFallback />}>
            <motion.div key={pathname} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: 'easeOut' }}>
              <Outlet />
            </motion.div>
          </Suspense>
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
