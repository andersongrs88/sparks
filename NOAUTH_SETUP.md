# Sparks MVP — Modo sem Login (temporário)

Este projeto foi ajustado para **não exigir autenticação** para acessar o sistema.

## 1) Variáveis na Vercel

Configure em **Settings → Environment Variables**:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Depois, faça um **Redeploy**.

## 2) Banco de dados (Supabase)

Se o seu Supabase já estava com Auth + RLS, você precisa liberar acesso público às tabelas.

1. Abra o Supabase → **SQL Editor**
2. Rode o arquivo: `supabase/schema_noauth.sql`

Esse script desativa o RLS e libera permissões de leitura/escrita para a chave pública (anon).

Aviso: isso é apenas para MVP/testes. Não use em produção.

## 3) Como acessar

Após o deploy, acesse diretamente:

- `/dashboard`
- `/imersoes`
- `/painel`

Não existe mais tela de login (a rota `/login` redireciona para o Dashboard).

## 4) Reativar autenticação depois

Quando você decidir reativar:

- restaurar o `context/AuthContext.js` com Supabase Auth
- voltar a ligar RLS com policies
- remover/ignorar `schema_noauth.sql`