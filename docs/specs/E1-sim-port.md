# E1 Tek platform — simülatör modül portları (TASLAK — insan onayı bekliyor)

> Durum: **Önerildi.** Kaynak: ADR-006 (kabul, 2026-09-23), E0 spec, kaynak depo
> sayımı. Bu epik, E0 kapsamındaki T09 dahil kalan tüm çalışmayı kapsar; E0'ın
> kalanı T09 olduğundan E1, E0'ın simülatör kalanını devralır.

## Amaç
ADR-006 hibrit modelini hayata geçirmek: üç simülatörün tek React platforma
iç modül olarak taşınması; kabuk çerçevesi (React + @egemed/ui) ile motor
kodunun davranış değişmeden korunması; xAPI takibinin (T06/T05) platformdan
doğrudan kurulması.

## Kaynak sayımı (23 Eylül 2026)
| Simülatör | Kaynak depo | src satır | Test |
|---|---|---|---|
| Pulse | github.com/ozankaraca10/egemed-pulse | ~7.8k (cardai/, düz JS) | 0 |
| Ausculta | github.com/ozankaraca10/egemed-ausculta | ~8.3k (src/, Vite+TS) | 1 dosya |
| Opaca | github.com/ozankaraca10/egemed-opaca | ~14.4k (src/, Vite+TS) | 15 dosya / 119 test |

## Görev sırası ve bağımlılıklar
| Sıra | Görev | İçerik | Bağımlı |
|---|---|---|---|
| 1 | T14 Platform sim-modül altyapısı | SimHost sözleşmesi (mount/unmount, React host), lazy chunk, rota bağları; sahte (stub) sim ile davranış testleri | T08 (done) |
| 2 | T15 Opaca port faz 1 | Motor+ekran dosyaları platform modülüne taşınır, SimHost'a bağlanır; 119 test yeşil kalır | T14 |
| 3 | T16 Opaca port faz 2+ | Opaca içi ekranlar kademeli React'e (ayrı alt görevler; plan faz içinde açılır) | T15 |
| 4 | T17 Ausculta port | Aynı kalıp (motor + ekran mount; sonra kademeli) | T14 |
| 5 | T18 Pulse port | cardai motoru + ekranlar; test iskeleti port sırasında kurulur | T14 |
| 6 | T09 Mobil e2e | Playwright; kabuk + üç port modülü 360/768/1440 (mevcut görev id korunur) | T18 |

Kurallar: aynı pakette paralel Running yok; her görev ~400 satır; sözleşme
değişikliği (SimHost sözleşmesi) tüketicilerden önce birleştirilir. SCORM
paketleme görevleri backlog'dan çıkar; T12 legacy belge kopyası kaynak gelince
yürütülür (bağımsız). AGENTS.md metni ADR-006 ile uyumlu hale getirilir (port
başlamadan önce küçük bir düzeltme görevi).

## Kabul ölçütleri (epik düzeyi)
- Her simülatör platform rotasında çalışır; motor davranışı kaynak depodakiyle
  birebir (regresyon: opaca 119 test, ausculta/pulse için port sırasında test
  iskeleti kurulur).
- Veri izolasyonu: sim başına ayrık durum; ifadeler tek SimulatorId.
- `pnpm turbo lint typecheck test` ve T09 e2e yeşil; kapı komutları değişmez.

## Açık sorular (insan kararı)
- Paket yerleşimi: `packages/sim-<id>` mü, `apps/shell` içi bölüm mü (port
  planlarında kararlaştırılır; öneri: sim başına paket).
- LTI entegrasyonu ayrı epik.
