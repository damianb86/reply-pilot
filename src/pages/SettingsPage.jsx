/* eslint-disable react/prop-types */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFetcher, useLoaderData, useLocation} from 'react-router';
import {SaveBar, useAppBridge} from '@shopify/app-bridge-react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Card,
  Checkbox,
  InlineStack,
  RangeSlider,
  Select,
  Text,
} from '@shopify/polaris';
import BrandVoicePage, {brandVoiceSettingsSections} from './BrandVoicePage';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';

const generalSettingsNav = [
  {id: 'general', label: 'General'},
  {id: 'queue', label: 'Queue behavior'},
  {id: 'privacy', label: 'Data & privacy'},
];
const brandVoiceSectionIds = new Set(brandVoiceSettingsSections.map((section) => section.id));
const settingsNavGroups = [
  {title: 'GENERAL SETTINGS', items: generalSettingsNav},
  {title: 'BRAND VOICE', items: brandVoiceSettingsSections},
];

const defaultSettings = {
  highConfidenceThreshold: 85,
  humanReviewThreshold: 75,
  routeSensitiveReviews: true,
  routeLowStarReviews: true,
  sendReplyEmail: false,
  useProductDescription: true,
  onboardingCompleted: false,
  showSkippedByDefault: false,
  showSentByDefault: false,
  dataRetention: '12-months',
  timezone: 'America/Argentina/Cordoba',
};

const retentionOptions = [
  {label: '12 months', value: '12-months'},
  {label: '24 months', value: '24-months'},
  {label: 'Forever', value: 'forever'},
];

function buildSettings(settings) {
  return {
    ...defaultSettings,
    ...(settings ?? {}),
  };
}

function settingsSignature(settings) {
  return JSON.stringify(buildSettings(settings));
}

function FieldRow({label, description, children}) {
  return (
    <div className="rp-field-row">
      <InlineStack align="space-between" blockAlign="center" gap="400">
        <BlockStack gap="050">
          <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
          {description ? <Text as="p" variant="bodyMd" tone="subdued">{description}</Text> : null}
        </BlockStack>
        <Box minWidth="220px">{children}</Box>
      </InlineStack>
    </div>
  );
}

function SectionCard({title, description, children, action}) {
  return (
    <Card padding="0">
      <Box padding="400">
        <InlineStack align="space-between" blockAlign="start" gap="300">
          <BlockStack gap="100">
            <Text as="h2" variant="headingLg">{title}</Text>
            <Text as="p" variant="bodyMd" tone="subdued">{description}</Text>
          </BlockStack>
          {action}
        </InlineStack>
      </Box>
      <BlockStack gap="0">{children}</BlockStack>
    </Card>
  );
}

function ThresholdSlider({label, description, value, min, max, suffix, onChange}) {
  return (
    <FieldRow
      label={label}
      description={description}
    >
      <BlockStack gap="150">
        <InlineStack align="space-between" blockAlign="center">
          <Badge tone="info">{value}{suffix}</Badge>
        </InlineStack>
        <RangeSlider
          label={label}
          labelHidden
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={onChange}
        />
      </BlockStack>
    </FieldRow>
  );
}

export default function SettingsPage() {
  const shopify = useAppBridge();
  const loaderData = useLoaderData();
  const location = useLocation();
  const saveFetcher = useFetcher();
  const cleanupFetcher = useFetcher();
  const lastToastKey = useRef('');
  const configuredProductDescriptionMultiplier = Number(loaderData.productDescriptionCreditMultiplier ?? 1);
  const productDescriptionMultiplier = Number.isFinite(configuredProductDescriptionMultiplier)
    ? configuredProductDescriptionMultiplier
    : 1;
  const [activeSection, setActiveSection] = useState(() => {
    const requestedSection = new URLSearchParams(location.search).get('section');
    return requestedSection && [...brandVoiceSectionIds, ...generalSettingsNav.map((item) => item.id)].includes(requestedSection)
      ? requestedSection
      : generalSettingsNav[0].id;
  });
  const [savedSettings, setSavedSettings] = useState(() => buildSettings(loaderData.settings));
  const [settings, setSettings] = useState(savedSettings);
  const [localToast, setLocalToast] = useState(null);

  const isDirty = useMemo(
    () => settingsSignature(settings) !== settingsSignature(savedSettings),
    [settings, savedSettings],
  );
  const isBrandVoiceSection = brandVoiceSectionIds.has(activeSection);
  const brandVoiceActionPath = useMemo(() => `/app/brand-voice${location.search || ''}`, [location.search]);
  const saveTimeout = useFetcherTimeout(saveFetcher, {
    timeoutMs: 20000,
    message: 'Saving settings took too long. Please try again later.',
  });
  const cleanupTimeout = useFetcherTimeout(cleanupFetcher, {
    timeoutMs: 30000,
    message: 'Deleting expired history took too long. Please try again later.',
  });
  const saveResult = saveTimeout.result || saveFetcher.data;
  const cleanupResult = cleanupTimeout.result || cleanupFetcher.data;

  useEffect(() => {
    const requestedSection = new URLSearchParams(location.search).get('section');
    if (requestedSection && (brandVoiceSectionIds.has(requestedSection) || generalSettingsNav.some((item) => item.id === requestedSection))) {
      setActiveSection(requestedSection);
    }
  }, [location.search]);

  const showToast = useCallback((data) => {
    if (!data?.message) return;
    const key = `${data.intent || 'settings'}:${data.ok ? 'ok' : 'error'}:${data.message}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;

    try {
      shopify.toast.show(data.message, {
        duration: data.ok ? 4000 : 8000,
        isError: data.ok === false,
      });
    } catch {
      setLocalToast({message: data.message, isError: data.ok === false});
      window.setTimeout(() => setLocalToast(null), data.ok ? 4000 : 8000);
    }
  }, [shopify]);

  useEffect(() => {
    showToast(saveResult);
    if (saveFetcher.data?.ok && saveFetcher.data.settings) {
      const nextSettings = buildSettings(saveFetcher.data.settings);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
    }
  }, [saveFetcher.data, saveResult, showToast]);

  useEffect(() => {
    showToast(cleanupResult);
    if (cleanupFetcher.data?.settings) {
      const nextSettings = buildSettings(cleanupFetcher.data.settings);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
    }
  }, [cleanupFetcher.data, cleanupResult, showToast]);

  function set(key, value) {
    setSettings((current) => ({...current, [key]: value}));
  }

  function handleSave() {
    const formData = new FormData();
    formData.set('intent', 'save-settings');
    Object.entries(settings).forEach(([key, value]) => {
      formData.set(key, String(value));
    });
    saveFetcher.submit(formData, {method: 'post'});
  }

  function handleDiscard() {
    setSettings(savedSettings);
  }

  function handleCleanup() {
    const formData = new FormData();
    formData.set('intent', 'cleanup-retention');
    cleanupFetcher.submit(formData, {method: 'post'});
  }

  return (
    <BlockStack gap="400">
      <SaveBar open={isDirty}>
        <button variant="primary" disabled={saveTimeout.pending} onClick={handleSave}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>

      {localToast ? (
        <div className={`rp-local-toast ${localToast.isError ? 'is-error' : ''}`} role="status">
          {localToast.message}
        </div>
      ) : null}

      <InlineStack align="space-between" blockAlign="center" gap="300">
        <BlockStack gap="100">
          <Text as="h1" variant="heading2xl">Settings</Text>
          <Text as="p" variant="bodyLg" tone="subdued">
            Configure app defaults and tune the Brand Voice ReplyPulse uses for AI replies.
          </Text>
        </BlockStack>
        {!isBrandVoiceSection ? (
          <Badge tone={isDirty ? 'attention' : 'success'}>
            {isDirty ? 'Unsaved changes' : 'Saved'}
          </Badge>
        ) : null}
      </InlineStack>

      <div className="rp-settings-layout">
        <aside className="rp-settings-nav" aria-label="Settings sections">
          <BlockStack gap="400">
            {settingsNavGroups.map((group) => (
              <BlockStack key={group.title} gap="150">
                <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">{group.title}</Text>
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`rp-settings-nav-item ${activeSection === item.id ? 'is-active' : ''}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </BlockStack>
            ))}
          </BlockStack>
        </aside>

        <BlockStack gap="400">
          {isBrandVoiceSection ? (
            <BrandVoicePage
              data={loaderData.brandVoice}
              actionPath={brandVoiceActionPath}
              embedded
              activeSection={activeSection}
              onActiveSectionChange={setActiveSection}
              useProductDescription={settings.useProductDescription}
              onUseProductDescriptionChange={(value) => set('useProductDescription', value)}
              replyCreditMultiplier={settings.useProductDescription ? productDescriptionMultiplier : 1}
            />
          ) : null}

          {activeSection === 'general' ? (
            <SectionCard
              title="General"
              description="Set the defaults the Inbox uses when merchants open the queue."
            >
              <FieldRow label="Show skipped by default" description="Includes skipped reviews when Queue first loads.">
                <Checkbox
                  label="Show skipped by default"
                  checked={settings.showSkippedByDefault}
                  onChange={(value) => set('showSkippedByDefault', value)}
                />
              </FieldRow>
              <FieldRow label="Show sent by default" description="Includes already-sent reviews when Queue first loads.">
                <Checkbox
                  label="Show sent by default"
                  checked={settings.showSentByDefault}
                  onChange={(value) => set('showSentByDefault', value)}
                />
              </FieldRow>
            </SectionCard>
          ) : null}

          {activeSection === 'queue' ? (
            <SectionCard
              title="Queue behavior"
              description="Control how ReplyPulse marks drafts for review and provider-specific send options."
              action={<Badge tone="info">Applies on next generation/send</Badge>}
            >
              <ThresholdSlider
                label="High-confidence threshold"
                description="Controls the Queue high-confidence filter and select-all shortcut."
                min={70}
                max={98}
                suffix="%"
                value={settings.highConfidenceThreshold}
                onChange={(value) => set('highConfidenceThreshold', Number(value))}
              />
              <ThresholdSlider
                label="Human review threshold"
                description="Generated drafts below this confidence are marked Human."
                min={40}
                max={95}
                suffix="%"
                value={settings.humanReviewThreshold}
                onChange={(value) => set('humanReviewThreshold', Number(value))}
              />
              <FieldRow label="Route sensitive reviews to human" description="Flags refund, damaged, urgent, broken, and similar reviews before sending.">
                <Checkbox
                  label="Route sensitive reviews to human"
                  checked={settings.routeSensitiveReviews}
                  onChange={(value) => set('routeSensitiveReviews', value)}
                />
              </FieldRow>
              <FieldRow label="Extra caution on 1-2 star reviews" description="Marks low-star drafts Human when confidence is not clearly high or the review has sensitive content.">
                <Checkbox
                  label="Extra caution on 1-2 star reviews"
                  checked={settings.routeLowStarReviews}
                  onChange={(value) => set('routeLowStarReviews', value)}
                />
              </FieldRow>
              <FieldRow label="Send Judge.me reply email" description="Judge.me only. Yotpo public comments do not use this setting.">
                <Checkbox
                  label="Send Judge.me reply email"
                  checked={settings.sendReplyEmail}
                  onChange={(value) => set('sendReplyEmail', value)}
                />
              </FieldRow>
            </SectionCard>
          ) : null}

          {activeSection === 'privacy' ? (
            <SectionCard
              title="Data & privacy"
              description="Control how long sent and skipped review history remains available in ReplyPulse."
              action={(
                <Button
                  loading={cleanupTimeout.pending}
                  disabled={cleanupTimeout.pending || isDirty || settings.dataRetention === 'forever'}
                  onClick={handleCleanup}
                >
                  Delete expired history now
                </Button>
              )}
            >
              <FieldRow label="Review history retention" description="Only sent and skipped history is deleted. Pending reviews stay in Queue.">
                <Select
                  label="Review history retention"
                  labelHidden
                  options={retentionOptions}
                  value={settings.dataRetention}
                  onChange={(value) => set('dataRetention', value)}
                />
              </FieldRow>
              <FieldRow label="Retention status" description="Expired sent/skipped items are cleaned when Queue or Sent loads, and when you run cleanup manually.">
                <Badge tone={settings.dataRetention === 'forever' ? 'attention' : 'success'}>
                  {settings.dataRetention === 'forever' ? 'Keeping history forever' : `Keeping ${settings.dataRetention}`}
                </Badge>
              </FieldRow>
            </SectionCard>
          ) : null}
        </BlockStack>
      </div>
    </BlockStack>
  );
}
