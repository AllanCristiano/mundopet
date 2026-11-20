-- DADOS DE EXEMPLO do catalogo (marcas ficticias, precos ilustrativos).
-- Migration "repeatable": roda de novo sempre que este arquivo mudar (upsert pelo SKU).
-- Em producao desligue com FLYWAY_LOCATIONS=classpath:db/migration e cadastre os produtos reais.
-- As promocoes sao relativas a data em que o seed roda.

INSERT INTO catalog_products
    (sku, name, brand, species, life_stage, pet_size, line, flavor, weight_kg, price, promo_price, promo_ends_at, stock, color, description)
VALUES
    ('NP-CAO-AD-MG-15', 'Ração NutriPata Cães Adultos Raças Médias e Grandes', 'NutriPata', 'CAO', 'ADULTO', 'GRANDE', 'PREMIUM', 'Frango e Arroz', 15, 229.90, 199.90, now() + interval '6 days', 40, '#d9822b', 'Proteína de alta qualidade para manter a massa muscular e a energia do dia a dia.'),
    ('NP-CAO-AD-PQ-3', 'Ração NutriPata Cães Adultos Raças Pequenas', 'NutriPata', 'CAO', 'ADULTO', 'PEQUENO', 'PREMIUM', 'Frango e Arroz', 3, 69.90, NULL, NULL, 55, '#d9822b', 'Croquetes menores, ideais para mordidas pequenas.'),
    ('NP-CAO-FI-10', 'Ração NutriPata Cães Filhotes', 'NutriPata', 'CAO', 'FILHOTE', 'TODOS', 'PREMIUM', 'Frango e Leite', 10, 179.90, 159.90, now() + interval '3 days', 22, '#d9822b', 'Com DHA para o desenvolvimento do cérebro e da visão.'),
    ('NP-GAT-AD-10', 'Ração NutriPata Gatos Adultos', 'NutriPata', 'GATO', 'ADULTO', 'TODOS', 'PREMIUM', 'Peixe', 10, 189.90, NULL, NULL, 30, '#d9822b', 'Controle de bolas de pelo e saúde urinária.'),
    ('VP-CAO-AD-GR-15', 'Ração Vita Pet Super Premium Cães Adultos Raças Grandes', 'Vita Pet', 'CAO', 'ADULTO', 'GRANDE', 'SUPER_PREMIUM', 'Cordeiro', 15, 319.90, 279.90, now() + interval '9 days', 18, '#3d7bd9', 'Condroitina e glucosamina para articulações saudáveis.'),
    ('VP-CAO-AD-PQ-1', 'Ração Vita Pet Super Premium Cães Adultos Mini', 'Vita Pet', 'CAO', 'ADULTO', 'PEQUENO', 'SUPER_PREMIUM', 'Frango', 1, 54.90, NULL, NULL, 60, '#3d7bd9', 'Alta palatabilidade para os pequenos mais exigentes.'),
    ('VP-CAO-SE-7', 'Ração Vita Pet Super Premium Cães Sênior 7+', 'Vita Pet', 'CAO', 'SENIOR', 'TODOS', 'SUPER_PREMIUM', 'Frango e Arroz', 7.5, 189.90, 164.90, now() + interval '5 days', 14, '#3d7bd9', 'Menos calorias e mais fibras para a melhor idade.'),
    ('VP-CAO-FI-PQ-3', 'Ração Vita Pet Super Premium Filhotes Mini', 'Vita Pet', 'CAO', 'FILHOTE', 'PEQUENO', 'SUPER_PREMIUM', 'Frango', 3, 99.90, NULL, NULL, 25, '#3d7bd9', 'Croquete extra pequeno e nutrição completa para o crescimento.'),
    ('VP-GAT-CA-10', 'Ração Vita Pet Super Premium Gatos Castrados', 'Vita Pet', 'GATO', 'ADULTO', 'TODOS', 'SUPER_PREMIUM', 'Salmão', 10.1, 269.90, 239.90, now() + interval '7 days', 20, '#3d7bd9', 'Controle de peso e pH urinário para gatos castrados.'),
    ('VP-GAT-FI-1', 'Ração Vita Pet Super Premium Gatos Filhotes', 'Vita Pet', 'GATO', 'FILHOTE', 'TODOS', 'SUPER_PREMIUM', 'Frango', 1, 49.90, NULL, NULL, 35, '#3d7bd9', 'Para gatinhos de 2 a 12 meses.'),
    ('BN-CAO-AD-12', 'Ração Bosque Natural Cães Adultos Sem Transgênicos', 'Bosque Natural', 'CAO', 'ADULTO', 'TODOS', 'NATURAL', 'Frango e Batata-doce', 12, 289.90, NULL, NULL, 16, '#4f9a5b', 'Sem corantes e aromatizantes artificiais. Ingredientes selecionados.'),
    ('BN-CAO-AD-GR-15', 'Ração Bosque Natural Cães Adultos Raças Grandes Grain Free', 'Bosque Natural', 'CAO', 'ADULTO', 'GRANDE', 'NATURAL', 'Carne e Abóbora', 15, 379.90, 329.90, now() + interval '4 days', 8, '#4f9a5b', 'Livre de grãos, com vegetais e frutas.'),
    ('BN-CAO-FI-2', 'Ração Bosque Natural Cães Filhotes', 'Bosque Natural', 'CAO', 'FILHOTE', 'TODOS', 'NATURAL', 'Frango e Arroz Integral', 2.5, 89.90, NULL, NULL, 19, '#4f9a5b', 'Natural e completa para os primeiros meses.'),
    ('BN-GAT-AD-7', 'Ração Bosque Natural Gatos Adultos', 'Bosque Natural', 'GATO', 'ADULTO', 'TODOS', 'NATURAL', 'Salmão e Ervilha', 7.5, 229.90, 199.90, now() + interval '8 days', 12, '#4f9a5b', 'Ômegas 3 e 6 para pele e pelagem brilhantes.'),
    ('BN-GAT-SE-3', 'Ração Bosque Natural Gatos Sênior', 'Bosque Natural', 'GATO', 'SENIOR', 'TODOS', 'NATURAL', 'Frango', 3, 119.90, NULL, NULL, 10, '#4f9a5b', 'Suporte renal e articular para gatos acima de 7 anos.'),
    ('FG-GAT-AD-SA-3', 'Ração Felino Gourmet Gatos Adultos Salmão', 'Felino Gourmet', 'GATO', 'ADULTO', 'TODOS', 'PREMIUM', 'Salmão', 3, 74.90, 64.90, now() + interval '2 days', 45, '#b8346c', 'Sabor irresistível para paladares exigentes.'),
    ('FG-GAT-AD-CA-10', 'Ração Felino Gourmet Gatos Adultos Carne', 'Felino Gourmet', 'GATO', 'ADULTO', 'TODOS', 'PREMIUM', 'Carne', 10.1, 169.90, NULL, NULL, 28, '#b8346c', 'Croquetes crocantes com recheio cremoso.'),
    ('FG-GAT-CA-3', 'Ração Felino Gourmet Gatos Castrados', 'Felino Gourmet', 'GATO', 'ADULTO', 'TODOS', 'PREMIUM', 'Frango', 3, 79.90, NULL, NULL, 33, '#b8346c', 'Menos gordura, mais saciedade.'),
    ('FG-GAT-FI-1', 'Ração Felino Gourmet Gatos Filhotes', 'Felino Gourmet', 'GATO', 'FILHOTE', 'TODOS', 'PREMIUM', 'Frango e Leite', 1, 34.90, 29.90, now() + interval '6 days', 50, '#b8346c', 'Croquetes pequenos e macios para dentes de leite.'),
    ('CF-CAO-AD-GR-20', 'Ração Campeão Forte Cães Adultos Raças Grandes', 'Campeão Forte', 'CAO', 'ADULTO', 'GRANDE', 'PREMIUM', 'Carne', 20, 189.90, 169.90, now() + interval '10 days', 35, '#c0392b', 'Ótimo custo-benefício para quem tem cães grandes.'),
    ('CF-CAO-AD-15', 'Ração Campeão Forte Cães Adultos', 'Campeão Forte', 'CAO', 'ADULTO', 'MEDIO', 'PREMIUM', 'Carne e Vegetais', 15, 149.90, NULL, NULL, 42, '#c0392b', 'Energia para cães ativos.'),
    ('CF-CAO-FI-10', 'Ração Campeão Forte Cães Filhotes', 'Campeão Forte', 'CAO', 'FILHOTE', 'MEDIO', 'PREMIUM', 'Frango', 10, 129.90, NULL, NULL, 0, '#c0392b', 'Cálcio e fósforo na medida para ossos fortes.'),
    ('VT-CAO-RE-2', 'Ração Terapêutica VetLife Renal Cães', 'VetLife', 'CAO', 'ADULTO', 'TODOS', 'TERAPEUTICA', NULL, 2, 139.90, NULL, NULL, 9, '#7a5bd1', 'Uso sob orientação veterinária. Auxilia no suporte da função renal.'),
    ('VT-CAO-OB-10', 'Ração Terapêutica VetLife Obesidade Cães', 'VetLife', 'CAO', 'ADULTO', 'TODOS', 'TERAPEUTICA', NULL, 10.1, 339.90, NULL, NULL, 6, '#7a5bd1', 'Uso sob orientação veterinária. Programa de perda de peso.'),
    ('VT-GAT-UR-1', 'Ração Terapêutica VetLife Urinary Gatos', 'VetLife', 'GATO', 'ADULTO', 'TODOS', 'TERAPEUTICA', NULL, 1.5, 119.90, 104.90, now() + interval '5 days', 11, '#7a5bd1', 'Uso sob orientação veterinária. Dissolução de cálculos de estruvita.'),
    ('VT-GAT-HA-1', 'Ração Terapêutica VetLife Hipoalergênica Gatos', 'VetLife', 'GATO', 'ADULTO', 'TODOS', 'TERAPEUTICA', NULL, 1.5, 134.90, NULL, NULL, 7, '#7a5bd1', 'Uso sob orientação veterinária. Proteína hidrolisada.')
ON CONFLICT (sku) DO UPDATE SET
    name = EXCLUDED.name, brand = EXCLUDED.brand, species = EXCLUDED.species, life_stage = EXCLUDED.life_stage,
    pet_size = EXCLUDED.pet_size, line = EXCLUDED.line, flavor = EXCLUDED.flavor, weight_kg = EXCLUDED.weight_kg,
    price = EXCLUDED.price, promo_price = EXCLUDED.promo_price, promo_ends_at = EXCLUDED.promo_ends_at,
    stock = EXCLUDED.stock, color = EXCLUDED.color, description = EXCLUDED.description;
