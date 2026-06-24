use std::path::Path;

use grep::matcher::Matcher;
use grep::regex::{RegexMatcher, RegexMatcherBuilder};
use grep::searcher::{BinaryDetection, Searcher, SearcherBuilder, Sink, SinkMatch};
use ignore::overrides::OverrideBuilder;
use ignore::WalkBuilder;
use serde::{Deserialize, Serialize};

/// Hard cap on matches collected when the caller passes `maxResults: 0`.
const DEFAULT_MAX_RESULTS: usize = 5000;
/// Longest preview line (in chars) returned to the UI; longer lines are clipped.
const MAX_PREVIEW_CHARS: usize = 2000;

/// Options for `search_files`, mirroring the SDK `SearchOptions`. Field names
/// arrive camelCased from the frontend.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SearchOptions {
    regex: bool,
    case_sensitive: bool,
    whole_word: bool,
    include_globs: Vec<String>,
    exclude_globs: Vec<String>,
    max_results: usize,
    max_file_size: Option<u64>,
}

impl Default for SearchOptions {
    fn default() -> Self {
        SearchOptions {
            regex: false,
            case_sensitive: false,
            whole_word: false,
            include_globs: Vec::new(),
            exclude_globs: Vec::new(),
            max_results: 0,
            max_file_size: None,
        }
    }
}

/// Thin newtype so the Tauri command can accept either one root (`cwd`) or many
/// (`cwds`). The frontend always sends `cwds`; the single-`cwd` path is kept for
/// backwards-compat with any caller that hasn't migrated yet.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchRoots {
    /// Legacy single-root path. Ignored when `cwds` is non-empty.
    #[serde(default)]
    cwd: Option<String>,
    /// Ordered list of absolute roots to search. When non-empty, `cwd` is unused.
    #[serde(default)]
    cwds: Vec<String>,
}

impl SearchRoots {
    /// Resolve to the concrete list of roots to walk.
    fn roots(self) -> Vec<String> {
        if !self.cwds.is_empty() {
            self.cwds
        } else if let Some(c) = self.cwd {
            vec![c]
        } else {
            vec![]
        }
    }
}

/// One matching line within a file.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchMatch {
    /// 1-indexed line number.
    line: u64,
    /// The matched line's text (trailing newline stripped, clipped if very long).
    preview: String,
    /// `[start, end)` match ranges as **UTF-16 code-unit** offsets into `preview`
    /// (so the JS side can `preview.slice(start, end)` directly).
    ranges: Vec<[u32; 2]>,
}

/// All matches for one file.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileResult {
    /// Absolute path of the search root this file lives under.
    root: String,
    /// Path relative to `root`.
    path: String,
    matches: Vec<SearchMatch>,
}

/// The grouped result of a search.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResponse {
    files: Vec<FileResult>,
    total_matches: usize,
    truncated: bool,
}

/// Search file contents under one or more roots — the native backend for
/// `ctx.search`. Uses ripgrep's matcher/searcher plus the `ignore` crate's
/// `.gitignore`-aware walker, so results match what `rg` would find without
/// depending on `rg` being installed. Runs on a `spawn_blocking` worker so a
/// large tree never stutters the UI thread. Roots are pre-validated by the host
/// scope guard, so they are trusted as absolute directories here.
#[tauri::command]
pub async fn search_files(
    query: String,
    roots: SearchRoots,
    options: SearchOptions,
) -> Result<SearchResponse, String> {
    tauri::async_runtime::spawn_blocking(move || run_search(&query, &roots.roots(), &options))
        .await
        .map_err(|e| format!("search task panicked: {}", e))?
}

fn run_search(
    query: &str,
    roots: &[String],
    options: &SearchOptions,
) -> Result<SearchResponse, String> {
    if query.is_empty() {
        return Ok(SearchResponse {
            files: Vec::new(),
            total_matches: 0,
            truncated: false,
        });
    }

    let pattern = if options.regex {
        query.to_string()
    } else {
        escape_literal(query)
    };
    let matcher = RegexMatcherBuilder::new()
        .case_insensitive(!options.case_sensitive)
        .word(options.whole_word)
        .build(&pattern)
        .map_err(|e| format!("invalid search pattern: {}", e))?;

    let max_results = if options.max_results == 0 {
        DEFAULT_MAX_RESULTS
    } else {
        options.max_results
    };

    let mut files: Vec<FileResult> = Vec::new();
    let mut total: usize = 0;
    let mut truncated = false;

    'outer: for cwd in roots {
        let root = Path::new(cwd);
        let mut overrides = OverrideBuilder::new(root);
        for glob in &options.include_globs {
            overrides
                .add(glob)
                .map_err(|e| format!("invalid include glob '{}': {}", glob, e))?;
        }
        for glob in &options.exclude_globs {
            overrides
                .add(&format!("!{}", glob))
                .map_err(|e| format!("invalid exclude glob '{}': {}", glob, e))?;
        }
        let overrides = overrides
            .build()
            .map_err(|e| format!("failed to build globs: {}", e))?;

        let mut walk = WalkBuilder::new(root);
        walk.overrides(overrides);
        if let Some(max) = options.max_file_size {
            walk.max_filesize(Some(max));
        }

        let mut searcher = SearcherBuilder::new()
            .line_number(true)
            .binary_detection(BinaryDetection::quit(0))
            .build();

        for entry in walk.build() {
            if total >= max_results {
                truncated = true;
                break 'outer;
            }
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };
            if !entry.file_type().map_or(false, |ft| ft.is_file()) {
                continue;
            }

            let mut matches: Vec<SearchMatch> = Vec::new();
            let mut sink = MatchSink {
                matcher: &matcher,
                matches: &mut matches,
                limit: max_results - total,
            };
            // A read/UTF-8 error on a single file shouldn't abort the whole search.
            let _ = searcher.search_path(&matcher, entry.path(), &mut sink);

            if !matches.is_empty() {
                total += matches.len();
                let rel = entry.path().strip_prefix(root).unwrap_or(entry.path());
                files.push(FileResult {
                    root: cwd.clone(),
                    path: super::fs::normalize_path(rel),
                    matches,
                });
            }
        }
    }

    Ok(SearchResponse {
        files,
        total_matches: total,
        truncated,
    })
}

/// Collects matches from one file, stopping once `limit` matches are gathered.
struct MatchSink<'a> {
    matcher: &'a RegexMatcher,
    matches: &'a mut Vec<SearchMatch>,
    limit: usize,
}

impl Sink for MatchSink<'_> {
    type Error = std::io::Error;

    fn matched(&mut self, _searcher: &Searcher, mat: &SinkMatch<'_>) -> Result<bool, std::io::Error> {
        let line_number = mat.line_number().unwrap_or(0);
        let raw = String::from_utf8_lossy(mat.bytes());
        let line = raw.trim_end_matches(['\n', '\r']);

        // Match ranges as byte offsets within the line.
        let mut byte_ranges: Vec<(usize, usize)> = Vec::new();
        let bytes = line.as_bytes();
        let mut at = 0usize;
        while at <= bytes.len() {
            match self.matcher.find_at(bytes, at) {
                Ok(Some(m)) => {
                    byte_ranges.push((m.start(), m.end()));
                    at = if m.end() > m.start() { m.end() } else { m.end() + 1 };
                }
                _ => break,
            }
        }

        // Clip very long lines; keep ranges valid against the clipped preview.
        let char_count = line.chars().count();
        let (preview, clip_units) = if char_count > MAX_PREVIEW_CHARS {
            let clipped: String = line.chars().take(MAX_PREVIEW_CHARS).collect();
            let units = clipped.encode_utf16().count() as u32;
            (format!("{}…", clipped), units)
        } else {
            (line.to_string(), u32::MAX)
        };

        let ranges: Vec<[u32; 2]> = byte_ranges
            .iter()
            .filter_map(|&(s, e)| {
                let start = utf16_offset(line, s);
                let end = utf16_offset(line, e);
                if start >= clip_units {
                    return None;
                }
                Some([start, end.min(clip_units)])
            })
            .collect();

        self.matches.push(SearchMatch {
            line: line_number,
            preview,
            ranges,
        });

        Ok(self.matches.len() < self.limit)
    }
}

/// Number of UTF-16 code units in `s` before byte offset `byte_off`.
fn utf16_offset(s: &str, byte_off: usize) -> u32 {
    let mut units = 0u32;
    for (i, ch) in s.char_indices() {
        if i >= byte_off {
            break;
        }
        units += ch.len_utf16() as u32;
    }
    units
}

/// Escape regex metacharacters so a literal query matches verbatim.
fn escape_literal(s: &str) -> String {
    const META: &str = r"\.+*?()|[]{}^$";
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if META.contains(c) {
            out.push('\\');
        }
        out.push(c);
    }
    out
}
