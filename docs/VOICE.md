# Tutor com voz (TTS pt-BR) — porte do Vitaliza

Camada de **voz humana pt-BR** para o tutor do fairgate. Porte do `lib/tts` do Vitaliza, **sem deps**,
em uma única função serverless (`api/tts.js`). O **tutor (texto) continua no `api/tutor.js`** (DeepSeek);
o TTS é **server-side** com **fallback automático** entre provedores e **degradação** para a voz do navegador.

## Como funciona (3 camadas de voz)
1. O tutor (`/api/tutor`, DeepSeek) gera a resposta em **texto** (conversacional — histórico de mensagens).
2. Ao ler em voz (toggle 🔊 ou "explicar esta fase"), o cliente chama **`POST /api/tts`**.
3. O servidor **normaliza o texto para fala** (remove markdown/URLs, trata `%`/`R$`/siglas, prosódia),
   escolhe o provedor (`TTS_PROVIDER`) e, em falha, tenta o `TTS_FALLBACK_PROVIDER`.
4. Retorna **`audio/mpeg`** (`X-TTS-Provider` indica quem sintetizou). O cliente toca o mp3.
5. Se **nenhum provedor estiver configurado** (501) ou erro (502), o cliente cai na **voz do navegador**
   (`SpeechSynthesis`, escolhendo a voz pt-BR mais natural). **Sempre funciona** — degrada, não quebra.

Voz de entrada (microfone): `SpeechRecognition` pt-BR no navegador (botão 🎙 do dock).

## Vozes (originalmente pt-BR — anti-robotização)
| Provedor | Voz | Estado |
|---|---|---|
| **Google Cloud TTS** | **`pt-BR-Chirp3-HD-Charon`** — masculina, **nativa pt-BR**, a mais natural do Google (Chirp3-HD) | ✅ **ao vivo** (service-account) |
| **ElevenLabs** | `eleven_multilingual_v2` + voz nativa BR (`ELEVENLABS_VOICE_ID`) | ⚠️ requer chave válida (a do Vitaliza expirou) |
| **Navegador** | melhor voz pt-BR local (Google/Natural/Neural) | ✅ sempre (fallback) |

> Chirp3-HD não aceita `pitch`; `audioConfig` usa MP3 + `speakingRate 1.0`.

## Variáveis de ambiente (server-side — segredos NUNCA no cliente)
| Var | Default | Descrição |
|---|---|---|
| `TTS_ENABLED` | `true` | liga/desliga o TTS de servidor |
| `TTS_PROVIDER` | `google` | provedor principal |
| `TTS_FALLBACK_PROVIDER` | `elevenlabs` | fallback |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | — | **segredo**: JSON da service-account (inline; gera OAuth via JWT) |
| `GOOGLE_TTS_API_KEY` | — | **segredo** alternativo (API key simples) |
| `GOOGLE_TTS_VOICE_NAME` | `pt-BR-Chirp3-HD-Charon` | voz Google (masculina nativa) |
| `GOOGLE_TTS_LANGUAGE_CODE` | `pt-BR` | idioma |
| `ELEVENLABS_API_KEY` | — | **segredo**; ativa o ElevenLabs |
| `ELEVENLABS_VOICE_ID` | (multilíngue) | use o ID de uma **voz nativa brasileira** da sua biblioteca |
| `ELEVENLABS_MODEL_ID` | `eleven_multilingual_v2` | modelo (pronúncia pt-BR) |

## Ativar a voz ElevenLabs nativa pt-BR
1. Conta em https://elevenlabs.io → **Settings → API Keys** → crie a chave.
2. Em **Voices / Voice Library**, adicione uma **voz brasileira nativa** (filtre por Portuguese · Brazil) e
   copie o **Voice ID**.
3. Na Vercel (Project → Settings → Environment Variables): `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`.
4. Redeploy. O `GET /api/tts` passa a mostrar `elevenlabs: configured=true`.

## Testar (produção)
```bash
curl -s https://fairgate-eight.vercel.app/api/tts | jq           # status dos provedores
curl -s -X POST https://fairgate-eight.vercel.app/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Olá, eu sou o tutor do fairgate."}' --output tutor.mp3   # síntese (Google Charon)
```

## Segurança
- Segredos só em env var no **servidor**; nunca em `.next`/cliente/repo.
- `api/tts.js`: rate-limit por IP, cap de input (8000), Content-Type validado, sanitização do BOM.
- P3: o tutor (texto e voz) **só ensina** — nunca altera o veredito do gate (determinístico em Python).
