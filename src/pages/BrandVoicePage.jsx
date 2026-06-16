/* eslint-disable react/prop-types, react/no-unescaped-entities */
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {useFetcher, useLoaderData} from 'react-router';
import {SaveBar, useAppBridge} from '@shopify/app-bridge-react';
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Checkbox,
  Divider,
  Icon,
  InlineGrid,
  InlineStack,
  RangeSlider,
  Select,
  Tag,
  Text,
  TextField,
} from '@shopify/polaris';
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  DeleteIcon,
  ChatIcon,
  ImageMagicIcon,
  InfoIcon,
  LightbulbIcon,
  MagicIcon,
  PageHeartIcon,
  PauseCircleIcon,
  PlayCircleIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckMarkIcon,
  SmileyJoyIcon,
  StarFilledIcon,
  XIcon,
} from '@shopify/polaris-icons';
import {
  defaultAvoidPhrases,
  defaultBrandVoice,
} from '../brandVoiceData';
import {useFetcherTimeout} from '../hooks/useFetcherTimeout';

export const brandVoiceSettingsSections = [
  {id: 'personality-builder', label: 'Personality builder'},
  {id: 'personality-settings', label: 'Personality settings'},
  {id: 'ai-model', label: 'AI model'},
  {id: 'live-preview', label: 'Live preview'},
];
const defaultAlwaysMention = ['product detail', 'what the customer noticed', 'next step when needed'];
const defaultPreviewReview = 'Obsessed with these napkins. The fabric feels substantial, the print looks even better in person, and they made our dinner table feel special.';
const tonePresetOptions = [
  {label: 'Use personality', value: 'use_personality', description: 'No extra tone nudge. ReplyPulse follows the Personality text as the source of truth.'},
  {label: 'More formal', value: 'formal', description: 'Adds polish, restraint, and more precise wording when drafting replies.'},
  {label: 'More casual', value: 'casual', description: 'Makes replies feel more relaxed and conversational without becoming sloppy.'},
  {label: 'Warmer', value: 'warm', description: 'Adds more appreciation and emotional presence, especially around customer concerns.'},
  {label: 'More playful', value: 'playful', description: 'Adds a light upbeat touch when the review gives room for it.'},
  {label: 'More direct', value: 'direct', description: 'Keeps replies practical, clear, and lower-friction.'},
  {label: 'More premium', value: 'premium', description: 'Adds a more composed, refined, and detail-aware feel.'},
];
const personalityStrengthOptions = [
  {label: 'Subtle', value: 'subtle', description: 'Light voice layer. Best when replies should feel clean and mostly support-led.'},
  {label: 'Balanced', value: 'balanced', description: 'Noticeable voice without overwhelming the message. Best default for most shops.'},
  {label: 'Expressive', value: 'expressive', description: 'Stronger character. Useful when the brand voice is part of the customer experience.'},
];
const replyLengthOptions = [
  {label: 'Adaptive', value: 'adaptive', description: 'Lets ReplyPulse choose the right length based on rating, detail, and complexity.'},
  {label: 'Short', value: 'short', description: '1-2 sentences. Best for simple positive reviews and quick acknowledgement.'},
  {label: 'Medium', value: 'medium', description: '2-4 sentences. Enough room for one or two specifics without feeling heavy.'},
  {label: 'Long', value: 'long', description: '4-6 sentences. Useful for mixed, detailed, or negative reviews that need care.'},
  {label: 'Very long', value: 'very_long', description: 'Detailed support-style reply. Use sparingly for complex public responses.'},
];
const defaultTonePreset = 'use_personality';
const defaultVoiceIntensity = 'balanced';
const defaultReplyLength = 'adaptive';
const personalityMaxWords = 200;
const personalityMaxCharacters = 1400;
const previewRatingValues = [1, 2, 3, 4, 5];
const sentReplyOptions = [
  {label: 'Last 5 sent replies', value: '5'},
  {label: 'Last 10 sent replies', value: '10'},
  {label: 'Last 25 sent replies', value: '25'},
  {label: 'Last 50 sent replies', value: '50'},
];
const manualReplyMaxCharacters = 1000;
const bulkReplyMaxCharacters = 12000;

const presetPreviewReviews = [
  {
    rating: 1,
    review: 'My order never arrived and I have not received any update.',
  },
  {
    rating: 2,
    review: 'The package arrived damaged and the product box was crushed.',
  },
  {
    rating: 3,
    review: 'It works, but the quality feels more basic than I expected.',
  },
  {
    rating: 4,
    review: 'Good product overall, but shipping took longer than expected.',
  },
  {
    rating: 5,
    review: 'Really happy with this. It looks good and works as expected.',
  },
];

const personalityPresets = [
  {
    id: 'warm-small-team',
    name: 'Warm',
    icon: PageHeartIcon,
    tone: 'warm',
    summary: 'Human, attentive, and grounded for most stores.',
    tags: ['Warm', 'General', 'Trust'],
    persona: `Brand personality: warm, attentive, and genuinely human.

This voice feels like a small team that actually reads every review. It is kind, grateful, specific, and calm without becoming overly familiar. The brand notices concrete details and sounds present rather than scripted.

Basic rules: stay grounded in what the customer said, avoid exaggerated emotion, do not sound corporate or defensive, and never promise anything the business cannot guarantee.

The goal is to make customers feel seen by real people who care about the product and the post-purchase experience.`,
    previewReplies: [
      "Hi there - I'm really sorry your order still has not arrived. That is frustrating, and it is not the experience we want you waiting through. Please send us your order details so we can look into the shipment and help with the next step.",
      "Hi there - I'm sorry the package arrived in that condition. Thanks for letting us know; crushed packaging is disappointing, especially when you were expecting everything to arrive ready to use. Please send us a photo and your order details so we can take a closer look.",
      "Hi there - thank you for being honest about that. I'm glad it works, but I understand that the feel did not fully match what you expected. We appreciate the feedback and will keep it in mind as we review the product experience.",
      "Hi there - thank you for the kind words about the product, and I'm sorry shipping took longer than expected. We know timing matters, and we appreciate your patience while it made its way to you.",
      "Hi there - thank you so much for sharing this. We're really glad it looks good and works the way you hoped. We appreciate you taking the time to leave such a thoughtful review.",
    ],
  },
  {
    id: 'premium-concierge',
    name: 'Premium',
    icon: StarFilledIcon,
    tone: 'premium',
    summary: 'Composed and refined for higher-touch brands.',
    tags: ['Premium', 'Calm', 'Refined'],
    persona: `Brand personality: polished, composed, and quietly premium.

This voice has the restraint of a thoughtful concierge: respectful, precise, and calm. It feels elevated but not cold. It uses clean language, avoids hype, and makes customers feel that their feedback is being handled with care.

Basic rules: do not over-explain, do not sound alarmed, keep claims measured, and communicate confidence, taste, and accountability.

The goal is to make every response feel considered, professional, and worthy of a brand that pays attention to details.`,
    previewReplies: [
      'Hi there - thank you for bringing this to our attention. An order that has not arrived deserves a careful follow-up, and we are sorry for the delay and lack of clarity. Please share your order details so our team can review the shipment and advise on the next step.',
      'Hi there - we are sorry your package arrived damaged. That is not the condition we want any order to be received in, and we appreciate you letting us know. Please send your order details and a photo so we can review this properly.',
      'Hi there - thank you for the candid feedback. We are glad the product is working for you, though we understand it did not feel as elevated as expected. Your note is helpful as we continue refining the product experience.',
      'Hi there - thank you for your thoughtful review. We are pleased the product met expectations overall, and we regret that the delivery timing was slower than it should have been. We appreciate your patience.',
      'Hi there - thank you for the lovely review. We are so pleased the product looks good and performs as expected. Your feedback means a great deal to our team.',
    ],
  },
  {
    id: 'direct-product-expert',
    name: 'Expert',
    icon: LightbulbIcon,
    tone: 'expert',
    summary: 'Practical and knowledgeable when shoppers care about details.',
    tags: ['Direct', 'Useful', 'Expert'],
    persona: `Brand personality: practical, knowledgeable, and product-first.

This voice sounds like an experienced product specialist who wants customers to get useful information quickly. It is direct, helpful, and grounded in what the customer actually said. It values clarity over performance.

Basic rules: avoid fluff, vague praise, and generic customer-service language. Do not invent technical details, product claims, policies, fixes, or anything not supported by the review or product context.

The goal is to make replies feel useful to both the reviewer and future shoppers reading the public thread.`,
    previewReplies: [
      'Hi there - thanks for flagging this. If the order has not arrived and there has been no update, the next useful step is for us to check the shipment details directly. Please send your order information so we can review what happened.',
      'Hi there - thanks for the clear note. Damaged outer packaging and a crushed product box should be reviewed with the order details and photos, so we can understand the condition it arrived in. Please send those through and we will take a look.',
      'Hi there - thanks for the straightforward feedback. It is helpful to know the product works but feels more basic than expected. We will use that as product feedback, especially around how expectations are set before purchase.',
      'Hi there - thank you for the review. It is good to hear the product worked well overall, and the slower shipping is useful feedback for us to track separately from the product experience.',
      'Hi there - thank you for sharing this. We are glad the product looks good and performs as expected. That is exactly the kind of clear product feedback future shoppers look for.',
    ],
  },
  {
    id: 'playful-community',
    name: 'Playful',
    icon: SmileyJoyIcon,
    tone: 'playful',
    summary: 'Social, lively, and lightly witty without becoming silly.',
    tags: ['Playful', 'Friendly', 'Social'],
    persona: `Brand personality: upbeat, friendly, and lightly playful.

This voice talks like a confident community host: conversational, appreciative, and a little witty when the moment allows it. It feels energetic but still clear. Humor is light, inclusive, and never at the customer's expense.

Basic rules: avoid forced jokes, unnatural slang, or overusing exclamation points. When a customer is upset, keep the warmth but do not joke over the concern.

The goal is to make replies feel alive, social, and memorable while still helping the customer and protecting trust.`,
    previewReplies: [
      "Hi there - oh no, an order should not disappear into the void. I'm really sorry it never arrived and that you were left without an update. Send us your order details and we will help look into where things stand.",
      "Hi there - that is definitely not the unboxing moment we want for you. I'm sorry the package showed up damaged and crushed. Please send a photo and your order details so we can take a closer look.",
      'Hi there - thank you for the honest take. Glad it works, but we hear you that the quality felt more basic than expected. That kind of feedback helps us keep the product experience honest and useful.',
      "Hi there - thanks for sticking with it through the slower shipping. We're glad the product landed well overall, even if the wait was not ideal. We appreciate you sharing both sides.",
      "Hi there - love hearing this. We're so glad it looks good, works well, and did what you needed it to do. Thanks for making our day with this review.",
    ],
  },
  {
    id: 'calm-problem-solver',
    name: 'Calm',
    icon: ShieldCheckMarkIcon,
    tone: 'calm',
    summary: 'Steady and accountable for support-sensitive brands.',
    tags: ['Support', 'Calm', 'Safe'],
    persona: `Brand personality: calm, accountable, and solution-oriented.

This voice is especially careful with frustration, low ratings, delivery issues, defects, and mixed feedback. It is steady, respectful, and practical. It acknowledges customer experience without arguing, minimizing, or sounding like a policy script.

Basic rules: avoid blame, defensiveness, excessive apology, and vague phrases like "we strive to do better." Only mention next steps that are realistic and supported.

The goal is to make customers feel that the brand is composed, fair, and capable of handling problems responsibly.`,
    previewReplies: [
      "Hi there - I'm sorry your order has not arrived and that you have not received an update. That needs a closer look. Please send us your order details so we can review the shipment and help with the next step.",
      "Hi there - I'm sorry the package arrived damaged. Please send a photo of the packaging and your order details so we can review the condition it arrived in and help from there.",
      'Hi there - thank you for sharing this honestly. It is helpful to know the product works, but the quality did not fully meet your expectations. We will take that feedback seriously.',
      "Hi there - thank you for the balanced review. I'm glad the product was good overall, and I understand that delayed shipping affected the experience. We appreciate your patience.",
      'Hi there - thank you for your review. We are glad the product looks good and works as expected. We appreciate you taking the time to share your experience.',
    ],
  },
  {
    id: 'theatrical-roast',
    name: 'Bold',
    icon: ImageMagicIcon,
    tone: 'bold',
    summary: 'Sharp, performative, and intentionally absurd.',
    tags: ['Sarcastic', 'Bold', 'Comedic'],
    persona: `Brand personality: sarcastic, theatrical, hostile in a funny way, and intentionally rude as a clear performance.

This voice treats customers like charming little disasters who somehow managed to buy the product correctly. It feels like a cruel comedian forced to work in customer support: dry, sharp, arrogant, and entertaining, but still functional.

Basic rules: the cruelty is performative and witty, not genuinely harmful. The voice can roast, exaggerate, and show playful contempt, but it must stay useful and clearly absurd.

The goal is to make the customer feel roasted, not genuinely harmed. Avoid real threats, protected-class insults, body, identity, or health attacks, and anything that feels like actual harassment.`,
    previewReplies: [
      'Hi there - your order appears to have taken a dramatic side quest instead of arriving like a normal package with a job. Annoying, and not okay. Send us your order details so we can investigate this little shipping performance.',
      "Hi there - crushed packaging is a bold design choice, unfortunately not one we ordered. I'm sorry it arrived that way. Send us a photo and your order details so we can inspect the damage and help from there.",
      'Hi there - fair enough. It works, but did not exactly sweep you off your feet and write poetry about craftsmanship. We appreciate the honest feedback and will use it to keep expectations clear.',
      'Hi there - thank you for the review. The product did its job, while shipping apparently chose to walk there slowly and reflect on life. We appreciate your patience and the balanced feedback.',
      'Hi there - excellent, the product behaved itself and looked good doing it. A rare moment of retail peace. Thank you for the lovely review; we are glad it worked as expected.',
    ],
  },
];

function RuleTags({items, onRemove}) {
  return (
    <div className="rp-tag-list">
      {items.map((item) => (
        <Tag key={item} onRemove={() => onRemove(item)}>{item}</Tag>
      ))}
    </div>
  );
}

function AddRule({value, onChange, onAdd, placeholder, label}) {
  return (
    <InlineStack gap="200" blockAlign="end">
      <div style={{flex: 1}}>
        <TextField
          label={label}
          labelHidden
          value={value}
          onChange={onChange}
          autoComplete="off"
          placeholder={placeholder}
        />
      </div>
      <Button icon={PlusIcon} accessibilityLabel={label} onClick={onAdd} />
    </InlineStack>
  );
}

function ExampleRow({example, onRemove}) {
  return (
    <div className="rp-example-row">
      <span className="rp-rating-chip">{example.rating ? `${example.rating}★` : 'Reply'}</span>
      <BlockStack gap="050">
        <Text as="p" variant="bodyMd">
          <span className="rp-line-clamp">{example.text}</span>
        </Text>
        {example.source ? (
          <Text as="span" variant="bodySm" tone="subdued">{example.source}</Text>
        ) : null}
      </BlockStack>
      <Button icon={DeleteIcon} variant="plain" accessibilityLabel="Remove example reply" onClick={onRemove} />
    </div>
  );
}

function mergeExampleReplies(current, incoming) {
  const seen = new Set();
  const merged = [];

  for (const reply of [...incoming, ...current]) {
    const text = String(reply?.text ?? '').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push({
      ...reply,
      text,
      id: reply.id || `reply-${merged.length}`,
      source: reply.source || 'Example reply',
    });
    if (merged.length >= 50) break;
  }

  return merged;
}

function splitBulkReplyText(value) {
  const normalized = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blankSeparated = normalized
    .split(/\n{2,}/)
    .map((reply) => reply.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const candidates = blankSeparated.length > 1
    ? blankSeparated
    : normalized
      .split(/\n+/)
      .map((reply) => reply.trim())
      .filter(Boolean);

  const seen = new Set();
  return candidates
    .map((reply) => reply.replace(/^\s*(?:[-*•]\s+|\d+[.)]\s+)/, '').trim())
    .filter((reply) => {
      const key = reply.toLowerCase();
      if (!reply || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 50);
}

function creditsText(amount) {
  const credits = Number(amount ?? 0);
  if (!credits) return 'free';
  const hasDecimals = !Number.isInteger(Math.abs(credits));
  const formatted = credits.toLocaleString('en', {
    minimumFractionDigits: hasDecimals ? 1 : 0,
    maximumFractionDigits: hasDecimals ? 1 : 0,
  });
  return `${formatted} credit${credits === 1 ? '' : 's'}`;
}

function creditsNumber(amount) {
  const credits = Number(amount ?? 0);
  const hasDecimals = !Number.isInteger(Math.abs(credits));
  return credits.toLocaleString('en', {
    minimumFractionDigits: hasDecimals ? 1 : 0,
    maximumFractionDigits: hasDecimals ? 1 : 0,
  });
}

function replyCostBadge(model, multiplier = 1) {
  const credits = Number(model.credits?.reply ?? 0) * Number(multiplier || 1);
  if (!credits) return 'Free';
  return `${creditsText(credits)} / reply`;
}

function ModelCard({model, selected, onSelect, replyCreditMultiplier = 1}) {
  return (
    <button
      type="button"
      className={`rp-model-card ${selected ? 'is-selected' : ''}`}
      onClick={onSelect}
      aria-pressed={selected}
    >
      <BlockStack gap="400">
        <div className="rp-model-card-header">
          <span className="rp-model-radio" aria-hidden="true" />
          <BlockStack gap="150">
            <InlineStack gap="200" blockAlign="center" wrap={false}>
              <Text as="span" variant="headingLg">{model.name}</Text>
              <Badge tone="info">{replyCostBadge(model, replyCreditMultiplier)}</Badge>
            </InlineStack>
          </BlockStack>
        </div>

        <BlockStack gap="300">
          <BlockStack gap="150">
            <Text as="h3" variant="headingMd">{model.bestFor}</Text>
            <Text as="p" variant="bodyMd" tone="subdued">{model.description}</Text>
          </BlockStack>
          {model.strengths?.length ? (
            <div className="rp-model-strengths">
              {model.strengths.map((strength) => (
                <Badge key={strength}>{strength}</Badge>
              ))}
            </div>
          ) : null}

          {model.activeVariant ? (
            <InlineStack gap="150" blockAlign="center">
              <Badge tone="info">Current dev fallback</Badge>
            </InlineStack>
          ) : null}

          {model.exhaustedVariants?.length ? (
            <Text as="span" variant="bodySm" tone="subdued">
              Exhausted today: {model.exhaustedVariants.map((variant) => variant.name).join(', ')}
            </Text>
          ) : null}
        </BlockStack>
      </BlockStack>
    </button>
  );
}

function CreditInfoPanel() {
  return (
    <div className="rp-credit-info-panel">
      <span className="rp-credit-info-icon" aria-hidden="true">
        <Icon source={InfoIcon} />
      </span>
      <BlockStack gap="100">
        <Text as="h3" variant="headingMd">How credits work</Text>
        <Text as="p" variant="bodyMd" tone="subdued">
          The selected tier is used for queue replies, live preview, and personality generation. Higher tiers use more credits, but follow brand voice and product context more carefully.
        </Text>
      </BlockStack>
    </div>
  );
}

function ProductDescriptionContextPanel({
  checked,
  onChange,
}) {
  return (
    <div className="rp-product-context-option">
      <BlockStack gap="200">
        <Checkbox
          label="Use product descriptions"
          checked={checked}
          onChange={onChange}
          disabled={!onChange}
        />
        <Text as="p" variant="bodyMd" tone="subdued">
          Keep this enabled to let ReplyPulse read cleaned Shopify product descriptions when drafting replies. Turn it off if you want responses based only on the review, product title, tags, and rating.
        </Text>
      </BlockStack>
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

function PreviewRatingPicker({value, onChange}) {
  return (
    <StarRatingPicker
      value={value}
      onChange={onChange}
      label="Preview rating"
      helpText="The reply changes tone based on the customer rating."
    />
  );
}

function StarRatingPicker({value, onChange, label, helpText}) {
  const selectedRating = Math.max(1, Math.min(5, Number(value) || 5));
  const tone = selectedRating <= 2 ? 'critical' : selectedRating === 3 ? 'attention' : 'success';

  return (
    <BlockStack gap="150">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="p" variant="bodyMd" fontWeight="semibold">{label}</Text>
        <Badge tone={tone}>{selectedRating} out of 5</Badge>
      </InlineStack>
      <div className="rp-preview-rating-picker" role="radiogroup" aria-label={label}>
        {previewRatingValues.map((rating) => (
          <button
            key={rating}
            type="button"
            className={`rp-preview-rating-option ${rating === selectedRating ? 'is-selected' : ''} ${rating <= selectedRating ? 'is-filled' : ''}`}
            role="radio"
            aria-checked={rating === selectedRating}
            aria-label={`${rating} out of 5 stars`}
            onClick={() => onChange(String(rating))}
          >
            <span aria-hidden="true">★</span>
          </button>
        ))}
      </div>
      {helpText ? <Text as="p" variant="bodySm" tone="subdued">{helpText}</Text> : null}
    </BlockStack>
  );
}

function presetPreviewItems(preset) {
  return presetPreviewReviews.map((review, index) => ({
    ...review,
    reply: preset?.previewReplies?.[index] || '',
  }));
}

function presetIdForPersona(value) {
  return personalityPresets.find((preset) => preset.persona.trim() === String(value ?? '').trim())?.id;
}

function PreviewStars({rating}) {
  return (
    <span className="rp-preset-preview-stars" aria-label={`${rating} out of 5 stars`}>
      {presetPreviewReviews.map((_, index) => (
        <span key={index} className={index >= rating ? 'is-empty' : undefined}>★</span>
      ))}
    </span>
  );
}

function tagKey(tag) {
  return String(tag ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function PersonalityPresetPreviewPanel({
  isPaused,
  onNext,
  onPrevious,
  onTogglePause,
  preset,
  previewIndex,
}) {
  const previews = presetPreviewItems(preset);
  const preview = previews[previewIndex % previews.length] ?? previews[0];
  const currentPreviewNumber = (previewIndex % previews.length) + 1;

  return (
    <aside className="rp-personality-preview-panel" aria-label="Live personality preview">
      <BlockStack gap="300">
        <BlockStack gap="050">
          <Text as="h3" variant="headingMd">Live personality preview</Text>
          <Text as="p" variant="bodySm" tone="subdued">
            Common reviews rotate with saved replies for the selected preset.
          </Text>
        </BlockStack>

        <div key={`${preset.id}-${preview.rating}`} className="rp-preset-preview-frame">
          <div className="rp-preset-preview-review">
            <InlineStack align="space-between" blockAlign="start" gap="200">
              <Text as="span" variant="bodySm" fontWeight="semibold">Original review</Text>
              <PreviewStars rating={preview.rating} />
            </InlineStack>
            <Text as="p" variant="bodyMd">{preview.review}</Text>
          </div>

          <div className="rp-preset-preview-reply">
            <Text as="span" variant="bodySm" fontWeight="semibold">AI reply preview</Text>
            <Text as="p" variant="bodyMd">{preview.reply}</Text>
          </div>
        </div>

        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Badge tone="info">{preset.name}</Badge>
          <InlineStack gap="100" blockAlign="center" wrap={false}>
            <Text as="span" variant="bodySm" tone="subdued">
              {currentPreviewNumber}/{previews.length}
            </Text>
            <div className="rp-preset-preview-controls" aria-label="Preview controls">
              <button
                type="button"
                className="rp-preset-preview-control"
                onClick={onPrevious}
                aria-label="Previous preview"
              >
                <Icon source={ChevronLeftIcon} />
              </button>
              <button
                type="button"
                className="rp-preset-preview-control"
                onClick={onTogglePause}
                aria-label={isPaused ? 'Resume preview rotation' : 'Pause preview rotation'}
              >
                <Icon source={isPaused ? PlayCircleIcon : PauseCircleIcon} />
              </button>
              <button
                type="button"
                className="rp-preset-preview-control"
                onClick={onNext}
                aria-label="Next preview"
              >
                <Icon source={ChevronRightIcon} />
              </button>
            </div>
          </InlineStack>
        </InlineStack>
        <Text as="p" variant="bodySm" tone="subdued">
          These examples are pregenerated. Final replies still use your product, review, and settings.
        </Text>
      </BlockStack>
    </aside>
  );
}

function PersonalityPresetCard({preset, selected, onApply}) {
  return (
    <button
      type="button"
      className={`rp-personality-preset ${selected ? 'is-selected' : ''}`}
      onClick={onApply}
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" blockAlign="start" gap="200" wrap={false}>
          <BlockStack gap="050">
            <span className="rp-preset-title-row">
              <span className={`rp-preset-title-icon is-${preset.tone || 'default'}`}>
                <Icon source={preset.icon} />
              </span>
              <Text as="span" variant="headingMd">{preset.name}</Text>
            </span>
            <Text as="span" variant="bodySm" tone="subdued">{preset.summary}</Text>
          </BlockStack>
        </InlineStack>
        <div className="rp-preset-pill-list">
          {preset.tags.map((tag) => (
            <span key={tag} className="rp-preset-pill" data-tag={tagKey(tag)}>
              <span className="rp-preset-pill-mark" aria-hidden="true" />
              {tag}
            </span>
          ))}
        </div>
      </BlockStack>
    </button>
  );
}

function optionIndex(options, value) {
  const index = options.findIndex((option) => option.value === value);
  return index >= 0 ? index : 0;
}

function optionByValue(options, value) {
  return options.find((option) => option.value === value) ?? options[0];
}

function normalizeTonePreset(value) {
  if (value === 'balanced') return defaultTonePreset;
  return tonePresetOptions.some((option) => option.value === value) ? value : defaultTonePreset;
}

function normalizeVoiceIntensity(value) {
  return personalityStrengthOptions.some((option) => option.value === value) ? value : defaultVoiceIntensity;
}

function normalizeReplyLength(value) {
  return replyLengthOptions.some((option) => option.value === value) ? value : defaultReplyLength;
}

function sliderOption(options, value) {
  const index = Math.max(0, Math.min(options.length - 1, Math.round(Number(value) || 0)));
  return options[index] ?? options[0];
}

function TonePresetSelect({value, onChange}) {
  const selectedValue = normalizeTonePreset(value);
  const selectedOption = optionByValue(tonePresetOptions, selectedValue);

  return (
    <div className="rp-voice-slider">
      <BlockStack gap="250">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="h2" variant="headingMd">Tone preset</Text>
          <Badge tone="info">{selectedOption.label}</Badge>
        </InlineStack>
        <div className="rp-tone-preset-select">
          <Select
            label="Tone preset"
            labelHidden
            options={tonePresetOptions.map((option) => ({
              label: option.label,
              value: option.value,
            }))}
            value={selectedValue}
            onChange={onChange}
          />
        </div>
        <Text as="p" variant="bodySm" tone="subdued">
          Use this only if you want to nudge generated replies in a specific direction. {selectedOption.description}
        </Text>
      </BlockStack>
    </div>
  );
}

function VoiceSettingSlider({title, options, value, onChange, helpText}) {
  const selectedIndex = optionIndex(options, value);
  const selectedOption = options[selectedIndex] ?? options[0];
  const handleChange = useCallback(
    (nextValue) => {
      onChange(sliderOption(options, nextValue).value);
    },
    [onChange, options],
  );

  return (
    <div className="rp-voice-slider">
      <BlockStack gap="250">
        <InlineStack align="space-between" blockAlign="center" gap="200">
          <Text as="h2" variant="headingMd">{title}</Text>
          <Badge tone="info">{selectedOption.label}</Badge>
        </InlineStack>
        <RangeSlider
          label={title}
          labelHidden
          min={0}
          max={options.length - 1}
          step={1}
          value={selectedIndex}
          onChange={handleChange}
        />
        <div
          className="rp-voice-slider-steps"
          style={{gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))`}}
        >
          {options.map((option, index) => (
            <button
              key={option.value}
              type="button"
              className={`rp-voice-slider-step ${index === selectedIndex ? 'is-selected' : ''}`}
              aria-pressed={index === selectedIndex}
              onClick={() => onChange(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <Text as="p" variant="bodySm" tone="subdued">
          {selectedOption.description || helpText}
        </Text>
      </BlockStack>
    </div>
  );
}

function countWords(value) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function limitPersonalityText(value) {
  const text = String(value ?? '').slice(0, personalityMaxCharacters);
  const parts = text.match(/\S+\s*/g) ?? [];
  if (parts.length <= personalityMaxWords) return text;
  return parts.slice(0, personalityMaxWords).join('').trimEnd();
}

function buildConfig(settings, defaultSelectedModel) {
  return {
    persona: limitPersonalityText(settings?.persona ?? defaultBrandVoice.persona),
    greeting: settings?.greeting ?? defaultBrandVoice.greeting,
    signOff: settings?.signOff ?? defaultBrandVoice.signOff,
    alwaysMention: Array.isArray(settings?.alwaysMention) ? settings.alwaysMention : defaultAlwaysMention,
    avoidPhrases: Array.isArray(settings?.avoidPhrases) ? settings.avoidPhrases : defaultAvoidPhrases,
    selectedModel: settings?.selectedModel ?? defaultSelectedModel,
    livePreview: settings?.livePreview ?? '',
    previewReview: settings?.previewReview ?? defaultPreviewReview,
    previewProductId: settings?.previewProductId ?? '',
    previewProductTitle: settings?.previewProductTitle ?? '',
    previewProductType: settings?.previewProductType ?? '',
    previewProductTags: Array.isArray(settings?.previewProductTags) ? settings.previewProductTags : [],
    previewRating: String(settings?.previewRating ?? '5'),
    personalityStyle: normalizeTonePreset(settings?.personalityStyle),
    personalityStrength: normalizeVoiceIntensity(settings?.personalityStrength),
    replyLength: normalizeReplyLength(settings?.replyLength),
  };
}

function configSignature(config) {
  return JSON.stringify({
    persona: config.persona || '',
    greeting: config.greeting || '',
    signOff: config.signOff || '',
    alwaysMention: Array.isArray(config.alwaysMention) ? config.alwaysMention : [],
    avoidPhrases: Array.isArray(config.avoidPhrases) ? config.avoidPhrases : [],
    selectedModel: config.selectedModel || '',
    personalityStyle: normalizeTonePreset(config.personalityStyle),
    personalityStrength: normalizeVoiceIntensity(config.personalityStrength),
    replyLength: normalizeReplyLength(config.replyLength),
    livePreview: config.livePreview || '',
    previewReview: config.previewReview || '',
    previewProductId: config.previewProductId || '',
    previewProductTitle: config.previewProductTitle || '',
    previewProductType: config.previewProductType || '',
    previewProductTags: Array.isArray(config.previewProductTags) ? config.previewProductTags : [],
    previewRating: config.previewRating || '5',
  });
}

export default function BrandVoicePage({
  data,
  actionPath,
  embedded = false,
  activeSection: controlledActiveSection,
  onActiveSectionChange,
  useProductDescription = false,
  onUseProductDescriptionChange,
  replyCreditMultiplier = 1,
  defaultSelectedModelOverride,
  hideSaveBar = false,
  onConfigChange,
  onSkipPersonalityBuilder,
  suppressPreviewFallback = false,
  livePreviewDescription,
  hideSentReplyLoader = false,
} = {}) {
  const shopify = useAppBridge();
  const routeLoaderData = useLoaderData();
  const loaderData = data ?? routeLoaderData.brandVoice ?? routeLoaderData;
  const saveFetcher = useFetcher();
  const sentRepliesFetcher = useFetcher();
  const personalityFetcher = useFetcher();
  const previewFetcher = useFetcher();
  const productFetcher = useFetcher();
  const saveTimeout = useFetcherTimeout(saveFetcher, {
    timeoutMs: 20000,
    message: 'Saving Brand Voice took too long. Please try again later.',
  });
  const sentRepliesTimeout = useFetcherTimeout(sentRepliesFetcher, {
    timeoutMs: 20000,
    message: 'Loading sent replies took too long. Please try again later.',
  });
  const personalityTimeout = useFetcherTimeout(personalityFetcher, {
    timeoutMs: 60000,
    message: 'Generating Personality took too long. Please try again later.',
  });
  const previewTimeout = useFetcherTimeout(previewFetcher, {
    timeoutMs: 60000,
    message: 'Generating the live preview took too long. Please try again later.',
  });
  const productTimeout = useFetcherTimeout(productFetcher, {
    timeoutMs: 30000,
    message: 'Loading the selected Shopify product took too long. Please try again later.',
  });
  const loaderAiModels = useMemo(() => loaderData.aiModels ?? [], [loaderData.aiModels]);
  const reviewSourceName = loaderData.connection?.providerName || 'review source';
  const reviewSourceLogo = loaderData.connection?.provider === 'yotpo'
    ? '/provider-logos/yotpo.svg'
    : '/provider-logos/judgeme.png';
  const defaultSelectedModel = defaultSelectedModelOverride ?? loaderData.defaultAiModelId ?? loaderAiModels[0]?.id ?? 'basic';
  const initialConfig = useMemo(
    () => buildConfig(loaderData.settings, defaultSelectedModel),
    [loaderData.settings, defaultSelectedModel],
  );

  const [persona, setPersona] = useState(initialConfig.persona);
  const [greeting, setGreeting] = useState(initialConfig.greeting);
  const [signOff, setSignOff] = useState(initialConfig.signOff);
  const [alwaysMention, setAlwaysMention] = useState(initialConfig.alwaysMention);
  const [avoidPhrases, setAvoidPhrases] = useState(initialConfig.avoidPhrases);
  const [alwaysInput, setAlwaysInput] = useState('');
  const [avoidInput, setAvoidInput] = useState('');
  const [aiModels, setAiModels] = useState(loaderAiModels);
  const [selectedModel, setSelectedModel] = useState(initialConfig.selectedModel);
  const [personalityStyle, setPersonalityStyle] = useState(initialConfig.personalityStyle);
  const [personalityStrength, setPersonalityStrength] = useState(initialConfig.personalityStrength);
  const [replyLength, setReplyLength] = useState(initialConfig.replyLength);
  const [exampleReplies, setExampleReplies] = useState([]);
  const [showManualReplyForm, setShowManualReplyForm] = useState(false);
  const [manualReplyMode, setManualReplyMode] = useState('single');
  const [manualReplyRating, setManualReplyRating] = useState('5');
  const [manualReplyText, setManualReplyText] = useState('');
  const [bulkReplyText, setBulkReplyText] = useState('');
  const [sentReplyLimit, setSentReplyLimit] = useState('10');
  const [livePreview, setLivePreview] = useState(initialConfig.livePreview);
  const [previewReview, setPreviewReview] = useState(initialConfig.previewReview);
  const [previewProductId, setPreviewProductId] = useState(initialConfig.previewProductId);
  const [previewProductTitle, setPreviewProductTitle] = useState(initialConfig.previewProductTitle);
  const [previewProductType, setPreviewProductType] = useState(initialConfig.previewProductType);
  const [previewProductTags, setPreviewProductTags] = useState(initialConfig.previewProductTags);
  const [previewRating, setPreviewRating] = useState(initialConfig.previewRating);
  const [internalActiveSection, setInternalActiveSection] = useState('personality-builder');
  const activeSection = controlledActiveSection ?? internalActiveSection;
  const setActiveSection = useCallback((section) => {
    if (onActiveSectionChange) {
      onActiveSectionChange(section);
      return;
    }
    setInternalActiveSection(section);
  }, [onActiveSectionChange]);
  const [savedConfig, setSavedConfig] = useState(initialConfig);
  const [localToast, setLocalToast] = useState(null);
  const [selectedPresetId, setSelectedPresetId] = useState(() => presetIdForPersona(initialConfig.persona));
  const [presetPreviewIndex, setPresetPreviewIndex] = useState(0);
  const [presetPreviewPaused, setPresetPreviewPaused] = useState(false);
  const [showAdvancedLength, setShowAdvancedLength] = useState(initialConfig.replyLength === 'very_long');
  const [personalityHighlight, setPersonalityHighlight] = useState(false);
  const lastToastKey = useRef('');
  const personalityHighlightTimer = useRef(null);
  const saveResult = saveTimeout.result || saveFetcher.data;
  const sentRepliesResult = sentRepliesTimeout.result || sentRepliesFetcher.data;
  const personalityResult = personalityTimeout.result || personalityFetcher.data;
  const previewResult = previewTimeout.result || previewFetcher.data;
  const productResult = productTimeout.result || productFetcher.data;

  const wordCount = useMemo(() => countWords(persona), [persona]);
  const characterCount = persona.length;
  const personalityIsAtLimit =
    wordCount >= personalityMaxWords || characterCount >= personalityMaxCharacters;
  const bulkReplyCount = useMemo(() => splitBulkReplyText(bulkReplyText).length, [bulkReplyText]);
  const selectedPreset = useMemo(
    () => personalityPresets.find((preset) => preset.id === selectedPresetId) ?? personalityPresets[0],
    [selectedPresetId],
  );

  const previewReply = useMemo(() => {
    const safeGreeting = greeting.replace('{name}', 'Anya').trim() || 'Hi Anya -';
    const safeSignOff = signOff.trim() || '- The team';
    return `${safeGreeting} thank you for sharing this. We appreciate the specific detail in your review and are glad the order felt right in person.\n\n${safeSignOff}`;
  }, [greeting, signOff]);
  const selectedModelConfig = aiModels.find((model) => model.id === selectedModel);
  const selectedModelConfigured = selectedModelConfig?.configured ?? false;
  const creditOverview = previewFetcher.data?.credits ?? personalityFetcher.data?.credits ?? loaderData.credits ?? {balance: 0};
  const selectedCreditCosts = selectedModelConfig?.credits ?? {reply: 1, preview: 1, personality: 2};
  const previewProductContextText = useMemo(() => {
    if (!previewProductTitle) return 'Open Shopify product picker to search the full catalog.';

    const productBasics = [previewProductType, previewProductTags.slice(0, 4).join(', ')].filter(Boolean).join(' · ');
    if (useProductDescription) {
      return productBasics
        ? `${productBasics} · cleaned description included`
        : 'Cleaned product description is included when Shopify provides it.';
    }

    return productBasics || 'Title is sent to the AI.';
  }, [previewProductTags, previewProductTitle, previewProductType, useProductDescription]);
  const visibleReplyLengthOptions = useMemo(
    () => (showAdvancedLength || replyLength === 'very_long'
      ? replyLengthOptions
      : replyLengthOptions.filter((option) => option.value !== 'very_long')),
    [replyLength, showAdvancedLength],
  );

  const currentConfig = useMemo(() => ({
    persona,
    greeting,
    signOff,
    alwaysMention,
    avoidPhrases,
    selectedModel,
    personalityStyle,
    personalityStrength,
    replyLength,
    livePreview,
    previewReview,
    previewProductId,
    previewProductTitle,
    previewProductType,
    previewProductTags,
    previewRating,
  }), [
    persona,
    greeting,
    signOff,
    alwaysMention,
    avoidPhrases,
    selectedModel,
    personalityStyle,
    personalityStrength,
    replyLength,
    livePreview,
    previewReview,
    previewProductId,
    previewProductTitle,
    previewProductType,
    previewProductTags,
    previewRating,
  ]);

  const isDirty = configSignature(currentConfig) !== configSignature(savedConfig);

  useEffect(() => {
    onConfigChange?.(currentConfig);
  }, [currentConfig, onConfigChange]);

  const showToast = useCallback((data) => {
    if (!data?.message) return;

    const key = `${data.intent || 'action'}:${data.ok ? 'ok' : 'error'}:${data.message}`;
    if (lastToastKey.current === key) return;
    lastToastKey.current = key;

    if (!data.ok && data.error) {
      // Keep full debug details out of the page while preserving them for local debugging.
      console.error('Brand voice action failed', data.error);
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

  function hasEnoughCredits(requiredCredits, actionLabel) {
    const required = Number(requiredCredits || 0);
    const available = Number(creditOverview.balance ?? 0);
    if (required <= available) return true;

    showToast({
      ok: false,
      intent: 'insufficient-credits',
      message: `${actionLabel} needs ${creditsText(required)}, but you only have ${creditsText(available)}. Buy more credits to continue.`,
    });
    return false;
  }

  const updatePersona = useCallback((value) => {
    setPersona(limitPersonalityText(value));
  }, []);

  const revealPersonalitySettings = useCallback(() => {
    window.clearTimeout(personalityHighlightTimer.current);
    setActiveSection('personality-settings');
    setPersonalityHighlight(true);
    personalityHighlightTimer.current = window.setTimeout(() => {
      setPersonalityHighlight(false);
    }, 2600);
  }, [setActiveSection]);

  useEffect(() => () => {
    window.clearTimeout(personalityHighlightTimer.current);
  }, []);

  useEffect(() => {
    setPresetPreviewIndex(0);
  }, [selectedPresetId]);

  useEffect(() => {
    if (
      activeSection !== 'personality-builder' ||
      presetPreviewPaused ||
      !selectedPreset?.previewReplies?.length
    ) return undefined;

    const timer = window.setInterval(() => {
      setPresetPreviewIndex((index) => (index + 1) % presetPreviewReviews.length);
    }, 7600);

    return () => window.clearInterval(timer);
  }, [activeSection, presetPreviewPaused, selectedPreset]);

  const movePresetPreview = useCallback((direction) => {
    setPresetPreviewPaused(true);
    setPresetPreviewIndex((index) => (
      index + direction + presetPreviewReviews.length
    ) % presetPreviewReviews.length);
  }, []);

  useEffect(() => {
    setAiModels(loaderAiModels);
  }, [loaderAiModels]);

  useEffect(() => {
    showToast(sentRepliesResult);

    if (
      sentRepliesFetcher.data?.ok &&
      sentRepliesFetcher.data.intent === 'load-sent-replies' &&
      Array.isArray(sentRepliesFetcher.data.importedReplies)
    ) {
      setExampleReplies((current) => mergeExampleReplies(current, sentRepliesFetcher.data.importedReplies));
    }
  }, [sentRepliesFetcher.data, sentRepliesResult, showToast]);

  useEffect(() => {
    showToast(personalityResult);
    if (Array.isArray(personalityFetcher.data?.aiModels)) {
      setAiModels(personalityFetcher.data.aiModels);
    }

    if (personalityFetcher.data?.ok && personalityFetcher.data.intent === 'generate-personality') {
      if (personalityFetcher.data.personality) {
        updatePersona(personalityFetcher.data.personality);
        revealPersonalitySettings();
      }

      if (personalityFetcher.data.livePreview) {
        setLivePreview(personalityFetcher.data.livePreview);
      }
    }
  }, [personalityFetcher.data, personalityResult, revealPersonalitySettings, showToast, updatePersona]);

  useEffect(() => {
    showToast(previewResult);
    if (Array.isArray(previewFetcher.data?.aiModels)) {
      setAiModels(previewFetcher.data.aiModels);
    }

    if (previewFetcher.data?.ok && previewFetcher.data.livePreview) {
      setLivePreview(previewFetcher.data.livePreview);
    }
  }, [previewFetcher.data, previewResult, showToast]);

  useEffect(() => {
    showToast(productResult);

    if (productFetcher.data?.ok && productFetcher.data.product) {
      const product = productFetcher.data.product;
      setPreviewProductId(product.id || '');
      setPreviewProductTitle(product.title || '');
      setPreviewProductType(product.productType || '');
      setPreviewProductTags(Array.isArray(product.tags) ? product.tags : []);
    }
  }, [productFetcher.data, productResult, showToast]);

  useEffect(() => {
    showToast(saveResult);
    if (Array.isArray(saveFetcher.data?.aiModels)) {
      setAiModels(saveFetcher.data.aiModels);
    }

    if (saveFetcher.data?.ok && saveFetcher.data.intent === 'save-settings') {
      const nextConfig = buildConfig(saveFetcher.data.settings, defaultSelectedModel);
      updatePersona(nextConfig.persona);
      setGreeting(nextConfig.greeting);
      setSignOff(nextConfig.signOff);
      setAlwaysMention(nextConfig.alwaysMention);
      setAvoidPhrases(nextConfig.avoidPhrases);
      setSelectedModel(nextConfig.selectedModel);
      setPersonalityStyle(nextConfig.personalityStyle);
      setPersonalityStrength(nextConfig.personalityStrength);
      setReplyLength(nextConfig.replyLength);
      setLivePreview(nextConfig.livePreview);
      setPreviewReview(nextConfig.previewReview);
      setPreviewProductId(nextConfig.previewProductId);
      setPreviewProductTitle(nextConfig.previewProductTitle);
      setPreviewProductType(nextConfig.previewProductType);
      setPreviewProductTags(nextConfig.previewProductTags);
      setPreviewRating(nextConfig.previewRating);
      setSelectedPresetId(presetIdForPersona(nextConfig.persona));
      setSavedConfig(nextConfig);
    }
  }, [saveFetcher.data, defaultSelectedModel, saveResult, showToast, updatePersona]);

  function addAlwaysMention() {
    const nextValue = alwaysInput.trim();
    if (!nextValue || alwaysMention.includes(nextValue)) return;
    setAlwaysMention((current) => [...current, nextValue]);
    setAlwaysInput('');
  }

  function addAvoidPhrase() {
    const nextValue = avoidInput.trim();
    if (!nextValue || avoidPhrases.includes(nextValue)) return;
    setAvoidPhrases((current) => [...current, nextValue]);
    setAvoidInput('');
  }

  const submitBrandVoice = useCallback((fetcher, formData) => {
    fetcher.submit(formData, actionPath ? {method: 'post', action: actionPath} : {method: 'post'});
  }, [actionPath]);

  function applyConfig(config) {
    updatePersona(config.persona);
    setGreeting(config.greeting);
    setSignOff(config.signOff);
    setAlwaysMention(config.alwaysMention);
    setAvoidPhrases(config.avoidPhrases);
    setSelectedModel(config.selectedModel);
    setPersonalityStyle(config.personalityStyle);
    setPersonalityStrength(config.personalityStrength);
    setReplyLength(config.replyLength);
    setLivePreview(config.livePreview);
    setPreviewReview(config.previewReview);
    setPreviewProductId(config.previewProductId);
    setPreviewProductTitle(config.previewProductTitle);
    setPreviewProductType(config.previewProductType);
    setPreviewProductTags(config.previewProductTags);
    setPreviewRating(config.previewRating);
    setSelectedPresetId(presetIdForPersona(config.persona));
  }

  function loadPreviewProduct(productId) {
    const formData = new FormData();
    formData.set('intent', 'load-preview-product');
    formData.set('productId', productId);
    submitBrandVoice(productFetcher, formData);
  }

  async function handlePreviewProductPicker() {
    try {
      const selection = await shopify.resourcePicker({
        type: 'product',
        multiple: false,
        selectionIds: previewProductId ? [{id: previewProductId}] : [],
      });
      const selectedProduct = Array.isArray(selection) ? selection[0] : null;
      if (!selectedProduct?.id) return;

      setPreviewProductId(selectedProduct.id);
      setPreviewProductTitle(selectedProduct.title || 'Selected product');
      setPreviewProductType('');
      setPreviewProductTags([]);
      loadPreviewProduct(selectedProduct.id);
    } catch (error) {
      console.error('Product picker failed', error);
      setLocalToast({message: 'Product picker could not be opened.', isError: true});
      window.setTimeout(() => setLocalToast(null), 8000);
    }
  }

  function handleClearPreviewProduct() {
    setPreviewProductId('');
    setPreviewProductTitle('');
    setPreviewProductType('');
    setPreviewProductTags([]);
  }

  function handleSave() {
    const formData = new FormData();
    formData.set('intent', 'save-settings');
    formData.set('personality', persona);
    formData.set('greeting', greeting);
    formData.set('signOff', signOff);
    formData.set('alwaysMention', JSON.stringify(alwaysMention));
    formData.set('avoidPhrases', JSON.stringify(avoidPhrases));
    formData.set('modelId', selectedModel);
    formData.set('personalityStyle', personalityStyle);
    formData.set('personalityStrength', personalityStrength);
    formData.set('replyLength', replyLength);
    formData.set('livePreview', livePreview);
    formData.set('previewReview', previewReview);
    formData.set('previewProductId', previewProductId);
    formData.set('previewProductTitle', previewProductTitle);
    formData.set('previewProductType', previewProductType);
    formData.set('previewProductTags', JSON.stringify(previewProductTags));
    formData.set('previewRating', previewRating);
    submitBrandVoice(saveFetcher, formData);
  }

  function handleDiscard() {
    applyConfig(savedConfig);
  }

  function handleLoadSentReplies() {
    const formData = new FormData();
    formData.set('intent', 'load-sent-replies');
    formData.set('limit', sentReplyLimit);
    submitBrandVoice(sentRepliesFetcher, formData);
  }

  function handleGeneratePersonality() {
    if (!hasEnoughCredits(selectedCreditCosts.personality, 'Generating Personality')) return;

    const formData = new FormData();
    formData.set('intent', 'generate-personality');
    formData.set('modelId', selectedModel);
    formData.set('personality', persona);
    formData.set('greeting', greeting);
    formData.set('signOff', signOff);
    formData.set('alwaysMention', JSON.stringify(alwaysMention));
    formData.set('avoidPhrases', JSON.stringify(avoidPhrases));
    formData.set('personalityStyle', personalityStyle);
    formData.set('personalityStrength', personalityStrength);
    formData.set('replyLength', replyLength);
    formData.set('previewReview', previewReview);
    formData.set('previewProductId', previewProductId);
    formData.set('previewProductTitle', previewProductTitle);
    formData.set('previewProductType', previewProductType);
    formData.set('previewProductTags', JSON.stringify(previewProductTags));
    formData.set('previewRating', previewRating);
    formData.set('useProductDescription', String(Boolean(useProductDescription)));
    formData.set('replies', JSON.stringify(exampleReplies));
    submitBrandVoice(personalityFetcher, formData);
  }

  function handleGeneratePreview() {
    if (!hasEnoughCredits(selectedCreditCosts.preview, livePreview ? 'Regenerating the preview' : 'Generating the preview')) return;

    const formData = new FormData();
    formData.set('intent', 'generate-preview');
    formData.set('modelId', selectedModel);
    formData.set('personality', persona);
    formData.set('greeting', greeting);
    formData.set('signOff', signOff);
    formData.set('alwaysMention', JSON.stringify(alwaysMention));
    formData.set('avoidPhrases', JSON.stringify(avoidPhrases));
    formData.set('personalityStyle', personalityStyle);
    formData.set('personalityStrength', personalityStrength);
    formData.set('replyLength', replyLength);
    formData.set('previewReview', previewReview);
    formData.set('previewProductId', previewProductId);
    formData.set('previewProductTitle', previewProductTitle);
    formData.set('previewProductType', previewProductType);
    formData.set('previewProductTags', JSON.stringify(previewProductTags));
    formData.set('previewRating', previewRating);
    formData.set('useProductDescription', String(Boolean(useProductDescription)));
    submitBrandVoice(previewFetcher, formData);
  }

  function removeExampleReply(id) {
    setExampleReplies((current) => current.filter((example) => example.id !== id));
  }

  function resetManualReplyForm() {
    setManualReplyText('');
    setBulkReplyText('');
    setManualReplyRating('5');
    setManualReplyMode('single');
    setShowManualReplyForm(false);
  }

  function addManualExampleReply() {
    const text = manualReplyText.trim();
    if (!text) return;

    setExampleReplies((current) => mergeExampleReplies(current, [
      {
        id: `manual-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        text,
        rating: Number(manualReplyRating) || null,
        customer: null,
        product: null,
        source: 'Manual example',
      },
    ]));
    setManualReplyText('');
    setManualReplyRating('5');
    setShowManualReplyForm(false);
    showToast({
      ok: true,
      intent: 'add-example-reply',
      message: 'Example reply added. Generate Personality when you have enough examples.',
    });
  }

  function addBulkExampleReplies() {
    const replies = splitBulkReplyText(bulkReplyText);
    if (!replies.length) return;

    const stamp = Date.now();
    setExampleReplies((current) => mergeExampleReplies(current, replies.map((text, index) => ({
      id: `bulk-${stamp}-${index}-${Math.random().toString(36).slice(2)}`,
      text: text.slice(0, manualReplyMaxCharacters),
      rating: null,
      customer: null,
      product: null,
      source: 'Bulk paste',
    }))));
    setBulkReplyText('');
    setManualReplyMode('single');
    setShowManualReplyForm(false);
    showToast({
      ok: true,
      intent: 'add-bulk-example-replies',
      message: `${replies.length} pasted ${replies.length === 1 ? 'reply' : 'replies'} added. Generate Personality when you have enough examples.`,
    });
  }

  function applyPersonalityPreset(preset) {
    setSelectedPresetId(preset.id);
    updatePersona(preset.persona);
    showToast({
      ok: true,
      intent: 'apply-personality-preset',
      message: `${preset.name} preset selected. Preview the examples, then continue to review the Personality text.`,
    });
  }

  return (
    <BlockStack gap="400">
      {!hideSaveBar ? (
      <SaveBar open={isDirty}>
        <button variant="primary" disabled={saveTimeout.pending} onClick={handleSave}>Save</button>
        <button onClick={handleDiscard}>Discard</button>
      </SaveBar>
      ) : null}

      {localToast ? (
        <div className={`rp-local-toast ${localToast.isError ? 'is-error' : ''}`} role="status">
          {localToast.message}
        </div>
      ) : null}

      {!embedded ? (
      <InlineStack align="space-between" blockAlign="center" gap="300">
        <BlockStack gap="100">
          <Text as="h1" variant="heading2xl">Your brand voice</Text>
          <Text as="p" variant="bodyLg" tone="subdued">
            The more specific you get, the better. Edits to approved replies feed back into these rules.
          </Text>
        </BlockStack>
      </InlineStack>
      ) : null}

      <div className={embedded ? 'rp-brand-voice-embedded' : 'rp-settings-layout'}>
        {!embedded ? (
        <aside className="rp-settings-nav" aria-label="Brand voice sections">
          <BlockStack gap="150">
            <Text as="p" variant="bodySm" tone="subdued" fontWeight="semibold">BRAND VOICE</Text>
            {brandVoiceSettingsSections.map((section) => (
              <button
                key={section.id}
                type="button"
                className={`rp-settings-nav-item ${activeSection === section.id ? 'is-active' : ''}`}
                onClick={() => setActiveSection(section.id)}
              >
                {section.label}
              </button>
            ))}
          </BlockStack>
        </aside>
        ) : null}

        <BlockStack gap="400">
          {activeSection === 'personality-builder' ? (
          <section className="rp-field-card">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="start" gap="300">
                <InlineStack gap="300" blockAlign="start" wrap={false}>
                  <span className="rp-icon-tile is-blue">
                    <Icon source={MagicIcon} />
                  </span>
                  <BlockStack gap="100">
                    <Text as="h2" variant="headingLg">Personality builder</Text>
                    <Text as="p" variant="bodyMd" tone="subdued">
                      Start with a preset or add real reply examples manually, then refine the Personality text below.
                    </Text>
                  </BlockStack>
                </InlineStack>
                <Badge tone="info">Manual setup</Badge>
              </InlineStack>

              <div className="rp-personality-builder-layout">
                <div className="rp-builder-method is-presets">
                  <BlockStack gap="300">
                    <BlockStack gap="050">
                      <Text as="h3" variant="headingMd">Choose a starting personality</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Pick a preset to see how it replies to common review situations before editing the Personality text.
                      </Text>
                    </BlockStack>

                    <div className="rp-personality-preset-grid">
                      {personalityPresets.map((preset) => (
                        <PersonalityPresetCard
                          key={preset.id}
                          preset={preset}
                          selected={selectedPresetId === preset.id}
                          onApply={() => applyPersonalityPreset(preset)}
                        />
                      ))}
                    </div>
                  </BlockStack>
                </div>

                <PersonalityPresetPreviewPanel
                  isPaused={presetPreviewPaused}
                  onNext={() => movePresetPreview(1)}
                  onPrevious={() => movePresetPreview(-1)}
                  onTogglePause={() => setPresetPreviewPaused((paused) => !paused)}
                  preset={selectedPreset}
                  previewIndex={presetPreviewIndex}
                />
              </div>

              <InlineStack align="end">
                <Button variant="primary" onClick={revealPersonalitySettings}>
                  Next: review Personality
                </Button>
              </InlineStack>

              <div className="rp-builder-method">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="start" gap="300">
                    <BlockStack gap="100">
                      <Text as="h3" variant="headingMd">Generate from example replies</Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        Reply platforms do not always expose past merchant replies. Add examples manually after you have answered a few reviews, or paste replies you wrote in another platform, so ReplyPulse can learn your real voice.
                      </Text>
                    </BlockStack>
                    <Button
                      icon={showManualReplyForm ? XIcon : PlusIcon}
                      onClick={() => {
                        if (showManualReplyForm) {
                          resetManualReplyForm();
                        } else {
                          setManualReplyMode('single');
                          setShowManualReplyForm(true);
                        }
                      }}
                    >
                      {showManualReplyForm ? 'Close' : 'Add reply'}
                    </Button>
                  </InlineStack>

                  <div className="rp-manual-reply-note">
                    <Icon source={InfoIcon} tone="base" />
                    <Text as="p" variant="bodySm" tone="subdued">
                      Best results come from 3-10 real public replies. Paste only the merchant responses your team wrote, not the customer's review text, because Personality is inferred from the responder's voice.
                    </Text>
                  </div>

                  {!hideSentReplyLoader ? (
                  <div className="rp-source-reply-loader">
                    <InlineStack align="space-between" blockAlign="center" gap="300">
                      <InlineStack gap="400" blockAlign="center" wrap={false}>
                        <span className="rp-source-button-mark">
                          <img src={reviewSourceLogo} alt="" aria-hidden="true" />
                        </span>
                        <BlockStack gap="050">
                          <Text as="p" variant="bodyMd" fontWeight="semibold">Load sent replies from {reviewSourceName} history</Text>
                          <Text as="p" variant="bodySm" tone="subdued">
                            Use replies that ReplyPulse already sent and stored for this shop. This does not call {reviewSourceName}; it loads your saved sent reply history.
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <InlineStack gap="200" blockAlign="center" align="end" wrap={false}>
                        <div className="rp-filter-select">
                          <Select
                            label="Sent reply count"
                            labelHidden
                            options={sentReplyOptions}
                            value={sentReplyLimit}
                            onChange={setSentReplyLimit}
                          />
                        </div>
                        <Button loading={sentRepliesTimeout.pending} disabled={sentRepliesTimeout.pending} onClick={handleLoadSentReplies}>
                          <span className="rp-source-load-button">
                            <img src={reviewSourceLogo} alt="" aria-hidden="true" />
                            Load replies
                          </span>
                        </Button>
                      </InlineStack>
                    </InlineStack>
                  </div>
                  ) : null}

                  {showManualReplyForm ? (
                    <div className="rp-manual-reply-form">
                      <BlockStack gap="300">
                        <InlineStack align="space-between" blockAlign="start" gap="300">
                          <BlockStack gap="050">
                            <Text as="h4" variant="headingSm">
                              {manualReplyMode === 'bulk' ? 'Paste all replies' : 'Add one reply'}
                            </Text>
                            <Text as="p" variant="bodySm" tone="subdued">
                              {manualReplyMode === 'bulk'
                                ? "Don't want to add replies one by one? Paste many merchant replies here, one per line. ReplyPulse will treat them as separate response examples and use them to interpret the responder's personality."
                                : "Paste only the response that was sent to the review. You do not need to include the customer's review, because the builder learns from the reply writer's wording."}
                            </Text>
                          </BlockStack>
                          <Button onClick={() => setManualReplyMode(manualReplyMode === 'bulk' ? 'single' : 'bulk')}>
                            {manualReplyMode === 'bulk' ? 'Add one reply' : 'Paste all replies'}
                          </Button>
                        </InlineStack>

                        {manualReplyMode === 'bulk' ? (
                          <TextField
                            label="Paste all replies"
                            value={bulkReplyText}
                            onChange={setBulkReplyText}
                            autoComplete="off"
                            multiline={8}
                            maxLength={bulkReplyMaxCharacters}
                            showCharacterCount
                            placeholder={"Thanks so much for sharing this with us...\nWe appreciate you taking the time to write this...\nI'm sorry this was not the experience you expected..."}
                            helpText={`${bulkReplyCount || 'No'} ${bulkReplyCount === 1 ? 'reply' : 'replies'} detected. Put each merchant reply on its own line and leave out the customer's review text.`}
                          />
                        ) : (
                          <>
                            <StarRatingPicker
                              value={manualReplyRating}
                              onChange={setManualReplyRating}
                              label="Review stars"
                              helpText="Use the rating from the review this response was written for."
                            />
                            <TextField
                              label="Reply example"
                              value={manualReplyText}
                              onChange={setManualReplyText}
                              autoComplete="off"
                              multiline={4}
                              maxLength={manualReplyMaxCharacters}
                              showCharacterCount
                              placeholder="Paste one reply you wrote to a customer review."
                              helpText="Only paste the merchant reply, not the original review. This is the text ReplyPulse uses to learn the responder's personality."
                            />
                          </>
                        )}
                        <InlineStack align="end" gap="200">
                          <Button
                            onClick={resetManualReplyForm}
                          >
                            Cancel
                          </Button>
                          {manualReplyMode === 'bulk' ? (
                            <Button variant="primary" icon={PlusIcon} disabled={!bulkReplyCount} onClick={addBulkExampleReplies}>
                              Add pasted replies
                            </Button>
                          ) : (
                            <Button variant="primary" icon={PlusIcon} disabled={!manualReplyText.trim()} onClick={addManualExampleReply}>
                              Add example
                            </Button>
                          )}
                        </InlineStack>
                      </BlockStack>
                    </div>
                  ) : null}

                  <div className="rp-builder-evidence">
                    {exampleReplies.length ? (
                      <BlockStack gap="200">
                        <InlineStack align="space-between" blockAlign="center" gap="300">
                          <Text as="p" variant="bodySm" tone="subdued">
                            {exampleReplies.length} example {exampleReplies.length === 1 ? 'reply' : 'replies'} ready as voice evidence.
                          </Text>
                          <Badge tone="info">Manual evidence</Badge>
                        </InlineStack>
                        {exampleReplies.map((example) => (
                          <ExampleRow
                            key={example.id}
                            example={example}
                            onRemove={() => removeExampleReply(example.id)}
                          />
                        ))}
                      </BlockStack>
                    ) : (
                      <div className="rp-example-empty">
                        <Icon source={ChatIcon} tone="subdued" />
                        <Text as="p" variant="bodyMd" tone="subdued">
                          Add real reply examples to generate a Personality from language you already use.
                        </Text>
                      </div>
                    )}
                  </div>

                  <InlineStack align="end">
                    <AiActionButton
                      variant="primary"
                      disabled={!exampleReplies.length || !selectedModelConfigured || personalityTimeout.pending}
                      loading={personalityTimeout.pending}
                      onClick={handleGeneratePersonality}
                    >
                      Generate Personality
                    </AiActionButton>
                  </InlineStack>
                </BlockStack>
              </div>

              {onSkipPersonalityBuilder ? (
                <InlineStack align="end">
                  <Button variant="plain" onClick={onSkipPersonalityBuilder}>
                    I’ll write the Personality myself
                  </Button>
                </InlineStack>
              ) : null}
            </BlockStack>
          </section>
          ) : null}

          {activeSection === 'personality-settings' ? (
          <>
          <section className={`rp-field-card rp-personality-card ${personalityHighlight ? 'is-personality-updated' : ''}`}>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="end" gap="300">
                <InlineStack gap="150" blockAlign="end">
                  <Text as="h2" variant="headingLg">Personality</Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    Describe the voice, attitude, and basic rules the assistant should follow when replying to reviews.
                  </Text>
                </InlineStack>
                <InlineStack gap="150" blockAlign="center">
                  {personalityHighlight ? <Badge tone="info">Updated now</Badge> : null}
                  <Text as="span" variant="bodySm" tone="critical">Review generated text before saving</Text>
                </InlineStack>
              </InlineStack>
              <div className="rp-personality-field-wrap">
                <TextField
                  label="Personality"
                  labelHidden
                  value={persona}
                  onChange={updatePersona}
                  autoComplete="off"
                  maxLength={personalityMaxCharacters}
                  multiline={8}
                />
              </div>
              <InlineStack align="space-between" blockAlign="center">
                <span className={`rp-word-count ${personalityIsAtLimit ? 'is-limit' : ''}`}>
                  {wordCount} / {personalityMaxWords} words · {characterCount} / {personalityMaxCharacters.toLocaleString('en')} characters
                </span>
                <Text as="span" variant="bodySm" tone="subdued">Saved only through Shopify Save</Text>
              </InlineStack>
            </BlockStack>
          </section>

          <section className="rp-field-card">
            <BlockStack gap="400">
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingLg">Voice controls</Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    These settings control how the personality above is applied when drafting replies.
                  </Text>
                </BlockStack>
                <Badge tone="info">Used by Queue and preview</Badge>
              </InlineStack>

              <InlineGrid columns={{xs: 1, md: 2}} gap="400">
                <TonePresetSelect
                  value={personalityStyle}
                  onChange={setPersonalityStyle}
                />
                <VoiceSettingSlider
                  title="Voice intensity"
                  options={personalityStrengthOptions}
                  value={personalityStrength}
                  onChange={setPersonalityStrength}
                  helpText="Controls how strongly the brand voice shows up in each reply."
                />
              </InlineGrid>
              <VoiceSettingSlider
                title="Reply length"
                options={visibleReplyLengthOptions}
                value={replyLength}
                onChange={setReplyLength}
                helpText="Controls how much detail ReplyPulse includes before the final sign-off."
              />
              {!showAdvancedLength && replyLength !== 'very_long' ? (
                <InlineStack align="end">
                  <Button variant="plain" onClick={() => setShowAdvancedLength(true)}>
                    Show advanced length option
                  </Button>
                </InlineStack>
              ) : null}

              <Divider />
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="h3" variant="headingMd">Greeting and sign-off</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    These small pieces are applied around every draft when the model writes a reply.
                  </Text>
                </BlockStack>
                <InlineGrid columns={{xs: 1, md: 2}} gap="400">
                  <BlockStack gap="250">
                    <Text as="h4" variant="headingSm">Sign-on greeting</Text>
                    <TextField
                      label="Sign-on greeting"
                      labelHidden
                      value={greeting}
                      onChange={setGreeting}
                      autoComplete="off"
                    />
                    <Text as="p" variant="bodySm" tone="subdued">Variables: {'{name}'}, {'{product}'}, {'{stars}'}</Text>
                  </BlockStack>

                  <BlockStack gap="250">
                    <Text as="h4" variant="headingSm">Sign-off</Text>
                    <TextField
                      label="Sign-off"
                      labelHidden
                      value={signOff}
                      onChange={setSignOff}
                      autoComplete="off"
                    />
                    <Text as="p" variant="bodySm" tone="subdued">Can include a signature line or light brand detail.</Text>
                  </BlockStack>
                </InlineGrid>
              </BlockStack>

              <Divider />
              <BlockStack gap="300">
                <BlockStack gap="050">
                  <Text as="h3" variant="headingMd">Reply rules</Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    Use these as soft guidance. ReplyPulse considers them when they fit the review, but the AI should still sound natural.
                  </Text>
                </BlockStack>
                <InlineGrid columns={{xs: 1, md: 2}} gap="400">
                  <BlockStack gap="300">
                    <BlockStack gap="200">
                      <InlineStack gap="150" blockAlign="end">
                        <Text as="h4" variant="headingSm">Emphasize when helpful</Text>
                        <Text as="span" variant="bodySm" tone="subdued">Soft guidance</Text>
                      </InlineStack>
                      <RuleTags
                        items={alwaysMention}
                        onRemove={(item) => setAlwaysMention((current) => current.filter((value) => value !== item))}
                      />
                    </BlockStack>
                    <AddRule
                      label="Add emphasis guidance"
                      value={alwaysInput}
                      onChange={setAlwaysInput}
                      onAdd={addAlwaysMention}
                      placeholder="Add idea to emphasize..."
                    />
                  </BlockStack>

                  <BlockStack gap="300">
                    <BlockStack gap="200">
                      <InlineStack gap="150" blockAlign="end">
                        <Text as="h4" variant="headingSm">Prefer avoiding</Text>
                        <Text as="span" variant="bodySm" tone="subdued">Use judgment</Text>
                      </InlineStack>
                      <RuleTags
                        items={avoidPhrases}
                        onRemove={(item) => setAvoidPhrases((current) => current.filter((value) => value !== item))}
                      />
                    </BlockStack>
                    <AddRule
                      label="Add phrase to avoid when possible"
                      value={avoidInput}
                      onChange={setAvoidInput}
                      onAdd={addAvoidPhrase}
                      placeholder="Add phrase to avoid when possible..."
                    />
                  </BlockStack>
                </InlineGrid>
              </BlockStack>
            </BlockStack>
          </section>
          </>
          ) : null}

          {activeSection === 'ai-model' ? (
          <section className="rp-field-card">
            <BlockStack gap="500">
              <InlineStack align="space-between" blockAlign="start" gap="300">
                <BlockStack gap="050">
                  <Text as="h2" variant="headingXl">AI model</Text>
                  <Text as="p" variant="bodyMd" tone="subdued">
                    Choose which model tier generates replies, previews, and personality drafts.
                  </Text>
                </BlockStack>
                <InlineStack gap="150" blockAlign="center">
                  <Badge tone={creditOverview.balance <= 25 ? 'critical' : 'info'}>{creditsNumber(creditOverview.balance)} credits left</Badge>
                  {selectedModelConfig ? <Badge>{selectedModelConfig.name} selected</Badge> : null}
                  {replyCreditMultiplier > 1 ? <Badge tone="info">Product descriptions {replyCreditMultiplier}x replies</Badge> : null}
                </InlineStack>
              </InlineStack>

              <div className="rp-model-grid">
                {aiModels.map((model) => (
                  <ModelCard
                    key={model.id}
                    model={model}
                    selected={selectedModel === model.id}
                    onSelect={() => setSelectedModel(model.id)}
                    replyCreditMultiplier={replyCreditMultiplier}
                  />
                ))}
              </div>

              <ProductDescriptionContextPanel
                checked={Boolean(useProductDescription)}
                onChange={(value) => onUseProductDescriptionChange?.(value)}
              />

              <CreditInfoPanel />
            </BlockStack>
          </section>
          ) : null}

          {activeSection === 'live-preview' ? (
          <section className="rp-field-card">
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center">
                <InlineStack gap="200" blockAlign="center">
                  <Icon source={MagicIcon} tone="critical" />
                  <Text as="h2" variant="headingLg" tone="critical">Live preview</Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    against your saved test review · {selectedModelConfig?.name ?? 'selected tier'}
                  </Text>
                  {useProductDescription ? <Badge tone="info">Product description on</Badge> : null}
                </InlineStack>
              </InlineStack>
              {livePreviewDescription ? (
                <Text as="p" variant="bodyMd" tone="subdued">{livePreviewDescription}</Text>
              ) : null}

              <InlineGrid columns={{xs: 1, md: 2}} gap="300">
                <BlockStack gap="150">
                  <Text as="p" variant="bodyMd" fontWeight="semibold">Preview product</Text>
                  <Box borderColor="border" borderWidth="025" borderRadius="200" padding="300" background="bg-surface-secondary">
                    <InlineStack align="space-between" blockAlign="center" gap="300">
                      <BlockStack gap="100">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">
                          {previewProductTitle || 'No product selected'}
                        </Text>
                        <Text as="p" variant="bodySm" tone="subdued">
                          {previewProductContextText}
                        </Text>
                      </BlockStack>
                      <InlineStack gap="150" wrap={false}>
                        <Button
                          icon={SearchIcon}
                          loading={productTimeout.pending}
                          disabled={productTimeout.pending}
                          onClick={handlePreviewProductPicker}
                        >
                          {previewProductTitle ? 'Change' : 'Select'}
                        </Button>
                        {previewProductTitle ? (
                          <Button
                            icon={XIcon}
                            accessibilityLabel="Clear preview product"
                            onClick={handleClearPreviewProduct}
                          />
                        ) : null}
                      </InlineStack>
                    </InlineStack>
                  </Box>
                </BlockStack>
                <PreviewRatingPicker
                  value={previewRating}
                  onChange={setPreviewRating}
                />
              </InlineGrid>

              <TextField
                label="Preview review"
                value={previewReview}
                onChange={setPreviewReview}
                autoComplete="off"
                multiline={3}
                helpText="Saved with Brand voice so you can reuse the same test review while tuning settings."
              />

              <InlineStack align="start">
                <AiActionButton
                  className="is-preview"
                  variant="primary"
                  size="large"
                  disabled={!selectedModelConfigured || previewTimeout.pending}
                  loading={previewTimeout.pending}
                  onClick={handleGeneratePreview}
                >
                  {livePreview ? 'Regenerate preview' : 'Generate preview'}
                </AiActionButton>
              </InlineStack>

              <div className="rp-draft-box is-preview">
                <Text as="p" variant="bodyLg">
                  {livePreview || (!suppressPreviewFallback ? previewReply : 'Generate a preview to see how ReplyPulse will answer this review.')}
                </Text>
              </div>
            </BlockStack>
          </section>
          ) : null}
        </BlockStack>
      </div>
    </BlockStack>
  );
}
