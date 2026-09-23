// Bu dosya yalnızca typecheck koruması içindir; test koşucusu çalıştırmaz.
// Her satır tek bir strict bayrağını hedefler: bayrak gevşetilirse
// ilgili beklenti yönergesi kullanılmaz hale gelir ve typecheck kırılır.

// @ts-expect-error strict: undefined, string'e atanamaz.
export const strictNullCheck: string = undefined;

const values: readonly string[] = ["ilk"];

// @ts-expect-error noUncheckedIndexedAccess: indeks erişimi string | undefined döner.
export const uncheckedIndexCheck: string = values[0];

export interface OptionalHolder {
  value?: string;
}

// @ts-expect-error exactOptionalPropertyTypes: isteğe bağlı alana açıkça undefined atanamaz.
export const exactOptionalCheck: OptionalHolder = { value: undefined };

// @ts-expect-error noImplicitAny: parametre tipi çıkarılamaz.
export const implicitAnyCheck = (parametre) => parametre;
