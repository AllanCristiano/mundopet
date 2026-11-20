package br.com.mundopet.address;

/** Endereco encontrado pelo CEP (sem numero: quem completa e o cliente). */
public record Address(String cep, String street, String district, String city, String state, String source) {

    /** Normaliza para so digitos. Retorna null se nao tiver exatamente 8 digitos. */
    public static String normalizeCep(String raw) {
        if (raw == null) {
            return null;
        }
        String digits = raw.replaceAll("\\D", "");
        return digits.length() == 8 ? digits : null;
    }

    /** 01001000 -> 01001-000 */
    public static String formatCep(String digits) {
        return digits.substring(0, 5) + "-" + digits.substring(5);
    }
}
