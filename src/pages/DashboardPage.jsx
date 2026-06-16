/* eslint-disable react/prop-types, react/no-unescaped-entities */
import {useMemo, useState} from 'react';
import {useFetcher, useLoaderData, useLocation} from 'react-router';
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  Text,
  TextField,
} from '@shopify/polaris';
import {
  ArrowRightIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  ClipboardIcon,
  ExternalIcon,
  HideIcon,
  ImportIcon,
  InfoIcon,
  MagicIcon,
  MicrophoneIcon,
  RefreshIcon,
  SendIcon,
  StarIcon,
  StatusActiveIcon,
  ViewIcon,
  XIcon,
} from '@shopify/polaris-icons';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';

const providers = [
  {
    id: 'judgeme',
    name: 'Judge.me',
    status: 'Available',
    available: true,
    logo: '/provider-logos/judgeme.png',
    tone: 'teal',
    initials: 'J',
  },
  {
    id: 'yotpo',
    name: 'Yotpo',
    status: 'Available',
    available: true,
    logo: '/provider-logos/yotpo.svg',
    tone: 'neutral',
  },
  {
    id: 'loox',
    name: 'Loox',
    status: 'Coming soon',
    available: false,
    logo: '/provider-logos/loox.svg',
    tone: 'black',
    wordmark: true,
  },
  {
    id: 'stamped',
    name: 'Stamped',
    status: 'Coming soon',
    available: false,
    logo: '/provider-logos/stamped.png',
    tone: 'orange',
    wordmark: true,
  },
];

const providerById = new Map(providers.map((provider) => [provider.id, provider]));

function getProvider(providerId) {
  return providerById.get(providerId) || providers[0];
}

const utcMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateTime(value) {
  if (!value) return 'Not verified yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not verified yet';

  let hours = date.getUTCHours();
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const period = hours >= 12 ? 'PM' : 'AM';
  hours %= 12;
  if (hours === 0) hours = 12;

  return `${utcMonths[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()} at ${hours}:${minutes} ${period} UTC`;
}

function formatNumber(value) {
  if (value === null || value === undefined || value === '') return 'Not available';
  if (typeof value === 'number') return new Intl.NumberFormat('en').format(value);
  return String(value);
}

function tokenWithViewIcon(tokenMask) {
  return (
    <InlineStack gap="150" blockAlign="center" align="end">
      <Text as="span" variant="bodyMd">{tokenMask || 'Not saved'}</Text>
      <Icon source={ViewIcon} tone="subdued" />
    </InlineStack>
  );
}

function ProviderMark({provider}) {
  const ProviderIcon = provider.icon;

  return (
    <span className={`rp-connect-provider-mark is-${provider.tone} ${provider.wordmark ? 'is-wordmark' : ''}`}>
      {provider.logo ? (
        <img className="rp-connect-provider-logo" src={provider.logo} alt="" aria-hidden="true" />
      ) : provider.initials ? (
        <span>{provider.initials}</span>
      ) : (
        <Icon source={ProviderIcon} tone="base" />
      )}
    </span>
  );
}

function ProviderTile({provider, selected, statusOverride, onSelect}) {
  const status = statusOverride || provider.status;
  const canSelect = provider.available && onSelect;

  function handleKeyDown(event) {
    if (!canSelect || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    onSelect(provider.id);
  }

  return (
    <div
      className={`rp-connect-provider-tile ${selected ? 'is-selected' : ''} ${provider.available ? '' : 'is-disabled'}`}
      role={canSelect ? 'button' : undefined}
      tabIndex={canSelect ? 0 : undefined}
      aria-disabled={provider.available ? undefined : true}
      aria-pressed={selected}
      onClick={canSelect ? () => onSelect(provider.id) : undefined}
      onKeyDown={handleKeyDown}
    >
      <InlineStack gap="350" blockAlign="center" wrap={false}>
        <ProviderMark provider={provider} />
        <BlockStack gap="025">
          <Text as="span" variant="bodyMd" fontWeight="semibold">{provider.name}</Text>
          <Text as="span" variant="bodySm" tone="subdued">{status}</Text>
        </BlockStack>
      </InlineStack>
      {selected ? (
        <span className="rp-connect-provider-check">
          <Icon source={CheckIcon} tone="base" />
        </span>
      ) : null}
    </div>
  );
}

function ReviewBubble() {
  return (
    <div className="rp-connect-review-bubble" aria-hidden="true">
      <InlineStack gap="050">
        {[1, 2, 3, 4, 5].map((star) => (
          <Icon key={star} source={StarIcon} tone="warning" />
        ))}
        <Icon source={MagicIcon} tone="magic" />
      </InlineStack>
      <span />
      <span />
    </div>
  );
}

function ResultBanner({result}) {
  if (!result?.message) return null;

  if (result.ok) {
    return (
      <Banner tone="success">
        <Text as="p" variant="bodyMd">{result.message}</Text>
      </Banner>
    );
  }

  const providerName = result.providerName || result.error?.providerName || 'review source';
  const statusText = result.error?.status
    ? `${providerName} returned ${result.error.status}${result.error.statusText ? ` ${result.error.statusText}` : ''}.`
    : null;
  const timeoutMs = result.error?.timeoutMs || result.error?.details?.timeoutMs;
  const timeoutText = timeoutMs
    ? `The request timed out after ${Math.round(timeoutMs / 1000)} seconds.`
    : null;

  return (
    <Banner tone="critical">
      <BlockStack gap="200">
        <Text as="p" variant="bodyMd" fontWeight="semibold">
          We couldn't connect {providerName}.
        </Text>
        <Text as="p" variant="bodyMd">{result.message}</Text>
        {statusText || timeoutText ? (
          <Text as="p" variant="bodySm" tone="subdued">{statusText || timeoutText}</Text>
        ) : null}
        <Text as="p" variant="bodySm" tone="subdued">
          Check the credentials, then try again.
        </Text>
      </BlockStack>
    </Banner>
  );
}

function KeyValueRow({label, value, badgeTone}) {
  const isPrimitive = typeof value === 'string' || typeof value === 'number';

  return (
    <div className="rp-connect-kv-row">
      <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
      {badgeTone ? (
        <Badge tone={badgeTone}>{String(value)}</Badge>
      ) : isPrimitive ? (
        <Text as="span" variant="bodyMd" fontWeight="medium">{value}</Text>
      ) : (
        <div className="rp-connect-kv-value">{value}</div>
      )}
    </div>
  );
}

function ConnectForm({
  fetcher,
  shop,
  loaderData,
  actionPath,
  initialProvider = 'judgeme',
  showTestStoreDomainField = false,
}) {
  const [selectedProvider, setSelectedProvider] = useState(initialProvider);
  const [apiToken, setApiToken] = useState('');
  const [shopDomain, setShopDomain] = useState(shop);
  const [showToken, setShowToken] = useState(false);
  const [storeId, setStoreId] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [showApiSecret, setShowApiSecret] = useState(false);
  const pendingIntent = fetcher.formData?.get('intent');
  const pendingProvider = fetcher.formData?.get('provider') || selectedProvider;
  const selectedProviderName = getProvider(selectedProvider).name;
  const timeout = useFetcherTimeout(fetcher, {
    timeoutMs: 30000,
    message: `${selectedProviderName} did not respond in time. Please try again later.`,
  });
  const isSubmitting = timeout.pending && (pendingIntent === 'connect-token' || pendingIntent === 'test-connection');
  const isTesting = isSubmitting && pendingIntent === 'test-connection' && pendingProvider === selectedProvider;
  const isSaving = isSubmitting && pendingIntent === 'connect-token' && pendingProvider === selectedProvider;
  const isJudgeMe = selectedProvider === 'judgeme';
  const isYotpo = selectedProvider === 'yotpo';
  const canSubmit = isJudgeMe ? Boolean(apiToken.trim()) : Boolean(storeId.trim() && apiSecret.trim());

  function submitConnection(intent) {
    if (!canSubmit || isSubmitting) return;

    const formData = new FormData();
    formData.set('intent', intent);
    formData.set('provider', selectedProvider);

    if (isJudgeMe) {
      formData.set('shopDomain', showTestStoreDomainField ? shopDomain.trim() || shop : shop);
      formData.set('apiToken', apiToken.trim());
    } else {
      formData.set('storeId', storeId.trim());
      formData.set('apiSecret', apiSecret.trim());
    }

    fetcher.submit(formData, {method: 'post', action: actionPath});
  }

  return (
    <>
      <BlockStack gap="400">
        <BlockStack gap="250">
          <Text as="p" variant="bodyMd">1. Choose provider</Text>
          <InlineGrid columns={{xs: 1, sm: 2, lg: 4}} gap="300">
            {providers.map((provider) => (
              <ProviderTile
                key={provider.id}
                provider={provider}
                selected={provider.id === selectedProvider}
                onSelect={setSelectedProvider}
              />
            ))}
          </InlineGrid>
        </BlockStack>

        <BlockStack gap="300">
          {isJudgeMe ? (
            <>
              <Text as="p" variant="bodyMd">2. Enter your Judge.me credentials</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Judge.me uses this authenticated Shopify shop and your Private API token to import reviews and send approved replies.
              </Text>
              {showTestStoreDomainField ? (
                <div className="rp-connect-test-store-field">
                  <BlockStack gap="200">
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">
                        Test store domain override
                      </Text>
                      <Text as="p" variant="bodySm">
                        This field is only visible on test stores. Use it only for Judge.me testing; in production, ReplyPulse uses the authenticated Shopify store.
                      </Text>
                    </BlockStack>
                    <TextField
                      label="Judge.me shop domain for tests"
                      name="shopDomain"
                      value={shopDomain}
                      onChange={setShopDomain}
                      autoComplete="off"
                      placeholder="your-test-store.myshopify.com"
                      helpText="Only change this when your Judge.me test data belongs to a different development store domain."
                    />
                  </BlockStack>
                </div>
              ) : null}
              <TextField
                label="API token"
                name="apiToken"
                type={showToken ? 'text' : 'password'}
                value={apiToken}
                onChange={setApiToken}
                autoComplete="off"
                placeholder="Paste your Private API token from Judge.me"
                connectedRight={(
                  <Button
                    icon={showToken ? HideIcon : ViewIcon}
                    accessibilityLabel={showToken ? 'Hide API token' : 'Show API token'}
                    onClick={() => setShowToken((value) => !value)}
                  />
                )}
                helpText="You can find your Private API token in Judge.me: Settings > Integrations > Private API token."
              />
            </>
          ) : null}

          {isYotpo ? (
            <>
              <Text as="p" variant="bodyMd">2. Enter your Yotpo credentials</Text>
              <Text as="p" variant="bodySm" tone="subdued">
                Yotpo uses your Store ID, formerly App Key, and API secret to generate an access token for the Reviews API.
              </Text>
              <TextField
                label="Store ID (App Key)"
                name="storeId"
                value={storeId}
                onChange={setStoreId}
                autoComplete="off"
                placeholder="Paste your Yotpo Store ID"
                helpText="Yotpo also calls this value App Key in some screens and API docs."
              />
              <TextField
                label="API secret"
                name="apiSecret"
                type={showApiSecret ? 'text' : 'password'}
                value={apiSecret}
                onChange={setApiSecret}
                autoComplete="off"
                placeholder="Paste your Yotpo API secret"
                connectedRight={(
                  <Button
                    icon={showApiSecret ? HideIcon : ViewIcon}
                    accessibilityLabel={showApiSecret ? 'Hide API secret' : 'Show API secret'}
                    onClick={() => setShowApiSecret((value) => !value)}
                  />
                )}
                helpText="Only Yotpo account administrators can view or generate the API secret."
              />
            </>
          ) : null}
        </BlockStack>

        <InlineStack align="space-between" blockAlign="center" gap="300">
          <InlineStack gap="300">
            {isJudgeMe ? (
              <>
                <Button variant="plain" url={loaderData.judgeMeApiSettingsUrl} target="_blank" icon={ExternalIcon}>
                  Where do I find my Judge.me API token?
                </Button>
                <Button variant="plain" url={loaderData.judgeMeApiDocsUrl} target="_blank" icon={ExternalIcon}>
                  Read setup guide
                </Button>
              </>
            ) : null}
            {isYotpo ? (
              <>
                <Button variant="plain" url={loaderData.yotpoApiCredentialsUrl} target="_blank" icon={ExternalIcon}>
                  Open Yotpo API credentials
                </Button>
                <Button variant="plain" url={loaderData.yotpoCredentialGuideUrl} target="_blank" icon={ExternalIcon}>
                  How to find credentials
                </Button>
                <Button variant="plain" url={loaderData.yotpoAuthenticationDocsUrl} target="_blank" icon={ExternalIcon}>
                  Authentication docs
                </Button>
              </>
            ) : null}
          </InlineStack>
          <InlineStack gap="200">
            <Button loading={isTesting} disabled={!canSubmit || isSubmitting} onClick={() => submitConnection('test-connection')}>
              Test connection
            </Button>
            <Button variant="primary" loading={isSaving} disabled={!canSubmit || isSubmitting} onClick={() => submitConnection('connect-token')}>
              Save
            </Button>
          </InlineStack>
        </InlineStack>
      </BlockStack>
    </>
  );
}

function CurrentConnectionCard({connection, fetcher, actionPath}) {
  const provider = getProvider(connection?.provider);
  const providerName = connection?.providerName || provider.name;
  const pendingIntent = fetcher.formData?.get('intent');
  const timeout = useFetcherTimeout(fetcher, {
    timeoutMs: 20000,
    message: `Refreshing the ${providerName} connection took too long. Please try again later.`,
  });
  const isRefreshing = timeout.pending && pendingIntent === 'refresh';

  function refresh() {
    const formData = new FormData();
    formData.set('intent', 'refresh');
    fetcher.submit(formData, {method: 'post', action: actionPath});
  }

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="center" gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={StatusActiveIcon} tone="success" />
            <Text as="h2" variant="headingMd">{connection ? 'Current connection' : 'Review source connection'}</Text>
          </InlineStack>
          <Badge tone={connection ? 'success' : 'attention'}>{connection ? 'Connected' : 'Not connected'}</Badge>
        </InlineStack>
        <Divider />

        {connection ? (
          <BlockStack gap="0">
            <KeyValueRow label="Provider" value={<InlineStack gap="250" align="end" blockAlign="center"><ProviderMark provider={provider} /><Text as="span" variant="bodyMd">{providerName}</Text></InlineStack>} />
            <KeyValueRow label={connection.provider === 'yotpo' ? 'Store ID' : 'Connected shop'} value={connection.connectedIdentifier || connection.shopDomain || connection.storeId} />
            <KeyValueRow label="Auth method" value={connection.authMethodLabel || connection.authMethod} />
            <KeyValueRow label={connection.credentialLabel || 'Credential'} value={tokenWithViewIcon(connection.credentialMask || connection.tokenMask || connection.secretMask)} />
            <KeyValueRow label="Last verified" value={formatDateTime(connection.lastVerifiedAt)} />
            <KeyValueRow label={connection.provider === 'yotpo' ? 'Reviews checked' : 'Imported reviews'} value={`${formatNumber(connection.reviewCount)} available`} />
          </BlockStack>
        ) : (
          <Text as="p" variant="bodyMd" tone="subdued">
            Choose a review source and add its credentials to verify the connection before importing reviews.
          </Text>
        )}

        {connection ? (
          <InlineStack align="end">
            <Button icon={RefreshIcon} loading={isRefreshing} disabled={isRefreshing} onClick={refresh}>
              Refresh connection
            </Button>
          </InlineStack>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function shopifyAdminAppPath(appHandle, appPath) {
  const safeHandle = String(appHandle || 'igu').replace(/^\/+|\/+$/g, '');
  const safePath = String(appPath || '').replace(/^\/+/, '');
  return `shopify://admin/apps/${safeHandle}/${safePath}`;
}

function AfterConnectionCard({connected, appHandle}) {
  const steps = connected
    ? [
        {icon: ImportIcon, tone: 'green', title: 'Import reviews', text: "We'll keep your reviews synced and ready to process."},
        {icon: MicrophoneIcon, tone: 'purple', title: 'Train brand voice', text: 'Paste 5-10 past replies so ReplyPulse learns your tone.'},
        {icon: SendIcon, tone: 'blue', title: 'Review AI replies', text: 'Drafts will appear in the approval queue before anything is sent.'},
      ]
    : [
        {icon: CheckCircleIcon, tone: 'green', title: 'Verified source', text: 'We verify your credentials and connection.'},
        {icon: ImportIcon, tone: 'blue', title: 'Ready to import', text: 'We fetch and sync your reviews securely.'},
        {icon: MicrophoneIcon, tone: 'purple', title: 'Human approval first', text: 'You review and approve AI replies before sending.'},
      ];

  return (
    <Card>
      <BlockStack gap="500">
        <Text as="h2" variant="headingLg">{connected ? 'What happens next' : 'What happens after connection'}</Text>
        <BlockStack gap="400">
          {steps.map((step) => (
            <InlineStack key={step.title} gap="300" blockAlign="start" wrap={false}>
                <span className={`rp-connect-mini-icon is-${step.tone}`}>
                  <Icon source={step.icon} tone="base" />
                </span>
                <BlockStack gap="075">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">{step.title}</Text>
                  <Text as="p" variant="bodySm" tone="subdued">{step.text}</Text>
                </BlockStack>
            </InlineStack>
          ))}
        </BlockStack>
        {connected ? (
          <>
            <Divider />
            <BlockStack gap="200">
              <Button
                url={shopifyAdminAppPath(appHandle, 'app/settings?section=personality-builder')}
                target="_top"
                icon={ExternalIcon}
              >
                Open brand voice setup
              </Button>
              <Button
                url={shopifyAdminAppPath(appHandle, 'app/reviews')}
                target="_top"
                variant="plain"
                icon={ExternalIcon}
              >
                View imported reviews
              </Button>
            </BlockStack>
          </>
        ) : null}
      </BlockStack>
    </Card>
  );
}

function ConnectedManager({connection, fetcher, actionPath, onChangeProvider}) {
  const provider = getProvider(connection?.provider);
  const providerName = connection?.providerName || provider.name;
  const pendingIntent = fetcher.formData?.get('intent');
  const timeout = useFetcherTimeout(fetcher, {
    timeoutMs: 20000,
    message: 'The connection action took too long. Please try again later.',
  });
  const isRefreshing = timeout.pending && pendingIntent === 'refresh';
  const isDisconnecting = timeout.pending && pendingIntent === 'disconnect';

  function submitIntent(intent) {
    const formData = new FormData();
    formData.set('intent', intent);
    fetcher.submit(formData, {method: 'post', action: actionPath});
  }

  const rows = [
    ['Provider', <InlineStack key="provider" gap="250" blockAlign="center"><ProviderMark provider={provider} /><Text as="span" variant="bodyMd">{providerName}</Text></InlineStack>],
    [connection.provider === 'yotpo' ? 'Store ID' : 'Connected shop', connection.connectedIdentifier || connection.shopDomain || connection.storeId],
    ['Auth method', connection.authMethodLabel || connection.authMethod],
    [connection.credentialLabel || 'Credential', tokenWithViewIcon(connection.credentialMask || connection.tokenMask || connection.secretMask)],
    ['Connected at', formatDateTime(connection.createdAt)],
    ['Last verified', formatDateTime(connection.lastVerifiedAt)],
    [connection.provider === 'yotpo' ? 'Reviews checked' : 'Imported reviews', `${formatNumber(connection.reviewCount)} available`],
    ['Sync health', <Badge key="health" tone={connection.status === 'connected' ? 'success' : 'critical'}>{connection.status === 'connected' ? 'Healthy' : 'Needs attention'}</Badge>],
  ];

  return (
    <Card>
      <BlockStack gap="400">
        <Text as="h2" variant="headingLg">Connected source</Text>
        <Banner tone="success">
          {providerName} connected successfully
        </Banner>

        <BlockStack gap="300">
          <BlockStack gap="0">
            {rows.map(([label, value]) => (
              <div key={label} className="rp-connect-summary-row">
                <Text as="span" variant="bodyMd" tone="subdued">{label}</Text>
                {typeof value === 'string' || typeof value === 'number' ? (
                  <Text as="span" variant="bodyMd" fontWeight="medium">{value}</Text>
                ) : (
                  <div className="rp-connect-kv-value">{value}</div>
                )}
              </div>
            ))}
          </BlockStack>
        </BlockStack>

        <InlineStack gap="200">
          <Button icon={RefreshIcon} loading={isRefreshing} disabled={isRefreshing} onClick={() => submitIntent('refresh')}>
            Refresh connection
          </Button>
          <Button icon={ArrowRightIcon} onClick={onChangeProvider}>
            Change provider
          </Button>
          <Button tone="critical" icon={XIcon} loading={isDisconnecting} disabled={isDisconnecting} onClick={() => submitIntent('disconnect')}>
            Disconnect
          </Button>
        </InlineStack>

        <Text as="p" variant="bodySm" tone="subdued">
          Changing provider will reopen the provider selection and token setup flow.
        </Text>

        <Divider />

        <BlockStack gap="250">
          <Text as="h3" variant="headingMd">Available providers</Text>
          <InlineGrid columns={{xs: 1, sm: 2, lg: 4}} gap="300">
            {providers.map((provider) => (
              <ProviderTile
                key={provider.id}
                provider={provider}
                selected={provider.id === connection.provider}
                statusOverride={provider.id === connection.provider ? 'Connected' : undefined}
              />
            ))}
          </InlineGrid>
        </BlockStack>
      </BlockStack>
    </Card>
  );
}

export function ConnectPanel({connection, fetcher, loaderData, actionPath, showProviderSetup, onChangeProvider}) {
  const activeProviderName = connection?.providerName || getProvider(connection?.provider).name;

  if (connection && !showProviderSetup) {
    return (
      <ConnectedManager
        connection={connection}
        fetcher={fetcher}
        actionPath={actionPath}
        onChangeProvider={onChangeProvider}
      />
    );
  }

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center">
          <Text as="h2" variant="headingLg">{connection ? 'Change review source' : 'Connect your review source'}</Text>
          {connection ? <Badge tone="info">{activeProviderName} active</Badge> : null}
        </InlineStack>
        {connection ? (
          <Banner tone="info">
            Choose a provider below to test and save a different review source.
          </Banner>
        ) : null}
        <ConnectForm
          fetcher={fetcher}
          shop={loaderData.shop}
          loaderData={loaderData}
          actionPath={actionPath}
          initialProvider={connection?.provider || 'judgeme'}
          showTestStoreDomainField={Boolean(loaderData.showJudgeMeTestDomainField)}
        />
      </BlockStack>
    </Card>
  );
}

function buildDebugInfo({connection, loaderData, result}) {
  const connected = Boolean(connection);
  const providerName = connection?.providerName || result?.providerName || 'None';
  const connectedIdentifier = connection?.connectedIdentifier || connection?.shopDomain || connection?.storeId || 'Not connected';
  const credentialMask = connection?.credentialMask || connection?.tokenMask || connection?.secretMask || 'Not saved';
  const reviewCount = connection?.reviewCount ?? 0;
  const connectionStatus = connection?.status || 'not_connected';
  const account = connection?.account && typeof connection.account === 'object' && !Array.isArray(connection.account)
    ? connection.account
    : null;
  const settings = connection?.settings && typeof connection.settings === 'object' && !Array.isArray(connection.settings)
    ? connection.settings
    : null;
  const sampleReviews = Array.isArray(connection?.sampleReviews) ? connection.sampleReviews : [];
  const logs = [
    result?.message ? ['Action response', result.message] : null,
    connection?.lastVerifiedAt ? ['Provider verified', formatDateTime(connection.lastVerifiedAt)] : null,
    connection?.updatedAt ? ['Database updated', formatDateTime(connection.updatedAt)] : null,
    connection?.createdAt ? ['Record created', formatDateTime(connection.createdAt)] : null,
    connection?.lastError ? ['Last provider error', connection.lastError] : null,
    !connected ? ['Connection state', 'No saved review source connection for this shop.'] : null,
  ].filter(Boolean);

  return {
    details: [
      ['Environment', loaderData.appEnv || 'development', 'warning'],
      ['Session shop', loaderData.shop],
      ['Connection ID', connection?.id || 'Not saved'],
      ['Provider', connected ? providerName : 'None'],
      ['Connection status', connectionStatus, connected ? 'success' : 'attention'],
      ['Auth method', connection?.authMethodLabel || connection?.authMethod || 'Not configured'],
      ['Credential (masked)', credentialMask],
      ['Connected identifier', connectedIdentifier],
      ['Scope', connection?.scope || 'Not returned by provider'],
    ],
    health: [
      ['Imported review count', formatNumber(reviewCount)],
      ['Sample reviews stored', String(sampleReviews.length)],
      ['Account payload fields', String(account ? Object.keys(account).length : 0)],
      ['Settings payload fields', String(settings ? Object.keys(settings).length : 0)],
      ['Last verified', connected ? formatDateTime(connection.lastVerifiedAt) : 'Never'],
      ['Last database update', connected ? formatDateTime(connection.updatedAt) : 'Never'],
    ],
    logs,
    latestApiResponse: {
      connection: connection
        ? {
            id: connection.id,
            provider: connection.provider,
            status: connection.status,
            connectedIdentifier,
            authMethod: connection.authMethod,
            credentialMask,
            reviewCount: connection.reviewCount,
            lastVerifiedAt: connection.lastVerifiedAt,
            updatedAt: connection.updatedAt,
            lastError: connection.lastError,
          }
        : null,
      loadedPayloads: {
        account,
        settings,
        sampleReviews: sampleReviews.slice(0, 3),
      },
      lastActionResult: result
        ? {
            intent: result.intent || null,
            ok: Boolean(result.ok),
            message: result.message || null,
            error: result.error || null,
          }
        : null,
      route: {
        shop: loaderData.shop,
        appEnv: loaderData.appEnv,
      },
    },
    lastError: connection?.lastError || result?.error?.message || 'None',
  };
}

function DebugPanel({connection, loaderData, result}) {
  const [open, setOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const debugInfo = useMemo(
    () => buildDebugInfo({connection, loaderData, result}),
    [connection, loaderData, result],
  );

  async function copyDebugInfo() {
    const text = JSON.stringify(debugInfo, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card padding="0">
      <Box padding="300" background="bg-surface-warning">
        <InlineStack align="space-between" blockAlign="center" gap="300">
          <InlineStack gap="200" blockAlign="center">
            <Icon source={InfoIcon} tone="warning" />
            <Text as="h2" variant="headingMd">Development debug panel</Text>
            <Badge tone="attention">Development only</Badge>
          </InlineStack>
          <InlineStack gap="200">
            <Button icon={ClipboardIcon} onClick={copyDebugInfo}>{copied ? 'Copied' : 'Copy debug info'}</Button>
            <Button icon={open ? ChevronUpIcon : ChevronDownIcon} accessibilityLabel={open ? 'Collapse debug panel' : 'Expand debug panel'} onClick={() => setOpen((value) => !value)} />
          </InlineStack>
        </InlineStack>
      </Box>

      {open ? (
        <InlineGrid columns={{xs: 1, md: 4}} gap="0">
          <Box padding="300" borderBlockStartWidth="025" borderInlineEndWidth="025" borderColor="border">
            <BlockStack gap="250">
              <Text as="h3" variant="headingSm">Connection details</Text>
              <BlockStack gap="150">
                {debugInfo.details.map(([label, value, tone]) => (
                  <KeyValueRow key={label} label={label} value={value} badgeTone={tone} />
                ))}
              </BlockStack>
            </BlockStack>
          </Box>

          <Box padding="300" borderBlockStartWidth="025" borderInlineEndWidth="025" borderColor="border">
            <BlockStack gap="250">
              <Text as="h3" variant="headingSm">Stored provider data</Text>
              <BlockStack gap="150">
                {debugInfo.health.map(([label, value, tone]) => (
                  <KeyValueRow key={label} label={label} value={value} badgeTone={tone} />
                ))}
              </BlockStack>
            </BlockStack>
          </Box>

          <Box padding="300" borderBlockStartWidth="025" borderInlineEndWidth="025" borderColor="border">
            <BlockStack gap="250">
              <InlineStack align="space-between">
                <Text as="h3" variant="headingSm">Recent local events</Text>
                <Badge tone="info">Current load</Badge>
              </InlineStack>
              <BlockStack gap="150">
                {debugInfo.logs.map(([label, message]) => (
                  <InlineStack key={`${label}-${message}`} gap="200" blockAlign="center" wrap={false}>
                    <span className="rp-connect-log-dot" />
                    <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
                    <Text as="span" variant="bodySm">{message}</Text>
                  </InlineStack>
                ))}
              </BlockStack>
              <Divider />
              <BlockStack gap="050">
                <Text as="h3" variant="headingSm">Last error</Text>
                <Text as="p" variant="bodySm" tone="subdued">{debugInfo.lastError}</Text>
              </BlockStack>
            </BlockStack>
          </Box>

          <Box padding="300" borderBlockStartWidth="025" borderColor="border">
            <BlockStack gap="250">
              <Text as="h3" variant="headingSm">Loaded debug payload</Text>
              <pre className="rp-json-preview">{JSON.stringify(debugInfo.latestApiResponse, null, 2)}</pre>
            </BlockStack>
          </Box>
        </InlineGrid>
      ) : null}
    </Card>
  );
}

export default function DashboardPage() {
  const loaderData = useLoaderData();
  const location = useLocation();
  const fetcher = useFetcher();
  const timeout = useFetcherTimeout(fetcher, {
    timeoutMs: 30000,
    message: 'The Connect action is taking longer than expected. Please try again later.',
  });
  const [showProviderSetup, setShowProviderSetup] = useState(false);
  const fetcherConnection = fetcher.data && 'connection' in fetcher.data ? fetcher.data.connection : undefined;
  const connection = fetcherConnection !== undefined ? fetcherConnection : loaderData.connection;
  const result = timeout.result || fetcher.data;
  const connected = connection?.status === 'connected';
  const actionPath = `${location.pathname}${location.search || ''}`;

  const pageTitle = connected
    ? 'Your review source is connected'
    : 'Connect your review source and start saving time';
  const pageSubtitle = connected
    ? 'ReplyPulse is now syncing reviews and is ready for brand voice training and reply approval workflows.'
    : 'ReplyPulse pulls your reviews, learns your brand voice, and helps you reply faster, always with human approval.';

  return (
    <BlockStack gap="400">
      <ResultBanner result={result} />

      <InlineStack align="space-between" blockAlign="start" gap="400">
        <BlockStack gap="100">
          <Text as="h1" variant="heading2xl">{pageTitle}</Text>
          <Text as="p" variant="bodyMd" tone="subdued">{pageSubtitle}</Text>
        </BlockStack>
        <ReviewBubble />
      </InlineStack>

      <InlineGrid columns={{xs: 1, lg: 'minmax(0, 1.2fr) minmax(360px, 0.8fr)'}} gap="400">
        <ConnectPanel
          connection={connection}
          fetcher={fetcher}
          loaderData={loaderData}
          actionPath={actionPath}
          showProviderSetup={showProviderSetup}
          onChangeProvider={() => setShowProviderSetup((value) => !value)}
        />

        <BlockStack gap="300">
          {!connected ? <CurrentConnectionCard connection={connection} fetcher={fetcher} actionPath={actionPath} /> : null}
          <AfterConnectionCard connected={connected} appHandle={loaderData.appHandle} />
        </BlockStack>
      </InlineGrid>

      {loaderData.isDevelopment ? (
        <DebugPanel connection={connection} loaderData={loaderData} result={result} />
      ) : null}
    </BlockStack>
  );
}
