package lk.boardleaf.field;

import java.net.URI;

/** Origin comparison is exact; suffixes and user-info never grant native access. */
public final class OriginPolicy {
    private final String origin;
    private final boolean allowLocalDebug;

    public OriginPolicy(String trustedUrl, boolean allowLocalDebug) {
        this.allowLocalDebug = allowLocalDebug;
        origin = originOf(trustedUrl);
        if (origin == null) throw new IllegalArgumentException("A trusted HTTPS or debug localhost origin is required.");
    }

    public String origin() { return origin; }
    public boolean allows(String candidate) { return origin.equals(originOf(candidate)); }

    private String originOf(String value) {
        try {
            URI uri = new URI(value);
            if (uri.getHost() == null || uri.getRawUserInfo() != null) return null;
            String host = uri.getHost().toLowerCase(java.util.Locale.ROOT);
            int port = uri.getPort();
            if (port < -1 || port == 0 || port > 65535) return null;
            if ("https".equalsIgnoreCase(uri.getScheme())) {
                return "https://" + host + (port == -1 || port == 443 ? "" : ":" + port);
            }
            if (allowLocalDebug && "http".equalsIgnoreCase(uri.getScheme()) && "localhost".equals(host)) {
                return "http://localhost" + (port == -1 || port == 80 ? "" : ":" + port);
            }
            return null;
        } catch (Exception ignored) { return null; }
    }
}
