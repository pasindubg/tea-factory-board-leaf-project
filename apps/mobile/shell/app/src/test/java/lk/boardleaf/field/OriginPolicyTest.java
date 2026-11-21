package lk.boardleaf.field;

import org.junit.Test;
import static org.junit.Assert.*;

public class OriginPolicyTest {
    @Test public void acceptsOnlyTheSameHttpsOrigin() {
        OriginPolicy policy = new OriginPolicy("https://field.example.com");
        assertTrue(policy.allows("https://field.example.com/path?x=1"));
        assertTrue(policy.allows("https://FIELD.example.com:443/"));
        for (String url : new String[] {"http://field.example.com", "https://field.example.com.evil.test", "https://evil.test/?field.example.com", "https://field.example.com@evil.test", "https://user@field.example.com", "https://field.example.com:8443", "file:///field.example.com", "javascript:alert(1)", "data:text/html,test", "not a URL"}) {
            assertFalse(url, policy.allows(url));
        }
    }
    @Test(expected = IllegalArgumentException.class) public void rejectsUntrustedProtocolAtStartup() {
        new OriginPolicy("http://field.example.com");
    }
}
