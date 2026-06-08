/* eslint-disable react/prop-types */
import {useCallback, useMemo, useState} from 'react';
import {useFetcher, useLoaderData, useLocation} from 'react-router';
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Icon,
  InlineStack,
  Text,
} from '@shopify/polaris';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ConnectIcon,
  MagicIcon,
  SettingsIcon,
  StarIcon,
  WandIcon,
} from '@shopify/polaris-icons';
import BrandVoicePage from './BrandVoicePage';
import {ConnectPanel} from './DashboardPage';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';

const wizardSteps = [
  {id: 'connect', label: 'Connect', icon: ConnectIcon},
  {id: 'builder', label: 'Builder', icon: MagicIcon, brandSection: 'personality-builder'},
  {id: 'voice', label: 'Voice', icon: SettingsIcon, brandSection: 'personality-settings'},
  {id: 'model', label: 'AI model', icon: StarIcon, brandSection: 'ai-model'},
  {id: 'preview', label: 'Preview', icon: WandIcon, brandSection: 'live-preview'},
  {id: 'finish', label: 'Finish', icon: CheckCircleIcon},
];

function WizardProgressBar({currentStepIndex, canContinue, isFinishing, onBack, onNext, onFinish}) {
  const isFirst = currentStepIndex === 0;
  const isLast = wizardSteps[currentStepIndex]?.id === 'finish';

  return (
    <div className="rp-onboarding-progress" aria-label="Setup progress">
      <InlineStack align="space-between" blockAlign="center" gap="300">
        <span className="rp-onboarding-nav-button">
          <Button icon={ArrowLeftIcon} size="large" disabled={isFirst || isFinishing} onClick={onBack}>
            Back
          </Button>
        </span>
        <div className="rp-onboarding-steps">
          {wizardSteps.map((step, index) => {
            const active = index === currentStepIndex;
            const done = index < currentStepIndex;
            return (
              <div key={step.id} className={`rp-onboarding-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}>
                <span className="rp-onboarding-step-number">{done ? '✓' : index + 1}</span>
                <span className="rp-onboarding-step-label">{step.label}</span>
              </div>
            );
          })}
        </div>
        <span className="rp-onboarding-nav-button is-next">
          {isLast ? (
            <Button icon={CheckCircleIcon} variant="primary" size="large" loading={isFinishing} disabled={!canContinue || isFinishing} onClick={onFinish}>
              Finish setup
            </Button>
          ) : (
            <Button icon={ArrowRightIcon} variant="primary" size="large" disabled={!canContinue || isFinishing} onClick={onNext}>
              Next
            </Button>
          )}
        </span>
      </InlineStack>
    </div>
  );
}

function WizardHeader({step}) {
  const copy = {
    connect: {
      title: 'Connect your review source',
      description: 'Start by connecting Judge.me so ReplyPulse AI: Review Replies can read reviews and sync reply status before drafting anything.',
    },
    builder: {
      title: 'Create your first Personality',
      description: 'Choose a preset or generate a voice from past replies. This is the fastest way to give the AI a useful starting point.',
    },
    voice: {
      title: 'Tune how replies should sound',
      description: 'Review the Personality text and adjust the controls that shape greeting, sign-off, length, and wording rules.',
    },
    model: {
      title: 'Choose your AI tier',
      description: 'Pro is selected by default because it gives the best balance of cost, tone matching, and reliability for most shops.',
    },
    preview: {
      title: 'Test your guide before using it',
      description: 'Pick a product, adjust the rating and review text, then generate a preview to see how ReplyPulse AI: Review Replies will answer.',
    },
    finish: {
      title: 'Finalize setup',
      description: 'Save this setup once. After this, ReplyPulse AI: Review Replies will open normally and use these settings for reviews and previews.',
    },
  }[step.id];

  return (
    <InlineStack align="space-between" blockAlign="start" gap="400">
      <BlockStack gap="100">
        <Text as="h1" variant="heading2xl">{copy.title}</Text>
        <Text as="p" variant="bodyLg" tone="subdued">{copy.description}</Text>
      </BlockStack>
      <span className="rp-onboarding-hero-icon">
        <Icon source={step.icon} />
      </span>
    </InlineStack>
  );
}

function appendBrandVoiceConfig(formData, config) {
  formData.set('personality', config.persona || '');
  formData.set('greeting', config.greeting || '');
  formData.set('signOff', config.signOff || '');
  formData.set('alwaysMention', JSON.stringify(config.alwaysMention || []));
  formData.set('avoidPhrases', JSON.stringify(config.avoidPhrases || []));
  formData.set('modelId', config.selectedModel || 'pro');
  formData.set('personalityStyle', config.personalityStyle || 'use_personality');
  formData.set('personalityStrength', config.personalityStrength || 'balanced');
  formData.set('replyLength', config.replyLength || 'adaptive');
  formData.set('livePreview', config.livePreview || '');
  formData.set('previewReview', config.previewReview || '');
  formData.set('previewProductId', config.previewProductId || '');
  formData.set('previewProductTitle', config.previewProductTitle || '');
  formData.set('previewProductType', config.previewProductType || '');
  formData.set('previewProductTags', JSON.stringify(config.previewProductTags || []));
  formData.set('previewRating', config.previewRating || '4');
}

export default function OnboardingPage() {
  const loaderData = useLoaderData();
  const location = useLocation();
  const connectFetcher = useFetcher();
  const finalizeFetcher = useFetcher();
  const finalizeTimeout = useFetcherTimeout(finalizeFetcher, {
    timeoutMs: 25000,
    message: 'Finalizing setup took too long. Please try again later.',
  });
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [showProviderSetup, setShowProviderSetup] = useState(false);
  const [useProductDescription, setUseProductDescription] = useState(Boolean(loaderData.settings?.useProductDescription));
  const [brandVoiceConfig, setBrandVoiceConfig] = useState(loaderData.brandVoice?.settings ?? {});

  const connection = connectFetcher.data && 'connection' in connectFetcher.data
    ? connectFetcher.data.connection
    : loaderData.connection;
  const connected = connection?.status === 'connected';
  const currentStep = wizardSteps[currentStepIndex];
  const brandSection = currentStep.brandSection;
  const connectResult = connectFetcher.data;
  const finalizeResult = finalizeTimeout.result || finalizeFetcher.data;
  const connectActionPath = `/app/dashboard${location.search || ''}`;
  const brandVoiceActionPath = `/app/brand-voice${location.search || ''}`;
  const personaHasText = Boolean((brandVoiceConfig.persona || '').trim());
  const modelSelected = Boolean(brandVoiceConfig.selectedModel || 'pro');
  const canContinue = useMemo(() => {
    if (currentStep.id === 'connect') return connected;
    if (currentStep.id === 'builder') return personaHasText;
    if (currentStep.id === 'voice') return personaHasText;
    if (currentStep.id === 'model') return modelSelected;
    if (currentStep.id === 'finish') return connected && personaHasText && modelSelected;
    return true;
  }, [connected, currentStep.id, modelSelected, personaHasText]);
  const goToStep = useCallback((index) => {
    setCurrentStepIndex(Math.max(0, Math.min(wizardSteps.length - 1, index)));
  }, []);

  const goToBrandSection = useCallback((section) => {
    const index = wizardSteps.findIndex((step) => step.brandSection === section);
    if (index >= 0) goToStep(index);
  }, [goToStep]);

  function finishSetup() {
    const formData = new FormData();
    formData.set('intent', 'complete-onboarding');
    formData.set('useProductDescription', String(Boolean(useProductDescription)));
    appendBrandVoiceConfig(formData, brandVoiceConfig);
    finalizeFetcher.submit(formData, {method: 'post'});
  }

  return (
    <BlockStack gap="400">
      <WizardProgressBar
        currentStepIndex={currentStepIndex}
        canContinue={canContinue}
        isFinishing={finalizeTimeout.pending}
        onBack={() => goToStep(currentStepIndex - 1)}
        onNext={() => goToStep(currentStepIndex + 1)}
        onFinish={finishSetup}
      />
      <WizardHeader step={currentStep} />

      {connectResult?.message ? (
        <Banner tone={connectResult.ok ? 'success' : 'critical'}>{connectResult.message}</Banner>
      ) : null}
      {finalizeResult?.message ? (
        <Banner tone={finalizeResult.ok === false ? 'critical' : 'success'}>{finalizeResult.message}</Banner>
      ) : null}

      {currentStep.id === 'connect' ? (
        <div className="rp-onboarding-connect-panel">
          <ConnectPanel
            connection={connection}
            fetcher={connectFetcher}
            loaderData={loaderData}
            actionPath={connectActionPath}
            showProviderSetup={showProviderSetup}
            onChangeProvider={() => setShowProviderSetup((value) => !value)}
          />
          {connected ? (
            <Banner tone="success">
              Connection verified. You can continue to build the first Brand Voice.
            </Banner>
          ) : null}
        </div>
      ) : null}

      {brandSection ? (
        <BrandVoicePage
          data={loaderData.brandVoice}
          actionPath={brandVoiceActionPath}
          embedded
          activeSection={brandSection}
          onActiveSectionChange={goToBrandSection}
          useProductDescription={useProductDescription}
          onUseProductDescriptionChange={setUseProductDescription}
          replyCreditMultiplier={useProductDescription ? loaderData.productDescriptionCreditMultiplier : 1}
          defaultSelectedModelOverride="pro"
          hideSaveBar
          onConfigChange={setBrandVoiceConfig}
          onSkipPersonalityBuilder={() => goToBrandSection('personality-settings')}
          suppressPreviewFallback={currentStep.id === 'preview'}
          livePreviewDescription={currentStep.id === 'preview' ? 'Use this sample review as a starting point, or replace it with a real review from your store before generating the preview.' : undefined}
          hideSentReplyLoader
        />
      ) : null}

      {currentStep.id === 'finish' ? (
        <Card>
          <Box padding="0">
            <div className="rp-onboarding-finish-card">
              <span className="rp-onboarding-finish-icon"><Icon source={CheckCircleIcon} /></span>
              <BlockStack gap="250" align="center">
                <Text as="h2" variant="heading2xl" alignment="center">ReplyPulse AI: Review Replies is ready</Text>
                <Text as="p" variant="bodyLg" tone="subdued" alignment="center">
                  Your review source, brand voice, AI model, and preview test are configured. You can now start reviewing customer messages and generating replies.
                </Text>
              </BlockStack>

              <div className="rp-onboarding-finish-checks">
                {[
                  'Review source connected',
                  'Brand voice prepared',
                  'AI reply workflow ready',
                ].map((item) => (
                  <div className="rp-onboarding-finish-check" key={item}>
                    <Icon source={CheckCircleIcon} tone="success" />
                    <Text as="span" variant="bodyMd" fontWeight="medium">{item}</Text>
                  </div>
                ))}
              </div>

              <Button
                icon={ArrowRightIcon}
                variant="primary"
                size="large"
                loading={finalizeTimeout.pending}
                disabled={!canContinue || finalizeTimeout.pending}
                onClick={finishSetup}
              >
                Go to Reviews
              </Button>
            </div>
          </Box>
        </Card>
      ) : null}
    </BlockStack>
  );
}
