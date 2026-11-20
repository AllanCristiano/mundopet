package br.com.mundopet.catalog.internal;

/** Valores aceitos nos filtros (iguais aos CHECKs da tabela catalog_products). */
final class CatalogEnums {

    private CatalogEnums() {
    }

    enum Species { CAO, GATO }

    enum LifeStage { FILHOTE, ADULTO, SENIOR }

    enum PetSize { PEQUENO, MEDIO, GRANDE, TODOS }

    enum FoodLine { PREMIUM, SUPER_PREMIUM, NATURAL, TERAPEUTICA }

    enum Sort { RELEVANCE, PRICE_ASC, PRICE_DESC, DISCOUNT, NAME }

    enum Fulfillment { PICKUP, DELIVERY }
}
