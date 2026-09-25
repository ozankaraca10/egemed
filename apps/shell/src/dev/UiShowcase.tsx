import { useMemo, useState, type JSX } from "react";
import {
  Avatar,
  Button,
  Checkbox,
  DataTable,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Menu,
  Pagination,
  RadioGroup,
  Select,
  Skeleton,
  Switch,
  TextArea,
  TextInput,
  ToastProvider,
  icons,
  useToast,
  type DataTableSort,
} from "@egemed/ui";

interface ShowcaseRow {
  readonly id: string;
  readonly ad: string;
  readonly rol: "Öğrenci" | "Yönetici";
  readonly durum: "Etkin" | "Askıda";
}

/** 12 satırlık sentetik veri; gerçek öğrenci verisi yok. */
const SHOWCASE_ROWS: readonly ShowcaseRow[] = Array.from({ length: 12 }, (_, index) => {
  const n = index + 1;
  return {
    id: `u${String(n).padStart(3, "0")}`,
    ad: `Örnek Kullanıcı ${String(n).padStart(3, "0")}`,
    rol: n % 5 === 0 ? "Yönetici" : "Öğrenci",
    durum: n % 4 === 0 ? "Askıda" : "Etkin",
  };
});

const TABLE_PAGE_SIZE = 5;

/** T151 — premium bileşen vitrini (yalnız geliştirme). e2e: erişilebilirlik, klavye, ekran görüntüsü. */
function Showcase(): JSX.Element {
  const toast = useToast();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [method, setMethod] = useState("username");
  const [sims, setSims] = useState({ pulse: true, ausculta: false });
  const [visible, setVisible] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableSort, setTableSort] = useState<DataTableSort | undefined>(undefined);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [tablePage, setTablePage] = useState(1);
  const invalid = name.length > 0 && name.length < 2;

  const sortedRows = useMemo(() => {
    if (tableSort === undefined) return SHOWCASE_ROWS;
    const factor = tableSort.direction === "asc" ? 1 : -1;
    return [...SHOWCASE_ROWS].sort((a, b) => {
      const av = tableSort.key === "durum" ? a.durum : a.ad;
      const bv = tableSort.key === "durum" ? b.durum : b.ad;
      return av.localeCompare(bv, "tr") * factor;
    });
  }, [tableSort]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / TABLE_PAGE_SIZE));
  const pageRows = sortedRows.slice((tablePage - 1) * TABLE_PAGE_SIZE, tablePage * TABLE_PAGE_SIZE);

  return (
    <main className="eg-shell-vitrin">
      <h1>Bileşen vitrini</h1>
      <section aria-labelledby="v-buttons">
        <h2 id="v-buttons">Düğmeler</h2>
        <div className="eg-shell-vitrin__row">
          <Button icon={<icons.Plus />}>Kullanıcı ekle</Button>
          <Button variant="secondary" icon={<icons.Download />}>Şablonu indir</Button>
          <Button variant="ghost">Filtreleri temizle</Button>
          <Button variant="danger" icon={<icons.Trash2 />}>Sil</Button>
          <Button loading>Kaydediliyor</Button>
          <Button disabled>Devre dışı</Button>
          <IconButton label="Ara" icon={<icons.Search />} />
          <IconButton label="Filtreler" icon={<icons.Filter />} variant="secondary" />
          <Menu
            trigger={<button type="button" className="eg-icon-btn eg-icon-btn--secondary" aria-label="Hesap menüsü"><Avatar name="Geliştirme Öğrencisi" size={32} /></button>}
            header={<><Avatar name="Geliştirme Öğrencisi" /><div><strong>Geliştirme Öğrencisi</strong><br /><span>Öğrenci</span></div></>}
            items={[
              { key: "profile", label: "Profilim", icon: <icons.User />, onSelect: () => toast({ title: "Profil açıldı" }) },
              { key: "settings", label: "Tercihler", icon: <icons.Settings />, onSelect: () => undefined },
              { kind: "separator", key: "sep" },
              { key: "logout", label: "Çıkış yap", icon: <icons.LogOut />, tone: "danger", onSelect: () => toast({ title: "Çıkış yapıldı", tone: "success" }) },
            ]}
          />
        </div>
      </section>
      <section aria-labelledby="v-form">
        <h2 id="v-form">Form</h2>
        <div className="eg-shell-vitrin__grid">
          <Field label="Görünen ad" hint="2–120 karakter" required error={invalid ? "Ad soyad 2-120 karakter olmalıdır." : undefined}>
            {(control) => <TextInput {...control} value={name} onChange={(event) => setName(event.target.value)} placeholder="Örnek Öğrenci" />}
          </Field>
          <Field label="Rol">
            {(control) => (
              <Select
                {...control}
                value={role}
                onValueChange={setRole}
                placeholder="Rol seçin"
                options={[{ value: "", label: "Tümü" }, { value: "kullanici", label: "Kullanıcı" }, { value: "admin", label: "Yönetici" }]}
              />
            )}
          </Field>
          <Field label="Not">{(control) => <TextArea {...control} rows={3} />}</Field>
          <RadioGroup
            legend="Eşleme anahtarı"
            value={method}
            onValueChange={setMethod}
            orientation="horizontal"
            options={[{ value: "username", label: "Kullanıcı adı" }, { value: "email", label: "E-posta" }]}
          />
          <div>
            <p className="eg-field__label">Sim erişimi</p>
            <Checkbox checked={sims.pulse} onCheckedChange={(pulse) => setSims({ ...sims, pulse })} label="Pulse" description="EKG ve kardiyak fizyoloji" />
            <Checkbox checked={sims.ausculta} onCheckedChange={(ausculta) => setSims({ ...sims, ausculta })} label="Ausculta" />
          </div>
          <Switch checked={visible} onCheckedChange={setVisible} label="Liderlik tablosunda görün" description="Kapalıyken yalnız siz kendi sıranızı görürsünüz." />
        </div>
        <div className="eg-shell-vitrin__row">
          <Button onClick={() => setOpen(true)}>Diyaloğu aç</Button>
          <Button variant="secondary" onClick={() => toast({ title: "Kaydedildi", description: "Değişiklikler uygulandı.", tone: "success" })}>Bildirim göster</Button>
          <Button variant="secondary" onClick={() => toast({ title: "Kaydedilemedi", description: "Bağlantıyı kontrol edin.", tone: "error" })}>Hata bildirimi</Button>
        </div>
      </section>
      <section aria-labelledby="v-state">
        <h2 id="v-state">Durumlar</h2>
        <div className="eg-shell-vitrin__grid">
          <div aria-busy="true" className="eg-shell-vitrin__card">
            <Skeleton width="60%" height={20} />
            <Skeleton height={12} />
            <Skeleton width="80%" height={12} />
          </div>
          <EmptyState
            className="eg-shell-vitrin__card"
            icon={<icons.Users />}
            title="Kullanıcı bulunamadı"
            description="Filtreleri değiştirin veya yeni kullanıcı ekleyin."
            action={<Button variant="secondary" icon={<icons.UserPlus />}>Kullanıcı ekle</Button>}
          />
        </div>
      </section>
      <section aria-labelledby="v-table">
        <h2 id="v-table">Tablo</h2>
        <DataTable<ShowcaseRow>
          caption="Örnek kullanıcı tablosu"
          columns={[
            { key: "ad", header: "Ad Soyad", cell: (row) => row.ad, sortable: true },
            { key: "rol", header: "Rol", cell: (row) => row.rol },
            { key: "durum", header: "Durum", cell: (row) => row.durum, sortable: true },
          ]}
          rows={pageRows}
          rowKey={(row) => row.id}
          {...(tableSort !== undefined ? { sort: tableSort } : {})}
          onSortChange={setTableSort}
          selection={{
            selected,
            onToggle: (key) => {
              const next = new Set(selected);
              if (next.has(key)) next.delete(key);
              else next.add(key);
              setSelected(next);
            },
            onToggleAll: () => {
              const allOnPage = pageRows.every((row) => selected.has(row.id));
              const next = new Set(selected);
              for (const row of pageRows) {
                if (allOnPage) next.delete(row.id);
                else next.add(row.id);
              }
              setSelected(next);
            },
            label: (row) => `${row.ad} satırını seç`,
          }}
        />
        <Pagination page={tablePage} pageCount={pageCount} onPageChange={setTablePage} total={sortedRows.length} pageSize={TABLE_PAGE_SIZE} />
      </section>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Yeni kullanıcı"
        description="Kullanıcı kurum SSO'su ile giriş yapar; parola saklanmaz."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Vazgeç</Button>
            <Button
              loading={saving}
              onClick={() => {
                setSaving(true);
                setTimeout(() => {
                  setSaving(false);
                  setOpen(false);
                  toast({ title: "Kullanıcı eklendi", tone: "success" });
                }, 600);
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <Field label="Kullanıcı adı" required>{(control) => <TextInput {...control} autoComplete="off" />}</Field>
        <Field label="Görünen ad" required>{(control) => <TextInput {...control} />}</Field>
      </Dialog>
    </main>
  );
}

export function UiShowcase(): JSX.Element {
  return (
    <ToastProvider>
      <Showcase />
    </ToastProvider>
  );
}
