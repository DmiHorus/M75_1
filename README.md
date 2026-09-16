# ADR Generation Pipeline

n8n-пайплайн, который превращает запись завершённой встречи с заказчиком в Architecture Decision Record (ADR) и отдаёт его архитектору на ревью перед публикацией.

n8n — единственная среда выполнения: оркестрация, интеграции и AI-логика живут в одном workflow. LangChain подключён встроенными нодами n8n (Information Extractor, Basic LLM Chain, Structured Output Parser). Отдельный Langflow/AI-backend не нужен.

## Пайплайн

Порядок этапов фиксирован:

1. **Webhook Trigger** — событие о завершении встречи (Zoom/Teams или канонический JSON)
2. **Получение записи** — скачивание `recording_url`, либо готовый `transcript` для dry-run
3. **Speech-to-Text** — Whisper (`verbose_json`), timestamps и `speaker_id` сохраняются, если STT их отдаёт
4. **Препроцессинг / чанкинг** — очистка служебных фрагментов, нормализация, нарезка длинного транскрипта
5. **Контекст Jira / Confluence** — отдельные HTTP-ноды; сбой не останавливает workflow
6. **AI-экстракция** — четыре LangChain-ноды: Requirements, Constraints, Alternatives, Decisions
7. **Aggregate / Reduce** — дедуп, сопоставление альтернатив с решениями, поиск противоречий
8. **Генерация ADR**
9. **Validation**
10. **Human-in-the-loop** — Approve / Reject / Request changes; публикация только после Approve
11. **Публикация** — Confluence, Notion, Jira, Slack / Teams

## Структура

```
n8n/workflows/adr-generation-pipeline.json   # импортируемый n8n workflow
n8n/lib/                                     # логика Code-нод (источник истины)
n8n/credentials/credentials.example.json     # какие credential-типы создать в n8n
samples/webhook-canonical.json               # dry-run payload с готовым транскриптом
samples/webhook-zoom.json                    # пример Zoom recording.completed
scripts/build-workflow.js                    # пересборка JSON workflow из lib/
tests/                                       # unit-тесты валидации, агрегации, контракта workflow
docker-compose.yml                           # альтернативный запуск через Docker
.env.example                                 # шаблон переменных окружения
```

Секреты в workflow не зашиты. Ключи задаются в n8n Credentials, URL систем — через `.env`.

## Требования

- Node.js 18+
- n8n 1.82+ (проверено на 2.30.8)
- OpenAI API key (Whisper + chat models)
- Опционально: Jira, Confluence, Notion, Slack incoming webhook, Teams incoming webhook

## Запуск n8n локально

Инстанс проекта слушает [http://localhost:5678/](http://localhost:5678/). Данные хранятся в `.n8n/` репозитория, а не в `~/.n8n`.

```bash
cp .env.example .env
# заполните OPENAI_API_KEY и при необходимости URL Jira/Confluence/Slack/Notion

export N8N_HOST=localhost
export N8N_PORT=5678
export N8N_PROTOCOL=http
export WEBHOOK_URL=http://localhost:5678/
export N8N_EDITOR_BASE_URL=http://localhost:5678/
export N8N_SECURE_COOKIE=false
export N8N_USER_FOLDER="$(pwd)"
export N8N_BLOCK_ENV_ACCESS_IN_NODE=false
export GENERIC_TIMEZONE=Europe/Moscow

n8n start
```

Вход в editor:

- URL: http://localhost:5678/
- email: `admin@localhost.local`
- пароль: `AdrPipeline5678!`

После входа:

1. Откройте workflow **ADR Generation Pipeline** (уже импортирован в этот инстанс).
2. Привяжите credentials:
   - **OpenAI** (`openAiApi`) — chat/LangChain
   - **OpenAI Bearer** (`httpBearerAuth`) — Whisper
   - **Atlassian API Token** (`httpBasicAuth`) — Jira и Confluence
   - **Notion API** (`httpHeaderAuth`) — публикация страницы
3. Для dry-run активируйте workflow или запустите вручную: в Webhook Trigger уже запинен `samples/webhook-canonical.json`.

Если workflow ещё не импортирован:

**Workflows → Add workflow → ⋮ → Import from File** → `n8n/workflows/adr-generation-pipeline.json`.

### Docker

```bash
cp .env.example .env
docker compose up
```

Затем импортируйте тот же JSON через UI и привяжите credentials. Образ в `docker-compose.yml` — `n8nio/n8n:1.82.3`.

## Webhook

`POST http://localhost:5678/webhook/adr-meeting-completed`

Канонический payload:

```json
{
  "meeting_id": "meeting-123",
  "recording_url": "https://example.com/recordings/meeting-123.mp4",
  "participants": [{ "id": "Ada", "name": "Ada Lovelace" }],
  "start_time": "2026-09-16T10:00:00Z",
  "project_id": "PAY",
  "jira_epic_id": "PAY-100"
}
```

Если передать поле `transcript`, скачивание записи и Whisper пропускаются. Это основной способ прогнать пайплайн без аудиофайла. Примеры: `samples/webhook-canonical.json`, `samples/webhook-zoom.json`.

## Контракты данных

Промежуточная экстракция:

```json
{
  "requirements": [],
  "constraints": [],
  "alternatives": [],
  "decisions": [],
  "open_questions": [],
  "risks": []
}
```

Итоговый ADR:

```json
{
  "title": "ADR: <краткое описание решения>",
  "status": "Proposed",
  "context": "...",
  "decision": "...",
  "alternatives": [],
  "consequences": { "positive": [], "negative": [] },
  "open_questions": [],
  "risks": [],
  "source_meeting": "meeting-123"
}
```

Секции опубликованного документа совпадают с этим составом: Title, Status, Context, Decision, Alternatives, Consequences (Positive/Negative), Open Questions, Risks, Source Meeting.

## Поведение на неоднозначностях

| Ситуация | Результат |
| --- | --- |
| В транскрипте нет явного решения | `status: "Needs clarification"`, решение не выдумывается, HITL и публикация не блокируются |
| AI вернул невалидный JSON | retry с уточняющим промптом; при повторной ошибке — уведомление и останов, без публикации |
| Jira/Confluence недоступны | workflow продолжается, в контексте пометка `[INCOMPLETE CONTEXT]` |
| Противоречивые решения | статус `Needs clarification`, документ уходит архитектору на ревью |
| Reject / Request changes | публикация не выполняется |

Публикация физически недоступна, пока архитектор не нажмёт **Approve** в форме Human Review.

## Тесты и пересборка workflow

```bash
npm test
npm run build:workflow
```

`n8n/lib/` — исходники логики Code-нод. После правок lib пересоберите JSON командой `npm run build:workflow`, затем заново импортируйте workflow в n8n.

## Переменные окружения

См. `.env.example`. Основные:

| Переменная | Назначение |
| --- | --- |
| `OPENAI_API_KEY` | Whisper и LangChain; в n8n всё равно нужно создать credential |
| `JIRA_BASE_URL` | контекст эпика и комментарий с ADR |
| `CONFLUENCE_BASE_URL`, `CONFLUENCE_SPACE_KEY` | поиск контекста и публикация страницы |
| `SLACK_WEBHOOK_URL` | уведомление архитектору и результат ревью |
| `TEAMS_WEBHOOK_URL` | то же для Teams |
| `NOTION_DATABASE_ID` | публикация страницы Notion |

RAG / векторное хранилище заложено в контексте экстракции как опциональное расширение и для MVP не требуется.
