import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AppIcon, IconName } from '../config/icons';

const navItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/', icon: 'Home', label: 'Home' },
  { path: '/calendar', icon: 'Calendar', label: 'Calendar' },
  { path: '/log', icon: 'Plus', label: 'Log' },
  { path: '/templates', icon: 'Clipboard', label: 'Templates' },
  { path: '/timeline', icon: 'History', label: 'Timeline' },
  { path: '/progress', icon: 'Trending', label: 'Progress' },
  { path: '/settings', icon: 'Settings', label: 'Settings' },
];

const mobileNavItems: { path: string; icon: IconName; label: string }[] = [
  { path: '/', icon: 'Home', label: 'Home' },
  { path: '/progress', icon: 'Activity', label: 'Health' },
  { path: '/calendar', icon: 'Calendar', label: 'Calendar' },
  { path: '/settings', icon: 'More', label: 'More' },
];

export const Layout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [viewportHeight, setViewportHeight] = useState(
    typeof window === 'undefined' ? 0 : window.innerHeight,
  );
  const [tappedTab, setTappedTab] = useState<string | null>(null);
  const isImmersiveRoute = location.pathname === '/log';
  const swipeStartRef = useRef<{ x: number; y: number; ts: number } | null>(null);
  const tapTimerRef = useRef<number | null>(null);

  const currentPageLabel = useMemo(() => {
    if (location.pathname.startsWith('/settings/layout')) return 'Layout';
    if (location.pathname === '/') return 'Home';
    const route = navItems.find((item) =>
      item.path !== '/' && location.pathname.startsWith(item.path),
    );
    return route?.label || 'Athlix';
  }, [location.pathname]);

  const canGoBack = location.pathname !== '/';

  useEffect(() => {
    const updateViewportHeight = () => {
      const nextHeight = Math.round(window.visualViewport?.height || window.innerHeight);
      setViewportHeight(nextHeight);
    };

    updateViewportHeight();

    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (tapTimerRef.current) {
        window.clearTimeout(tapTimerRef.current);
      }
    };
  }, []);

  const handleBack = () => {
    if (!canGoBack) return;
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    navigate('/');
  };

  const handleTouchStart = (event: React.TouchEvent<HTMLElement>) => {
    if (!canGoBack || event.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    if (touch.clientX > 28) {
      swipeStartRef.current = null;
      return;
    }

    swipeStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      ts: Date.now(),
    };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = Math.abs(touch.clientY - start.y);
    const elapsed = Date.now() - start.ts;

    if (deltaX > 78 && deltaY < 56 && elapsed < 520) {
      handleBack();
    }
  };

  const handleTabTap = (path: string) => {
    if (navigator.vibrate) navigator.vibrate(10);
    setTappedTab(path);
    if (tapTimerRef.current) {
      window.clearTimeout(tapTimerRef.current);
    }
    tapTimerRef.current = window.setTimeout(() => {
      setTappedTab(null);
    }, 150);
  };

  return (
    <div
      className="flex bg-black text-white overflow-hidden"
      style={viewportHeight > 0 ? { height: `${viewportHeight}px` } : undefined}
    >
      {/* Sidebar for tablet/desktop */}
      <aside className="hidden md:flex flex-col w-64 border-r border-white/10 bg-[#0A0A0A]">
        <div className="p-6">
          <h1 className="text-2xl font-bold tracking-tighter text-[#00D4FF]">ATHLIX</h1>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-4 py-3 rounded-xl transition-colors ${
                  isActive
                    ? 'bg-[#00D4FF]/10 text-[#00D4FF]'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <AppIcon name={item.icon} size="md" />
              <span className="font-medium">{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {!isImmersiveRoute && (
        <header
          className="md:hidden fixed top-0 left-0 right-0 z-[90] px-3"
          style={{
            paddingTop: 'env(safe-area-inset-top)',
            backgroundColor: 'rgba(10, 15, 20, 0.6)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex h-[60px] items-center justify-between">
            <button
              type="button"
              onClick={handleBack}
              disabled={!canGoBack}
              aria-label="Go back"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.07] text-white/90 transition-transform duration-150 hover:bg-white/[0.12] active:scale-95 disabled:cursor-default disabled:opacity-35"
            >
              <AppIcon name="Back" size="md" />
            </button>
            <p className="text-sm font-semibold tracking-wide text-slate-100">{currentPageLabel}</p>
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Go to home"
              className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/18 text-cyan-300 transition-transform duration-150 hover:bg-cyan-400/25 active:scale-95"
            >
              <AppIcon name="Home" size="sm" />
            </button>
          </div>
        </header>
      )}

      {/* Main Content */}
      <main
        className={`flex-1 flex flex-col h-full relative overflow-y-auto md:pb-0 ${
          isImmersiveRoute
            ? ''
            : 'pt-[calc(60px+env(safe-area-inset-top))] pb-[calc(80px+env(safe-area-inset-bottom))] md:pt-0 md:pb-0'
        }`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className={`flex-1 w-full ${
            isImmersiveRoute
              ? ''
              : 'px-3 pt-3 pb-5 sm:px-5 md:px-8 md:pt-8 md:pb-8'
          }`}
        >
          <Outlet />
        </div>
      </main>

      {/* Floating Action Button */}
      {!isImmersiveRoute && (
        <NavLink
          to="/log?add=1"
          onClick={() => {
            if (navigator.vibrate) navigator.vibrate(15);
          }}
          className="md:hidden fixed right-4 w-14 h-14 rounded-full bg-[var(--accent)] text-black flex items-center justify-center shadow-[0_8px_24px_var(--accent-glow)] active:scale-95 transition-transform z-[95]"
          style={{ bottom: 'calc(88px + max(env(safe-area-inset-bottom), 12px))' }}
        >
          <AppIcon name="Plus" size="lg" />
        </NavLink>
      )}

      {/* Bottom Navigation for mobile */}
      {!isImmersiveRoute && (
        <>
          <div
            className="md:hidden fixed left-0 right-0 z-[98] pointer-events-none"
            style={{
              bottom: 'calc(72px + env(safe-area-inset-bottom))',
              height: '32px',
              background: 'linear-gradient(to bottom, transparent 0%, rgba(10, 15, 20, 0.9) 100%)',
            }}
          />

          <nav
            className="md:hidden fixed left-0 right-0 bottom-0 z-[100]"
            style={{
              backgroundColor: 'rgba(10, 15, 20, 0.75)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              paddingBottom: 'env(safe-area-inset-bottom)',
            }}
          >
            <div className="mx-auto flex h-[72px] max-w-[540px] items-center justify-between px-6">
              {mobileNavItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.path === '/'}
                  onClick={() => handleTabTap(item.path)}
                  className={({ isActive }) =>
                    `group flex h-full w-[66px] flex-col items-center justify-center transition-all duration-150 ${
                      isActive ? 'text-[#00D4FF] opacity-100' : 'text-slate-200 opacity-[0.35]'
                    } ${tappedTab === item.path ? 'scale-[1.15]' : 'scale-100'}`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <AppIcon name={item.icon} size="md" />
                      {isActive ? (
                        <span className="mt-1 text-[10px] font-semibold leading-none tracking-wide">{item.label}</span>
                      ) : (
                        <span className="sr-only">{item.label}</span>
                      )}
                      {isActive && (
                        <span className="mt-1 h-1 w-1 rounded-full bg-[#00D4FF] shadow-[0_0_6px_#00D4FF]" />
                      )}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </nav>
        </>
      )}

      <Toaster 
        position="top-center"
        toastOptions={{
          style: {
            background: '#1A1A1A',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
    </div>
  );
};
