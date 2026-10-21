/** Sentinel value in model selects for free-form model id. */
export const MODEL_DIGITAR = '__digitar__';

export function resolveModelSelection(
  model: string,
  knownModels: string[],
): { selectValue: string; customModel: string } {
  if (knownModels.includes(model)) {
    return { selectValue: model, customModel: '' };
  }
  return { selectValue: MODEL_DIGITAR, customModel: model };
}

export function effectiveModelId(
  selectValue: string,
  customModel: string,
): string {
  if (selectValue === MODEL_DIGITAR) {
    return customModel.trim();
  }
  return selectValue;
}
