// Constants shared by the service worker (ES module import), content scripts and
// extension pages (classic <script>). Sets globalThis.PWShared.
globalThis.PWShared = {
  TONES: [
    { id: 'neutral', label: 'Neutral' },
    { id: 'friendly', label: 'Friendly' },
    { id: 'confident', label: 'Confident' },
    { id: 'professional', label: 'Professional' },
    { id: 'diplomatic', label: 'Diplomatic' },
    { id: 'concise', label: 'Concise' },
    { id: 'persuasive', label: 'Persuasive' },
    { id: 'empathetic', label: 'Empathetic' },
  ],
  FORMALITY: ['Very casual', 'Casual', 'Neutral', 'Formal', 'Very formal'],
  DEFAULTS: {
    provider: 'openrouter',
    // Per-provider connection settings, so switching providers keeps each key.
    connections: {},
    autoCheck: true,
    delayMs: 1200,
    minChars: 12,
    tone: 'neutral',
    formality: 3,
    dialect: '',
    theme: 'priority',
    disabledSites: [],
  },
  MAX_CHARS: 8000,
};
