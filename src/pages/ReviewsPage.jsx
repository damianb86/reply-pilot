/* eslint-disable react/prop-types, react/no-unescaped-entities */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFetcher, useLoaderData, useLocation} from 'react-router';
import {useAppBridge} from '@shopify/app-bridge-react';
import {
  Autocomplete,
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  Checkbox,
  Icon,
  IndexTable,
  InlineStack,
  Select,
  Spinner,
  Text,
  TextField,
} from '@shopify/polaris';
import {
  AlertTriangleIcon,
  ChatIcon,
  EditIcon,
  MagicIcon,
  RefreshIcon,
  SearchIcon,
  SendIcon,
  XIcon,
} from '@shopify/polaris-icons';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';
import PageLoadingState from '../PageLoadingState';

function Stars({rating}) {
  return (
    <span className="rp-stars" aria-label={`${rating} out of 5 stars`}>
      {Array.from({length: 5}, (_, index) => (
        <span key={index} className={index >= rating ? 'is-empty' : undefined}>★</span>
      ))}
    </span>
  );
}

function ConfidenceMeter({value}) {
  const isWarning = value < 75;

  return (
    <span className="rp-confidence">
      <span className="rp-confidence-track" aria-hidden="true">
        <span
          className={`rp-confidence-fill ${isWarning ? 'is-warning' : ''}`}
          style={{width: `${value}%`}}
        />
      </span>
      <Text as="span" variant="bodySm" tone={isWarning ? 'critical' : 'subdued'}>{value}%</Text>
    </span>
  );
}

function CustomerCell({review}) {
  return (
    <div className="rp-customer-cell">
      <span className="rp-avatar">{review.initials}</span>
      <BlockStack gap="050">
        <Text as="span" variant="bodyMd" fontWeight="semibold">{review.customer}</Text>
        <Stars rating={review.rating} />
      </BlockStack>
    </div>
  );
}

function QueueEmptyState({connected, connectUrl, onRefresh, refreshing}) {
  return (
    <div className="rp-queue-empty">
      <span className="rp-empty-mark is-blue">
        <Icon source={ChatIcon} tone="base" />
      </span>
      <BlockStack gap="150" align="center">
        <Text as="h2" variant="headingLg" alignment="center">No messages to show</Text>
        <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
          {connected
            ? 'When Judge.me has reviews ready for attention, Reply Pulse AI: Review Replies will import them here so you can review existing replies and generate new drafts.'
            : 'Connect Judge.me from Connect to import reviews and start replying from Reviews.'}
        </Text>
      </BlockStack>
      <InlineStack gap="200" align="center">
        <span className="rp-refresh-action">
          <Button icon={RefreshIcon} loading={refreshing} disabled={!connected || refreshing} onClick={onRefresh}>
            {refreshing ? 'Refreshing' : 'Refresh reviews'}
          </Button>
        </span>
        {!connected ? <Button url={connectUrl} variant="primary">Go to Connect</Button> : null}
      </InlineStack>
    </div>
  );
}

function AiActionButton({children, className = '', icon = MagicIcon, ...buttonProps}) {
  return (
    <span className={`rp-ai-action-button ${className}`}>
      <Button {...buttonProps} icon={icon}>{children}</Button>
    </span>
  );
}

function ResultBanner({result, syncError}) {
  if (result?.message && result.ok === false) {
    return (
      <Banner tone={result.ok ? 'success' : 'critical'}>
        <BlockStack gap="150">
          <Text as="p" variant="bodyMd">{result.message}</Text>
          {!result.ok && result.error ? (
            <pre className="rp-json-preview is-error">{JSON.stringify(result.error, null, 2)}</pre>
          ) : null}
        </BlockStack>
      </Banner>
    );
  }

  if (syncError) {
    return (
      <Banner tone="critical">
        <BlockStack gap="150">
          <Text as="p" variant="bodyMd">Could not sync Judge.me reviews.</Text>
          <pre className="rp-json-preview is-error">{JSON.stringify(syncError, null, 2)}</pre>
        </BlockStack>
      </Banner>
    );
  }

  return null;
}

function formatErrorPreview(value) {
  if (!value) return '';

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return String(value);
  }
}

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function hasDraft(review) {
  return Boolean(review?.draftGenerated ?? review?.draft?.trim());
}

function hasJudgeMeReply(review) {
  return Boolean(review?.hasJudgeMeReply || review?.judgeMeReply?.present);
}

function formatReplyDate(value) {
  const date = parseDate(value);
  if (!date) return '';

  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function readPendingIds(formData) {
  const value = formData?.get('ids');
  if (typeof value !== 'string') return [];

  try {
    const ids = JSON.parse(value);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

function DraftPlaceholderIllustration() {
  return (
    <svg className="rp-draft-illustration" viewBox="0 0 180 132" role="img" aria-label="Draft not generated">
      <defs>
        <linearGradient id="draft-card" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--rp-ai-surface)" />
          <stop offset="100%" stopColor="var(--rp-ai-selected)" />
        </linearGradient>
      </defs>
      <rect x="30" y="18" width="120" height="86" rx="14" fill="url(#draft-card)" />
      <rect x="46" y="38" width="62" height="8" rx="4" fill="var(--rp-ai-primary)" opacity="0.76" />
      <rect x="46" y="56" width="88" height="7" rx="3.5" fill="var(--rp-ai-secondary)" opacity="0.5" />
      <rect x="46" y="72" width="72" height="7" rx="3.5" fill="var(--rp-ai-secondary)" opacity="0.42" />
      <circle cx="135" cy="33" r="18" fill="var(--rp-card-surface)" />
      <path d="M135 23l2.6 6.6 7.1 1.1-5.1 4.9 1.2 7-5.8-3.3-6.2 3.3 1.3-7-5.1-4.9 7.1-1.1L135 23z" fill="var(--rp-ai-primary)" />
      <path d="M58 103c10 8 54 9 67 0" fill="none" stroke="var(--rp-ai-primary)" strokeWidth="5" strokeLinecap="round" opacity="0.38" />
    </svg>
  );
}

function ProductFilter({products, value, onChange}) {
  const [inputValue, setInputValue] = useState(value === 'all' ? '' : value);

  useEffect(() => {
    setInputValue(value === 'all' ? '' : value);
  }, [value]);

  const productOptions = useMemo(() => {
    const query = inputValue.trim().toLowerCase();
    const matches = products
      .filter((product) => !query || product.toLowerCase().includes(query))
      .slice(0, 50)
      .map((product) => ({label: product, value: product}));

    return [
      {label: 'All products', value: 'all'},
      ...matches,
    ];
  }, [inputValue, products]);

  const textField = (
    <Autocomplete.TextField
      label="Product"
      labelHidden
      value={inputValue}
      prefix={<Icon source={SearchIcon} tone="subdued" />}
      placeholder={value === 'all' ? 'Search products' : value}
      autoComplete="off"
      clearButton
      onChange={(nextValue) => {
        setInputValue(nextValue);
        if (!nextValue.trim()) onChange('all');
      }}
      onClearButtonClick={() => {
        setInputValue('');
        onChange('all');
      }}
    />
  );

  return (
    <Autocomplete
      options={productOptions}
      selected={[value]}
      textField={textField}
      listTitle="Products in reviews"
      preferredPosition="below"
      emptyState={(
        <div className="rp-product-filter-empty">
          <Text as="p" variant="bodySm" tone="subdued">No matching products in current reviews.</Text>
        </div>
      )}
      onSelect={(selected) => {
        const nextValue = selected[0] ?? 'all';
        onChange(nextValue);
        setInputValue(nextValue === 'all' ? '' : nextValue);
      }}
    />
  );
}

function ReviewsContent() {
  const loaderData = useLoaderData();
  const location = useLocation();
  const actionFetcher = useFetcher();
  const syncFetcher = useFetcher();
  const shopify = useAppBridge();
  const lastToastKey = useRef('');
  const initialRefreshStarted = useRef(false);
  const [localToast, setLocalToast] = useState(null);
  const hasCachedReviews = Array.isArray(loaderData.reviews) && loaderData.reviews.length > 0;
  const [showInitialRefreshLoading, setShowInitialRefreshLoading] = useState(Boolean(loaderData.connected && !hasCachedReviews));
  const [latestPageData, setLatestPageData] = useState(null);
  const pageData = latestPageData ?? loaderData;
  const reviews = useMemo(() => pageData.reviews ?? [], [pageData.reviews]);
  const stats = pageData.stats ?? {pending: 0, sentToday: 0, sent: 0, skipped: 0, ungenerated: 0, judgeMeReplied: 0, highConfidence: 0, needsHuman: 0};
  const queueSettings = pageData.settings ?? {};
  const highConfidenceThreshold = queueSettings.highConfidenceThreshold ?? 85;
  const products = pageData.products ?? [];
  const aiConfig = pageData.aiConfig ?? {};
  const aiConfigured = aiConfig.configured !== false;
  const aiDisplayName = aiConfig.displayName || aiConfig.activeVariant?.name || aiConfig.selectedModel?.name || 'Brand Voice model';
  const productDescriptionMultiplier = Number(aiConfig.productDescriptionMultiplier ?? 1);
  const creditBalance = Number(pageData.credits?.balance ?? 0);
  const replyCreditCost = Number(aiConfig.replyCreditCost ?? 1);

  const [activeReviewId, setActiveReviewId] = useState(reviews[0]?.id ?? null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [starFilter, setStarFilter] = useState('all');
  const [productFilter, setProductFilter] = useState('all');
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(false);
  const [needsHumanOnly, setNeedsHumanOnly] = useState(false);
  const [dateRangeFilter, setDateRangeFilter] = useState(queueSettings.defaultQueueRange || '7-days');
  const [showSkipped, setShowSkipped] = useState(Boolean(queueSettings.showSkippedByDefault));
  const [showSent, setShowSent] = useState(Boolean(queueSettings.showSentByDefault));
  const [sortNewest, setSortNewest] = useState((queueSettings.defaultQueueSort || 'newest') !== 'oldest');
  const [isEditing, setIsEditing] = useState(false);
  const [draftValue, setDraftValue] = useState('');
  const [showDraftAdjuster, setShowDraftAdjuster] = useState(false);
  const [draftInstruction, setDraftInstruction] = useState('');

  const filteredReviews = useMemo(() => {
    const now = Date.now();

    return [...reviews]
      .filter((review) => showSkipped || review.status !== 'skipped')
      .filter((review) => showSent || review.status !== 'sent')
      .filter((review) => starFilter === 'all' || String(review.rating) === starFilter)
      .filter((review) => productFilter === 'all' || review.product === productFilter)
      .filter((review) => !highConfidenceOnly || (hasDraft(review) && review.confidence >= highConfidenceThreshold))
      .filter((review) => !needsHumanOnly || (hasDraft(review) && review.human))
      .filter((review) => {
        if (dateRangeFilter === 'all') return true;
        const rangeDays = dateRangeFilter === '30-days' ? 30 : 7;
        const date = parseDate(review.createdAt);
        return !date || now - date.getTime() <= rangeDays * 24 * 60 * 60 * 1000;
      })
      .sort((a, b) => {
        const aTime = parseDate(a.createdAt)?.getTime() ?? 0;
        const bTime = parseDate(b.createdAt)?.getTime() ?? 0;
        return sortNewest ? bTime - aTime : aTime - bTime;
      });
  }, [reviews, showSkipped, showSent, starFilter, productFilter, highConfidenceOnly, needsHumanOnly, dateRangeFilter, sortNewest, highConfidenceThreshold]);

  const activeReview = filteredReviews.find((review) => review.id === activeReviewId) ?? filteredReviews[0] ?? null;
  const visibleIds = filteredReviews.map((review) => review.id);
  const activeHasDraft = hasDraft(activeReview);
  const activeHasJudgeMeReply = hasJudgeMeReply(activeReview);
  const activeCanUseAiDraft = activeReview?.status === 'pending' && !activeHasJudgeMeReply;
  const highConfidenceVisible = filteredReviews.filter((review) => (
    review.status === 'pending' && hasDraft(review) && review.confidence >= highConfidenceThreshold
  ));
  const ungeneratedVisible = filteredReviews.filter((review) => (
    review.status === 'pending' && !hasDraft(review) && !hasJudgeMeReply(review)
  ));
  const selectedVisibleIds = selectedIds.filter((id) => visibleIds.includes(id));
  const selectedPendingIds = selectedVisibleIds.filter((id) => filteredReviews.find((review) => review.id === id)?.status === 'pending');
  const selectedGeneratedPendingIds = selectedPendingIds.filter((id) => {
    const review = filteredReviews.find((item) => item.id === id);
    return hasDraft(review) && !hasJudgeMeReply(review);
  });
  const selectedUngeneratedPendingIds = selectedPendingIds.filter((id) => {
    const review = filteredReviews.find((item) => item.id === id);
    return !hasDraft(review) && !hasJudgeMeReply(review);
  });
  const selectedJudgeMeReplyIds = selectedPendingIds.filter((id) => {
    const review = filteredReviews.find((item) => item.id === id);
    return hasJudgeMeReply(review);
  });
  const selectedSkippedIds = selectedVisibleIds.filter((id) => filteredReviews.find((review) => review.id === id)?.status === 'skipped');
  const selectedSentIds = selectedVisibleIds.filter((id) => filteredReviews.find((review) => review.id === id)?.status === 'sent');
  const selectedCount = selectedVisibleIds.length;
  const actionTimeout = useFetcherTimeout(actionFetcher, {
    timeoutMs: 120000,
    message: 'The Reviews action took too long. Please try again later.',
  });
  const syncTimeout = useFetcherTimeout(syncFetcher, {
    timeoutMs: 120000,
    message: 'Refreshing reviews took too long. Please try again later.',
  });
  const isSubmitting = actionTimeout.pending;
  const pendingIntent = String(actionFetcher.formData?.get('intent') ?? '');
  const pendingIds = readPendingIds(actionFetcher.formData);
  const isBulkAiProcessing = isSubmitting && ['generate', 'regenerate'].includes(pendingIntent) && pendingIds.length > 1;
  const bulkProcessingVerb = pendingIntent === 'regenerate' ? 'Regenerating' : 'Generating';
  const syncPendingIntent = String(syncFetcher.formData?.get('intent') ?? '');
  const isSyncing = syncTimeout.pending && syncPendingIntent === 'sync';
  const actionResult = actionTimeout.result || actionFetcher.data || syncTimeout.result || syncFetcher.data;
  const connectUrl = `/app/dashboard${location.search || ''}`;
  const creditsFor = useCallback((count) => Math.max(0, count * replyCreditCost), [replyCreditCost]);
  const formatCreditAmount = useCallback((value) => {
    const numeric = Number(value || 0);
    const hasDecimals = !Number.isInteger(Math.abs(numeric));
    return numeric.toLocaleString('en', {
      minimumFractionDigits: hasDecimals ? 1 : 0,
      maximumFractionDigits: hasDecimals ? 1 : 0,
    });
  }, []);

  const showToast = useCallback((data) => {
    if (!data?.message) return;

    const key = `${data.intent || 'action'}:${data.ok ? 'ok' : 'error'}:${data.message}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;

    if (!data.ok && data.error) {
      console.error('Reviews action failed', data.error);
    }

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

  const creditText = useCallback((value) => {
    const amount = Number(value || 0);
    return `${formatCreditAmount(amount)} credit${amount === 1 ? '' : 's'}`;
  }, [formatCreditAmount]);

  const hasEnoughCredits = useCallback((count, actionLabel) => {
    const required = creditsFor(count);
    if (required <= creditBalance) return true;

    showToast({
      ok: false,
      intent: 'insufficient-credits',
      message: `${actionLabel} needs ${creditText(required)}, but you only have ${creditText(creditBalance)}. Buy more credits to continue.`,
    });
    return false;
  }, [creditBalance, creditText, creditsFor, showToast]);

  useEffect(() => {
    if (!loaderData.connected || initialRefreshStarted.current) return;
    initialRefreshStarted.current = true;
    if (!hasCachedReviews) {
      setShowInitialRefreshLoading(true);
    }
    const formData = new FormData();
    formData.set('intent', 'sync');
    formData.set('ids', '[]');
    formData.set('source', 'initial-load');
    syncFetcher.submit(formData, {method: 'post'});
  }, [hasCachedReviews, loaderData.connected, syncFetcher]);

  useEffect(() => {
    if (
      showInitialRefreshLoading &&
      syncFetcher.state === 'idle' &&
      (syncFetcher.data?.intent === 'sync' || syncTimeout.timedOut)
    ) {
      setShowInitialRefreshLoading(false);
    }
  }, [showInitialRefreshLoading, syncFetcher.data?.intent, syncFetcher.state, syncTimeout.timedOut]);

  useEffect(() => {
    if (syncFetcher.data?.reviews) {
      setLatestPageData(syncFetcher.data);
    }
  }, [syncFetcher.data]);

  useEffect(() => {
    if (actionFetcher.data?.reviews) {
      setLatestPageData(actionFetcher.data);
    }
  }, [actionFetcher.data]);

  useEffect(() => {
    if (!activeReview && filteredReviews[0]) {
      setActiveReviewId(filteredReviews[0].id);
    }
  }, [activeReview, filteredReviews]);

  useEffect(() => {
    setDraftValue(activeReview?.draft ?? '');
    setIsEditing(false);
    setShowDraftAdjuster(false);
    setDraftInstruction('');
  }, [activeReview?.id, activeReview?.draft]);

  useEffect(() => {
    if (['generate', 'regenerate'].includes(actionFetcher.data?.intent)) {
      const generatedIds = Array.isArray(actionFetcher.data?.generation?.generatedIds)
        ? actionFetcher.data.generation.generatedIds
        : [];
      if (generatedIds.length) {
        setSelectedIds((current) => current.filter((id) => !generatedIds.includes(id)));
      }
    } else if ((actionFetcher.data?.ok || actionFetcher.data?.generation?.generated) && ['send', 'skip', 'restore'].includes(actionFetcher.data?.intent)) {
      setSelectedIds([]);
    }

    if (actionFetcher.data?.ok && actionFetcher.data.intent === 'revise-draft') {
      setDraftInstruction('');
      setShowDraftAdjuster(false);
    }
  }, [actionFetcher.data]);

  useEffect(() => {
    showToast(actionTimeout.result || actionFetcher.data);
  }, [actionFetcher.data, actionTimeout.result, showToast]);

  useEffect(() => {
    showToast(syncTimeout.result || syncFetcher.data);
  }, [showToast, syncFetcher.data, syncTimeout.result]);

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'select' || event.target?.isContentEditable) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault();
        setSelectedIds(visibleIds);
        return;
      }

      if (!activeReview) return;

      if (event.key === 'Enter' && activeCanUseAiDraft && hasDraft(activeReview)) {
        event.preventDefault();
        submitAction('send', [activeReview.id]);
      } else if (event.key.toLowerCase() === 'e' && activeCanUseAiDraft) {
        event.preventDefault();
        setIsEditing(true);
      } else if (event.key.toLowerCase() === 'j' || event.key === 'ArrowDown') {
        event.preventDefault();
        moveActive(1);
      } else if (event.key.toLowerCase() === 'k' || event.key === 'ArrowUp') {
        event.preventDefault();
        moveActive(-1);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function submitAction(intent, ids = selectedVisibleIds, extra = {}) {
    const formData = new FormData();
    formData.set('intent', intent);
    formData.set('ids', JSON.stringify(ids));

    Object.entries(extra).forEach(([key, value]) => {
      formData.set(key, value);
    });

    actionFetcher.submit(formData, {method: 'post'});
  }

  function submitSingle(intent, id, extra = {}) {
    submitAction(intent, [id], extra);
  }

  function submitAiAction(intent, ids, actionLabel, extra = {}) {
    if (!Array.isArray(ids) || !ids.length) return;
    if (!hasEnoughCredits(ids.length, actionLabel)) return;
    submitAction(intent, ids, extra);
  }

  function submitSingleAiAction(intent, id, actionLabel, extra = {}) {
    submitAiAction(intent, [id], actionLabel, extra);
  }

  function handleSelectionChange(selectionType, isSelecting, selection) {
    if (selectionType === 'all' || selectionType === 'page') {
      setSelectedIds(isSelecting ? visibleIds : []);
      return;
    }

    if (selectionType === 'single') {
      setSelectedIds((current) => (
        isSelecting
          ? Array.from(new Set([...current, selection]))
          : current.filter((id) => id !== selection)
      ));
      return;
    }

    if (Array.isArray(selection)) {
      const [start, end] = selection;
      const rangeIds = visibleIds.slice(Number(start), Number(end) + 1);
      setSelectedIds((current) => (
        isSelecting
          ? Array.from(new Set([...current, ...rangeIds]))
          : current.filter((id) => !rangeIds.includes(id))
      ));
    }
  }

  function moveActive(direction) {
    if (!filteredReviews.length) return;
    const currentIndex = Math.max(0, filteredReviews.findIndex((review) => review.id === activeReview?.id));
    const nextIndex = Math.min(filteredReviews.length - 1, Math.max(0, currentIndex + direction));
    setActiveReviewId(filteredReviews[nextIndex].id);
  }

  function handleRefresh() {
    if (!pageData.connected || isSyncing) return;
    const formData = new FormData();
    formData.set('intent', 'sync');
    formData.set('ids', '[]');
    syncFetcher.submit(formData, {method: 'post'});
  }

  function handleSaveDraft() {
    if (!activeReview || !activeCanUseAiDraft || !draftValue.trim()) return;

    const formData = new FormData();
    formData.set('intent', 'update-draft');
    formData.set('id', activeReview.id);
    formData.set('draft', draftValue);
    actionFetcher.submit(formData, {method: 'post'});
  }

  function handleReviseDraft() {
    if (!activeReview || !activeCanUseAiDraft || !activeHasDraft || !draftInstruction.trim()) return;
    if (!hasEnoughCredits(1, 'Applying this AI change')) return;

    const formData = new FormData();
    formData.set('intent', 'revise-draft');
    formData.set('id', activeReview.id);
    formData.set('instruction', draftInstruction.trim().slice(0, 100));
    actionFetcher.submit(formData, {method: 'post'});
  }

  const rowMarkup = filteredReviews.map((review, index) => (
    <IndexTable.Row
      id={review.id}
      key={review.id}
      selected={selectedIds.includes(review.id)}
      position={index}
      tone={review.id === activeReview?.id ? 'success' : undefined}
      onClick={() => setActiveReviewId(review.id)}
    >
      <IndexTable.Cell>
        <CustomerCell review={review} />
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div className="rp-product-cell">
          <Text as="span" variant="bodyMd">{review.product}</Text>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        <div className="rp-review-cell">
          <Text as="p" variant="bodyMd">
            <span className="rp-line-clamp">"{review.review}"</span>
          </Text>
          <InlineStack gap="200" blockAlign="center">
            {review.status === 'skipped' ? (
              <Badge tone="attention">Skipped</Badge>
            ) : review.status === 'sent' ? (
              <Badge tone="success">Sent</Badge>
            ) : null}
            {hasJudgeMeReply(review) ? <Badge tone="success">Judge.me replied</Badge> : null}
            {!hasDraft(review) && !hasJudgeMeReply(review) ? (
              <Badge tone="info">Draft needed</Badge>
            ) : hasDraft(review) ? (
              <span className="rp-draft-ready">✶ draft ready</span>
            ) : null}
            {review.human ? <Badge tone="critical">Human</Badge> : null}
            {review.lastError && !hasJudgeMeReply(review) ? <Badge tone="critical">AI error</Badge> : null}
          </InlineStack>
        </div>
      </IndexTable.Cell>
      <IndexTable.Cell>
        {hasDraft(review) ? (
          <ConfidenceMeter value={review.confidence} />
        ) : (
          <Text as="span" variant="bodySm" tone="subdued">
            {hasJudgeMeReply(review) ? 'Judge.me reply' : 'Not generated'}
          </Text>
        )}
      </IndexTable.Cell>
      <IndexTable.Cell>
        <Text as="span" variant="bodySm" tone="subdued">{review.age}</Text>
      </IndexTable.Cell>
    </IndexTable.Row>
  ));

  if (showInitialRefreshLoading) {
    return (
      <PageLoadingState
        title="Loading Reviews"
        description="Refreshing reviews and preparing AI drafts, filters, and reply status..."
      />
    );
  }

  return (
    <BlockStack gap="400">
      {localToast ? (
        <div className={`rp-local-toast ${localToast.isError ? 'is-error' : ''}`} role="status">
          {localToast.message}
        </div>
      ) : null}

      <ResultBanner result={actionResult} syncError={pageData.syncError} />
      {isBulkAiProcessing ? (
        <div className="rp-processing-overlay" role="status" aria-live="assertive">
          <div className="rp-processing-modal">
            <span className="rp-processing-modal-mark">
              <Spinner accessibilityLabel={`${bulkProcessingVerb} messages`} size="large" />
            </span>
            <BlockStack gap="150" align="center">
              <Text as="h2" variant="headingLg" alignment="center">Please wait</Text>
              <Text as="p" variant="bodyMd" alignment="center">
                {bulkProcessingVerb} {pendingIds.length} messages with {aiDisplayName}.
              </Text>
              <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                Reply Pulse AI: Review Replies is applying Brand Voice, product context, and review ratings. Keep this page open until it finishes.
              </Text>
            </BlockStack>
            <div className="rp-processing-bar" aria-hidden="true">
              <span />
            </div>
          </div>
        </div>
      ) : null}
      {!aiConfigured ? (
        <Banner tone="critical">
          <Text as="p" variant="bodyMd">
            {aiConfig.dailyLimitReached
              ? `All Gemini/Gemma variants configured for Brand Voice are exhausted for ${aiConfig.dayKey || 'today'}. Reviews generation will resume when the daily pool resets.`
              : `The AI model selected in Brand Voice is missing backend configuration${aiConfig.missingEnv ? ` (${aiConfig.missingEnv})` : ''}. Reviews generation is paused until it is configured.`}
          </Text>
        </Banner>
      ) : null}

      <InlineStack align="space-between" blockAlign="center" gap="300">
        <BlockStack gap="100">
          <Text as="h1" variant="heading2xl">Reviews</Text>
          <Text as="p" variant="bodyLg" tone="subdued">
            Review approvals stay table-first for speed while existing Judge.me replies and AI drafts remain visible in the side panel.
          </Text>
        </BlockStack>
        <span className="rp-refresh-action">
          <Button icon={RefreshIcon} size="large" loading={isSyncing} disabled={!pageData.connected || isSyncing} onClick={handleRefresh}>
            {isSyncing ? 'Refreshing' : 'Refresh'}
          </Button>
        </span>
      </InlineStack>

      <div className="rp-queue-shell">
        <div className="rp-queue-header">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <InlineStack gap="200" blockAlign="center">
              <span className="rp-brand-lockup">
                <span className="rp-brand-mark">
                  <Icon source={MagicIcon} tone="base" />
                </span>
                <span className="rp-brand-name">Reviews</span>
              </span>
              <span className="rp-queue-metric">{stats.pending} pending</span>
              <span className="rp-queue-metric">{stats.sentToday} sent today</span>
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              <Badge tone={aiConfigured ? 'info' : 'critical'}>AI: {aiDisplayName}</Badge>
              <Badge tone={creditBalance < replyCreditCost ? 'critical' : 'info'}>{formatCreditAmount(creditBalance)} credits</Badge>
              {productDescriptionMultiplier > 1 ? <Badge tone="info">Product descriptions {productDescriptionMultiplier}x</Badge> : null}
              <Badge>{pageData.connected ? 'Judge.me connected' : 'Source missing'}</Badge>
              <Badge tone={pageData.connected ? 'success' : 'attention'}>{pageData.connected ? 'Ready' : 'Setup needed'}</Badge>
            </InlineStack>
          </InlineStack>
        </div>

        <div className="rp-queue-filterbar">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodySm" tone="subdued" fontWeight="semibold">FILTER</Text>
              <div className="rp-filter-select">
                <Select
                  label="Stars"
                  labelHidden
                  options={[
                    {label: 'All stars', value: 'all'},
                    {label: '5 stars', value: '5'},
                    {label: '4 stars', value: '4'},
                    {label: '3 stars', value: '3'},
                    {label: '2 stars', value: '2'},
                    {label: '1 star', value: '1'},
                  ]}
                  value={starFilter}
                  onChange={setStarFilter}
                />
              </div>
              <div className="rp-filter-select is-search">
                <ProductFilter
                  products={products}
                  value={productFilter}
                  onChange={setProductFilter}
                />
              </div>
              <Button pressed={highConfidenceOnly} tone={highConfidenceOnly ? 'critical' : undefined} onClick={() => setHighConfidenceOnly((value) => !value)}>
                High conf {highConfidenceThreshold}%+
              </Button>
              <Button pressed={needsHumanOnly} icon={AlertTriangleIcon} onClick={() => setNeedsHumanOnly((value) => !value)}>
                Needs human
              </Button>
              <div className="rp-filter-select">
                <Select
                  label="Date range"
                  labelHidden
                  options={[
                    {label: 'Last 7 days', value: '7-days'},
                    {label: 'Last 30 days', value: '30-days'},
                    {label: 'All time', value: 'all'},
                  ]}
                  value={dateRangeFilter}
                  onChange={setDateRangeFilter}
                />
              </div>
              <Checkbox
                label={`Show skipped${stats.skipped ? ` (${stats.skipped})` : ''}`}
                checked={showSkipped}
                onChange={setShowSkipped}
              />
              <Checkbox
                label={`Show sent${stats.sent ? ` (${stats.sent})` : ''}`}
                checked={showSent}
                onChange={setShowSent}
              />
            </InlineStack>
            <Button onClick={() => setSortNewest((value) => !value)}>
              {sortNewest ? 'Newest' : 'Oldest'}
            </Button>
          </InlineStack>
        </div>

        <div className="rp-bulkbar">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <InlineStack gap="200" blockAlign="center">
              <Text as="span" variant="bodyMd" fontWeight="semibold">{selectedCount} selected</Text>
              <span className="rp-ai-action-group">
                <AiActionButton disabled={!aiConfigured || !selectedUngeneratedPendingIds.length || isSubmitting} onClick={() => submitAiAction('generate', selectedUngeneratedPendingIds, `Generating ${selectedUngeneratedPendingIds.length} ${selectedUngeneratedPendingIds.length === 1 ? 'reply' : 'replies'}`)}>
                  {selectedUngeneratedPendingIds.length ? `Generate ${selectedUngeneratedPendingIds.length}` : 'Generate'}
                </AiActionButton>
                <AiActionButton className="is-secondary" disabled={!aiConfigured || !selectedGeneratedPendingIds.length || isSubmitting} onClick={() => submitAiAction('regenerate', selectedGeneratedPendingIds, `Regenerating ${selectedGeneratedPendingIds.length} ${selectedGeneratedPendingIds.length === 1 ? 'reply' : 'replies'}`)}>
                  {selectedGeneratedPendingIds.length ? `Regenerate ${selectedGeneratedPendingIds.length}` : 'Regenerate'}
                </AiActionButton>
              </span>
              <span className="rp-action-button is-publish">
                <Button icon={SendIcon} variant="primary" disabled={!selectedGeneratedPendingIds.length || isSubmitting} onClick={() => submitAction('send', selectedGeneratedPendingIds)}>
                  {selectedGeneratedPendingIds.length ? `Approve & send all ${selectedGeneratedPendingIds.length}` : 'Approve & send'}
                </Button>
              </span>
              <span className="rp-action-button is-reject">
                <Button icon={XIcon} disabled={!selectedPendingIds.length || isSubmitting} onClick={() => submitAction('skip', selectedPendingIds)}>
                  Don't reply
                </Button>
              </span>
              {showSkipped ? (
                <Button icon={RefreshIcon} disabled={!selectedSkippedIds.length || isSubmitting} onClick={() => submitAction('restore', selectedSkippedIds)}>
                  Restore {selectedSkippedIds.length}
                </Button>
              ) : null}
              {selectedSentIds.length ? (
                <Badge tone="success">{selectedSentIds.length} already sent</Badge>
              ) : null}
              {selectedJudgeMeReplyIds.length ? (
                <Badge tone="success">{selectedJudgeMeReplyIds.length} already replied in Judge.me</Badge>
              ) : null}
            </InlineStack>
            <InlineStack gap="200" blockAlign="center">
              {ungeneratedVisible.length ? (
                <AiActionButton disabled={!aiConfigured || isSubmitting} onClick={() => submitAiAction('generate', ungeneratedVisible.map((review) => review.id), `Generating ${ungeneratedVisible.length} missing ${ungeneratedVisible.length === 1 ? 'reply' : 'replies'}`)}>
                  Generate missing {ungeneratedVisible.length}
                </AiActionButton>
              ) : null}
              <Text as="span" variant="bodyMd" tone="critical">{highConfidenceVisible.length} high-conf</Text>
              <Button disabled={!highConfidenceVisible.length} onClick={() => setSelectedIds(highConfidenceVisible.map((review) => review.id))}>
                Select all {highConfidenceVisible.length}
              </Button>
              <Button variant="plain" onClick={() => setSelectedIds([])}>Clear</Button>
            </InlineStack>
          </InlineStack>
        </div>

        <div className="rp-queue-grid">
          <div className="rp-index-pane rp-index-table">
            {filteredReviews.length ? (
              <IndexTable
                resourceName={{singular: 'review', plural: 'reviews'}}
                itemCount={filteredReviews.length}
                selectedItemsCount={selectedCount === filteredReviews.length && selectedCount ? 'All' : selectedCount}
                onSelectionChange={handleSelectionChange}
                headings={[
                  {title: 'Customer'},
                  {title: 'Product'},
                  {title: 'Review'},
                  {title: 'Conf.'},
                  {title: 'Age'},
                ]}
              >
                {rowMarkup}
              </IndexTable>
            ) : (
              <QueueEmptyState
                connected={pageData.connected}
                connectUrl={connectUrl}
                refreshing={isSyncing}
                onRefresh={handleRefresh}
              />
            )}
          </div>

          <aside className="rp-detail-panel" aria-label="AI draft">
            {activeReview ? (
              <>
                <div className="rp-detail-body">
                  <InlineStack align="space-between" blockAlign="start" gap="300">
                    <InlineStack gap="300" blockAlign="start" wrap={false}>
                      <span className="rp-avatar">{activeReview.initials}</span>
                      <BlockStack gap="100">
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="h2" variant="headingLg">{activeReview.customer}</Text>
                          <Stars rating={activeReview.rating} />
                          <Text as="span" variant="bodySm" tone="subdued">{activeReview.age} ago</Text>
                        </InlineStack>
                        <Text as="p" variant="bodyMd" tone="subdued">{activeReview.product}</Text>
                      </BlockStack>
                    </InlineStack>
                    <InlineStack gap="200" blockAlign="center">
                      {activeReview.status === 'skipped' ? <Badge tone="attention">Skipped</Badge> : null}
                      {activeReview.status === 'sent' ? <Badge tone="success">Sent</Badge> : null}
                      {activeHasJudgeMeReply ? <Badge tone="success">Judge.me replied</Badge> : null}
                      <Badge>Judge.me</Badge>
                    </InlineStack>
                  </InlineStack>

                  <div className="rp-quote">
                    <Text as="p" variant="bodyMd">"{activeReview.review}"</Text>
                  </div>

                  {activeHasJudgeMeReply ? (
                    <div className="rp-source-reply-card">
                      <BlockStack gap="250">
                        <InlineStack align="space-between" blockAlign="center" gap="300">
                          <InlineStack gap="200" blockAlign="center">
                            <Icon source={ChatIcon} tone="success" />
                            <Text as="h3" variant="headingMd">Judge.me reply</Text>
                          </InlineStack>
                          <Badge tone={activeReview.judgeMeReply?.contentAvailable ? 'success' : 'attention'}>
                            {activeReview.judgeMeReply?.contentAvailable ? 'Imported' : 'Detected'}
                          </Badge>
                        </InlineStack>
                        {activeReview.judgeMeReply?.contentAvailable ? (
                          <Text as="p" variant="bodyMd">{activeReview.judgeMeReply.content}</Text>
                        ) : (
                          <Text as="p" variant="bodyMd" tone="subdued">
                            {activeReview.judgeMeReply?.message || 'Judge.me already has an external reply for this review, but Reply Pulse AI: Review Replies could not import the reply text.'}
                          </Text>
                        )}
                        <InlineStack gap="200" blockAlign="center">
                          <Text as="span" variant="bodySm" tone="subdued">
                            {activeReview.judgeMeReply?.author || 'Judge.me'}
                          </Text>
                          {activeReview.judgeMeReply?.createdAt ? (
                            <Text as="span" variant="bodySm" tone="subdued">
                              {formatReplyDate(activeReview.judgeMeReply.createdAt)}
                            </Text>
                          ) : null}
                        </InlineStack>
                      </BlockStack>
                    </div>
                  ) : null}

                  {activeReview.lastError && !activeHasJudgeMeReply ? (
                    <Banner tone="critical">
                      <BlockStack gap="150">
                        <Text as="p" variant="bodyMd">The last AI generation attempt for this review failed.</Text>
                        <pre className="rp-json-preview is-error">{formatErrorPreview(activeReview.lastError)}</pre>
                      </BlockStack>
                    </Banner>
                  ) : null}

                  {activeHasJudgeMeReply ? (
                    <Banner tone="info">
                      <Text as="p" variant="bodyMd">
                        This review is already answered in Judge.me. Reply Pulse AI: Review Replies cleared the AI draft and will not generate, edit, regenerate, or approve another public reply for it.
                      </Text>
                    </Banner>
                  ) : (
                    <>
                      <InlineStack align="space-between" blockAlign="center">
                        <InlineStack gap="200" blockAlign="center">
                          <span className="rp-ai-heading-icon">
                            <Icon source={MagicIcon} tone="base" />
                          </span>
                          <Text as="h3" variant="headingMd">AI draft</Text>
                        </InlineStack>
                        {activeHasDraft ? (
                          <InlineStack gap="200" blockAlign="center">
                            {activeReview.aiModel ? (
                              <Text as="span" variant="bodySm" tone="subdued">
                                {activeReview.aiModel.name}
                              </Text>
                            ) : null}
                            <ConfidenceMeter value={activeReview.confidence} />
                          </InlineStack>
                        ) : (
                          <Badge tone="info">Not generated</Badge>
                        )}
                      </InlineStack>

                      <div className={`rp-draft-box ${isEditing ? 'is-editing' : ''}`}>
                        {isEditing ? (
                          <BlockStack gap="300">
                            <TextField
                              label="Draft reply"
                              labelHidden
                              value={draftValue}
                              onChange={setDraftValue}
                              multiline={8}
                              autoComplete="off"
                            />
                            <InlineStack align="end" gap="200">
                              <Button onClick={() => { setDraftValue(activeReview.draft); setIsEditing(false); }}>
                                Cancel
                              </Button>
                              <span className="rp-action-button is-save">
                                <Button variant="primary" loading={isSubmitting && actionFetcher.formData?.get('intent') === 'update-draft'} onClick={handleSaveDraft}>
                                  Save draft
                                </Button>
                              </span>
                            </InlineStack>
                          </BlockStack>
                        ) : !activeHasDraft ? (
                          <div className="rp-draft-empty">
                            <DraftPlaceholderIllustration />
                            <Text as="h3" variant="headingMd" alignment="center">Draft not generated yet</Text>
                            <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                              Generate the first message when you are ready. Reply Pulse AI: Review Replies will use Brand Voice, product context, star rating, and this review.
                            </Text>
                          </div>
                        ) : (
                          <Text as="p" variant="bodyLg">{activeReview.draft}</Text>
                        )}
                      </div>
                    </>
                  )}

                  {activeReview.status === 'pending' && activeHasDraft && !activeHasJudgeMeReply ? (
                    <div className="rp-draft-adjuster">
                      <BlockStack gap="250">
                        <InlineStack align="space-between" blockAlign="center" gap="300">
                          <BlockStack gap="050">
                            <Text as="h3" variant="headingMd">Adjust draft</Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              Edit the current draft with a short instruction. This keeps the generated reply as the starting point.
                            </Text>
                          </BlockStack>
                          <Button
                            size="slim"
                            disabled={!aiConfigured || isSubmitting}
                            onClick={() => setShowDraftAdjuster((value) => !value)}
                          >
                            {showDraftAdjuster ? 'Hide' : 'Describe change'}
                          </Button>
                        </InlineStack>
                        {showDraftAdjuster ? (
                          <BlockStack gap="200">
                            <TextField
                              label="Draft change"
                              labelHidden
                              value={draftInstruction}
                              onChange={setDraftInstruction}
                              autoComplete="off"
                              maxLength={100}
                              showCharacterCount
                              placeholder="Example: make it much shorter, warmer, longer, or replace a phrase."
                            />
                            <InlineStack align="end" gap="200">
                              <Button
                                disabled={isSubmitting}
                                onClick={() => {
                                  setDraftInstruction('');
                                  setShowDraftAdjuster(false);
                                }}
                              >
                                Cancel
                              </Button>
                              <AiActionButton
                                className="is-tone"
                                variant="primary"
                                disabled={!aiConfigured || !draftInstruction.trim()}
                                loading={isSubmitting && actionFetcher.formData?.get('intent') === 'revise-draft'}
                                onClick={handleReviseDraft}
                              >
                                Apply change
                              </AiActionButton>
                            </InlineStack>
                          </BlockStack>
                        ) : null}
                      </BlockStack>
                    </div>
                  ) : null}
                </div>

                <div className="rp-detail-footer">
                  <BlockStack gap="300">
                    <InlineStack gap="200" wrap={false}>
                      {activeReview.status === 'skipped' ? (
                        <Button icon={RefreshIcon} variant="primary" size="large" fullWidth loading={isSubmitting && actionFetcher.formData?.get('intent') === 'restore'} onClick={() => submitSingle('restore', activeReview.id)}>
                          Restore to reviews
                        </Button>
                      ) : activeReview.status === 'sent' ? (
                        <Button icon={SendIcon} size="large" fullWidth disabled>
                          Already sent
                        </Button>
                      ) : activeHasJudgeMeReply ? (
                        <span className="rp-action-button is-reject is-full">
                          <Button icon={XIcon} variant="primary" size="large" fullWidth disabled={isSubmitting} loading={isSubmitting && actionFetcher.formData?.get('intent') === 'skip'} onClick={() => submitSingle('skip', activeReview.id)}>
                            Don't reply
                          </Button>
                        </span>
                      ) : !activeHasDraft ? (
                        <AiActionButton className="is-full" variant="primary" size="large" fullWidth disabled={!aiConfigured} loading={isSubmitting && actionFetcher.formData?.get('intent') === 'generate'} onClick={() => submitSingleAiAction('generate', activeReview.id, 'Generating this message')}>
                          Generate message
                        </AiActionButton>
                      ) : (
                        <span className="rp-action-button is-publish is-full">
                          <Button icon={SendIcon} variant="primary" size="large" fullWidth loading={isSubmitting && actionFetcher.formData?.get('intent') === 'send'} onClick={() => submitSingle('send', activeReview.id)}>
                            Approve & send
                          </Button>
                        </span>
                      )}
                      {!activeHasJudgeMeReply ? (
                        <>
                          <Button icon={EditIcon} accessibilityLabel="Edit draft" disabled={activeReview.status !== 'pending'} onClick={() => setIsEditing(true)} />
                          <AiActionButton className="is-icon-only is-secondary" accessibilityLabel="Regenerate draft" disabled={!aiConfigured || isSubmitting || activeReview.status !== 'pending' || !activeHasDraft} onClick={() => submitSingleAiAction('regenerate', activeReview.id, 'Regenerating this draft')} />
                          <span className="rp-action-button is-reject">
                            <Button icon={XIcon} accessibilityLabel="Do not reply" disabled={isSubmitting || activeReview.status !== 'pending'} onClick={() => submitSingle('skip', activeReview.id)} />
                          </span>
                        </>
                      ) : null}
                    </InlineStack>
                    {activeReview.status === 'skipped' ? (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        Restore this message to edit, regenerate, or send it.
                      </Text>
                    ) : activeReview.status === 'sent' ? (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        This reply has already been sent and is shown for review only.
                      </Text>
                    ) : activeHasJudgeMeReply ? (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        Mark it as Don't reply to clear it from Reviews without changing the existing Judge.me reply.
                      </Text>
                    ) : !activeHasDraft ? (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        {activeHasJudgeMeReply
                          ? 'This review is excluded from bulk generation because it already has a Judge.me reply.'
                          : 'Generate a message before approving this reply.'}
                      </Text>
                    ) : (
                      <Text as="p" variant="bodySm" tone="subdued" alignment="center">
                        Enter approve · E edit · J/K next · Cmd A select all
                      </Text>
                    )}
                  </BlockStack>
                </div>
              </>
            ) : (
              <div className="rp-detail-body">
                <Card>
                  <BlockStack gap="250" align="center">
                    <span className="rp-empty-mark rp-detail-empty-mark">
                      <Icon source={MagicIcon} tone="base" />
                    </span>
                    <Text as="h2" variant="headingMd" alignment="center">Nothing selected</Text>
                    <Text as="p" variant="bodyMd" tone="subdued" alignment="center">
                      Select a review when messages appear to inspect the draft and send it.
                    </Text>
                  </BlockStack>
                </Card>
              </div>
            )}
          </aside>
        </div>
      </div>
    </BlockStack>
  );
}

export default function ReviewsPage() {
  return <ReviewsContent />;
}
