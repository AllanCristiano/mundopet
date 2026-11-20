-- Espaco Beleza (modulo beauty): fotos dos pets (arquivos no MinIO) e depoimentos com moderacao

CREATE TABLE beauty_photos (
    id          UUID PRIMARY KEY,
    pet_name    VARCHAR(40)  NOT NULL,
    species     VARCHAR(10)  NOT NULL CHECK (species IN ('CAO', 'GATO', 'OUTRO')),
    service     VARCHAR(20)  NOT NULL CHECK (service IN ('BANHO', 'TOSA', 'BANHO_TOSA', 'HIDRATACAO', 'SPA', 'OUTRO')),
    caption     VARCHAR(160),
    width       INTEGER      NOT NULL CHECK (width > 0),
    height      INTEGER      NOT NULL CHECK (height > 0),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_beauty_photos_recent ON beauty_photos (created_at DESC, id DESC);
CREATE INDEX idx_beauty_photos_service ON beauty_photos (service, created_at DESC);

CREATE TABLE beauty_testimonials (
    id           UUID PRIMARY KEY,
    author       VARCHAR(60)  NOT NULL,
    pet_name     VARCHAR(40),
    rating       SMALLINT     NOT NULL CHECK (rating BETWEEN 1 AND 5),
    message      VARCHAR(600) NOT NULL,
    status       VARCHAR(10)  NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    approved_at  TIMESTAMPTZ
);

CREATE INDEX idx_beauty_testimonials_status ON beauty_testimonials (status, created_at DESC);
