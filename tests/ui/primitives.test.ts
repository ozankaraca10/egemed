import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, Field, TextInput, initialsOf } from "../../packages/ui/src/index";

describe("premium bileşen temeli (T151)", () => {
  it("baş harfler Türkçe büyük harf kuralıyla, en fazla iki harf", () => {
    expect(initialsOf("ışıl ilker")).toBe("Iİ");
    expect(initialsOf("  Geliştirme   Öğrencisi ")).toBe("GÖ");
    expect(initialsOf("Mert")).toBe("M");
    expect(initialsOf("Ali Veli Kaya")).toBe("AK");
    expect(initialsOf("")).toBe("?");
  });

  it("Field etiketi, ipucu ve hatayı denetime bağlar (aria-describedby, aria-invalid)", () => {
    const html = renderToStaticMarkup(
      createElement(Field, {
        id: "ad",
        label: "Görünen ad",
        hint: "2–120 karakter",
        error: "Ad soyad 2-120 karakter olmalıdır.",
        required: true,
        children: (control) => createElement(TextInput, { ...control }),
      }),
    );
    expect(html).toContain('for="ad"');
    expect(html).toContain('id="ad"');
    expect(html).toContain('aria-describedby="ad-hint ad-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('required=""');
    expect(html).toContain('id="ad-error"');
  });

  it("hatasız Field denetime aria-invalid vermez", () => {
    const html = renderToStaticMarkup(
      createElement(Field, { id: "x", label: "Not", children: (control) => createElement(TextInput, { ...control }) }),
    );
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-describedby");
  });

  it("yükleniyor düğmesi devre dışı ve aria-busy taşır; varsayılan tür button", () => {
    const html = renderToStaticMarkup(createElement(Button, { loading: true }, "Kaydet"));
    expect(html).toContain('type="button"');
    expect(html).toContain("disabled");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("eg-spinner");
  });
});
