# Sidechat AI

Extensão para **Chrome** e **Brave** que facilita conversar com LLMs a partir de texto selecionado em qualquer página — no estilo do botão do Google Tradutor, mas com chat.

## O que faz

1. Você seleciona um texto na página.
2. Aparece um botão **AI**.
3. Ao clicar, abre um popup de chat com o texto pré-preenchido.
4. Você escolhe/cria uma sessão, ajusta provider/modelo se quiser, edita a mensagem e só então clica em **Enviar**.
5. Nada é enviado à API até o clique em **Enviar**.

Providers suportados: **OpenAI**, **Groq**, **Anthropic**, **OpenRouter**.

## Requisitos

- Node.js 18+ (para build)
- Chrome ou Brave

## Instalar (uso local)

```bash
npm install
npm run build
```

1. Abra `chrome://extensions` (Chrome) ou `brave://extensions` (Brave).
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** / **Load unpacked**.
4. Selecione a pasta de output do WXT, em geral:

   `.output/chrome-mv3`

## Configurar

1. Clique no ícone da extensão → **Configurar**, ou abra as Options da extensão.
2. Crie uma **senha mestre** (cofre). As API keys são cifradas em disco com essa senha.
3. **Desbloqueie** o cofre.
4. Cole as **API keys / tokens** dos providers que for usar e salve cada uma.
5. Defina **provider padrão** e **modelo LLM padrão** (ou um model id customizado).
6. Salve as preferências.

O desbloqueio dura a sessão do navegador (sobrevive ao restart do service worker). Ao fechar o navegador, o cofre bloqueia de novo.

## Usar

1. Desbloqueie o cofre nas Options (se estiver bloqueado).
2. Em qualquer página, selecione um trecho de texto.
3. Clique no botão **AI**.
4. Escolha uma sessão existente ou **Nova**.
5. Edite a mensagem no composer (o texto selecionado já vem preenchido).
6. Clique em **Enviar** (ou Enter). Shift+Enter quebra linha.
7. A resposta aparece em streaming no popup.

Pelo chat você também pode trocar provider/modelo entre os configurados, ou abrir **Configurar…** para editar tokens.

## Desenvolvimento

```bash
npm run dev
```

O WXT abre o navegador com a extensão em modo desenvolvimento (hot reload). Se algo não atualizar, recarregue a extensão em `chrome://extensions`.

```bash
npm run compile   # typecheck
npm run build     # build de produção
```

## Privacidade e segurança

- **Envio manual:** seleção e abertura do popup **não** chamam a API.
- **Keys:** armazenadas cifradas (`AES-GCM` + senha mestre via `PBKDF2`) em `chrome.storage.local`. Após o unlock, ficam também em `chrome.storage.session` (memória da sessão do navegador) para sobreviver ao restart do service worker MV3; limpam ao fechar o navegador ou ao bloquear.
- **Keys nunca** são enviadas ao content script nem renderizadas depois de salvas.
- **Histórico** fica só no navegador (`chrome.storage.local`), sem sync.
- **Texto selecionado e mensagens** vão ao provider escolhido — não use com dados sensíveis.
- Respostas do modelo são renderizadas como **texto puro** (sem HTML) para reduzir risco de XSS.
- O messaging interno valida o `sender` da extensão e o schema das mensagens.

### Modelo de ameaça (resumo)

| Risco | Mitigação / residual |
| --- | --- |
| Keys em plaintext no disco | Cifradas com senha mestre |
| Página maliciosa | Sem `postMessage` com a página; keys só no background |
| XSS via resposta do LLM | UI só texto |
| Malware no SO / dump de memória | Após unlock, keys existem em memória — risco residual |
| Provider vê o conteúdo | Inerente ao uso de APIs de LLM |

Uso recomendado: pessoal / desenvolvimento, com keys próprias.

## Estrutura

- `entrypoints/background.ts` — cofre, providers, streaming
- `entrypoints/content/` — botão de seleção + chat popup
- `entrypoints/options/` — configuração
- `entrypoints/popup/` — status + atalho Configurar
- `lib/` — crypto, storage, providers, messaging
