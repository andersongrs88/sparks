# StartB Salão (MVP)

Sistema web (responsivo) para gestão 360° de salão de beleza, com Next.js + Supabase.

## Funcionalidades incluídas neste starter (MVP)
- Autenticação (Supabase Auth) e rotas protegidas
- Tema claro/escuro com persistência
- Estrutura de módulos (Agenda, Clientes, Serviços, Produtos, Financeiro, Relatórios, Configurações)
- Modelos de dados (SQL) para Supabase: clientes, profissionais, serviços, agendamentos, pagamentos, comissões, notificações
- Layout “premium” e mobile-first

## Como rodar localmente (opcional)
1. Crie um projeto no Supabase
2. Rode os SQLs em `supabase/schema.sql` e `supabase/rls.sql`
3. Copie `.env.example` para `.env.local` e preencha as chaves
4. `npm i`
5. `npm run dev`

## Deploy na Vercel (recomendado)
1. Suba este projeto no GitHub
2. Importe na Vercel
3. Configure as variáveis de ambiente (mesmas do `.env.example`)
4. Deploy

## Observações
- Notificações via WhatsApp (API gratuita) não está implementado neste starter; está preparado um módulo “Notificações” e tabela `notifications` para evoluir.
- No rodapé, o sistema exibe “Desenvolvido pela Wizze Tecnologia Inteligente.” (conforme requisito).
