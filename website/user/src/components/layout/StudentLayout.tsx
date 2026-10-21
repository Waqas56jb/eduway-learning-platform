import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import { readStore, writeStore } from '@/lib/storage';
import { BottomTabs } from './BottomTabs';
import { PageTransition } from './PageTransition';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

export function StudentLayout() {
  const [collapsed, setCollapsed] = useState(() => readStore('eduway.sidebar.collapsed', false));
  const toggle = () =>
    setCollapsed((c) => {
      writeStore('eduway.sidebar.collapsed', !c);
      return !c;
    });

  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main id="main" className="flex-1 px-4 pb-28 pt-6 sm:px-6 lg:px-8 lg:pb-12 lg:pt-8">
          <div className="mx-auto max-w-7xl">
            <PageTransition>
              <Outlet />
            </PageTransition>
          </div>
        </main>
      </div>
      <BottomTabs />
    </div>
  );
}
