# Regras de Notificação por E-mail (pré-production)

Este projeto já possui um endpoint de cron em **`/api/cron/email-notifications`**.

Por padrão, ele opera em **modo preview** (não envia). Para envio, é necessário:

- `ENABLE_EMAIL_NOTIFICATIONS=1`
- `CRON_TOKEN` (e enviar via header `x-cron-token` ou query `?token=...`)
- SMTP configurado (variáveis descritas em `EMAIL_SMTP_SETUP.md`)

## Regras propostas (para validação)

### 1) `task_overdue_daily` (diário)
- **Quando:** diariamente (ex.: 08:00)
- **Quem recebe:** responsável (`immersion_tasks.responsible_id`)
- **O que envia:** lista de tarefas com `due_date < hoje` e `status != Concluída`
- **Objetivo:** reduzir backlog e evitar atrasos silenciosos.

### 2) `task_due_soon_weekly` (semanal)
- **Quando:** semanal (ex.: segunda 08:00)
- **Quem recebe:** responsável
- **O que envia:** tarefas com `due_date` entre hoje e +7 dias e `status != Concluída`
- **Objetivo:** antecipar riscos de prazo.

### 3) `immersion_risk_daily` (diário)
- **Quando:** diariamente (ex.: 08:30)
- **Quem recebe:** Consultor, Designer, Produção vinculados à imersão
- **Gatilhos sugeridos (MVP):**
  - tarefas atrasadas > 0
  - tarefas vencendo hoje > 0
  - imersão com status prestes a iniciar e checklist incompleto
- **Objetivo:** governança operacional.

## Endpoint

- **Preview:** `GET /api/cron/email-notifications?token=...`
- **Envio real:** habilitar `ENABLE_EMAIL_NOTIFICATIONS=1`.

O endpoint retorna `preview_count` e, quando habilitado, `sent` e `failures`.