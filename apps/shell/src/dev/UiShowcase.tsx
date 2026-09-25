import { useState, type JSX } from "react";
import {
  Avatar,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  Field,
  IconButton,
  Menu,
  RadioGroup,
  Select,
  Skeleton,
  Switch,
  TextArea,
  TextInput,
  ToastProvider,
  icons,
  useToast,
} from "@egemed/ui";

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
  const invalid = name.length > 0 && name.length < 2;
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
