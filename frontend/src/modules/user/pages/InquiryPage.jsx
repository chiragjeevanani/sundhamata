import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Camera,
  Check,
  CheckCircle2,
  Headphones,
  MessageSquareText,
  Minus,
  Plus,
  Smartphone,
  Wrench,
  X,
} from 'lucide-react';
import {
  ACCESSORY_ITEMS,
  ACCESSORY_TYPE_LABELS,
  INQUIRY_CATEGORY_LABELS,
  MOBILE_BRANDS,
  MOBILE_FEATURES,
  MOBILE_RAM_ROM,
  SERVICE_DEVICE_LABELS,
  SERVICE_PREFERENCE_LABELS,
  SERVICE_PROBLEMS,
  describeAccessoriesInquiry,
  describeMobileInquiry,
  describeServiceInquiry,
  inquiryPhotoUrl,
  inquiryService,
} from '../../../services/inquiryService';
import { formatDate, formatINR } from '../../../utils/formatters';
import { PHOTO_ACCEPT, toScaledPhoto } from '../../../utils/photo';

const CATEGORIES = [
  { key: 'mobile', icon: Smartphone, hint: 'New phone' },
  { key: 'accessories', icon: Headphones, hint: 'Covers, chargers…' },
  { key: 'service', icon: Wrench, hint: 'Repair & service' },
];

const STATUS_BADGE = {
  new: { label: 'Sent', className: 'bg-brand-50 text-brand-700 border-brand-200/70' },
  contacted: { label: 'Store contacted you', className: 'bg-emerald-50 text-emerald-800 border-emerald-200/70' },
  closed: { label: 'Closed', className: 'bg-stone-100 text-stone-600 border-stone-200' },
};

const OTHER = 'Other';
const MAX_QUANTITY = 1000;

const EMPTY_ANSWERS = {
  // Mobile
  brand: '',
  brandOther: '',
  ramRom: '',
  ramRomOther: '',
  features: [],
  // Accessories
  accType: '',
  item: '',
  itemOther: '',
  brandPreference: '',
  device: '',
  quantity: '1',
  // Service
  svcDevice: '',
  brandModel: '',
  problem: '',
  problemOther: '',
  details: '',
  preference: '',
  photo: null, // resized Blob
  // All
  budget: '',
  message: '',
};

/** "Other" picked → what the customer typed */
const picked = (a, field) => (a[field] === OTHER ? a[`${field}Other`].trim() : a[field]);

/**
 * Step-by-step questions. Each step: title, question, optional hint, the input `kind`, and
 * `check(answers)` returning a problem to show (or '' when the step is answered / optional).
 */
const STEPS = {
  mobile: [
    {
      key: 'brand',
      title: 'Preferred Mobile Brand',
      question: 'Which mobile brand are you looking for?',
      kind: 'choice',
      field: 'brand',
      options: MOBILE_BRANDS.map((b) => ({ value: b, label: b })),
      otherPlaceholder: 'Type the brand, e.g. Motorola',
      check: (a) => (picked(a, 'brand') ? '' : 'Choose a brand, or pick Other and type it.'),
    },
    {
      key: 'ramRom',
      title: 'RAM & ROM Requirement',
      question: 'What RAM and ROM configuration do you need?',
      kind: 'choice',
      field: 'ramRom',
      options: MOBILE_RAM_ROM.map((v) => ({ value: v, label: v })),
      otherPlaceholder: 'e.g. 16GB RAM + 512GB ROM',
      check: (a) => (picked(a, 'ramRom') ? '' : 'Choose a RAM & ROM option, or pick Other and type it.'),
    },
    { key: 'budget', title: 'Budget', question: 'What is your preferred budget for the mobile?', kind: 'budget' },
    {
      key: 'extra',
      title: 'Additional Requirements',
      question: 'Do you have any other specific requirements?',
      kind: 'extra',
      features: MOBILE_FEATURES,
      placeholder: 'Write your additional requirements here.',
    },
  ],
  accessories: [
    {
      key: 'accType',
      title: 'Accessories Type',
      question: 'What type of accessories are you looking for?',
      kind: 'choice',
      field: 'accType',
      options: Object.entries(ACCESSORY_TYPE_LABELS).map(([value, label]) => ({ value, label })),
      check: (a) => (a.accType ? '' : 'Choose the accessories type.'),
    },
    {
      key: 'item',
      title: 'What do you need?',
      question: 'What do you need?',
      kind: 'choice',
      field: 'item',
      options: ACCESSORY_ITEMS.map((v) => ({ value: v, label: v })),
      allowOther: true,
      otherPlaceholder: 'Type what you need',
      check: (a) => (picked(a, 'item') ? '' : 'Choose what you need, or pick Other and type it.'),
    },
    {
      key: 'brandPreference',
      title: 'Brand Preference',
      question: 'Do you want a specific brand?',
      hint: 'Only if you need a specific brand. You can skip this.',
      kind: 'text',
      field: 'brandPreference',
      maxLength: 60,
      placeholder: 'e.g. boAt, Samsung, HP, Logitech',
    },
    {
      key: 'device',
      title: 'Device Brand & Model',
      question: 'Which mobile, laptop or computer is it for?',
      hint: 'Brand and model of your device. You can skip this.',
      kind: 'text',
      field: 'device',
      maxLength: 80,
      placeholder: 'e.g. Samsung Galaxy A54, HP Pavilion 15',
    },
    {
      key: 'quantity',
      title: 'Quantity',
      question: 'How many pieces do you need?',
      kind: 'quantity',
      check: (a) => {
        const n = Number(a.quantity);
        return Number.isInteger(n) && n >= 1 && n <= MAX_QUANTITY ? '' : `Enter a quantity from 1 to ${MAX_QUANTITY}.`;
      },
    },
    { key: 'budget', title: 'Budget', question: 'What is your budget?', kind: 'budget' },
    {
      key: 'extra',
      title: 'Additional Requirement',
      question: 'Any other requirement?',
      hint: 'Optional. Colour, length, wattage, anything else.',
      kind: 'extra',
      placeholder: 'Write any other requirement here.',
    },
  ],
  service: [
    {
      key: 'svcDevice',
      title: 'Device',
      question: 'Which device needs service?',
      kind: 'choice',
      field: 'svcDevice',
      options: Object.entries(SERVICE_DEVICE_LABELS).map(([value, label]) => ({ value, label })),
      check: (a) => (a.svcDevice ? '' : 'Choose mobile or computer.'),
    },
    {
      key: 'brandModel',
      title: 'Brand & Model',
      question: 'What is the brand and model?',
      kind: 'text',
      field: 'brandModel',
      maxLength: 60,
      placeholder: 'e.g. Samsung Galaxy A54, Dell Inspiron 15',
      check: (a) => (a.brandModel.trim() ? '' : 'Enter the brand and model.'),
    },
    {
      key: 'problem',
      title: 'Problem',
      question: 'What is the problem?',
      kind: 'choice',
      field: 'problem',
      // Problems for the chosen device
      options: (a) => (SERVICE_PROBLEMS[a.svcDevice] ?? []).map((v) => ({ value: v, label: v })),
      otherPlaceholder: 'Describe the problem in a few words',
      check: (a) => (picked(a, 'problem') ? '' : 'Choose the problem, or pick Other and type it.'),
    },
    {
      key: 'details',
      title: 'Problem Details',
      question: 'Tell us more about the problem',
      hint: 'When did it start, what happened, any error message. You can skip this.',
      kind: 'longtext',
      field: 'details',
      placeholder: 'e.g. Phone fell down yesterday, screen cracked and touch works only on the top half.',
    },
    {
      key: 'preference',
      title: 'Service Preference',
      question: 'How would you like it serviced?',
      kind: 'choice',
      field: 'preference',
      options: Object.entries(SERVICE_PREFERENCE_LABELS).map(([value, label]) => ({ value, label })),
      check: (a) => (a.preference ? '' : 'Choose how you would like it serviced.'),
    },
    {
      key: 'photo',
      title: 'Photo',
      question: 'Add a photo of the problem',
      hint: 'Optional, but it helps us check the problem and give a better estimate.',
      kind: 'photo',
    },
    {
      key: 'extra',
      title: 'Additional Requirement',
      question: 'Any other requirement?',
      hint: 'Optional. E.g. a preferred time, or anything else we should know.',
      kind: 'extra',
      placeholder: 'Write any other requirement here.',
    },
  ],
};

const budgetCheck = (a) => (a.budget !== '' && Number(a.budget) > 0 ? '' : 'Enter your budget.');
const stepProblem = (step, a) => (step.kind === 'budget' ? budgetCheck(a) : step.check?.(a) ?? '');

/** The answers as the API expects them */
const toPayload = (category, a) => {
  const base = { category, budget: a.budget === '' ? null : Number(a.budget), message: a.message.trim() };
  if (category === 'mobile') {
    return { ...base, mobile: { brand: picked(a, 'brand'), ramRom: picked(a, 'ramRom'), features: a.features } };
  }
  if (category === 'accessories') {
    return {
      ...base,
      accessories: {
        type: a.accType,
        item: picked(a, 'item'),
        brandPreference: a.brandPreference.trim(),
        device: a.device.trim(),
        quantity: Number(a.quantity),
      },
    };
  }
  if (category === 'service') {
    return {
      ...base,
      // No budget question for service
      budget: null,
      service: {
        device: a.svcDevice,
        brandModel: a.brandModel.trim(),
        problem: picked(a, 'problem'),
        details: a.details.trim(),
        preference: a.preference,
      },
    };
  }
  return base;
};

/** Short recap of what has been answered so far */
const recap = (category, a, upTo) => {
  const steps = STEPS[category].slice(0, upTo);
  const has = (key) => steps.some((s) => s.key === key);
  const parts =
    category === 'mobile'
      ? [has('brand') && picked(a, 'brand'), has('ramRom') && picked(a, 'ramRom')]
      : category === 'service'
        ? [
            has('svcDevice') && SERVICE_DEVICE_LABELS[a.svcDevice],
            has('brandModel') && a.brandModel.trim(),
            has('problem') && picked(a, 'problem'),
            has('preference') && SERVICE_PREFERENCE_LABELS[a.preference],
            has('photo') && a.photo && 'Photo added',
          ]
        : [
          has('accType') && ACCESSORY_TYPE_LABELS[a.accType],
          has('item') && picked(a, 'item'),
          has('brandPreference') && a.brandPreference.trim() && `Brand: ${a.brandPreference.trim()}`,
          has('device') && a.device.trim() && `For: ${a.device.trim()}`,
          has('quantity') && `Qty ${a.quantity}`,
        ];
  if (has('budget') && a.budget) parts.push(formatINR(Number(a.budget)));
  return parts.filter(Boolean).join(' · ');
};

const inputClass =
  'w-full px-3 py-2 bg-white border border-stone-300 rounded-lg text-[13px] text-stone-900 focus:outline-hidden focus:border-brand-600';

const Chip = ({ selected, onClick, children }) => (
  <button
    type="button"
    aria-pressed={selected}
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer inline-flex items-center gap-1 ${
      selected ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-stone-200 text-stone-700 hover:border-brand-300'
    }`}
  >
    {selected && <Check className="w-3 h-3" />}
    {children}
  </button>
);

/** Make an Inquiry: Mobile, Accessories and Service each ask their own questions step by step */
export const InquiryPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Opened from a Home shortcut: /inquiry?type=mobile
  const [searchParams] = useSearchParams();
  const [category, setCategory] = useState(() =>
    CATEGORIES.some((c) => c.key === searchParams.get('type')) ? searchParams.get('type') : ''
  );
  const [answers, setAnswers] = useState(EMPTY_ANSWERS);
  const [stepIndex, setStepIndex] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  // Inquiry was sent but its photo could not be uploaded
  const [photoFailed, setPhotoFailed] = useState(false);
  const [preparingPhoto, setPreparingPhoto] = useState(false);
  const [history, setHistory] = useState(null);

  // Preview of the chosen problem photo (a data URL of the resized photo, so nothing to clean up)
  const [photoPreview, setPhotoPreview] = useState(null);

  useEffect(() => {
    let active = true;
    inquiryService
      .listMine()
      .then((items) => active && setHistory(items))
      .catch(() => active && setHistory([]));
    return () => {
      active = false;
    };
  }, []);

  const steps = STEPS[category];
  const step = steps?.[stepIndex];
  const lastStep = steps ? stepIndex === steps.length - 1 : true;

  const setAnswer = (field, value) => {
    setAnswers((prev) => ({
      ...prev,
      [field]: value,
      // Problems depend on the device: a new device starts the problem over
      ...(field === 'svcDevice' && value !== prev.svcDevice ? { problem: '', problemOther: '' } : {}),
    }));
    setError('');
  };

  const chooseCategory = (key) => {
    setCategory(key);
    setStepIndex(0);
    setSent(false);
    setPhotoFailed(false);
    setError('');
  };

  const pickPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // picking the same photo again still triggers a change
    if (!file) return;
    setError('');
    setPreparingPhoto(true);
    try {
      const blob = await toScaledPhoto(file);
      const preview = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('This photo could not be opened. Try another one.'));
        reader.readAsDataURL(blob);
      });
      setAnswer('photo', blob);
      setPhotoPreview(preview);
    } catch (err) {
      setError(err.message);
    } finally {
      setPreparingPhoto(false);
    }
  };

  const next = () => {
    const problem = stepProblem(step, answers);
    if (problem) return setError(problem);
    setError('');
    setStepIndex((i) => i + 1);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!category) return setError('Choose what you are looking for.');
    // Enter on an earlier step moves on instead of sending
    if (!lastStep) return next();
    const firstProblem = steps.findIndex((s) => stepProblem(s, answers));
    if (firstProblem >= 0) {
      setStepIndex(firstProblem);
      return setError(stepProblem(steps[firstProblem], answers));
    }
    setSending(true);
    try {
      let inquiry = await inquiryService.create(toPayload(category, answers));
      // The photo goes up after the inquiry exists; the inquiry counts as sent even if it fails
      let photoUploadFailed = false;
      if (category === 'service' && answers.photo) {
        try {
          inquiry = await inquiryService.uploadPhoto(inquiry.id, answers.photo);
        } catch {
          photoUploadFailed = true;
        }
      }
      setHistory((prev) => [inquiry, ...(prev ?? [])]);
      setPhotoFailed(photoUploadFailed);
      // Remember the lead number ("SM-007") to show in the confirmation
      setSent(inquiry.leadCode || true);
      setCategory('');
      setAnswers(EMPTY_ANSWERS);
      setPhotoPreview(null);
      setStepIndex(0);
    } catch (err) {
      setError(err.message || 'Could not send your inquiry. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const toggleFeature = (feature) =>
    setAnswer(
      'features',
      answers.features.includes(feature) ? answers.features.filter((f) => f !== feature) : [...answers.features, feature]
    );

  const budgetInput = (
    <input
      id="inquiry-budget"
      type="number"
      inputMode="numeric"
      min="0"
      max="10000000"
      value={answers.budget}
      onChange={(e) => setAnswer('budget', e.target.value)}
      placeholder="e.g. 20000"
      className={`${inputClass} tabular-nums`}
    />
  );

  const renderStep = () => {
    switch (step.kind) {
      case 'choice': {
        const value = answers[step.field];
        const withOther = step.allowOther ?? Boolean(step.otherPlaceholder);
        const options = typeof step.options === 'function' ? step.options(answers) : step.options;
        return (
          <div className="space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {options.map((o) => (
                <Chip key={o.value} selected={value === o.value} onClick={() => setAnswer(step.field, o.value)}>
                  {o.label}
                </Chip>
              ))}
              {withOther && (
                <Chip selected={value === OTHER} onClick={() => setAnswer(step.field, OTHER)}>
                  {OTHER}
                </Chip>
              )}
            </div>
            {withOther && value === OTHER && (
              <input
                aria-label={`${step.title}: other`}
                value={answers[`${step.field}Other`]}
                onChange={(e) => setAnswer(`${step.field}Other`, e.target.value)}
                maxLength={60}
                placeholder={step.otherPlaceholder}
                className={inputClass}
                autoFocus
              />
            )}
          </div>
        );
      }
      case 'text':
        return (
          <input
            aria-label={step.title}
            value={answers[step.field]}
            onChange={(e) => setAnswer(step.field, e.target.value)}
            maxLength={step.maxLength}
            placeholder={step.placeholder}
            className={inputClass}
            autoFocus
          />
        );
      case 'longtext':
        return (
          <textarea
            aria-label={step.title}
            rows={4}
            maxLength={1000}
            value={answers[step.field]}
            onChange={(e) => setAnswer(step.field, e.target.value)}
            placeholder={step.placeholder}
            className={`${inputClass} resize-none`}
            autoFocus
          />
        );
      case 'photo':
        return photoPreview ? (
          <div className="relative w-fit">
            <img
              src={photoPreview}
              alt="Photo of the problem"
              className="max-h-56 rounded-xl border border-stone-200 object-contain bg-stone-50"
            />
            <button
              type="button"
              onClick={() => {
                setAnswer('photo', null);
                setPhotoPreview(null);
              }}
              aria-label="Remove photo"
              className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-stone-900/70 text-white flex items-center justify-center cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          // No `capture`: the phone offers both the camera and the gallery
          <label
            className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 py-7 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors ${
              preparingPhoto ? 'opacity-60 pointer-events-none' : ''
            }`}
          >
            <Camera className="w-6 h-6 text-brand-600" />
            <span className="text-[13px] font-bold text-stone-800">{preparingPhoto ? 'Preparing photo...' : 'Take or choose a photo'}</span>
            <span className="text-[11px] text-stone-400">JPG or PNG</span>
            <input type="file" accept={PHOTO_ACCEPT} onChange={pickPhoto} className="sr-only" />
          </label>
        );
      case 'quantity': {
        const n = Number(answers.quantity) || 0;
        const stepper = 'w-10 h-10 rounded-lg border border-stone-300 flex items-center justify-center text-stone-700 hover:bg-stone-50 cursor-pointer disabled:opacity-40';
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="Fewer"
              disabled={n <= 1}
              onClick={() => setAnswer('quantity', String(Math.max(1, n - 1)))}
              className={stepper}
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              aria-label="Quantity"
              type="number"
              inputMode="numeric"
              min="1"
              max={MAX_QUANTITY}
              value={answers.quantity}
              onChange={(e) => setAnswer('quantity', e.target.value)}
              className={`${inputClass} w-24 text-center tabular-nums font-bold`}
            />
            <button
              type="button"
              aria-label="More"
              disabled={n >= MAX_QUANTITY}
              onClick={() => setAnswer('quantity', String(Math.min(MAX_QUANTITY, n + 1)))}
              className={stepper}
            >
              <Plus className="w-4 h-4" />
            </button>
            <span className="text-[12px] text-stone-500">piece{n === 1 ? '' : 's'}</span>
          </div>
        );
      }
      case 'budget':
        return (
          <div className="space-y-1">
            <label htmlFor="inquiry-budget" className="text-[11px] font-bold text-stone-700 block">
              Your Budget (₹)
            </label>
            {budgetInput}
          </div>
        );
      case 'extra':
        return (
          <div className="space-y-2.5">
            {step.features && (
              <div className="flex flex-wrap gap-1.5">
                {step.features.map((feature) => (
                  <Chip key={feature} selected={answers.features.includes(feature)} onClick={() => toggleFeature(feature)}>
                    {feature}
                  </Chip>
                ))}
              </div>
            )}
            <textarea
              aria-label={step.title}
              rows={4}
              maxLength={1000}
              value={answers.message}
              onChange={(e) => setAnswer('message', e.target.value)}
              placeholder={step.placeholder}
              className={`${inputClass} resize-none`}
            />
            {step.features && <p className="text-[10.5px] text-stone-400">Optional. Tap any that matter to you.</p>}
          </div>
        );
      default:
        return null;
    }
  };

  const summary = steps && stepIndex > 0 ? recap(category, answers, stepIndex) : '';

  return (
    <div className="flex-1 flex flex-col">
      <div className="sticky top-0 z-20 bg-cream-50/95 backdrop-blur-sm border-b border-stone-200/80 px-3 py-2.5 flex items-center gap-2">
        <button
          type="button"
          onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/home'))}
          aria-label="Go back"
          className="w-8 h-8 rounded-lg hover:bg-stone-100 flex items-center justify-center text-stone-700 cursor-pointer"
        >
          <ArrowLeft className="w-4.5 h-4.5" />
        </button>
        <h1 className="text-[15px] font-black text-ink-900 tracking-tight">Make an Inquiry</h1>
      </div>

      <div className="p-3.5 sm:p-4 space-y-3">
        {sent && (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200/80 p-3 flex items-start gap-2.5 text-[12px]">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-emerald-900">Inquiry sent</p>
              <p className="text-emerald-800">The store team will contact you soon.</p>
              {typeof sent === 'string' && (
                <p className="text-emerald-800 mt-0.5">
                  Your inquiry number is <span className="font-mono font-bold text-emerald-900">{sent}</span>
                </p>
              )}
              {photoFailed && (
                <p className="text-amber-800 mt-0.5">
                  The photo could not be uploaded, but your inquiry was sent. You can show the problem at the store.
                </p>
              )}
            </div>
          </div>
        )}

        <form
          onSubmit={submit}
          className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] p-3 space-y-3.5"
        >
          <div className="space-y-1.5">
            <p className="text-[11px] font-bold text-stone-700">What are you looking for?</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Inquiry type">
              {CATEGORIES.map(({ key, icon: Icon, hint }) => {
                const selected = category === key;
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => chooseCategory(key)}
                    className={`rounded-xl border p-2.5 flex flex-col items-center gap-1 text-center transition-colors cursor-pointer ${
                      selected
                        ? 'border-brand-600 bg-brand-50 ring-1 ring-brand-600'
                        : 'border-stone-200 hover:bg-stone-50'
                    }`}
                  >
                    <Icon className={`w-5 h-5 ${selected ? 'text-brand-700' : 'text-stone-500'}`} />
                    <span className={`text-[12px] font-bold ${selected ? 'text-brand-800' : 'text-stone-800'}`}>
                      {INQUIRY_CATEGORY_LABELS[key]}
                    </span>
                    <span className="text-[9.5px] text-stone-400 leading-tight">{hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {steps ? (
            <div className="space-y-3 pt-0.5">
              {/* Progress */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold">
                  <span className="text-brand-700 uppercase tracking-wider shrink-0">
                    Step {stepIndex + 1} of {steps.length}
                  </span>
                  <span className="text-stone-400 truncate">{step.title}</span>
                </div>
                <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }}>
                  {steps.map((s, i) => (
                    <div key={s.key} className={`h-1 rounded-full ${i <= stepIndex ? 'bg-brand-600' : 'bg-stone-200'}`} />
                  ))}
                </div>
              </div>

              <div>
                <p className="text-[14px] font-black text-ink-900 leading-snug">{step.question}</p>
                {step.hint && <p className="text-[11px] text-stone-500 mt-0.5">{step.hint}</p>}
              </div>

              {renderStep()}

              {summary && (
                <p className="text-[11px] text-stone-500 bg-stone-50 border border-stone-100 rounded-lg px-2.5 py-1.5">{summary}</p>
              )}

              {error && <p className="text-[11px] text-rose-600">{error}</p>}

              <div className="flex gap-2">
                {stepIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setError('');
                      setStepIndex((i) => i - 1);
                    }}
                    className="px-4 py-2.5 rounded-xl border border-stone-300 text-stone-700 font-bold text-[13px] hover:bg-stone-50 cursor-pointer"
                  >
                    Back
                  </button>
                )}
                {/* Separate keys: React must not turn the clicked Next button into a submit button mid-click */}
                {lastStep ? (
                  <button
                    key="send"
                    type="submit"
                    disabled={sending}
                    className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-[13px] transition-colors active:scale-[0.99] cursor-pointer disabled:opacity-60"
                  >
                    {sending ? 'Sending...' : 'Send Inquiry'}
                  </button>
                ) : (
                  <button
                    key="next"
                    type="button"
                    onClick={next}
                    className="flex-1 py-2.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-[13px] transition-colors active:scale-[0.99] cursor-pointer"
                  >
                    {/* Optional steps say Skip until something is filled in */}
                    {step.check || step.kind === 'budget'
                      ? 'Next'
                      : (step.kind === 'photo' ? answers.photo : answers[step.field]?.trim?.())
                        ? 'Next'
                        : 'Skip'}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-stone-400">Choose one to start.</p>
          )}
        </form>

        {history?.length > 0 && (
          <div className="bg-white rounded-xl border border-stone-200/90 shadow-[0_1px_2px_rgba(15,32,66,0.03)] overflow-hidden">
            <div className="px-3 py-2 bg-stone-50/80 border-b border-stone-100">
              <h3 className="text-[10.5px] font-bold uppercase tracking-wider text-stone-600">My Inquiries</h3>
            </div>
            <ul className="divide-y divide-stone-100">
              {history.map((inq) => {
                const badge = STATUS_BADGE[inq.status] ?? STATUS_BADGE.new;
                const details = inq.mobile
                  ? describeMobileInquiry(inq.mobile)
                  : inq.accessories
                    ? describeAccessoriesInquiry(inq.accessories)
                    : inq.service
                      ? describeServiceInquiry(inq.service)
                      : '';
                return (
                  <li key={inq.id} className="px-3 py-2.5 flex items-start gap-2.5 text-xs">
                    <div className="w-6.5 h-6.5 rounded bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                      <MessageSquareText className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-stone-800">
                          {inq.leadCode && <span className="font-mono text-stone-500 mr-1.5">{inq.leadCode}</span>}
                          {INQUIRY_CATEGORY_LABELS[inq.category]}
                          {inq.budget != null && (
                            <span className="font-semibold text-stone-500"> · {formatINR(inq.budget)}</span>
                          )}
                        </span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[9.5px] font-bold ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      {details && <p className="text-stone-700 font-semibold leading-snug mt-0.5">{details}</p>}
                      {inq.service?.details && (
                        <p className="text-stone-600 leading-snug break-words mt-0.5">{inq.service.details}</p>
                      )}
                      {inq.message && <p className="text-stone-600 leading-snug break-words mt-0.5">{inq.message}</p>}
                      {inq.photo && (
                        <a href={inquiryPhotoUrl(inq.photo)} target="_blank" rel="noreferrer" className="inline-block mt-1">
                          <img
                            src={inquiryPhotoUrl(inq.photo)}
                            alt="Photo of the problem"
                            className="w-16 h-16 rounded-lg object-cover border border-stone-200"
                          />
                        </a>
                      )}
                      <p className="text-[10px] text-stone-400 mt-0.5">{formatDate(inq.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};
