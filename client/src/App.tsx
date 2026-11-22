import * as React from 'react';
import { CommunityPage } from '@/pages/CommunityPage';
import { AdminPage } from '@/pages/AdminPage';

function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname === '/admin/';
}

export function App() {
  const [pathname, setPathname] = React.useState(() => window.location.pathname);

  React.useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (isAdminPath(pathname)) {
    return <AdminPage />;
  }

  return <CommunityPage />;
}

export default App;
