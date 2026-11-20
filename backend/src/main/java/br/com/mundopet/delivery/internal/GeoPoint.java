package br.com.mundopet.delivery.internal;

/** Coordenada (graus decimais). */
record GeoPoint(double lat, double lng) {

    private static final double EARTH_RADIUS_KM = 6371.0088;

    /** Distancia em linha reta (formula de haversine), em km. */
    double distanceKm(GeoPoint other) {
        double dLat = Math.toRadians(other.lat - lat);
        double dLng = Math.toRadians(other.lng - lng);
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(lat)) * Math.cos(Math.toRadians(other.lat)) * Math.pow(Math.sin(dLng / 2), 2);
        return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
    }

    /** Aceita so coordenadas plausiveis do Brasil (descarta lixo como 0,0 que algumas APIs devolvem). */
    static boolean isValid(double lat, double lng) {
        return lat >= -34.5 && lat <= 6 && lng >= -75 && lng <= -28;
    }

    /** "lat,lng" para o cache. */
    String encode() {
        return lat + "," + lng;
    }

    static GeoPoint decode(String raw) {
        String[] parts = raw.split(",");
        return new GeoPoint(Double.parseDouble(parts[0]), Double.parseDouble(parts[1]));
    }
}
