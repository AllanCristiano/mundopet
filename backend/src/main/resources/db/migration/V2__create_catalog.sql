-- Catalogo de racoes (modulo catalog)
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE catalog_products (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sku            VARCHAR(40)   NOT NULL UNIQUE,
    name           VARCHAR(160)  NOT NULL,
    brand          VARCHAR(60)   NOT NULL,
    species        VARCHAR(10)   NOT NULL CHECK (species IN ('CAO', 'GATO')),
    life_stage     VARCHAR(10)   NOT NULL CHECK (life_stage IN ('FILHOTE', 'ADULTO', 'SENIOR')),
    pet_size       VARCHAR(10)   NOT NULL CHECK (pet_size IN ('PEQUENO', 'MEDIO', 'GRANDE', 'TODOS')),
    line           VARCHAR(20)   NOT NULL CHECK (line IN ('PREMIUM', 'SUPER_PREMIUM', 'NATURAL', 'TERAPEUTICA')),
    flavor         VARCHAR(60),
    weight_kg      NUMERIC(6, 2) NOT NULL CHECK (weight_kg > 0),
    price          NUMERIC(10, 2) NOT NULL CHECK (price > 0),
    promo_price    NUMERIC(10, 2) CHECK (promo_price > 0),
    promo_ends_at  TIMESTAMPTZ,
    stock          INTEGER       NOT NULL DEFAULT 0 CHECK (stock >= 0),
    color          VARCHAR(7)    NOT NULL DEFAULT '#e3b062',
    description    VARCHAR(500),
    active         BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT promo_below_price CHECK (promo_price IS NULL OR promo_price < price)
);

CREATE INDEX idx_catalog_species ON catalog_products (species) WHERE active;
CREATE INDEX idx_catalog_brand ON catalog_products (brand) WHERE active;
CREATE INDEX idx_catalog_promo ON catalog_products (promo_ends_at) WHERE promo_price IS NOT NULL;
