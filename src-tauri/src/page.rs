// Fetching a recipe page someone pasted. The address comes from the person,
// so the request must never reach this device or the local network: every
// hop (including redirects) is resolved here, checked, and the connection is
// pinned to the address that passed the check.

use std::net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr};
use std::time::Duration;

use reqwest::{redirect::Policy, Url};

const MAX_BYTES: usize = 5 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const TIMEOUT: Duration = Duration::from_secs(20);

fn is_public_v4(ip: Ipv4Addr) -> bool {
    let [a, b, ..] = ip.octets();
    !(ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || a == 0
        || a >= 240
        || (a == 100 && (64..=127).contains(&b))
        || (a == 192 && b == 0 && ip.octets()[2] == 0)
        || (a == 198 && (b == 18 || b == 19)))
}

fn is_public_v6(ip: Ipv6Addr) -> bool {
    if let Some(v4) = ip.to_ipv4_mapped() {
        return is_public_v4(v4);
    }
    let s = ip.segments();
    // Only global unicast (2000::/3), and none of the forms in it that carry an
    // IPv4 address through to somewhere else or are set aside for examples.
    (s[0] & 0xe000) == 0x2000
        && !(s[0] == 0x2001 && s[1] == 0x0000) // Teredo
        && !(s[0] == 0x2001 && s[1] == 0x0db8) // documentation
        && s[0] != 0x2002 // 6to4
        && (s[0] & 0xfff0) != 0x3ff0 // documentation (3fff::/20)
}

/// Whether an address is out on the internet rather than on this device or the local network.
pub fn is_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => is_public_v4(v4),
        IpAddr::V6(v6) => is_public_v6(v6),
    }
}

/// Resolve the URL's host and refuse it unless every address it names is public.
async fn checked_address(url: &Url) -> Result<SocketAddr, String> {
    let port = url.port_or_known_default().ok_or("no port")?;
    let addresses: Vec<SocketAddr> = match url.host() {
        Some(url::Host::Ipv4(ip)) => vec![SocketAddr::new(IpAddr::V4(ip), port)],
        Some(url::Host::Ipv6(ip)) => vec![SocketAddr::new(IpAddr::V6(ip), port)],
        Some(url::Host::Domain(name)) => tokio::net::lookup_host((name, port))
            .await
            .map_err(|e| e.to_string())?
            .collect(),
        None => return Err("no host".into()),
    };
    match addresses.first() {
        Some(first) if addresses.iter().all(|a| is_public(a.ip())) => Ok(*first),
        _ => Err("that address is not on the public internet".into()),
    }
}

/// The `charset=` value in a Content-Type header or a `<meta>` tag.
fn charset_after(text: &str) -> Option<String> {
    let at = text.to_ascii_lowercase().find("charset=")? + "charset=".len();
    let label: String = text[at..]
        .trim_start_matches(['"', '\''])
        .chars()
        .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | ':' | '.'))
        .collect();
    (!label.is_empty()).then_some(label)
}

/// Turn a page's bytes into text in the character set it says it uses:
/// a byte order mark first, then the Content-Type header, then a `<meta>` near the top, else UTF-8.
pub fn decode(body: &[u8], content_type: Option<&str>) -> String {
    let head = String::from_utf8_lossy(&body[..body.len().min(4096)]);
    let label = content_type.and_then(charset_after).or_else(|| charset_after(&head));
    let encoding = label
        .and_then(|label| encoding_rs::Encoding::for_label(label.as_bytes()))
        .unwrap_or(encoding_rs::UTF_8);
    let (text, _, _) = encoding.decode(body);
    text.into_owned()
}

/// Fetch a web page's HTML for recipe import.
#[tauri::command]
pub async fn fetch_page(url: String) -> Result<String, String> {
    let mut url = Url::parse(&url).map_err(|e| e.to_string())?;
    for _ in 0..=MAX_REDIRECTS {
        if url.scheme() != "https" && url.scheme() != "http" {
            return Err("not a web address".into());
        }
        let address = checked_address(&url).await?;
        let mut client = reqwest::Client::builder()
            .redirect(Policy::none())
            // A proxy would make its own connection and skip the address check above.
            .no_proxy()
            .timeout(TIMEOUT)
            .user_agent("Mozilla/5.0 (compatible; Simmer recipe import)");
        if let Some(url::Host::Domain(name)) = url.host() {
            client = client.resolve(name, address);
        }
        let client = client.build().map_err(|e| e.to_string())?;
        let mut response = client.get(url.clone()).send().await.map_err(|e| e.to_string())?;

        if response.status().is_redirection() {
            let location = response
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|value| value.to_str().ok())
                .ok_or("redirect without a location")?;
            url = url.join(location).map_err(|e| e.to_string())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("{} from the page", response.status()));
        }
        let content_type = response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .map(str::to_owned);
        let mut body = Vec::new();
        while let Some(chunk) = response.chunk().await.map_err(|e| e.to_string())? {
            body.extend_from_slice(&chunk);
            if body.len() >= MAX_BYTES {
                body.truncate(MAX_BYTES);
                break;
            }
        }
        return Ok(decode(&body, content_type.as_deref()));
    }
    Err("too many redirects".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn public(address: &str) -> bool {
        is_public(address.parse().unwrap())
    }

    #[test]
    fn the_internet_is_allowed() {
        assert!(public("93.184.216.34"));
        assert!(public("172.32.0.1"));
        assert!(public("2606:4700::1111"));
    }

    #[test]
    fn this_device_and_the_local_network_are_not() {
        for address in [
            "127.0.0.1", "0.0.0.0", "0.1.2.3", "10.0.0.2", "172.16.4.4", "172.31.255.255", "192.168.1.1", "169.254.169.254",
            "100.64.0.1", "255.255.255.255", "224.0.0.1", "::1", "::", "fd00::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1",
            "::ffff:192.168.0.1", "::127.0.0.1", "64:ff9b::7f00:1", "64:ff9b:1::7f00:1", "2002:7f00:1::1", "2001:0:4136:e378::1",
            "::ffff:0:7f00:1", "100::1", "3fff::1",
        ] {
            assert!(!public(address), "{address} should be refused");
        }
    }

    #[tokio::test]
    async fn pages_on_this_device_are_refused_even_by_name() {
        for address in ["https://127.0.0.1/", "http://localhost:1420/", "https://[::1]/", "https://10.0.0.1/"] {
            assert_eq!(fetch_page(address.into()).await, Err("that address is not on the public internet".into()), "{address}");
        }
        assert_eq!(fetch_page("file:///etc/passwd".into()).await, Err("not a web address".into()));
    }

    #[test]
    fn pages_are_read_in_their_own_character_set() {
        // "Crème brûlée" in windows-1252.
        let latin: &[u8] = b"<html><body>Cr\xe8me br\xfbl\xe9e</body></html>";
        assert!(decode(latin, Some("text/html; charset=windows-1252")).contains("Crème brûlée"));
        let declared: &[u8] = b"<html><head><meta charset=\"iso-8859-1\"></head><body>Cr\xe8me</body></html>";
        assert!(decode(declared, Some("text/html")).contains("Crème"));
        let old_style: &[u8] = b"<meta http-equiv=\"Content-Type\" content=\"text/html; charset=windows-1252\">Cr\xe8me";
        assert!(decode(old_style, None).contains("Crème"));
        assert!(decode("Crème brûlée".as_bytes(), None).contains("Crème brûlée"));
        // A byte order mark wins over what the header claims.
        let marked = [b"\xef\xbb\xbf".as_slice(), "Crème".as_bytes()].concat();
        assert!(decode(&marked, Some("text/html; charset=windows-1252")).starts_with("Crème"));
    }
}
