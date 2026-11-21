package lk.boardleaf.field;

import java.net.URI;

/** Origin comparison is exact; suffixes and user-info never grant native access. */
public final class OriginPolicy {
    private final String origin;

    public OriginPolicy(String trustedUrl) {
        origin = originOf(trustedUrl);
        if (origin == null) throw new IllegalArgumentException("A trusted HTTPS origin is required.");
    }

    public String origin() { return origin; }
    public boolean allows(String candidate) { return origin.equals(originOf(candidate)); }

    private static String originOf(String value) {
        try {
            URI uri = new URI(value);
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getRawUserInfo() != null) return null;
            int port = uri.getPort();
            if (port < -1 || port == 0 || port > 65535) return null;
            return "https://" + uri.getHost().toLowerCase(java.util.Locale.ROOT) + (port == -1 || port == 443 ? "" : ":" + port);
        } catch (Exception ignored) { return null; }
    }
}
