# Setup rápido — Supabase Auth + RLS (MVP)

## 1) Variáveis de ambiente (Vercel e local)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 2) Ativar Email/Password
Supabase → Authentication → Providers → **Email** → Enable.

## 3) Criar schema + policies (RLS)
Supabase → SQL Editor → execute:
- `supabase/schema.sql`

Isso:
- cria as tabelas (immersions, immersion_tasks, checklist_templates, etc.)
- liga RLS
- cria policies (somente autenticado lê; só roles full-access editam)
- cria trigger para gerar `public.profiles` automaticamente em cada usuário criado no Auth.

## 4) Criar usuários e roles
Supabase → Authentication → Users → Add user.
Depois ajuste o role no app:
- /usuarios → abrir usuário → definir role.

Roles com acesso total:
- `admin`
- `consultor_educacao`
- `designer`

Role leitura:
- `viewer`

## 5) Teste
1) Login em `/login`
2) Abrir `/dashboard` e `/imersoes`
