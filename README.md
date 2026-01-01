# 🚀 Sparks
### Sistema Estratégico de Planejamento e Gestão do Conhecimento

![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)
![Stack](https://img.shields.io/badge/stack-Next.js%20%7C%20Supabase%20%7C%20Vercel-blue)
![UX](https://img.shields.io/badge/focus-UX%2FUI-success)
![Cloud](https://img.shields.io/badge/cloud--only-100%25-lightgrey)

---

## 📌 Visão Geral

Sparks é um **sistema SaaS de gestão de imersões, tarefas e execução operacional**, criado para apoiar **planejamento estratégico, organização do conhecimento e tomada de decisão**, com forte foco em **UX/UI orientado à execução**.

O projeto é desenvolvido **100% em ambiente cloud**, sem necessidade de instalação local, utilizando **GitHub, Vercel e Supabase**.

---

## 🎯 Propósito

O Sparks existe para transformar conhecimento em execução.

Ele permite que organizações:

- Planejem estrategicamente suas iniciativas
- Organizem conhecimento de forma estruturada
- Distribuam responsabilidades com clareza
- Acompanhem execução, prazos e entregas
- Criem base sólida para dashboards executivos

---

## 🧠 Princípios de UX/UI

- Interface limpa, densa e informativa
- Menos cliques, mais contexto por tela
- Ações sempre visíveis
- Navegação orientada à execução
- Totalmente responsivo (desktop e mobile)
- Zero efeito PowerPoint

---

## 🧱 Stack Tecnológica

| Camada | Tecnologia |
|------|-----------|
| Front-end | Next.js |
| Back-end | Supabase (PostgreSQL + API) |
| Deploy | Vercel |
| Versionamento | GitHub |
| Autenticação (futuro) | Supabase Auth |

---

## 🗄️ Estrutura de Dados

### immersions
- id
- immersion_name
- type
- educational_consultant → profiles.id
- instructional_designer → profiles.id
- created_at

### immersion_tasks
- id
- immersion_id
- responsible_id → profiles.id
- created_by → profiles.id
- completed_by → profiles.id
- due_date
- completed_at
- status
- notes

### profiles
- id
- name
- email
- role

---

## 🔐 Governança de Dados

- Foreign Keys com ON DELETE SET NULL
- Auditoria de criação e conclusão
- Índices para performance
- Preparado para Row Level Security (RLS)

---

## 🧩 Migrações SQL

As migrações são:

- Idempotentes
- Compatíveis com Supabase
- Escritas sem ADD CONSTRAINT IF NOT EXISTS

📂 Local: `/supabase/`

---

## 🚀 Como Executar

### 1. Banco de Dados
- Criar projeto no Supabase
- Executar SQLs no SQL Editor

### 2. Front-end
Configurar variáveis no Vercel:

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### (Opcional) Criar usuários pela tela do app

Se você quiser criar usuários diretamente pela UI (**Usuários → Novo usuário**), adicione também no Vercel:

```
SUPABASE_SERVICE_ROLE_KEY
```

O sistema expõe um endpoint server-side (`/api/admin/create-user`) que:

- valida o usuário logado via `Authorization: Bearer <access_token>`
- permite criação apenas para `role=admin`
- cria o usuário no Supabase Auth e faz upsert em `public.profiles`

### 3. Deploy
- Deploy automático via GitHub → Vercel

---

## 🛣️ Roadmap

- [ ] Notificações automáticas
- [ ] Dashboard executivo
- [ ] Templates de tarefas
- [ ] Sistema de permissões
- [ ] Supabase Auth
- [ ] Audit log completo

---

## 🧭 Filosofia

> Planejamento sem execução é teoria.  
> Execução sem conhecimento é risco.

Sparks une **estratégia, conhecimento e ação** em um único sistema.

---

## 📄 Licença

Projeto proprietário.  
Uso, cópia ou distribuição dependem de autorização do autor.
