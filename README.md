<p align="center">
  <img src="assets/icon.svg" width="72" height="72" alt="" />
</p>

<h1 align="center">Mitya</h1>

<p align="center">A quiet co-pilot for Google Meet. It reads the live captions and,<br />now and then, slips you a note. Usually a question to ask, or a claim you should check before nodding along.</p>



## What it does

- **It reads Meet's own captions.** There's no audio capture and no bot in the call. If captions are on, Mitya can follow along.
- **Notes come in four kinds:**
  - **Ask**: a follow-up question you can say out loud as written.
  - **Flag**: something that sounds vague or doesn't add up, with a line on why.
  - **Remind**: you're drifting, running out of time, or skipping an agenda item.
  - **Explain**: a term you might not know, in one plain sentence.
- **You tell it what the meeting is for.** Before the call, write a short brief: the kind of meeting (interview, 1:1, discovery call, negotiation, general), your goal, an agenda, and any background you have, like a job description or CV.
- **Agenda items tick themselves off** as they come up in conversation.
- **You get a recap when the call ends**: a summary, agenda coverage, key points, things to verify, and follow-ups. Copy it or download it as Markdown.
- **It stays out of the way.** A small draggable card floats over Meet. The full view lives in Chrome's side panel, which doesn't show up when you share a tab.

Mitya waits for the other person to finish talking before it thinks about anything. Most of the time it decides to say nothing, which is the point. If you want its take right now, press **Ask now** (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>M</kbd>).

## Model providers

Pick one in settings.

| Provider                                            | Sign-in              | Notes                                                                                                                                          |
| --------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [Groq](https://console.groq.com/keys)               | API key              | Free tier, and very fast. The free tier tops out around 8K tokens a minute, so Mitya keeps prompts short and spaces out its checks. |
| [Claude](https://platform.claude.com/settings/keys) | API key              | Anthropic API, billed per use.                                                                                                                 |
| ChatGPT                                             | Your ChatGPT account | **Experimental.** See below.                                                                                                                   |
| [OpenAI](https://platform.openai.com/api-keys)      | API key              | Official API, billed per use.                                                                                                                  |

For each provider you choose the model and, if the model supports it, how much it **thinks** before answering. Keep that low during a live call. A great note that shows up two minutes late is no use to anyone. **Fast mode** asks for faster processing where the provider offers it (Claude Opus models, ChatGPT, and OpenAI). It's quicker, but it costs more or eats more of your plan.

### About "Sign in with ChatGPT"

This uses the same sign-in flow as OpenAI's open-source [Codex CLI](https://github.com/openai/codex), so requests count against your ChatGPT plan instead of API credits. OpenAI does not offer this as a public API for third-party apps. It may break without notice, and you are responsible for making sure your use complies with OpenAI's terms. If you need it to just work, use an API key.

Claude is API-key only. Anthropic doesn't allow third-party apps to sign in with a Claude.ai subscription, so Mitya doesn't offer that.

## Install

Mitya isn't on the Chrome Web Store yet. To run it from source:

```sh
git clone <this repo>
cd mitya
npm install
npm run build
```

Then open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and choose `.output/chrome-mv3`.

Click the Mitya icon to open the side panel, go to settings, and connect a provider. Mitya asks for permission to reach that provider's API the first time you connect.

## Using it

1. Open the side panel and fill in the **Brief**. Even a one-line goal and two or three agenda items make the notes a lot sharper.
2. Join your Meet call and turn on captions (press <kbd>c</kbd>, or use the link on Mitya's card).
3. Talk. Notes show up on the card and in the **Live** tab.
4. When you leave the call, or press **End**, Mitya writes the recap. Past meetings live under **History**.

You can edit the brief mid-call, tick agenda items yourself, dismiss notes, or pause Mitya.

## Privacy

- Transcripts, briefs, and recaps are stored in your browser's extension storage and nowhere else.
- The only data that leaves your machine is what gets sent to the model provider you picked: your brief and recent transcript, when Mitya checks in or writes a recap.
- API keys and ChatGPT tokens are stored locally and sent only to their own provider.
- There is no Mitya server and no analytics.

Tell the people on the call that you're using captions and an AI assistant. In some places the law requires it, and it's polite everywhere else.

## Development

```sh
npm run dev        # builds .output/chrome-mv3-dev and reloads the extension on change
npm test           # unit tests (Vitest)
npm run typecheck
npm run format
```

For development, load `.output/chrome-mv3-dev` instead of the production build. After a content-script change, reload the Meet tab.

The extension is built with [WXT](https://wxt.dev), React, and TypeScript.

```
src/
  entrypoints/
    background.ts        session lifecycle, deciding when to ask the model
    meet.content/        caption watcher and the floating card inside Meet
    sidepanel/           brief, live view, history, settings
  lib/
    captions/            turns Meet's ever-changing caption text into stable utterances
    meet/dom.ts          every Meet selector lives here
    llm/                 providers, prompts, ChatGPT sign-in
    session/             session state and the trigger rules
```

### When Meet changes

Google changes Meet's markup whenever it likes. If Mitya stops seeing captions, the fix is almost always in [`src/lib/meet/dom.ts`](src/lib/meet/dom.ts). It prefers stable attributes such as roles, `aria-label`, and `jsname`, falls back to structure, and keeps every selector in one place.

## Roadmap

- Local transcription with Whisper, for meetings without captions and for platforms other than Meet
- Per-meeting briefs pulled from Google Calendar
- Better recaps for very long meetings on rate-limited providers

## License

[MIT](LICENSE)
