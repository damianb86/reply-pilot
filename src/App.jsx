/* eslint-disable react/prop-types */
import {useEffect, useState} from 'react';
import {Badge, BlockStack, Button, Icon, InlineStack, Page, Text} from '@shopify/polaris';
import {
  ChartVerticalIcon,
  ChatIcon,
  CheckCircleIcon,
  HomeIcon,
  ImportIcon,
  PageIcon,
  QuestionCircleIcon,
  SettingsIcon,
  SendIcon,
} from '@shopify/polaris-icons';
import DashboardPage from './pages/DashboardPage';
import HelpPage from './pages/HelpPage';
import LogsPage from './pages/LogsPage';
import ReviewsPage from './pages/ReviewsPage';
import SettingsPage from './pages/SettingsPage';

const navigationItems = [
  {key: 'dashboard', label: 'Connect', icon: 'home', path: '/dashboard'},
  {key: 'reviews', label: 'Reviews', icon: 'reviews', path: '/reviews'},
  {key: 'logs', label: 'Sent', icon: 'logs', path: '/logs'},
  {key: 'settings', label: 'Settings', icon: 'settings', path: '/settings'},
  {key: 'help', label: 'Help', icon: 'help', path: '/help'},
];

const iconMap = {
  home: HomeIcon,
  reviews: ChatIcon,
  analytics: ChartVerticalIcon,
  logs: PageIcon,
  settings: SettingsIcon,
  help: QuestionCircleIcon,
};

function routeKeyFromPath(pathname) {
  if (pathname === '/dashboard') return 'dashboard';
  if (pathname === '/reviews') return 'reviews';
  if (pathname === '/brand-voice') return 'settings';
  if (pathname === '/logs') return 'logs';
  if (pathname === '/settings') return 'settings';
  if (pathname === '/help') return 'help';
  return 'dashboard';
}

function NavigationIcon({name}) {
  return <Icon source={iconMap[name]} tone="base" />;
}

function SidebarCard({children}) {
  return <div className="sidebar-support-card">{children}</div>;
}

export default function App() {
  const [currentPage, setCurrentPage] = useState(() => routeKeyFromPath(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname === '/' || window.location.pathname === '') {
      window.history.replaceState({}, '', '/dashboard');
      setCurrentPage('dashboard');
    }

    function handlePopState() {
      setCurrentPage(routeKeyFromPath(window.location.pathname));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  function navigateTo(path) {
    if (!path || window.location.pathname === path) return;
    window.history.pushState({}, '', path);
    setCurrentPage(routeKeyFromPath(path));
  }

  return (
    <div className="embedded-shell">
      <div className="workspace-shell">
        <aside className="sidebar">
          <div className="sidebar-panel">
            <div className="app-mark">
              <div className="app-mark-badge">
                <Icon source={ChatIcon} tone="base" />
              </div>
              <Text as="span" variant="headingLg">Reply Pulse AI: Review Replies</Text>
            </div>

            <nav className="sidebar-nav" aria-label="ReplyPulse sections">
              {navigationItems.map((item) => {
                const isActive = item.key === currentPage;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`nav-item ${isActive ? 'is-active' : ''}`}
                    onClick={() => navigateTo(item.path)}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <NavigationIcon name={item.icon} />
                    <span className="nav-item-label">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="sidebar-support">
              <SidebarCard>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Badge tone="attention">Setup</Badge>
                    <Text as="p" variant="bodyMd" fontWeight="semibold">
                      Connect a review source
                    </Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Import reviews, draft replies, and send from one queue.
                  </Text>
                  <Button icon={ImportIcon} fullWidth>Open connection</Button>
                </BlockStack>
              </SidebarCard>

              <SidebarCard>
                <BlockStack gap="300">
                  <InlineStack gap="200" blockAlign="center">
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="p" variant="bodyMd" fontWeight="semibold">Production mode</Text>
                  </InlineStack>
                  <Text as="p" variant="bodySm" tone="subdued">Audit approved replies after they are sent.</Text>
                  <Button icon={SendIcon} fullWidth onClick={() => navigateTo('/logs')}>View sent replies</Button>
                </BlockStack>
              </SidebarCard>
            </div>
          </div>
        </aside>

        <main className="main-content">
          <Page fullWidth>
            {currentPage === 'dashboard' ? <DashboardPage /> : null}
            {currentPage === 'reviews' ? <ReviewsPage /> : null}
            {currentPage === 'logs' ? <LogsPage /> : null}
            {currentPage === 'settings' ? <SettingsPage /> : null}
            {currentPage === 'help' ? <HelpPage /> : null}
          </Page>
        </main>
      </div>
    </div>
  );
}
