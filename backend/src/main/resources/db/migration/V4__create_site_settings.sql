-- Configuracoes do site editadas pelo dono na pagina de gestao (modulo site).
-- Uma unica linha (id = 1) com o documento JSON validado pela API; "version" evita que duas pessoas
-- salvem por cima uma da outra (controle otimista).
CREATE TABLE site_settings (
    id          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    data        JSONB       NOT NULL,
    version     INTEGER     NOT NULL CHECK (version > 0),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
