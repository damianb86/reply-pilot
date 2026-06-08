/* eslint-disable react/prop-types */
import {useEffect} from 'react';
import {useFetcher, useLoaderData, useLocation, useRevalidator} from 'react-router';
import {
  Badge,
  Banner,
  BlockStack,
  Button,
  Card,
  InlineGrid,
  InlineStack,
  Text,
} from '@shopify/polaris';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';

function formatCreditNumber(value) {
  const numeric = Number(value || 0);
  const sign = numeric < 0 ? '-' : '';
  const absolute = Math.abs(numeric);
  const hasDecimals = !Number.isInteger(absolute);
  return `${sign}${absolute.toLocaleString('en', {
    minimumFractionDigits: hasDecimals ? 1 : 0,
    maximumFractionDigits: hasDecimals ? 1 : 0,
  })}`;
}

function creditWord(value) {
  return Number(value) === 1 ? 'credit' : 'credits';
}

function LedgerAmount({amount}) {
  const positive = amount > 0;
  return (
    <Badge tone={positive ? 'success' : 'attention'}>
      {positive ? '+' : ''}{formatCreditNumber(amount)} credits
    </Badge>
  );
}

function PackageCard({pkg, fetcher, pending}) {
  const isLoading = pending && fetcher.formData?.get('packageId') === pkg.id;
  const hasWelcomeBonus = Boolean(pkg.firstPurchaseBonusAvailable && pkg.firstPurchaseBonusCredits);

  return (
    <Card>
      <BlockStack gap="300">
        <InlineStack align="space-between" blockAlign="start" gap="300">
          <BlockStack gap="050">
            <InlineStack gap="150" blockAlign="center">
              <Text as="h2" variant="headingLg">{pkg.name}</Text>
              {pkg.recommended ? <Badge tone="success">Recommended</Badge> : null}
            </InlineStack>
            <Text as="p" variant="bodyMd" tone="subdued">{pkg.description}</Text>
          </BlockStack>
          <Text as="span" variant="headingLg">{pkg.priceLabel}</Text>
        </InlineStack>
        <InlineStack align="space-between" blockAlign="center" gap="200" wrap={false}>
          <InlineStack gap="150" blockAlign="center" wrap={false}>
            <span className="rp-credit-package-stack">
              <span className="rp-credit-package-base">{formatCreditNumber(pkg.credits)} credits</span>
              {hasWelcomeBonus ? (
                <span className="rp-credit-package-bonus" title="First purchase total with welcome bonus">
                  {formatCreditNumber(pkg.firstPurchaseTotalCredits)} credits
                </span>
              ) : null}
            </span>
          </InlineStack>
          <fetcher.Form method="post" className="rp-credit-buy-form">
            <input type="hidden" name="packageId" value={pkg.id} />
            <span className={`rp-credit-buy-button-wrap ${hasWelcomeBonus ? 'has-welcome-bonus' : ''}`}>
              <Button submit loading={isLoading} disabled={pending} variant={pkg.recommended ? 'primary' : undefined}>
                Buy {formatCreditNumber(hasWelcomeBonus ? pkg.firstPurchaseTotalCredits : pkg.credits)}
              </Button>
            </span>
          </fetcher.Form>
        </InlineStack>
      </BlockStack>
    </Card>
  );
}

function replyCapacity(credits, replyCost) {
  const cost = Number(replyCost || 1);
  return formatCreditNumber(Math.floor(Number(credits || 0) / cost));
}

function ModelSpendCard({name, costs}) {
  return (
    <Card>
      <BlockStack gap="150">
        <BlockStack gap="050">
          <Text as="p" variant="headingMd">{name}</Text>
          <Text as="p" variant="bodySm" tone="subdued">AI model tier</Text>
        </BlockStack>
        <Text as="p" variant="bodyMd">
          The AI agent spends {formatCreditNumber(costs.reply)} {creditWord(costs.reply)} per review reply.
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          With this model, 1.000 credits answers about {replyCapacity(1000, costs.reply)} review replies.
        </Text>
        <Text as="p" variant="bodySm" tone="subdued">
          Live previews use {formatCreditNumber(costs.preview)} {creditWord(costs.preview)}. Personality uses {formatCreditNumber(costs.personality)} credits.
        </Text>
      </BlockStack>
    </Card>
  );
}

export default function CreditsPage() {
  const loaderData = useLoaderData();
  const purchaseFetcher = useFetcher();
  const location = useLocation();
  const revalidator = useRevalidator();
  const credits = loaderData.credits;
  const modelCosts = credits.modelCosts ?? {};
  const actionData = purchaseFetcher.data;
  const timeout = useFetcherTimeout(purchaseFetcher, {
    timeoutMs: 30000,
    message: 'Starting the Shopify billing approval took too long. Please try again later.',
    intent: 'buy-credits',
  });
  const actionResult = timeout.result || actionData;
  const message = actionResult?.message ?? loaderData.message;
  const ok = actionResult?.ok ?? loaderData.ok;
  const purchaseId = new URLSearchParams(location.search).get('credit_purchase');
  const purchasePending = Boolean(
    purchaseId &&
      ok === false &&
      typeof message === 'string' &&
      message.toLowerCase().includes('still confirming'),
  );
  const shouldPollPurchase = Boolean(
    purchaseId &&
      loaderData.ok === false &&
      typeof loaderData.message === 'string' &&
      loaderData.message.toLowerCase().includes('still confirming'),
  );

  useEffect(() => {
    if (!actionData?.confirmationUrl) return;
    try {
      window.top.location.href = actionData.confirmationUrl;
    } catch {
      window.location.href = actionData.confirmationUrl;
    }
  }, [actionData?.confirmationUrl]);

  useEffect(() => {
    if (!shouldPollPurchase) return undefined;

    let attempts = 0;
    const interval = window.setInterval(() => {
      attempts += 1;
      revalidator.revalidate();
      if (attempts >= 6) window.clearInterval(interval);
    }, 2000);

    return () => window.clearInterval(interval);
  }, [revalidator, shouldPollPurchase]);

  return (
    <BlockStack gap="400">
      {message ? (
        <Banner tone={ok ? 'success' : purchasePending ? 'info' : 'critical'}>
          <Text as="p" variant="bodyMd">{message}</Text>
        </Banner>
      ) : null}

      <InlineStack align="space-between" blockAlign="end" gap="300">
        <BlockStack gap="100">
          <Text as="h1" variant="heading2xl">Credits</Text>
          <Text as="p" variant="bodyLg" tone="subdued">
            Credits are assigned to this shop and are spent only when ReplyPulse AI: Review Replies generates AI content.
          </Text>
        </BlockStack>
        <Badge tone={credits.balance <= 25 ? 'critical' : 'info'}>{formatCreditNumber(credits.balance)} credits left</Badge>
      </InlineStack>

      <InlineGrid columns={{xs: 1, md: 3}} gap="300">
        <Card>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" tone="subdued">Available</Text>
            <Text as="p" variant="headingXl">{formatCreditNumber(credits.balance)}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" tone="subdued">Spent</Text>
            <Text as="p" variant="headingXl">{formatCreditNumber(credits.spent)}</Text>
          </BlockStack>
        </Card>
        <Card>
          <BlockStack gap="050">
            <Text as="span" variant="bodySm" tone="subdued">Purchased</Text>
            <Text as="p" variant="headingXl">{formatCreditNumber(credits.purchased)}</Text>
          </BlockStack>
        </Card>
      </InlineGrid>

      <section className="rp-field-card">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="start" gap="300">
            <BlockStack gap="050">
              <Text as="h2" variant="headingLg">Buy credits</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Purchases use Shopify billing. After approval, credits are added to this shop automatically.
              </Text>
            </BlockStack>
            {credits.firstPurchaseBonusAvailable ? (
              <div className="rp-credit-welcome-bonus">
                <Text as="p" variant="bodyMd" fontWeight="semibold">
                  First purchase bonus: +{credits.firstPurchaseBonusPercent}% extra credits
                </Text>
              </div>
            ) : null}
          </InlineStack>
          <InlineGrid columns={{xs: 1, sm: 2, lg: 4}} gap="300">
            {credits.packages.map((pkg) => (
              <PackageCard key={pkg.id} pkg={pkg} fetcher={purchaseFetcher} pending={timeout.pending} />
            ))}
          </InlineGrid>
        </BlockStack>
      </section>

      <section className="rp-field-card">
        <BlockStack gap="300">
          <BlockStack gap="050">
            <Text as="h2" variant="headingLg">AI model credit usage</Text>
            <Text as="p" variant="bodyMd" tone="subdued">
              Credits are spent when the AI agent generates replies, live previews, or Personality drafts. The cost depends on the AI model tier selected in Settings.
            </Text>
            {credits.useProductDescription && Number(credits.productDescriptionMultiplier) > 1 ? (
              <Badge tone="info">Product descriptions enabled: reply costs are {formatCreditNumber(credits.productDescriptionMultiplier)}x</Badge>
            ) : null}
          </BlockStack>
          <InlineGrid columns={{xs: 1, md: 3}} gap="300">
            <ModelSpendCard name="Basic" costs={modelCosts.basic ?? {reply: 1, personality: 2}} />
            <ModelSpendCard name="Pro" costs={modelCosts.pro ?? {reply: 4, personality: 8}} />
            <ModelSpendCard name="Premium" costs={modelCosts.premium ?? {reply: 12, personality: 24}} />
          </InlineGrid>
        </BlockStack>
      </section>

      <section className="rp-field-card">
        <BlockStack gap="300">
          <Text as="h2" variant="headingLg">Recent activity</Text>
          {loaderData.recentLedger.length ? (
            <BlockStack gap="0">
              {loaderData.recentLedger.map((entry) => (
                <div key={entry.id} className="rp-field-row">
                  <InlineStack align="space-between" blockAlign="center" gap="300">
                    <BlockStack gap="050">
                      <Text as="p" variant="bodyMd" fontWeight="semibold">{entry.description}</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Balance after: {formatCreditNumber(entry.balanceAfter)}
                      </Text>
                    </BlockStack>
                    <LedgerAmount amount={entry.amount} />
                  </InlineStack>
                </div>
              ))}
            </BlockStack>
          ) : (
            <Text as="p" variant="bodyMd" tone="subdued">No credit activity yet.</Text>
          )}
        </BlockStack>
      </section>
    </BlockStack>
  );
}
