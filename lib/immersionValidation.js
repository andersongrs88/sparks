function isEmpty(v) {
  return v === null || v === undefined || (typeof v === "string" ? v.trim() === "" : false);
}

export function validateImmersionField(field, value, ctx = {}) {
  const { hasCatalog = false, usingCatalog = false } = ctx;

  if (field === "immersion_catalog_id") {
    if (hasCatalog && !value) return "Selecione uma imersão cadastrada.";
    return "";
  }

  if (field === "immersion_name") {
    if (isEmpty(value)) return "Informe o nome da imersão.";
    return "";
  }

  if (field === "type") {
    // Pode vir do catálogo (readOnly) ou manual
    if (isEmpty(value)) return "Selecione o formato da imersão.";
    return "";
  }

  if (field === "start_date") {
    if (isEmpty(value)) return "Informe a data inicial.";
    return "";
  }

  if (field === "end_date") {
    if (isEmpty(value)) return "Informe a data final.";
    return "";
  }

  if (field === "educational_consultant") {
    if (isEmpty(value)) return "Selecione o consultor responsável.";
    return "";
  }

  if (field === "instructional_designer") {
    if (isEmpty(value)) return "Selecione o designer responsável.";
    return "";
  }

  if (field === "checklist_template_id") {
    if (isEmpty(value)) return "Selecione um Checklist template (obrigatório).";
    return "";
  }

  return "";
}

export function validateImmersionStep(stepKey, form, ctx = {}) {
  const errs = {};

  if (stepKey === "informacoes") {
    // catálogo ou manual
    if (ctx.hasCatalog) {
      const m = validateImmersionField("immersion_catalog_id", form?.immersion_catalog_id, ctx);
      if (m) errs.immersion_catalog_id = m;
      // nome e tipo são preenchidos automaticamente, mas validamos do mesmo jeito
    }

    const mName = validateImmersionField("immersion_name", form?.immersion_name, ctx);
    if (mName) errs.immersion_name = mName;

    const mType = validateImmersionField("type", form?.type, ctx);
    if (mType) errs.type = mType;

    const ms = validateImmersionField("start_date", form?.start_date, ctx);
    if (ms) errs.start_date = ms;

    const me = validateImmersionField("end_date", form?.end_date, ctx);
    if (me) errs.end_date = me;
  }

  if (stepKey === "time") {
    const mc = validateImmersionField("educational_consultant", form?.educational_consultant, ctx);
    if (mc) errs.educational_consultant = mc;
    const md = validateImmersionField("instructional_designer", form?.instructional_designer, ctx);
    if (md) errs.instructional_designer = md;
    const mt = validateImmersionField("checklist_template_id", form?.checklist_template_id, ctx);
    if (mt) errs.checklist_template_id = mt;
  }

  return errs;
}
