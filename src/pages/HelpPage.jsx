/* eslint-disable react/prop-types */
import {useCallback, useEffect, useRef, useState} from 'react';
import {useFetcher, useLoaderData} from 'react-router';
import {useAppBridge} from '@shopify/app-bridge-react';
import {
  Badge,
  BlockStack,
  Button,
  Card,
  Icon,
  InlineGrid,
  InlineStack,
  Modal,
  Text,
  TextField,
} from '@shopify/polaris';
import {
  AutomationIcon,
  ChatIcon,
  CodeIcon,
  CreditCardIcon,
  DatabaseIcon,
  EmailIcon,
  LightbulbIcon,
  LockIcon,
  MagicIcon,
  SettingsIcon,
  StoreIcon,
  WrenchIcon,
} from '@shopify/polaris-icons';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';

const requestCards = [
  {
    id: 'customization',
    icon: WrenchIcon,
    tone: 'coral',
    title: 'Configure ReplyPulse AI: Review Replies',
    description: 'Adapt review approval, AI generation, routing, and ReplyPulse AI: Review Replies workflows to the way your team handles reviews.',
    action: 'Describe review workflow',
  },
  {
    id: 'suggestion',
    icon: LightbulbIcon,
    tone: 'amber',
    title: 'Suggest an improvement',
    description: 'Send product ideas for filters, bulk actions, model controls, integrations, or approval workflows.',
    action: 'Send suggestion',
  },
  {
    id: 'support',
    icon: ChatIcon,
    tone: 'blue',
    title: 'Contact support',
    description: 'Ask about review provider setup, Brand Voice, credits, AI model behavior, Queue, Sent, or data handling.',
    action: 'Contact us',
  },
];

const customizationServices = [
  {
    icon: SettingsIcon,
    title: 'Queue and approval workflows',
    text: 'Review routing, team handoffs, confidence rules, skipped/sent views, and batch approval flows inside ReplyPulse AI: Review Replies.',
  },
  {
    icon: MagicIcon,
    title: 'Brand Voice and AI tuning',
    text: 'Better prompts, safer model behavior, custom presets, product-aware replies, and approval guardrails.',
  },
  {
    icon: CodeIcon,
    title: 'Review provider setup',
    text: 'Help connecting supported review providers, Shopify product context, and ReplyPulse AI: Review Replies approval workflows.',
  },
];

const dataItems = [
  'Review provider connection details and encrypted credentials',
  'Imported review records, product context, generated drafts, and sent/skipped status',
  'Brand Voice settings, model tier, preview review, and AI configuration choices',
  'Credit account, credit ledger entries, and credit purchase records',
  'Support, customization, and feature requests sent from this page',
  'Shopify session tokens used for admin authentication',
];

const heroChecklist = [
  'Connect review providers and import recent reviews',
  'Tune Brand Voice with examples, presets, and live preview',
  'Generate replies with the selected model tier and review them before sending',
];

const modalContent = {
  customization: {
    title: 'Request customization',
    type: 'customization',
    subjectPlaceholder: 'Custom review workflow',
    messageLabel: 'What should ReplyPulse AI: Review Replies adapt?',
    messagePlaceholder: 'Example: Add a review escalation flow for low-confidence replies before anyone sends them.',
    intro: 'Share the current review workflow, what feels slow or risky, and what ReplyPulse AI: Review Replies should support.',
    primary: 'Send request',
  },
  suggestion: {
    title: 'Suggest an improvement',
    type: 'suggestion',
    subjectPlaceholder: 'New Queue, Brand Voice, or credits idea',
    messageLabel: 'What should we add or improve?',
    messagePlaceholder: 'Example: Add a filter for generated-but-not-reviewed replies and show model cost before every bulk action.',
    intro: 'Rough ideas are useful. Tell us what would make review operations faster, safer, or easier to approve.',
    primary: 'Send suggestion',
  },
  support: {
    title: 'Contact support',
    type: 'support',
    subjectPlaceholder: 'Question about ReplyPulse AI: Review Replies',
    messageLabel: 'How can we help?',
    messagePlaceholder: 'Example: my review provider is connected, but the Queue is not importing my newest reviews.',
    intro: 'Send enough context for us to understand or reproduce the issue.',
    primary: 'Send message',
  },
};

function HelpIcon({source, tone = 'blue', size = 'md'}) {
  return (
    <span className={`rp-help-icon is-${tone} is-${size}`}>
      <Icon source={source} tone="base" />
    </span>
  );
}

function RequestCard({card, onAction}) {
  return (
    <Card>
      <div className="rp-help-request-card">
        <InlineStack gap="300" blockAlign="start" wrap={false}>
          <HelpIcon source={card.icon} tone={card.tone} />
          <BlockStack gap="100">
            <Text as="h2" variant="headingLg">{card.title}</Text>
            <Text as="p" variant="bodyMd" tone="subdued">{card.description}</Text>
          </BlockStack>
        </InlineStack>
        <Button variant={card.primary ? 'primary' : undefined} onClick={onAction}>
          {card.action}
        </Button>
      </div>
    </Card>
  );
}

function ServiceItem({item}) {
  return (
    <div className="rp-help-service-item">
      <HelpIcon source={item.icon} tone="green" size="sm" />
      <BlockStack gap="050">
        <Text as="p" variant="bodyMd" fontWeight="semibold">{item.title}</Text>
        <Text as="p" variant="bodyMd" tone="subdued">{item.text}</Text>
      </BlockStack>
    </div>
  );
}

function summaryText(data) {
  const counts = data?.counts;
  if (!counts) return data?.message ?? '';

  return [
    data.message,
    `${counts.reviews} reviews/drafts`,
    `${counts.judgeMeConnections} Judge.me connection(s)`,
    `${counts.creditLedgerEntries} credit ledger entries`,
  ].join(' ');
}

export default function HelpPage() {
  const loaderData = useLoaderData();
  const shopify = useAppBridge();
  const fetcher = useFetcher();
  const privacyFetcher = useFetcher();
  const lastToastKey = useRef('');
  const [openModal, setOpenModal] = useState(null);
  const [privacyDeleteOpen, setPrivacyDeleteOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [localToast, setLocalToast] = useState(null);

  const contactEmail = loaderData?.contactEmail ?? 'CONTACT_EMAIL not configured';
  const activeModal = openModal ? modalContent[openModal] : null;
  const contactTimeout = useFetcherTimeout(fetcher, {
    timeoutMs: 20000,
    message: 'The support request took too long. Please try again later.',
  });
  const privacyTimeout = useFetcherTimeout(privacyFetcher, {
    timeoutMs: 30000,
    message: 'The privacy action took too long. Please try again later.',
  });
  const contactResult = contactTimeout.result || fetcher.data;
  const privacyResult = privacyTimeout.result || privacyFetcher.data;
  const isSubmitting = contactTimeout.pending;
  const isPrivacySubmitting = privacyTimeout.pending;

  const showToast = useCallback((data) => {
    if (!data?.message) return;
    const content = data.intent === 'privacy-data-request' ? summaryText(data) : data.message;
    const key = `${data.intent || 'help'}:${data.ok ? 'ok' : 'error'}:${content}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;

    try {
      shopify.toast.show(content, {
        duration: data.ok ? 5000 : 9000,
        isError: data.ok === false,
      });
    } catch {
      setLocalToast({message: content, isError: data.ok === false});
      window.setTimeout(() => setLocalToast(null), data.ok ? 5000 : 9000);
    }
  }, [shopify]);

  const closeContactModal = useCallback(() => {
    setOpenModal(null);
    setSubject('');
    setMessage('');
    setEmail('');
  }, []);

  useEffect(() => {
    const didTimeout = Boolean(contactTimeout.result);
    if (!didTimeout && (fetcher.state !== 'idle' || !fetcher.data)) return;
    if (!contactResult) return;

    showToast(contactResult);
    if (!didTimeout && contactResult.ok) closeContactModal();
  }, [closeContactModal, contactResult, contactTimeout.result, fetcher.data, fetcher.state, showToast]);

  useEffect(() => {
    const didTimeout = Boolean(privacyTimeout.result);
    if (!didTimeout && (privacyFetcher.state !== 'idle' || !privacyFetcher.data)) return;
    if (!privacyResult) return;

    showToast(privacyResult);
    if (!didTimeout && privacyResult.ok && privacyResult.intent === 'privacy-data-delete') {
      setPrivacyDeleteOpen(false);
    }
  }, [privacyFetcher.data, privacyFetcher.state, privacyResult, privacyTimeout.result, showToast]);

  function submitContact() {
    if (!activeModal || !message.trim()) return;

    const formData = new FormData();
    formData.set('intent', 'contact');
    formData.set('type', activeModal.type);
    formData.set('subject', subject || activeModal.title);
    formData.set('message', message);
    formData.set('email', email);
    fetcher.submit(formData, {method: 'post'});
  }

  function requestPrivacySummary() {
    const formData = new FormData();
    formData.set('intent', 'privacy-data-request');
    privacyFetcher.submit(formData, {method: 'post'});
  }

  function deletePrivacyData() {
    const formData = new FormData();
    formData.set('intent', 'privacy-data-delete');
    privacyFetcher.submit(formData, {method: 'post'});
  }

  return (
    <BlockStack gap="400">
      {localToast ? (
        <div className={`rp-local-toast ${localToast.isError ? 'is-error' : ''}`} role="status">
          {localToast.message}
        </div>
      ) : null}

      <InlineStack align="space-between" blockAlign="center" gap="300">
        <BlockStack gap="100">
          <Text as="h1" variant="heading2xl">Help</Text>
          <Text as="p" variant="bodyLg" tone="subdued">
            Workflow setup, product feedback, app support, and data controls for ReplyPulse AI: Review Replies.
          </Text>
        </BlockStack>
      </InlineStack>

      <section className="rp-help-hero">
        <div className="rp-help-hero-copy">
          <InlineStack gap="150">
            <Badge tone="success">Implementation support</Badge>
            <Badge tone="info">AI reply operations</Badge>
            <Badge>Workflow setup</Badge>
          </InlineStack>
          <BlockStack gap="150">
            <Text as="h2" variant="heading2xl">Make ReplyPulse AI: Review Replies fit the way your store works.</Text>
            <Text as="p" variant="bodyLg" tone="subdued">
              Our team can tune ReplyPulse AI: Review Replies, improve your approval flow, and help connect supported review operations to Shopify.
            </Text>
          </BlockStack>
          <InlineStack gap="200">
            <Button variant="primary" icon={WrenchIcon} onClick={() => setOpenModal('customization')}>ReplyPulse AI: Review Replies setup</Button>
            <Button icon={LightbulbIcon} onClick={() => setOpenModal('suggestion')}>Suggest an improvement</Button>
          </InlineStack>
        </div>

        <div className="rp-help-hero-panel">
          <InlineStack gap="300" blockAlign="center" wrap={false}>
            <HelpIcon source={AutomationIcon} tone="coral" />
            <BlockStack gap="050">
              <Text as="h3" variant="headingLg">Common work we help with</Text>
              <Text as="p" variant="bodyMd" tone="subdued">Practical improvements around AI replies and merchant approval.</Text>
            </BlockStack>
          </InlineStack>
          <BlockStack gap="200">
            {heroChecklist.map((item) => (
              <div key={item} className="rp-help-check-row">
                <span aria-hidden="true">✓</span>
                <Text as="p" variant="bodyMd">{item}</Text>
              </div>
            ))}
          </BlockStack>
          <div className="rp-help-shopify-note">
            <HelpIcon source={StoreIcon} tone="blue" size="sm" />
            <BlockStack gap="050">
              <Text as="p" variant="bodyMd" fontWeight="semibold">Need setup help?</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Our team can help with ReplyPulse AI: Review Replies setup, supported review providers, product context, and approval workflows.
              </Text>
            </BlockStack>
          </div>
        </div>
      </section>

      <InlineGrid columns={{xs: 1, md: 3}} gap="300">
        {requestCards.map((card) => (
          <RequestCard
            key={card.id}
            card={card}
            onAction={() => setOpenModal(card.id)}
          />
        ))}
      </InlineGrid>

      <InlineGrid columns={{xs: 1, md: 2}} gap="400">
        <Card>
          <BlockStack gap="500">
            <InlineStack gap="300" blockAlign="center">
              <HelpIcon source={StoreIcon} tone="blue" />
              <BlockStack gap="050">
                <Text as="h2" variant="headingLg">What we can customize</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Keep the app simple day to day, and add the specific behavior your team needs.
                </Text>
              </BlockStack>
            </InlineStack>
            <BlockStack gap="300">
              {customizationServices.map((item) => (
                <ServiceItem key={item.title} item={item} />
              ))}
            </BlockStack>
          </BlockStack>
        </Card>

        <Card>
          <div className="rp-help-contact-panel">
            <InlineStack gap="300" blockAlign="center">
              <HelpIcon source={EmailIcon} tone="green" />
              <BlockStack gap="050">
                <Text as="h2" variant="headingLg">Direct contact</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Prefer email? Send context about your store, the review problem, and the result you want.
                </Text>
              </BlockStack>
            </InlineStack>
            <div className="rp-help-email-box">{contactEmail}</div>
            <Text as="p" variant="bodySm" tone="subdued">
              For app support, use the support card above so the request keeps its context.
            </Text>
          </div>
        </Card>
      </InlineGrid>

      <Card>
        <BlockStack gap="500">
          <InlineStack align="space-between" blockAlign="start" gap="300">
            <InlineStack gap="300" blockAlign="center" wrap={false}>
              <HelpIcon source={LockIcon} tone="purple" />
              <BlockStack gap="050">
                <Text as="h2" variant="headingLg">Data & privacy</Text>
                <Text as="p" variant="bodyMd" tone="subdued">
                  Review what ReplyPulse AI: Review Replies stores and request deletion from inside the app.
                </Text>
              </BlockStack>
            </InlineStack>
            <Badge tone="info">Merchant controlled</Badge>
          </InlineStack>

          <InlineGrid columns={{xs: 1, md: 2}} gap="300">
            <div className="rp-help-data-panel">
              <InlineStack gap="200" blockAlign="center">
                <HelpIcon source={DatabaseIcon} tone="blue" size="sm" />
                <Text as="h3" variant="headingMd">Stored app data</Text>
              </InlineStack>
              <BlockStack gap="150">
                {dataItems.map((item) => (
                  <div key={item} className="rp-help-data-row">
                    <span aria-hidden="true">·</span>
                    <Text as="p" variant="bodyMd" tone="subdued">{item}</Text>
                  </div>
                ))}
              </BlockStack>
            </div>

            <div className="rp-help-data-panel is-accent">
              <InlineStack gap="200" blockAlign="center">
                <HelpIcon source={CreditCardIcon} tone="amber" size="sm" />
                <Text as="h3" variant="headingMd">Privacy actions</Text>
              </InlineStack>
              <Text as="p" variant="bodyMd" tone="subdued">
                Request a summary for review, or permanently delete all app data for this shop. Deletion also clears Shopify sessions.
              </Text>
              <InlineStack gap="200">
                <Button
                  loading={isPrivacySubmitting && privacyFetcher.formData?.get('intent') === 'privacy-data-request'}
                  disabled={isPrivacySubmitting}
                  onClick={requestPrivacySummary}
                >
                  Request data summary
                </Button>
                <Button
                  tone="critical"
                  variant="tertiary"
                  disabled={isPrivacySubmitting}
                  onClick={() => setPrivacyDeleteOpen(true)}
                >
                  Delete all my data
                </Button>
              </InlineStack>
            </div>
          </InlineGrid>
        </BlockStack>
      </Card>

      <Modal
        open={privacyDeleteOpen}
        onClose={() => setPrivacyDeleteOpen(false)}
        title="Delete all ReplyPulse AI: Review Replies data?"
        primaryAction={{
          content: 'Delete permanently',
          destructive: true,
          loading: isPrivacySubmitting,
          disabled: isPrivacySubmitting,
          onAction: deletePrivacyData,
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            disabled: isPrivacySubmitting,
            onAction: () => setPrivacyDeleteOpen(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              This permanently deletes review records, AI drafts, Brand Voice settings, review provider connection data, app settings, credit records, contact requests, and Shopify sessions for this shop.
            </Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              This action cannot be undone. You may be asked to log in again after deletion.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>

      <Modal
        open={Boolean(activeModal)}
        onClose={closeContactModal}
        title={activeModal?.title ?? 'Contact'}
        primaryAction={{
          content: activeModal?.primary ?? 'Send',
          onAction: submitContact,
          loading: isSubmitting,
          disabled: isSubmitting || !message.trim(),
        }}
        secondaryActions={[
          {
            content: 'Cancel',
            onAction: closeContactModal,
            disabled: isSubmitting,
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            {activeModal?.intro ? (
              <Text as="p" variant="bodyMd" tone="subdued">{activeModal.intro}</Text>
            ) : null}
            <TextField
              label={activeModal?.messageLabel ?? 'Message'}
              value={message}
              onChange={setMessage}
              multiline={5}
              autoComplete="off"
              placeholder={activeModal?.messagePlaceholder}
            />
            <TextField
              label="Subject"
              value={subject}
              onChange={setSubject}
              autoComplete="off"
              placeholder={activeModal?.subjectPlaceholder}
            />
            <TextField
              label="Reply email"
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              placeholder="you@store.com"
            />
          </BlockStack>
        </Modal.Section>
      </Modal>
    </BlockStack>
  );
}
