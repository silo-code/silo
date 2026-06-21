use std::collections::HashMap;
use std::time::Duration;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NetResponse {
    pub status: u16,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub final_url: String,
}

fn build_client(
    follow_redirects: bool,
    timeout_ms: Option<u64>,
) -> reqwest::Result<reqwest::Client> {
    let redirect = if follow_redirects {
        reqwest::redirect::Policy::default()
    } else {
        reqwest::redirect::Policy::none()
    };
    let mut b = reqwest::Client::builder().redirect(redirect);
    if let Some(ms) = timeout_ms {
        b = b.timeout(Duration::from_millis(ms));
    }
    b.build()
}

fn collect_headers(map: &reqwest::header::HeaderMap) -> HashMap<String, String> {
    let mut out: HashMap<String, String> = HashMap::new();
    for (name, value) in map.iter() {
        let k = name.as_str().to_lowercase();
        let v = value.to_str().unwrap_or("").to_string();
        out.entry(k)
            .and_modify(|prev| {
                prev.push_str(", ");
                prev.push_str(&v);
            })
            .or_insert(v);
    }
    out
}

/// Full HTTP request — bypasses browser CORS. Returns status, headers, body,
/// and the final URL after any redirects. Intended for `ctx.net.fetch`.
#[tauri::command]
pub async fn net_fetch(
    url: String,
    method: Option<String>,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
    follow_redirects: Option<bool>,
    timeout_ms: Option<u64>,
) -> Result<NetResponse, String> {
    let client =
        build_client(follow_redirects.unwrap_or(true), timeout_ms).map_err(|e| e.to_string())?;

    let method_str = method.unwrap_or_else(|| "GET".into()).to_uppercase();
    let method =
        reqwest::Method::from_bytes(method_str.as_bytes()).map_err(|e| e.to_string())?;

    let mut req = client.request(method, &url);

    if let Some(hdrs) = headers {
        for (k, v) in hdrs {
            req = req.header(k, v);
        }
    }

    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| e.to_string())?;
    let final_url = resp.url().to_string();
    let status = resp.status().as_u16();
    let resp_headers = collect_headers(resp.headers());
    let text = resp.text().await.map_err(|e| e.to_string())?;

    Ok(NetResponse {
        status,
        headers: resp_headers,
        body: text,
        final_url,
    })
}

/// HEAD-only request — returns response headers without downloading the body.
/// Efficient for embeddability checks and probing. Intended for `ctx.net.fetchHeaders`.
#[tauri::command]
pub async fn net_fetch_headers(
    url: String,
    follow_redirects: Option<bool>,
    timeout_ms: Option<u64>,
) -> Result<HashMap<String, String>, String> {
    let client =
        build_client(follow_redirects.unwrap_or(true), timeout_ms).map_err(|e| e.to_string())?;

    let resp = client
        .head(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    Ok(collect_headers(resp.headers()))
}
