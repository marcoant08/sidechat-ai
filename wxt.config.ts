import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '🤖 sidechat-ai',
    description:
      'Selecione texto em qualquer página e converse com LLMs (OpenAI, Groq, Anthropic, OpenRouter).',
    permissions: ['storage'],
    host_permissions: [
      'https://api.openai.com/*',
      'https://api.groq.com/*',
      'https://api.anthropic.com/*',
      'https://openrouter.ai/*',
    ],
    // Os wallpapers foram removidos: o fundo do chat agora é cor sólida em CSS.
    web_accessible_resources: [],
  },
});


