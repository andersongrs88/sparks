# Ativação de e-mail via SMTP (Gmail)

Este projeto envia e-mails por SMTP padrão, pensado para funcionar com Gmail/Google Workspace usando porta 587 (STARTTLS).

## 1) Pré-requisito (Gmail)
Para Gmail, use Senha de App (App Password):
1. Ative a Verificação em 2 etapas na sua conta Google.
2. Gere uma Senha de App (por exemplo: "Sparks").
3. Use essa senha no `SMTP_PASS` (não use sua senha normal).

## 2) Variáveis de ambiente (Vercel)
Defina em Settings → Environment Variables:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seuemail@gmail.com
SMTP_PASS=senha_de_app
EMAIL_FROM="Sparks <seuemail@gmail.com>"

# Proteção dos endpoints de e-mail/cron
CRON_TOKEN=um_token_aleatorio

# Supabase (server-side)
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_URL=...

# Opcional (link no e-mail)
APP_URL=https://seu-dominio.vercel.app
```

## 3) Teste rápido (antes do cron)
Após o deploy, teste o envio com:

`/api/test-email?token=SEU_TOKEN&to=seuemail@dominio.com`

Se retornar `{ ok: true }`, o SMTP está ok.

## 4) Digest diário (cron)
O endpoint do digest é:

`/api/cron/email-digest?token=SEU_TOKEN`

Ele envia 1 e-mail para cada responsável com tarefas que vencem nos próximos 7 dias.

## 5) Agendamento (Vercel Cron)
Crie um cron para chamar a URL 1x por dia (ex.: 07:00).
Use sempre o token (query ou header `x-cron-token`) para evitar execução indevida.
