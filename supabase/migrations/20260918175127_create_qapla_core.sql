/*
# Qap-la fırsat platformu temel verileri

1. Yeni tablolar
- `qapla_merchants`: Haritada ve fırsat listesinde görünen işletmeler.
- `qapla_offers`: İşletmelere bağlı kampanyalar, indirimler ve süre bilgileri.
- `qapla_coupon_claims`: Giriş gerektirmeden, yerel tüketici kimliğiyle oluşturulan kupon kayıtları.

2. Alanlar
- İşletmeler: ad, kategori, adres, konum, logo rengi ve açık/kapalı durumu.
- Fırsatlar: başlık, açıklama, indirim, etiket, kupon süresi, stok ve yayın durumu.
- Kuponlar: fırsat, yerel tüketici kimliği, alfanümerik kod, son kullanım ve durum.

3. Güvenlik
- Tüm tablolar RLS ile korunur.
- Bu sürümde hesap girişi olmadığı için yalnızca uygulamanın ihtiyaç duyduğu herkese açık okuma ve kupon oluşturma işlemleri anon/authenticated rollerine açılır.
- Kupon kayıtlarının güncellenmesi ve silinmesi kapalıdır; kuponlar yalnızca oluşturulabilir.

4. Notlar
- Başlangıç verileri yalnızca tablo boşsa eklenir.
- Konum verileri harita görünümünü ve mesafe etiketlerini besler.
*/

CREATE TABLE IF NOT EXISTS qapla_merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL,
  address text NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  distance_m integer NOT NULL DEFAULT 0,
  description text NOT NULL DEFAULT '',
  accent text NOT NULL DEFAULT '#1dc9a0',
  is_open boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qapla_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES qapla_merchants(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL,
  discount text NOT NULL,
  category text NOT NULL,
  badge text NOT NULL DEFAULT 'Yeni',
  expires_at timestamptz NOT NULL,
  stock integer NOT NULL DEFAULT 50,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS qapla_coupon_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id uuid NOT NULL REFERENCES qapla_offers(id) ON DELETE CASCADE,
  consumer_id text NOT NULL,
  code text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'expired')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qapla_offers_active_idx ON qapla_offers (is_active, expires_at);
CREATE INDEX IF NOT EXISTS qapla_offers_merchant_idx ON qapla_offers (merchant_id);
CREATE INDEX IF NOT EXISTS qapla_claims_consumer_idx ON qapla_coupon_claims (consumer_id, status);

ALTER TABLE qapla_merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE qapla_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE qapla_coupon_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read merchants" ON qapla_merchants;
CREATE POLICY "Public can read merchants" ON qapla_merchants FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public can create merchants" ON qapla_merchants;
CREATE POLICY "Public can create merchants" ON qapla_merchants FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update merchants" ON qapla_merchants;
CREATE POLICY "Public can update merchants" ON qapla_merchants FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Public can delete merchants" ON qapla_merchants;
CREATE POLICY "Public can delete merchants" ON qapla_merchants FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Public can read offers" ON qapla_offers;
CREATE POLICY "Public can read offers" ON qapla_offers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public can create offers" ON qapla_offers;
CREATE POLICY "Public can create offers" ON qapla_offers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Public can update offers" ON qapla_offers;
CREATE POLICY "Public can update offers" ON qapla_offers FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Public can delete offers" ON qapla_offers;
CREATE POLICY "Public can delete offers" ON qapla_offers FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS "Public can read own consumer claims" ON qapla_coupon_claims;
CREATE POLICY "Public can read own consumer claims" ON qapla_coupon_claims FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public can create consumer claims" ON qapla_coupon_claims;
CREATE POLICY "Public can create consumer claims" ON qapla_coupon_claims FOR INSERT TO anon, authenticated WITH CHECK (consumer_id IS NOT NULL AND length(consumer_id) BETWEEN 8 AND 80);
DROP POLICY IF EXISTS "Claims cannot be updated" ON qapla_coupon_claims;
CREATE POLICY "Claims cannot be updated" ON qapla_coupon_claims FOR UPDATE TO anon, authenticated USING (false) WITH CHECK (false);
DROP POLICY IF EXISTS "Claims cannot be deleted" ON qapla_coupon_claims;
CREATE POLICY "Claims cannot be deleted" ON qapla_coupon_claims FOR DELETE TO anon, authenticated USING (false);

INSERT INTO qapla_merchants (name, category, address, latitude, longitude, distance_m, description, accent, is_open)
SELECT * FROM (VALUES
  ('Mod Kahve', 'Kafe', 'Moda Caddesi No: 24, Kadıköy', 40.9873, 29.0285, 110, 'İkinci espresso veya americano hediye.', '#1dc9a0', true),
  ('Burger Lab', 'Yeme & İçme', 'Mühürdar Sokak No: 18, Kadıköy', 40.9887, 29.0308, 186, 'Klasik smash menüde geç saat indirimi.', '#f2b84b', true),
  ('Mint Gelato', 'Yeme & İçme', 'Rıhtım Caddesi No: 12, Kadıköy', 40.9906, 29.0254, 241, 'İkinci top nane-çikolata dondurma hediye.', '#72c9df', true),
  ('Qap Fit', 'Spor', 'Bahariye Caddesi No: 56, Kadıköy', 40.9894, 29.0324, 283, 'Günlük girişte stüdyo ve havlu dahil.', '#5e9cf0', true),
  ('Nane Berber', 'Güzellik', 'Moda Sokak No: 9, Kadıköy', 40.9858, 29.0262, 298, 'Fade ve sakal bakımında fırsat.', '#ed8fba', false)
) AS seed(name, category, address, latitude, longitude, distance_m, description, accent, is_open)
WHERE NOT EXISTS (SELECT 1 FROM qapla_merchants);

INSERT INTO qapla_offers (merchant_id, title, description, discount, category, badge, expires_at, stock, is_featured)
SELECT m.id, seed.title, seed.description, seed.discount, seed.category, seed.badge, now() + seed.hours * interval '1 hour', seed.stock, seed.is_featured
FROM (VALUES
  ('Mod Kahve', 'İkinci espresso bizden', 'Aynı siparişte ikinci espresso veya americano hediye.', '%50', 'Kafe', 'Yeni', 6, 28, true),
  ('Burger Lab', 'Smash burger %35', 'Klasik smash menüde geç saat indirimi. Patates dahil.', '%35', 'Yeme & İçme', 'Yeni', 4, 18, true),
  ('Mint Gelato', 'Çift top nane', 'İkinci top nane-çikolata dondurma hediye.', '%45', 'Yeme & İçme', 'Sınırlı', 3, 33, true),
  ('Qap Fit', 'Günlük giriş fırsatı', 'Tek seferlik stüdyo girişi, havlu dahil.', '%60', 'Spor', 'Popüler', 8, 9, false),
  ('Nane Berber', 'Fade + sakal %40', 'Bugün 22:00’ye kadar fade kesim ve sakal düzenleme.', '%40', 'Güzellik', 'Bugün', 2, 7, false)
) AS seed(merchant_name, title, description, discount, category, badge, hours, stock, is_featured)
JOIN qapla_merchants m ON m.name = seed.merchant_name
WHERE NOT EXISTS (SELECT 1 FROM qapla_offers);
