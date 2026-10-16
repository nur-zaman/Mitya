import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Mitya',
    description:
      'A quiet co-pilot for Google Meet. Reads live captions and suggests what to ask next.',
    permissions: ['storage', 'sidePanel'],
    host_permissions: ['https://meet.google.com/*'],
    // Requested when the user picks a provider, so the install prompt stays small.
    optional_host_permissions: [
      'https://api.groq.com/*',
      'https://api.openai.com/*',
      'https://api.anthropic.com/*',
      'https://auth.openai.com/*',
      'https://chatgpt.com/*',
      'http://localhost:1455/*',
    ],
    action: { default_title: 'Open Mitya' },
    commands: {
      'ask-now': {
        suggested_key: { default: 'Alt+Shift+M' },
        description: 'Ask Mitya for a suggestion right now',
      },
    },
  },
  webExt: { disabled: true },
});
