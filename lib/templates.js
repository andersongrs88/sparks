import { supabase } from "./supabaseClient";

function ensure() {
  if (!supabase) throw new Error("Supabase não configurado (verifique as variáveis do deploy na Vercel).");
}

export async function listTemplates() {
  ensure();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, name, description, is_active, created_at")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listTemplateItems(templateId) {
  ensure();
  const { data, error } = await supabase
    .from("checklist_template_items")
    .select("id, template_id, phase, area, title, due_basis, offset_days, sort_order")
    .eq("template_id", templateId)
    .order("sort_order", { ascending: true })
    .order("phase", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTemplate(payload) {
  ensure();
  const { data, error } = await supabase
    .from("checklist_templates")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplate(id, payload) {
  ensure();
  const { error } = await supabase
    .from("checklist_templates")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTemplate(id) {
  ensure();
  const { error } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

export async function createTemplateItem(payload) {
  ensure();
  const { data, error } = await supabase
    .from("checklist_template_items")
    .insert([payload])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateTemplateItem(id, payload) {
  ensure();
  const { error } = await supabase
    .from("checklist_template_items")
    .update(payload)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTemplateItem(id) {
  ensure();
  const { error } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
